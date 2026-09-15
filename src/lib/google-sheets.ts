import { slugificarClaveVariable } from "@/lib/campos-personalizados";

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

// Nombre acordado con el cliente: slug de la sub-cuenta + fecha, ej.
// "conbranza_total_15092026". La fecha se calcula en hora de México y no en
// UTC: exportar a las 7 de la noche no debe quedar fechado al día siguiente.
export function nombreDeHoja(slugCuenta: string | null, nombreCuenta: string): string {
  const base = slugCuenta || slugificarClaveVariable(nombreCuenta) || "cuenta";
  const fecha = new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
    .format(new Date())
    .replaceAll("/", "");
  return `${base}_${fecha}`;
}

async function googleFetch(url: string, accessToken: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...init?.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message ?? `Google respondió ${res.status}`);
  }
  return data;
}

// Crea la hoja y escribe encabezados y filas de un tirón. Se hace en dos
// llamadas porque la API de Sheets no permite crear con datos y darles
// formato a la vez, y el formato del encabezado importa: sin la fila
// congelada, al desplazarse por cientos de contactos se pierde de vista qué
// columna es cuál.
export async function crearHojaConDatos({
  accessToken,
  nombre,
  encabezados,
  filas,
}: {
  accessToken: string;
  nombre: string;
  encabezados: string[];
  filas: string[][];
}): Promise<{ spreadsheetId: string; url: string }> {
  const creada = await googleFetch(SHEETS_API, accessToken, {
    method: "POST",
    body: JSON.stringify({
      properties: { title: nombre, locale: "es_MX" },
      sheets: [{ properties: { title: "Contactos", gridProperties: { frozenRowCount: 1 } } }],
    }),
  });

  const spreadsheetId = creada.spreadsheetId as string;
  const url = creada.spreadsheetUrl as string;
  // El id de la pestaña lo asigna Google y no es 0: el 0 solo le toca a la
  // hoja que se crea sola cuando no se declara ninguna. Como acá sí se
  // declara ("Contactos"), hay que leer el id que devolvió.
  const sheetId = creada.sheets?.[0]?.properties?.sheetId as number | undefined;

  // RAW y no USER_ENTERED: con USER_ENTERED, Google interpreta los valores
  // como si alguien los tecleara, y un teléfono como "5219991234567" acaba
  // convertido a notación científica. Los datos se escriben tal cual.
  await googleFetch(
    `${SHEETS_API}/${spreadsheetId}/values/Contactos!A1?valueInputOption=RAW`,
    accessToken,
    { method: "PUT", body: JSON.stringify({ values: [encabezados, ...filas] }) },
  );

  // El formato es cosmético y va después de escribir los datos. Si fallara,
  // tirar la petición entera dejaría una hoja ya creada y llena en el Drive
  // del usuario, invisible para la plataforma y sin forma de recuperarla
  // desde la UI. Vale más entregar la hoja sin negritas que perderla.
  if (sheetId !== undefined) {
    try {
      await googleFetch(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, accessToken, {
        method: "POST",
        body: JSON.stringify({
          requests: [
            {
              repeatCell: {
                range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
                cell: { userEnteredFormat: { textFormat: { bold: true } } },
                fields: "userEnteredFormat.textFormat.bold",
              },
            },
            {
              autoResizeDimensions: {
                dimensions: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: encabezados.length },
              },
            },
          ],
        }),
      });
    } catch {
      // La hoja queda usable; solo sin negritas ni columnas ajustadas.
    }
  }

  return { spreadsheetId, url };
}

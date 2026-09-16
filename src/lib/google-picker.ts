// Carga del selector de archivos de Google y apertura del diálogo.
//
// El Picker es la única forma de que el usuario nos entregue una hoja que la
// plataforma no creó, sin pedir el scope drive.readonly -- que Google
// clasifica como restringido y condiciona a una auditoría de seguridad anual
// por un tercero certificado. Al elegir un archivo aquí, Google le da a la
// app acceso a ese archivo y a ninguno más.
//
// La API key es pública por diseño (viaja en el bundle del navegador); lo que
// la protege es la restricción por dominio y por API en Google Cloud.

type PickerGlobal = {
  load: (modulo: string, cb: () => void) => void;
  picker: Record<string, never>;
};

declare global {
  interface Window {
    gapi?: PickerGlobal;
    google?: { picker?: Record<string, unknown> };
  }
}

const SRC = "https://apis.google.com/js/api.js";
let cargando: Promise<void> | null = null;

// Una sola carga por sesión de página, aunque se abra el Picker varias veces.
function cargarLibreria(): Promise<void> {
  if (window.google?.picker) return Promise.resolve();
  if (cargando) return cargando;

  cargando = new Promise<void>((resolver, rechazar) => {
    const script = document.createElement("script");
    script.src = SRC;
    script.async = true;
    script.onerror = () => {
      cargando = null;
      rechazar(new Error("No se pudo cargar el selector de Google"));
    };
    script.onload = () => {
      // gapi.load es asíncrono y el módulo "picker" es lo que expone
      // window.google.picker; sin esperar a su callback, abrir el diálogo
      // truena con google.picker undefined.
      window.gapi?.load("picker", () => resolver());
    };
    document.body.appendChild(script);
  });

  return cargando;
}

export type HojaElegida = { id: string; nombre: string };

// La librería se tipa a mano: @types/google.picker arrastra todo gapi y aquí
// solo se usan estos símbolos.
type ConstructorPicker = {
  addView: (v: unknown) => ConstructorPicker;
  setOAuthToken: (t: string) => ConstructorPicker;
  setDeveloperKey: (k: string) => ConstructorPicker;
  setCallback: (cb: (d: Record<string, unknown>) => void) => ConstructorPicker;
  build: () => { setVisible: (v: boolean) => void };
};

type ApiPicker = {
  PickerBuilder: new () => ConstructorPicker;
  DocsView: new (tipo: unknown) => { setMode: (m: unknown) => unknown };
  ViewId: { SPREADSHEETS: unknown };
  DocsViewMode: { LIST: unknown };
  Action: { PICKED: string; CANCEL: string };
  Response: { ACTION: string; DOCUMENTS: string };
  Document: { ID: string; NAME: string };
};

export async function abrirSelectorDeHojas({
  accessToken,
  apiKey,
}: {
  accessToken: string;
  apiKey: string;
}): Promise<HojaElegida | null> {
  await cargarLibreria();

  const picker = window.google?.picker as ApiPicker | undefined;
  if (!picker) throw new Error("El selector de Google no quedó disponible");

  return new Promise<HojaElegida | null>((resolver) => {
    const vista = new picker.DocsView(picker.ViewId.SPREADSHEETS).setMode(picker.DocsViewMode.LIST);

    const dialogo = new picker.PickerBuilder()
      .addView(vista)
      .setOAuthToken(accessToken)
      .setDeveloperKey(apiKey)
      .setCallback((datos) => {
        const accion = datos[picker.Response.ACTION];
        if (accion === picker.Action.CANCEL) return resolver(null);
        if (accion !== picker.Action.PICKED) return;

        const documentos = datos[picker.Response.DOCUMENTS] as Record<string, string>[] | undefined;
        const elegido = documentos?.[0];
        if (!elegido) return resolver(null);
        resolver({ id: elegido[picker.Document.ID], nombre: elegido[picker.Document.NAME] });
      })
      .build();

    dialogo.setVisible(true);
  });
}

"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/Badge";

type Categoria = {
  valor: string;
  etiqueta: string;
  descripcion: string;
  disponible: boolean;
};

const CATEGORIAS: Categoria[] = [
  { valor: "legal", etiqueta: "Legal", descripcion: "Despachos y asesoría jurídica", disponible: false },
  { valor: "medicos", etiqueta: "Médicos", descripcion: "Consultorios y clínicas", disponible: false },
  { valor: "inmobiliario", etiqueta: "Inmobiliarios", descripcion: "Venta y renta de propiedades", disponible: false },
  { valor: "servicios", etiqueta: "Servicios", descripcion: "Agendamiento y atención a clientes", disponible: true },
  { valor: "cobranza", etiqueta: "Cobranza", descripcion: "Recordatorios y gestión de pagos", disponible: false },
  { valor: "ventas", etiqueta: "Ventas", descripcion: "Prospección y seguimiento comercial", disponible: false },
];

type Llamada = {
  id: string;
  status: "en_progreso" | "completada" | "fallida" | "sin_respuesta";
  resultado: "acepto" | "rechazo" | "pendiente" | null;
  duracion_segundos: number | null;
  transcripcion: string | null;
  audio_url: string | null;
  created_at: string;
  contacto: { nombre: string | null; telefono: string } | null;
  plantilla: { nombre: string } | null;
};

const ETIQUETA_STATUS: Record<Llamada["status"], string> = {
  en_progreso: "En progreso",
  completada: "Completada",
  fallida: "Fallida",
  sin_respuesta: "Sin respuesta",
};

const ETIQUETA_RESULTADO: Record<NonNullable<Llamada["resultado"]>, string> = {
  acepto: "Aceptó",
  rechazo: "Rechazó",
  pendiente: "Pendiente",
};

function BadgeStatus({ status }: { status: Llamada["status"] }) {
  if (status === "completada") return <Badge tono="en-vivo">{ETIQUETA_STATUS[status]}</Badge>;
  if (status === "en_progreso") return <Badge tono="aviso">{ETIQUETA_STATUS[status]}</Badge>;
  return <span className="text-xs font-medium text-red-500">{ETIQUETA_STATUS[status]}</span>;
}

function BadgeResultado({ resultado }: { resultado: Llamada["resultado"] }) {
  if (!resultado || resultado === "pendiente") return <Badge tono="mute">{ETIQUETA_RESULTADO.pendiente}</Badge>;
  if (resultado === "acepto") return <Badge tono="en-vivo">{ETIQUETA_RESULTADO.acepto}</Badge>;
  return <span className="text-xs font-medium text-red-500">{ETIQUETA_RESULTADO.rechazo}</span>;
}

function formatearDuracion(segundos: number | null) {
  if (segundos === null) return "—";
  const min = Math.floor(segundos / 60);
  const seg = segundos % 60;
  return `${min}:${seg.toString().padStart(2, "0")}`;
}

export function AgentesVozView() {
  const [categoria, setCategoria] = useState<string | null>(null);

  return (
    <div>
      <h1 className="text-xl font-bold text-[var(--color-texto)]">Agentes de Voz</h1>
      <p className="mt-1 text-sm text-[var(--color-texto-mute)]">
        Llamadas automatizadas con IA (Retell) organizadas por tipo de negocio.
      </p>

      {categoria === null ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIAS.map((c) => (
            <button
              key={c.valor}
              disabled={!c.disponible}
              onClick={() => c.disponible && setCategoria(c.valor)}
              className={
                c.disponible
                  ? "rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-5 text-left transition-colors hover:border-[var(--color-marca)]"
                  : "cursor-not-allowed rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-5 text-left opacity-50"
              }
            >
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--color-texto)]">{c.etiqueta}</h3>
                {!c.disponible && <Badge tono="mute">Próximamente</Badge>}
              </div>
              <p className="text-xs text-[var(--color-texto-mute)]">{c.descripcion}</p>
            </button>
          ))}
        </div>
      ) : (
        <ServiciosWorkspace onVolver={() => setCategoria(null)} />
      )}
    </div>
  );
}

function ServiciosWorkspace({ onVolver }: { onVolver: () => void }) {
  const [llamadas, setLlamadas] = useState<Llamada[] | null>(null);
  const [transcripcionAbierta, setTranscripcionAbierta] = useState<Llamada | null>(null);

  useEffect(() => {
    fetch("/api/llamadas-voz")
      .then((res) => res.json())
      .then((data) => setLlamadas(data.llamadas ?? []));
  }, []);

  const stats = calcularStats(llamadas ?? []);

  return (
    <div className="mt-6">
      <button onClick={onVolver} className="mb-4 text-sm font-medium text-[var(--color-marca)] hover:underline">
        ← Volver a categorías
      </button>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { etiqueta: "Total de llamadas", valor: stats.total },
          { etiqueta: "En progreso", valor: stats.enProgreso },
          { etiqueta: "Completadas", valor: stats.completadas },
          { etiqueta: "Fallidas / sin respuesta", valor: stats.fallidas },
          { etiqueta: "Aceptó", valor: stats.acepto },
          { etiqueta: "Rechazó", valor: stats.rechazo },
          { etiqueta: "Duración promedio", valor: stats.duracionPromedio },
        ].map((t) => (
          <div key={t.etiqueta} className="rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-5">
            <p className="text-sm text-[var(--color-texto-mute)]">{t.etiqueta}</p>
            <p className="mt-2 text-3xl font-bold text-[var(--color-texto)]">{t.valor}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)]">
        {llamadas === null ? (
          <p className="p-5 text-sm text-[var(--color-texto-mute)]">Cargando…</p>
        ) : llamadas.length === 0 ? (
          <p className="p-5 text-sm text-[var(--color-texto-mute)]">Todavía no se han hecho llamadas.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-borde)] text-xs text-[var(--color-texto-mute)]">
                <th className="px-4 py-3 font-medium">Contacto</th>
                <th className="px-4 py-3 font-medium">Plantilla</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Resultado</th>
                <th className="px-4 py-3 font-medium">Duración</th>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Transcripción</th>
              </tr>
            </thead>
            <tbody>
              {llamadas.map((l) => (
                <tr key={l.id} className="border-b border-[var(--color-borde)] last:border-0">
                  <td className="px-4 py-3 text-[var(--color-texto)]">{l.contacto?.nombre || l.contacto?.telefono || "—"}</td>
                  <td className="px-4 py-3 text-[var(--color-texto-mute)]">{l.plantilla?.nombre ?? "—"}</td>
                  <td className="px-4 py-3">
                    <BadgeStatus status={l.status} />
                  </td>
                  <td className="px-4 py-3">
                    <BadgeResultado resultado={l.resultado} />
                  </td>
                  <td className="px-4 py-3 text-[var(--color-texto-mute)]">{formatearDuracion(l.duracion_segundos)}</td>
                  <td className="px-4 py-3 text-[var(--color-texto-mute)]">
                    {new Date(l.created_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td className="px-4 py-3">
                    {l.transcripcion ? (
                      <button onClick={() => setTranscripcionAbierta(l)} className="text-xs font-medium text-[var(--color-marca)] hover:underline">
                        Ver
                      </button>
                    ) : (
                      <span className="text-xs text-[var(--color-texto-mute)]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {transcripcionAbierta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setTranscripcionAbierta(null)}>
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-4 text-base font-semibold text-[var(--color-texto)]">
              Transcripción — {transcripcionAbierta.contacto?.nombre || transcripcionAbierta.contacto?.telefono}
            </h2>
            <p className="whitespace-pre-wrap text-sm text-[var(--color-texto)]">{transcripcionAbierta.transcripcion}</p>
            {transcripcionAbierta.audio_url && (
              <audio className="mt-4 w-full" controls src={transcripcionAbierta.audio_url} />
            )}
            <button
              onClick={() => setTranscripcionAbierta(null)}
              className="mt-4 text-sm font-medium text-[var(--color-marca)] hover:underline"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function calcularStats(llamadas: Llamada[]) {
  const total = llamadas.length;
  const enProgreso = llamadas.filter((l) => l.status === "en_progreso").length;
  const completadas = llamadas.filter((l) => l.status === "completada").length;
  const fallidas = llamadas.filter((l) => l.status === "fallida" || l.status === "sin_respuesta").length;
  const acepto = llamadas.filter((l) => l.resultado === "acepto").length;
  const rechazo = llamadas.filter((l) => l.resultado === "rechazo").length;

  const conDuracion = llamadas.filter((l) => l.duracion_segundos !== null);
  const duracionPromedio =
    conDuracion.length === 0
      ? "—"
      : formatearDuracion(Math.round(conDuracion.reduce((s, l) => s + (l.duracion_segundos ?? 0), 0) / conDuracion.length));

  return { total, enProgreso, completadas, fallidas, acepto, rechazo, duracionPromedio };
}

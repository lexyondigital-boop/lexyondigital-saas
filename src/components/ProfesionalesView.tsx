"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/Badge";
import { CampoTelefono } from "@/components/CampoTelefono";

type Profesional = {
  id: string;
  perfil_id: string;
  nombre: string;
  especialidad: string;
  email: string | null;
  telefono: string | null;
  color_agenda: string;
  estado: "activo" | "inactivo";
  google_oauth_email: string | null;
  google_calendar_name: string | null;
  google_oauth_connected_at: string | null;
  created_at: string;
};

type ProfesionalDetalle = Profesional & {
  biografia: string | null;
  foto_url: string | null;
  horario_inicio: string;
  horario_fin: string;
  dias_disponibles: string[];
  duracion_cita_minutos: number;
};

const DIAS: { valor: string; etiqueta: string }[] = [
  { valor: "lunes", etiqueta: "L" },
  { valor: "martes", etiqueta: "M" },
  { valor: "miercoles", etiqueta: "Mi" },
  { valor: "jueves", etiqueta: "J" },
  { valor: "viernes", etiqueta: "V" },
  { valor: "sabado", etiqueta: "S" },
  { valor: "domingo", etiqueta: "D" },
];

export function ProfesionalesView() {
  const searchParams = useSearchParams();
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [mostrarNuevo, setMostrarNuevo] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [avisoGoogle, setAvisoGoogle] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  async function cargar() {
    setCargando(true);
    const res = await fetch("/api/profesionales");
    const data = await res.json();
    setProfesionales(data.profesionales ?? []);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
  }, []);

  useEffect(() => {
    const google = searchParams.get("google");
    if (google === "conectado") setAvisoGoogle({ tipo: "ok", texto: "Google Calendar conectado correctamente." });
    if (google === "error") setAvisoGoogle({ tipo: "error", texto: searchParams.get("mensaje") ?? "No se pudo conectar Google Calendar." });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtrados = useMemo(() => {
    if (!busqueda.trim()) return profesionales;
    const q = busqueda.toLowerCase();
    return profesionales.filter((p) => p.nombre.toLowerCase().includes(q) || p.especialidad.toLowerCase().includes(q));
  }, [profesionales, busqueda]);

  async function alternarEstado(p: Profesional) {
    const nuevo = p.estado === "activo" ? "inactivo" : "activo";
    await fetch(`/api/profesionales/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: nuevo }),
    });
    cargar();
  }

  const [reenviando, setReenviando] = useState<string | null>(null);

  async function reenviarAcceso(p: Profesional) {
    setReenviando(p.id);
    await fetch(`/api/usuarios/${p.perfil_id}/reenviar-clave`, { method: "POST" });
    setReenviando(null);
    alert(`Le reenviamos el correo para definir su contraseña a ${p.nombre}`);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-texto)]">Profesionales</h1>
          <p className="mt-1 text-sm text-[var(--color-texto-mute)]">Gestiona a los médicos, abogados o especialistas de la cuenta.</p>
        </div>
        <button
          onClick={() => {
            setEditando(null);
            setMostrarNuevo((v) => !v);
          }}
          style={{ boxShadow: "var(--halo-accion)" }}
          className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90"
        >
          {mostrarNuevo ? "Cancelar" : "+ Nuevo profesional"}
        </button>
      </div>

      {avisoGoogle && (
        <div
          className="mt-4 rounded-lg px-4 py-2.5 text-sm"
          style={
            avisoGoogle.tipo === "ok"
              ? { background: "color-mix(in srgb, var(--color-ok, #22c55e) 15%, transparent)", color: "var(--color-texto)" }
              : { background: "color-mix(in srgb, #ef4444 15%, transparent)", color: "var(--color-texto)" }
          }
        >
          {avisoGoogle.texto}
        </div>
      )}

      {mostrarNuevo && (
        <FormularioNuevoProfesional
          onGuardado={() => {
            setMostrarNuevo(false);
            cargar();
          }}
          onCancelar={() => setMostrarNuevo(false)}
        />
      )}

      <div className="mt-5 mb-4">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o especialidad…"
          className="w-full max-w-sm rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)]">
        {cargando ? (
          <p className="p-6 text-sm text-[var(--color-texto-mute)]">Cargando…</p>
        ) : filtrados.length === 0 ? (
          <p className="p-6 text-sm text-[var(--color-texto-mute)]">Sin profesionales todavía.</p>
        ) : (
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-borde)] text-xs uppercase tracking-wide text-[var(--color-texto-mute)]">
                <th className="px-5 py-3 font-medium">Nombre</th>
                <th className="px-5 py-3 font-medium">Especialidad</th>
                <th className="px-5 py-3 font-medium">Google Calendar</th>
                <th className="px-5 py-3 font-medium">Estado</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtrados.map((p) => (
                <tr key={p.id} className="border-b border-[var(--color-borde)] last:border-0">
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center gap-2.5 text-[var(--color-texto)]">
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                        style={{ background: p.color_agenda }}
                      >
                        {p.nombre[0]?.toUpperCase()}
                      </span>
                      {p.nombre}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-[var(--color-texto)]">{p.especialidad}</td>
                  <td className="px-5 py-3.5">
                    {p.google_oauth_connected_at ? (
                      <span className="text-[var(--color-texto)]">
                        ✅ Conectado
                        <span className="block text-xs text-[var(--color-texto-mute)]">{p.google_oauth_email}</span>
                      </span>
                    ) : (
                      <span className="text-[var(--color-texto-mute)]">❌ Sin conectar</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge tono={p.estado === "activo" ? "en-vivo" : "mute"}>{p.estado === "activo" ? "Activo" : "Inactivo"}</Badge>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5 text-right">
                    <button
                      onClick={() => {
                        setMostrarNuevo(false);
                        setEditando(editando === p.id ? null : p.id);
                      }}
                      className="mr-3 text-sm font-medium text-[var(--color-marca)] hover:underline"
                    >
                      Editar
                    </button>
                    <Link href={`/profesionales/${p.id}/citas`} className="mr-3 text-sm font-medium text-[var(--color-texto-mute)] hover:text-[var(--color-texto)]">
                      Ver citas
                    </Link>
                    <button
                      onClick={() => reenviarAcceso(p)}
                      disabled={reenviando === p.id}
                      className="mr-3 text-sm font-medium text-[var(--color-texto-mute)] hover:text-[var(--color-texto)] disabled:opacity-50"
                    >
                      {reenviando === p.id ? "Enviando…" : "Reenviar acceso"}
                    </button>
                    <button
                      onClick={() => alternarEstado(p)}
                      className={`text-sm font-medium hover:underline ${p.estado === "activo" ? "text-red-500" : "text-[var(--color-marca)]"}`}
                    >
                      {p.estado === "activo" ? "Desactivar" : "Reactivar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editando && (
        <FormularioEditarProfesional
          id={editando}
          onGuardado={() => {
            setEditando(null);
            cargar();
          }}
          onCancelar={() => setEditando(null)}
        />
      )}
    </div>
  );
}

const COLORES_PRESET = ["#6b2fa0", "#f97316", "#22c55e", "#0ea5e9", "#ef4444", "#eab308"];

function FormularioNuevoProfesional({ onGuardado, onCancelar }: { onGuardado: () => void; onCancelar: () => void }) {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [especialidad, setEspecialidad] = useState("");
  const [emailGoogle, setEmailGoogle] = useState("");
  const [color, setColor] = useState(COLORES_PRESET[0]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);

    const res = await fetch("/api/usuarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre,
        email,
        telefono,
        rol: "agente",
        equipo_id: null,
        permisos: [
          { clave: "view_professionals", concedido: true },
          { clave: "view_appointments", concedido: true },
          { clave: "manage_appointments", concedido: true },
        ],
        es_profesional: true,
        profesional: { especialidad, email_google: emailGoogle, color_agenda: color },
      }),
    });
    setEnviando(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo crear el profesional");
      return;
    }
    onGuardado();
  }

  return (
    <form onSubmit={guardar} className="mt-5 max-w-2xl space-y-4 rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-6">
      <h2 className="text-base font-semibold text-[var(--color-texto)]">Nuevo profesional</h2>
      <p className="text-xs text-[var(--color-texto-mute)]">
        Se crea también como usuario del sistema (rol Agente) y le llega un correo para definir su contraseña.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Nombre</span>
          <input required value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Dr. Juan García" className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Correo de acceso</span>
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]" />
        </label>
        <CampoTelefono required value={telefono} onChange={setTelefono} />
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Especialidad</span>
          <input required value={especialidad} onChange={(e) => setEspecialidad(e.target.value)} placeholder="Ej. Cardiología" className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Correo de Google (opcional)</span>
          <input type="email" value={emailGoogle} onChange={(e) => setEmailGoogle(e.target.value)} placeholder="Para conectar su Google Calendar después" className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]" />
        </label>
      </div>

      <div>
        <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Color en la agenda</span>
        <div className="flex items-center gap-2">
          {COLORES_PRESET.map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)} className="h-7 w-7 rounded-full" style={{ background: c, outline: color === c ? "2px solid var(--color-texto)" : "none", outlineOffset: 2 }} />
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-3 border-t border-[var(--color-borde)] pt-4">
        <button type="submit" disabled={enviando} style={{ boxShadow: "var(--halo-accion)" }} className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90 disabled:opacity-60">
          {enviando ? "Creando…" : "Crear profesional"}
        </button>
        <button type="button" onClick={onCancelar} className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--color-texto-mute)] hover:text-[var(--color-texto)]">
          Cancelar
        </button>
      </div>
    </form>
  );
}

function FormularioEditarProfesional({ id, onGuardado, onCancelar }: { id: string; onGuardado: () => void; onCancelar: () => void }) {
  const [detalle, setDetalle] = useState<ProfesionalDetalle | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [conectando, setConectando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/profesionales/${id}`);
      const data = await res.json();
      setDetalle(data.profesional ?? null);
    })();
  }, [id]);

  if (!detalle) {
    return <div className="mt-5 rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-6 text-sm text-[var(--color-texto-mute)]">Cargando…</div>;
  }

  function alternarDia(dia: string) {
    setDetalle((prev) =>
      prev ? { ...prev, dias_disponibles: prev.dias_disponibles.includes(dia) ? prev.dias_disponibles.filter((d) => d !== dia) : [...prev.dias_disponibles, dia] } : prev,
    );
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!detalle) return;
    setEnviando(true);
    setError(null);

    const res = await fetch(`/api/profesionales/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        especialidad: detalle.especialidad,
        color_agenda: detalle.color_agenda,
        telefono: detalle.telefono,
        biografia: detalle.biografia,
        foto_url: detalle.foto_url,
        horario_inicio: detalle.horario_inicio,
        horario_fin: detalle.horario_fin,
        dias_disponibles: detalle.dias_disponibles,
        duracion_cita_minutos: detalle.duracion_cita_minutos,
      }),
    });
    setEnviando(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo guardar");
      return;
    }
    onGuardado();
  }

  async function conectarGoogle() {
    setConectando(true);
    const res = await fetch("/api/auth/google-calendar/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profesional_id: id, volver_a: "/profesionales" }),
    });
    const data = await res.json();
    setConectando(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo iniciar la conexión con Google");
      return;
    }
    window.location.href = data.url;
  }

  async function desconectarGoogle() {
    if (!confirm("¿Desconectar Google Calendar de este profesional?")) return;
    await fetch("/api/auth/google-calendar/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profesional_id: id }),
    });
    onGuardado();
  }

  return (
    <form onSubmit={guardar} className="mt-5 max-w-2xl space-y-5 rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-6">
      <h2 className="text-base font-semibold text-[var(--color-texto)]">Editar profesional — {detalle.nombre}</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Especialidad</span>
          <input value={detalle.especialidad} onChange={(e) => setDetalle({ ...detalle, especialidad: e.target.value })} className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]" />
        </label>
        <CampoTelefono value={detalle.telefono ?? ""} onChange={(v) => setDetalle({ ...detalle, telefono: v })} />
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Horario inicio</span>
          <input type="time" value={detalle.horario_inicio} onChange={(e) => setDetalle({ ...detalle, horario_inicio: e.target.value })} className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Horario fin</span>
          <input type="time" value={detalle.horario_fin} onChange={(e) => setDetalle({ ...detalle, horario_fin: e.target.value })} className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Duración de cita</span>
          <select value={detalle.duracion_cita_minutos} onChange={(e) => setDetalle({ ...detalle, duracion_cita_minutos: Number(e.target.value) })} className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]">
            {[15, 30, 45, 60].map((m) => (
              <option key={m} value={m}>
                {m} minutos
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Color en la agenda</span>
          <input type="color" value={detalle.color_agenda} onChange={(e) => setDetalle({ ...detalle, color_agenda: e.target.value })} className="h-9 w-16 rounded border border-[var(--color-borde)] bg-transparent" />
        </label>
      </div>

      <div>
        <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Días disponibles</span>
        <div className="flex flex-wrap gap-2">
          {DIAS.map((d) => (
            <button
              key={d.valor}
              type="button"
              onClick={() => alternarDia(d.valor)}
              className="h-8 w-9 rounded-lg text-xs font-semibold"
              style={
                detalle.dias_disponibles.includes(d.valor)
                  ? { background: "var(--color-marca)", color: "var(--color-accion-fg)" }
                  : { background: "var(--color-bg-elevada)", color: "var(--color-texto-mute)", border: "1px solid var(--color-borde)" }
              }
            >
              {d.etiqueta}
            </button>
          ))}
        </div>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Biografía (opcional)</span>
        <textarea value={detalle.biografia ?? ""} onChange={(e) => setDetalle({ ...detalle, biografia: e.target.value })} rows={2} className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]" />
      </label>

      <div className="border-t border-[var(--color-borde)] pt-4">
        <h3 className="mb-2 text-sm font-semibold text-[var(--color-texto)]">Google Calendar</h3>
        {detalle.google_oauth_connected_at ? (
          <div className="rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] p-3 text-sm text-[var(--color-texto)]">
            <p>✅ Conectado — {detalle.google_oauth_email}</p>
            <p className="mt-0.5 text-xs text-[var(--color-texto-mute)]">Calendario: {detalle.google_calendar_name}</p>
            <button type="button" onClick={desconectarGoogle} className="mt-2 text-sm font-medium text-red-500 hover:underline">
              Desconectar
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={conectarGoogle}
            disabled={conectando}
            className="rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm font-medium text-[var(--color-texto)] hover:opacity-80 disabled:opacity-50"
          >
            {conectando ? "Redirigiendo…" : "🔗 Conectar Google Calendar"}
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-3 border-t border-[var(--color-borde)] pt-4">
        <button type="submit" disabled={enviando} style={{ boxShadow: "var(--halo-accion)" }} className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90 disabled:opacity-60">
          {enviando ? "Guardando…" : "Guardar cambios"}
        </button>
        <button type="button" onClick={onCancelar} className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--color-texto-mute)] hover:text-[var(--color-texto)]">
          Cancelar
        </button>
      </div>
    </form>
  );
}

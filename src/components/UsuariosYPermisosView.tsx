"use client";

import { Fragment, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/Badge";
import { LABEL_CATEGORIA, LABEL_ACCION, agruparPorCategoria, type Permiso } from "@/lib/permisos";

type Equipo = { id: string; nombre: string; descripcion: string | null; color: string; created_at: string };

type PerfilUsuario = {
  id: string;
  nombre: string | null;
  telefono: string | null;
  rol: "super_admin" | "admin" | "agente";
  activo: boolean;
  equipo_id: string | null;
  created_at: string;
  email: string | null;
  es_profesional: boolean;
  profesional_id: string | null;
  especialidad?: string | null;
};

type Tab = "usuarios" | "equipos" | "auditoria";

export function UsuariosYPermisosView({ cuentaId, miPerfilId }: { cuentaId: string; miPerfilId: string }) {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("usuarios");
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [permisosCatalogo, setPermisosCatalogo] = useState<Permiso[]>([]);
  const [filtroUsuarioAuditoria, setFiltroUsuarioAuditoria] = useState<string | null>(null);

  async function cargarComun() {
    const [{ data: eq }, { data: pc }] = await Promise.all([
      supabase.from("equipos").select("id, nombre, descripcion, color, created_at").order("nombre"),
      supabase.from("permisos_catalogo").select("clave, nombre, categoria"),
    ]);
    setEquipos(eq ?? []);
    setPermisosCatalogo(pc ?? []);
  }

  useEffect(() => {
    cargarComun();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function verLogsDeUsuario(perfilId: string) {
    setFiltroUsuarioAuditoria(perfilId);
    setTab("auditoria");
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-[var(--color-texto)]">Usuarios y permisos</h1>
      <p className="mt-1 text-sm text-[var(--color-texto-mute)]">
        Administra el equipo de esta cuenta, sus permisos y el historial de actividad.
      </p>

      <div className="mb-6 mt-5 flex gap-5 border-b border-[var(--color-borde)]">
        {([
          ["usuarios", "Usuarios"],
          ["equipos", "Equipos"],
          ["auditoria", "Auditoría"],
        ] as [Tab, string][]).map(([valor, etiqueta]) => (
          <button
            key={valor}
            onClick={() => setTab(valor)}
            className="border-b-2 pb-2.5 text-sm font-medium transition-colors"
            style={{
              borderColor: tab === valor ? "var(--color-marca)" : "transparent",
              color: tab === valor ? "var(--color-texto)" : "var(--color-texto-mute)",
            }}
          >
            {etiqueta}
          </button>
        ))}
      </div>

      {tab === "usuarios" && (
        <TabUsuarios
          cuentaId={cuentaId}
          miPerfilId={miPerfilId}
          equipos={equipos}
          permisosCatalogo={permisosCatalogo}
          onVerLogs={verLogsDeUsuario}
        />
      )}
      {tab === "equipos" && <TabEquipos equipos={equipos} onCambio={cargarComun} />}
      {tab === "auditoria" && (
        <TabAuditoria filtroUsuarioInicial={filtroUsuarioAuditoria} onFiltroConsumido={() => setFiltroUsuarioAuditoria(null)} />
      )}
    </div>
  );
}

// ============================================================
// TAB USUARIOS
// ============================================================

function TabUsuarios({
  cuentaId,
  miPerfilId,
  equipos,
  permisosCatalogo,
  onVerLogs,
}: {
  cuentaId: string;
  miPerfilId: string;
  equipos: Equipo[];
  permisosCatalogo: Permiso[];
  onVerLogs: (perfilId: string) => void;
}) {
  const supabase = createClient();
  const [usuarios, setUsuarios] = useState<PerfilUsuario[]>([]);
  const [ultimaActividad, setUltimaActividad] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(true);
  const [filtroEquipo, setFiltroEquipo] = useState<string>("todos");
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "admin" | "usuario" | "profesionista">("todos");
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editando, setEditando] = useState<PerfilUsuario | null>(null);

  async function cargar() {
    setCargando(true);
    const { data: perfiles } = await supabase
      .from("perfiles")
      .select("id, nombre, telefono, rol, activo, equipo_id, created_at, es_profesional, profesional_id")
      .order("created_at", { ascending: false });

    const idsUsuarios = (perfiles ?? []).map((p) => p.id);
    const emailPorId: Record<string, string | null> = {};
    if (idsUsuarios.length > 0) {
      const res = await fetch(`/api/usuarios/emails?ids=${idsUsuarios.join(",")}`);
      if (res.ok) {
        const data = await res.json();
        for (const u of data.usuarios ?? []) emailPorId[u.id] = u.email;
      }
    }

    const idsProfesionales = (perfiles ?? []).map((p) => p.profesional_id).filter(Boolean) as string[];
    const especialidadPorProfesionalId: Record<string, string> = {};
    if (idsProfesionales.length > 0) {
      const { data: profesionales } = await supabase.from("profesionales").select("id, especialidad").in("id", idsProfesionales);
      for (const p of profesionales ?? []) especialidadPorProfesionalId[p.id] = p.especialidad;
    }

    setUsuarios(
      (perfiles ?? []).map((p) => ({
        ...p,
        email: emailPorId[p.id] ?? null,
        especialidad: p.profesional_id ? especialidadPorProfesionalId[p.profesional_id] ?? null : null,
      })),
    );

    const { data: logs } = await supabase
      .from("logs_actividad")
      .select("perfil_id, created_at")
      .order("created_at", { ascending: false })
      .limit(500);

    const mapa: Record<string, string> = {};
    for (const l of logs ?? []) {
      if (l.perfil_id && !mapa[l.perfil_id]) mapa[l.perfil_id] = l.created_at;
    }
    setUltimaActividad(mapa);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtrados = useMemo(() => {
    let lista = usuarios;
    if (filtroEquipo !== "todos") lista = lista.filter((u) => u.equipo_id === filtroEquipo);
    if (filtroTipo === "admin") lista = lista.filter((u) => u.rol === "admin" || u.rol === "super_admin");
    if (filtroTipo === "profesionista") lista = lista.filter((u) => u.es_profesional);
    if (filtroTipo === "usuario") lista = lista.filter((u) => u.rol === "agente" && !u.es_profesional);
    return lista;
  }, [usuarios, filtroEquipo, filtroTipo]);

  const equipoDe = (id: string | null) => equipos.find((e) => e.id === id) ?? null;

  async function desactivar(u: PerfilUsuario) {
    if (!confirm(`¿Desactivar a ${u.nombre ?? "este usuario"}? Pierde acceso de inmediato.`)) return;
    await fetch(`/api/usuarios/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activo: false }),
    });
    cargar();
  }

  async function reactivar(u: PerfilUsuario) {
    await fetch(`/api/usuarios/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activo: true }),
    });
    cargar();
  }

  const [reenviando, setReenviando] = useState<string | null>(null);

  async function reenviarAcceso(u: PerfilUsuario) {
    setReenviando(u.id);
    await fetch(`/api/usuarios/${u.id}/reenviar-clave`, { method: "POST" });
    setReenviando(null);
    alert(`Le reenviamos el correo para definir su contraseña a ${u.email}`);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <select
          value={filtroEquipo}
          onChange={(e) => setFiltroEquipo(e.target.value)}
          className="rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
        >
          <option value="todos">Todos los equipos</option>
          {equipos.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre}
            </option>
          ))}
        </select>
        <select
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value as typeof filtroTipo)}
          className="rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
        >
          <option value="todos">Todos los tipos</option>
          <option value="admin">Administradores</option>
          <option value="usuario">Usuarios</option>
          <option value="profesionista">Profesionistas</option>
        </select>
        <button
          onClick={() => {
            setEditando(null);
            setMostrarForm((v) => !v);
          }}
          style={{ boxShadow: "var(--halo-accion)" }}
          className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90"
        >
          {mostrarForm && !editando ? "Cancelar" : "+ Nuevo usuario"}
        </button>
      </div>

      {(mostrarForm || editando) && (
        <FormularioUsuario
          equipos={equipos}
          permisosCatalogo={permisosCatalogo}
          usuario={editando}
          miPerfilId={miPerfilId}
          onGuardado={() => {
            setMostrarForm(false);
            setEditando(null);
            cargar();
          }}
          onCancelar={() => {
            setMostrarForm(false);
            setEditando(null);
          }}
        />
      )}

      <div className="overflow-x-auto rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)]">
        {cargando ? (
          <p className="p-6 text-sm text-[var(--color-texto-mute)]">Cargando…</p>
        ) : filtrados.length === 0 ? (
          <p className="p-6 text-sm text-[var(--color-texto-mute)]">Sin usuarios.</p>
        ) : (
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-borde)] text-xs uppercase tracking-wide text-[var(--color-texto-mute)]">
                <th className="px-5 py-3 font-medium">Nombre</th>
                <th className="px-5 py-3 font-medium">Correo</th>
                <th className="px-5 py-3 font-medium">Rol</th>
                <th className="px-5 py-3 font-medium">Tipo</th>
                <th className="px-5 py-3 font-medium">Equipo</th>
                <th className="px-5 py-3 font-medium">Estado</th>
                <th className="px-5 py-3 font-medium">Última actividad</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtrados.map((u) => {
                const equipo = equipoDe(u.equipo_id);
                const actividad = ultimaActividad[u.id];
                return (
                  <tr key={u.id} className="border-b border-[var(--color-borde)] last:border-0">
                    <td className="px-5 py-3.5 text-[var(--color-texto)]">{u.nombre ?? "—"}</td>
                    <td className="px-5 py-3.5 text-[var(--color-texto-mute)]">{u.email ?? "—"}</td>
                    <td className="px-5 py-3.5 text-[var(--color-texto)]">
                      {u.rol === "super_admin" ? "Super admin" : u.rol === "admin" ? "Administrador" : "Agente"}
                    </td>
                    <td className="px-5 py-3.5">
                      {u.es_profesional ? (
                        <span className="text-[var(--color-texto)]">
                          🩺 Profesionista
                          {u.especialidad && <span className="block text-xs text-[var(--color-texto-mute)]">{u.especialidad}</span>}
                        </span>
                      ) : (
                        <span className="text-[var(--color-texto-mute)]">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      {equipo ? (
                        <span className="inline-flex items-center gap-1.5 text-[var(--color-texto)]">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: equipo.color }} />
                          {equipo.nombre}
                        </span>
                      ) : (
                        <span className="text-[var(--color-texto-mute)]">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge tono={u.activo ? "en-vivo" : "mute"}>{u.activo ? "Activo" : "Inactivo"}</Badge>
                    </td>
                    <td className="px-5 py-3.5 text-[var(--color-texto-mute)]">
                      {actividad
                        ? new Date(actividad).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
                        : "—"}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-right">
                      {u.rol !== "super_admin" && (
                        <button
                          onClick={() => {
                            setMostrarForm(false);
                            setEditando(u);
                          }}
                          className="mr-3 text-sm font-medium text-[var(--color-marca)] hover:underline"
                        >
                          Editar
                        </button>
                      )}
                      <button onClick={() => onVerLogs(u.id)} className="mr-3 text-sm font-medium text-[var(--color-texto-mute)] hover:text-[var(--color-texto)]">
                        Ver logs
                      </button>
                      {u.es_profesional && (
                        <Link href="/profesionales" className="mr-3 text-sm font-medium text-[var(--color-texto-mute)] hover:text-[var(--color-texto)]">
                          Ver en Profesionales
                        </Link>
                      )}
                      {u.rol !== "super_admin" && (
                        <button
                          onClick={() => reenviarAcceso(u)}
                          disabled={reenviando === u.id}
                          className="mr-3 text-sm font-medium text-[var(--color-texto-mute)] hover:text-[var(--color-texto)] disabled:opacity-50"
                        >
                          {reenviando === u.id ? "Enviando…" : "Reenviar acceso"}
                        </button>
                      )}
                      {u.rol !== "super_admin" &&
                        (u.activo ? (
                          <button onClick={() => desactivar(u)} className="text-sm font-medium text-red-500 hover:underline">
                            Desactivar
                          </button>
                        ) : (
                          <button onClick={() => reactivar(u)} className="text-sm font-medium text-[var(--color-marca)] hover:underline">
                            Reactivar
                          </button>
                        ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function FormularioUsuario({
  equipos,
  permisosCatalogo,
  usuario,
  miPerfilId,
  onGuardado,
  onCancelar,
}: {
  equipos: Equipo[];
  permisosCatalogo: Permiso[];
  usuario: PerfilUsuario | null;
  miPerfilId: string;
  onGuardado: () => void;
  onCancelar: () => void;
}) {
  const supabase = createClient();
  const [nombre, setNombre] = useState(usuario?.nombre ?? "");
  const [email, setEmail] = useState(usuario?.email ?? "");
  const [telefono, setTelefono] = useState(usuario?.telefono ?? "");
  const [rol, setRol] = useState<"admin" | "agente">(usuario?.rol === "admin" ? "admin" : "agente");
  const [equipoId, setEquipoId] = useState(usuario?.equipo_id ?? "");
  const [esProfesional, setEsProfesional] = useState(usuario?.es_profesional ?? false);
  const [especialidad, setEspecialidad] = useState(usuario?.especialidad ?? "");
  const [colorAgenda, setColorAgenda] = useState("#6b2fa0");
  const [emailGoogle, setEmailGoogle] = useState("");
  const [permisos, setPermisos] = useState<Record<string, boolean>>({});
  const [cargandoPermisos, setCargandoPermisos] = useState(!!usuario);
  const [historial, setHistorial] = useState<
    { id: string; permiso_clave: string; valor_anterior: boolean | null; valor_nuevo: boolean | null; tipo_cambio: string; razon: string | null; created_at: string; cambiado_por: string | null }[]
  >([]);
  const [razon, setRazon] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!usuario) {
      setCargandoPermisos(false);
      return;
    }
    (async () => {
      const [{ data: perms }, { data: hist }] = await Promise.all([
        supabase.from("perfil_permisos").select("permiso_clave, concedido").eq("perfil_id", usuario.id),
        supabase
          .from("historial_permisos")
          .select("id, permiso_clave, valor_anterior, valor_nuevo, tipo_cambio, razon, created_at, cambiado_por")
          .eq("perfil_id", usuario.id)
          .order("created_at", { ascending: false })
          .limit(8),
      ]);
      const mapa: Record<string, boolean> = {};
      for (const p of perms ?? []) mapa[p.permiso_clave] = p.concedido;
      setPermisos(mapa);
      setHistorial(hist ?? []);
      setCargandoPermisos(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario?.id]);

  function tienePermiso(clave: string) {
    if (clave in permisos) return permisos[clave];
    return rol === "admin"; // default: admin todo, agente nada, salvo excepción guardada
  }

  function alternarPermiso(clave: string) {
    setPermisos((prev) => ({ ...prev, [clave]: !tienePermiso(clave) }));
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);

    const permisosPayload = permisosCatalogo.map((p) => ({ clave: p.clave, concedido: tienePermiso(p.clave) }));

    const datosProfesional = esProfesional ? { especialidad, color_agenda: colorAgenda, email_google: emailGoogle } : undefined;

    if (usuario) {
      const res = await fetch(`/api/usuarios/${usuario.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre,
          telefono,
          rol,
          equipo_id: equipoId || null,
          permisos: permisosPayload,
          razon: razon.trim() || undefined,
          es_profesional: esProfesional,
          profesional: datosProfesional,
        }),
      });
      setEnviando(false);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "No se pudo guardar");
        return;
      }
    } else {
      const res = await fetch("/api/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre,
          email,
          telefono,
          rol,
          equipo_id: equipoId || null,
          permisos: permisosPayload,
          es_profesional: esProfesional,
          profesional: datosProfesional,
        }),
      });
      setEnviando(false);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "No se pudo crear el usuario");
        return;
      }
    }

    onGuardado();
  }

  const grupos = agruparPorCategoria(permisosCatalogo);

  return (
    <form onSubmit={guardar} className="mb-6 max-w-2xl space-y-4 rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-6">
      <h2 className="text-base font-semibold text-[var(--color-texto)]">{usuario ? "Editar usuario" : "Nuevo usuario"}</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Nombre</span>
          <input
            required
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Correo</span>
          <input
            required
            type="email"
            disabled={!!usuario}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)] disabled:opacity-60"
          />
          {!usuario && (
            <span className="mt-1 block text-xs text-[var(--color-texto-mute)]">
              Le llega un correo con un link para definir su contraseña.
            </span>
          )}
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Teléfono</span>
          <input
            required={!usuario}
            type="tel"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="10 dígitos"
            className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
          />
          {!usuario ? null : !telefono && (
            <span className="mt-1 block text-xs text-[var(--color-texto-mute)]">
              Este usuario todavía no lo ha capturado — puedes escribirlo tú aquí.
            </span>
          )}
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Rol</span>
          <select
            value={rol}
            onChange={(e) => setRol(e.target.value as "admin" | "agente")}
            className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
          >
            <option value="admin">Administrador</option>
            <option value="agente">Agente</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Equipo (opcional)</span>
          <select
            value={equipoId}
            onChange={(e) => setEquipoId(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
          >
            <option value="">Sin equipo</option>
            {equipos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="border-t border-[var(--color-borde)] pt-4">
        <label className="flex items-center gap-2 text-sm font-medium text-[var(--color-texto)]">
          <input type="checkbox" checked={esProfesional} onChange={(e) => setEsProfesional(e.target.checked)} disabled={!!usuario?.es_profesional} />
          Es profesionista
        </label>
        {usuario?.es_profesional && <p className="mt-1 text-xs text-[var(--color-texto-mute)]">Edita sus datos de agenda desde Profesionales.</p>}

        {esProfesional && !usuario?.es_profesional && (
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Especialidad</span>
              <input
                required
                value={especialidad}
                onChange={(e) => setEspecialidad(e.target.value)}
                placeholder="Ej. Cardiología"
                className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Correo de Google (opcional)</span>
              <input
                type="email"
                value={emailGoogle}
                onChange={(e) => setEmailGoogle(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
              />
            </label>
            <div>
              <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Color en la agenda</span>
              <input type="color" value={colorAgenda} onChange={(e) => setColorAgenda(e.target.value)} className="h-9 w-16 rounded border border-[var(--color-borde)] bg-transparent" />
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-[var(--color-borde)] pt-4">
        <h3 className="mb-1 text-sm font-semibold text-[var(--color-texto)]">Permisos</h3>
        <p className="mb-3 text-xs text-[var(--color-texto-mute)]">
          {rol === "admin"
            ? "Un administrador tiene todo por defecto — desmarca lo que quieras quitarle."
            : "Un agente no tiene nada por defecto — marca lo que quieras darle."}
        </p>
        {cargandoPermisos ? (
          <p className="text-sm text-[var(--color-texto-mute)]">Cargando…</p>
        ) : (
          <div className="space-y-3">
            {Object.entries(grupos).map(([categoria, items]) => (
              <div key={categoria}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-texto-mute)]">
                  {LABEL_CATEGORIA[categoria] ?? categoria}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                  {items.map((p) => (
                    <label key={p.clave} className="flex items-center gap-1.5 text-sm text-[var(--color-texto)]">
                      <input type="checkbox" checked={tienePermiso(p.clave)} onChange={() => alternarPermiso(p.clave)} />
                      {p.nombre}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {usuario && (
        <label className="block border-t border-[var(--color-borde)] pt-4">
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Razón del cambio (opcional)</span>
          <input
            value={razon}
            onChange={(e) => setRazon(e.target.value)}
            placeholder="Ej. Promovido a manager"
            className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
          />
        </label>
      )}

      {usuario && historial.length > 0 && (
        <div className="border-t border-[var(--color-borde)] pt-4">
          <h3 className="mb-2 text-sm font-semibold text-[var(--color-texto)]">Historial de cambios recientes</h3>
          <div className="space-y-1.5 text-xs text-[var(--color-texto-mute)]">
            {historial.map((h) => (
              <p key={h.id}>
                {new Date(h.created_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })} — {h.permiso_clave === "rol" ? "Cambio de rol" : h.permiso_clave}:{" "}
                {h.tipo_cambio === "cambio_rol" ? h.razon : `${h.valor_anterior === null ? "—" : h.valor_anterior ? "sí" : "no"} → ${h.valor_nuevo ? "sí" : "no"}`}
              </p>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-3 border-t border-[var(--color-borde)] pt-4">
        <button
          type="submit"
          disabled={enviando}
          style={{ boxShadow: "var(--halo-accion)" }}
          className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {enviando ? "Guardando…" : usuario ? "Guardar cambios" : "Crear usuario"}
        </button>
        <button type="button" onClick={onCancelar} className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--color-texto-mute)] hover:text-[var(--color-texto)]">
          Cancelar
        </button>
      </div>
    </form>
  );
}

// ============================================================
// TAB EQUIPOS
// ============================================================

function TabEquipos({ equipos, onCambio }: { equipos: Equipo[]; onCambio: () => void }) {
  const supabase = createClient();
  const [conteos, setConteos] = useState<Record<string, number>>({});
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editando, setEditando] = useState<Equipo | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("perfiles").select("equipo_id").not("equipo_id", "is", null);
      const mapa: Record<string, number> = {};
      for (const p of data ?? []) {
        if (p.equipo_id) mapa[p.equipo_id] = (mapa[p.equipo_id] ?? 0) + 1;
      }
      setConteos(mapa);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipos]);

  async function eliminar(id: string) {
    if (!confirm("¿Eliminar este equipo? Los usuarios que estén en él quedan sin equipo.")) return;
    await fetch(`/api/equipos/${id}`, { method: "DELETE" });
    onCambio();
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-[var(--color-texto-mute)]">Organiza usuarios en equipos/departamentos.</p>
        <button
          onClick={() => {
            setEditando(null);
            setMostrarForm((v) => !v);
          }}
          style={{ boxShadow: "var(--halo-accion)" }}
          className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90"
        >
          {mostrarForm && !editando ? "Cancelar" : "+ Nuevo equipo"}
        </button>
      </div>

      {(mostrarForm || editando) && (
        <FormularioEquipo
          equipo={editando}
          onGuardado={() => {
            setMostrarForm(false);
            setEditando(null);
            onCambio();
          }}
          onCancelar={() => {
            setMostrarForm(false);
            setEditando(null);
          }}
        />
      )}

      <div className="overflow-x-auto rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)]">
        {equipos.length === 0 ? (
          <p className="p-6 text-sm text-[var(--color-texto-mute)]">Todavía no hay equipos.</p>
        ) : (
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-borde)] text-xs uppercase tracking-wide text-[var(--color-texto-mute)]">
                <th className="px-5 py-3 font-medium">Equipo</th>
                <th className="px-5 py-3 font-medium">Miembros</th>
                <th className="px-5 py-3 font-medium">Creado</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {equipos.map((e) => (
                <tr key={e.id} className="border-b border-[var(--color-borde)] last:border-0">
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center gap-2 text-[var(--color-texto)]">
                      <span className="h-3 w-3 rounded-full" style={{ background: e.color }} />
                      {e.nombre}
                    </span>
                    {e.descripcion && <p className="mt-0.5 text-xs text-[var(--color-texto-mute)]">{e.descripcion}</p>}
                  </td>
                  <td className="px-5 py-3.5 text-[var(--color-texto)]">{conteos[e.id] ?? 0}</td>
                  <td className="px-5 py-3.5 text-[var(--color-texto-mute)]">
                    {new Date(e.created_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={() => {
                        setMostrarForm(false);
                        setEditando(e);
                      }}
                      className="mr-3 text-sm font-medium text-[var(--color-marca)] hover:underline"
                    >
                      Editar
                    </button>
                    <button onClick={() => eliminar(e.id)} className="text-sm font-medium text-red-500 hover:underline">
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const COLORES_PRESET = ["#8b5cf6", "#f97316", "#22c55e", "#0ea5e9", "#ef4444", "#eab308"];

function FormularioEquipo({ equipo, onGuardado, onCancelar }: { equipo: Equipo | null; onGuardado: () => void; onCancelar: () => void }) {
  const [nombre, setNombre] = useState(equipo?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(equipo?.descripcion ?? "");
  const [color, setColor] = useState(equipo?.color ?? COLORES_PRESET[0]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);

    const res = await fetch(equipo ? `/api/equipos/${equipo.id}` : "/api/equipos", {
      method: equipo ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, descripcion, color }),
    });
    setEnviando(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo guardar");
      return;
    }

    onGuardado();
  }

  return (
    <form onSubmit={guardar} className="mb-6 max-w-md space-y-4 rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)] p-6">
      <h2 className="text-base font-semibold text-[var(--color-texto)]">{equipo ? "Editar equipo" : "Nuevo equipo"}</h2>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Nombre del equipo</span>
        <input
          required
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej. Ventas, Soporte"
          className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Descripción (opcional)</span>
        <input
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          className="w-full rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
        />
      </label>

      <div>
        <span className="mb-1.5 block text-sm font-medium text-[var(--color-texto)]">Color</span>
        <div className="flex items-center gap-2">
          {COLORES_PRESET.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className="h-7 w-7 rounded-full"
              style={{ background: c, outline: color === c ? "2px solid var(--color-texto)" : "none", outlineOffset: 2 }}
            />
          ))}
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-7 w-9 rounded border border-[var(--color-borde)] bg-transparent" />
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={enviando}
          style={{ boxShadow: "var(--halo-accion)" }}
          className="rounded-lg bg-[var(--color-accion)] px-4 py-2 text-sm font-semibold text-[var(--color-accion-fg)] transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {enviando ? "Guardando…" : equipo ? "Guardar cambios" : "Crear equipo"}
        </button>
        <button type="button" onClick={onCancelar} className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--color-texto-mute)] hover:text-[var(--color-texto)]">
          Cancelar
        </button>
      </div>
    </form>
  );
}

// ============================================================
// TAB AUDITORÍA
// ============================================================

type LogActividad = {
  id: string;
  perfil_id: string | null;
  accion: string;
  recurso_tipo: string | null;
  recurso_id: string | null;
  detalles: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

function TabAuditoria({ filtroUsuarioInicial, onFiltroConsumido }: { filtroUsuarioInicial: string | null; onFiltroConsumido: () => void }) {
  const supabase = createClient();
  const [logs, setLogs] = useState<LogActividad[]>([]);
  const [usuarios, setUsuarios] = useState<{ id: string; nombre: string | null }[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtroUsuario, setFiltroUsuario] = useState<string>(filtroUsuarioInicial ?? "todos");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [expandido, setExpandido] = useState<string | null>(null);

  useEffect(() => {
    if (filtroUsuarioInicial) {
      setFiltroUsuario(filtroUsuarioInicial);
      onFiltroConsumido();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroUsuarioInicial]);

  async function cargar() {
    setCargando(true);
    let query = supabase.from("logs_actividad").select("*").order("created_at", { ascending: false }).limit(1000);
    if (filtroUsuario !== "todos") query = query.eq("perfil_id", filtroUsuario);
    if (desde) query = query.gte("created_at", desde);
    if (hasta) query = query.lte("created_at", `${hasta}T23:59:59`);

    const [{ data: logsData }, { data: perfiles }] = await Promise.all([
      query,
      supabase.from("perfiles").select("id, nombre"),
    ]);
    setLogs(logsData ?? []);
    setUsuarios(perfiles ?? []);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroUsuario, desde, hasta]);

  const nombreDe = (id: string | null) => usuarios.find((u) => u.id === id)?.nombre ?? "—";

  function descargarCsv() {
    const encabezados = ["Fecha", "Usuario", "Accion", "Recurso", "IP", "Navegador"];
    const filas = logs.map((l) => [
      new Date(l.created_at).toISOString(),
      nombreDe(l.perfil_id),
      LABEL_ACCION[l.accion] ?? l.accion,
      l.recurso_tipo ?? "",
      l.ip_address ?? "",
      (l.user_agent ?? "").replace(/,/g, ";"),
    ]);
    const csv = [encabezados, ...filas].map((f) => f.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `auditoria-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--color-texto-mute)]">Usuario</span>
          <select
            value={filtroUsuario}
            onChange={(e) => setFiltroUsuario(e.target.value)}
            className="rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]"
          >
            <option value="todos">Todos</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre ?? u.id}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--color-texto-mute)]">Desde</span>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--color-texto-mute)]">Hasta</span>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm text-[var(--color-texto)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]" />
        </label>
        <button
          onClick={descargarCsv}
          disabled={logs.length === 0}
          className="rounded-lg border border-[var(--color-borde)] bg-[var(--color-bg-elevada)] px-3 py-2 text-sm font-medium text-[var(--color-texto)] hover:opacity-80 disabled:opacity-50"
        >
          Descargar CSV
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[var(--color-borde)] bg-[var(--color-tarjeta)]">
        {cargando ? (
          <p className="p-6 text-sm text-[var(--color-texto-mute)]">Cargando…</p>
        ) : logs.length === 0 ? (
          <p className="p-6 text-sm text-[var(--color-texto-mute)]">Sin actividad registrada.</p>
        ) : (
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-borde)] text-xs uppercase tracking-wide text-[var(--color-texto-mute)]">
                <th className="px-5 py-3 font-medium">Fecha</th>
                <th className="px-5 py-3 font-medium">Usuario</th>
                <th className="px-5 py-3 font-medium">Acción</th>
                <th className="px-5 py-3 font-medium">Recurso</th>
                <th className="px-5 py-3 font-medium">IP</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <Fragment key={l.id}>
                  <tr className="border-b border-[var(--color-borde)] last:border-0">
                    <td className="px-5 py-3.5 text-[var(--color-texto-mute)]">
                      {new Date(l.created_at).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-5 py-3.5 text-[var(--color-texto)]">{nombreDe(l.perfil_id)}</td>
                    <td className="px-5 py-3.5 text-[var(--color-texto)]">{LABEL_ACCION[l.accion] ?? l.accion}</td>
                    <td className="px-5 py-3.5 text-[var(--color-texto-mute)]">{l.recurso_tipo ?? "—"}</td>
                    <td className="px-5 py-3.5 text-[var(--color-texto-mute)]">{l.ip_address ?? "—"}</td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => setExpandido(expandido === l.id ? null : l.id)}
                        className="text-sm font-medium text-[var(--color-marca)] hover:underline"
                      >
                        {expandido === l.id ? "Ocultar" : "Ver"}
                      </button>
                    </td>
                  </tr>
                  {expandido === l.id && (
                    <tr className="border-b border-[var(--color-borde)] last:border-0">
                      <td colSpan={6} className="bg-[var(--color-bg-elevada)] px-5 py-3 text-xs text-[var(--color-texto-mute)]">
                        <p>Navegador: {l.user_agent ?? "—"}</p>
                        <pre className="mt-1 whitespace-pre-wrap">{JSON.stringify(l.detalles, null, 2)}</pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

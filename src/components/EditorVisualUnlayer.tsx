"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { variablesPorTipo, type TipoPlantillaEmail } from "@/lib/plantillas-email-variables";

type MergeTag = { name: string; value: string };

type UnlayerInstance = {
  init: (opciones: Record<string, unknown>) => void;
  loadDesign: (diseno: unknown) => void;
  exportHtml: (callback: (data: { design: unknown; html: string }) => void) => void;
};

declare global {
  interface Window {
    unlayer?: UnlayerInstance;
  }
}

// El embed.js de Unlayer es JS puro (no un paquete de React) a propósito:
// react-email-editor apunta sus peer deps a React 16-18 y este proyecto ya
// está en React 19 -- se evita ese riesgo de incompatibilidad usando
// directamente el script de Unlayer.
let cargaScript: Promise<void> | null = null;

function cargarEmbedScript(): Promise<void> {
  if (typeof window !== "undefined" && window.unlayer) return Promise.resolve();
  if (!cargaScript) {
    cargaScript = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://editor.unlayer.com/embed.js";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("No se pudo cargar el editor visual"));
      document.body.appendChild(script);
    });
  }
  return cargaScript;
}

export type EditorVisualUnlayerRef = {
  exportar: () => Promise<{ html: string; diseno: unknown }>;
};

let contadorInstancias = 0;

const EditorVisualUnlayer = forwardRef<EditorVisualUnlayerRef, { tipo: TipoPlantillaEmail; disenoInicial?: unknown | null }>(
  function EditorVisualUnlayer({ tipo, disenoInicial }, ref) {
    const [listo, setListo] = useState(false);
    const [errorCarga, setErrorCarga] = useState<string | null>(null);
    const idContenedorRef = useRef(`editor-visual-unlayer-${++contadorInstancias}`);

    useEffect(() => {
      let cancelado = false;
      cargarEmbedScript()
        .then(() => {
          if (cancelado || !window.unlayer) return;

          const mergeTags: Record<string, MergeTag> = {};
          for (const v of variablesPorTipo(tipo)) mergeTags[v.clave] = { name: v.etiqueta, value: `{{${v.clave}}}` };

          const projectId = Number(process.env.NEXT_PUBLIC_UNLAYER_PROJECT_ID);
          window.unlayer.init({
            id: idContenedorRef.current,
            projectId: Number.isFinite(projectId) && projectId > 0 ? projectId : undefined,
            displayMode: "email",
            mergeTags,
          });
          if (disenoInicial) window.unlayer.loadDesign(disenoInicial);
          setListo(true);
        })
        .catch((e) => setErrorCarga(e instanceof Error ? e.message : "No se pudo cargar el editor visual"));
      return () => {
        cancelado = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useImperativeHandle(ref, () => ({
      exportar: () =>
        new Promise((resolve, reject) => {
          if (!window.unlayer) {
            reject(new Error("El editor visual no está listo"));
            return;
          }
          window.unlayer.exportHtml((data) => resolve({ html: data.html, diseno: data.design }));
        }),
    }));

    return (
      <div>
        {errorCarga && <p className="mb-2 text-sm text-red-500">{errorCarga}</p>}
        {!listo && !errorCarga && <p className="mb-2 text-xs text-[var(--color-texto-mute)]">Cargando editor visual…</p>}
        <div id={idContenedorRef.current} style={{ height: 600 }} />
      </div>
    );
  }
);

export default EditorVisualUnlayer;

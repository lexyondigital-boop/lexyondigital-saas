"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Tema = "negro" | "tornasol-oscuro" | "tornasol-claro";

const STORAGE_KEY = "lexyon-theme";
const TEMA_DEFECTO: Tema = "tornasol-claro";

const TemaContext = createContext<{
  tema: Tema;
  setTema: (tema: Tema) => void;
}>({ tema: TEMA_DEFECTO, setTema: () => {} });

export function aplicarTema(tema: Tema) {
  document.documentElement.setAttribute("data-theme", tema);
}

// Se inyecta como <script> inline en el <head>, antes de hidratar React,
// para que el tema guardado se aplique en el primer paint sin parpadeo.
export const SCRIPT_TEMA_INICIAL = `
(function () {
  try {
    var tema = localStorage.getItem("${STORAGE_KEY}") || "${TEMA_DEFECTO}";
    document.documentElement.setAttribute("data-theme", tema);
  } catch (e) {}
})();
`;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [tema, setTemaState] = useState<Tema>(TEMA_DEFECTO);

  useEffect(() => {
    const guardado = localStorage.getItem(STORAGE_KEY);
    if (guardado === "negro" || guardado === "tornasol-oscuro" || guardado === "tornasol-claro") {
      setTemaState(guardado);
    }
  }, []);

  function setTema(nuevo: Tema) {
    setTemaState(nuevo);
    localStorage.setItem(STORAGE_KEY, nuevo);
    aplicarTema(nuevo);
  }

  return <TemaContext.Provider value={{ tema, setTema }}>{children}</TemaContext.Provider>;
}

export function useTema() {
  return useContext(TemaContext);
}

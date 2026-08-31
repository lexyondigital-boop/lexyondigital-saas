import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Necesario para el build de Docker: genera server.js + solo las
  // dependencias que realmente se usan, en vez de copiar node_modules entero.
  output: "standalone",
  // pdf-parse y cheerio se usan con require() dinámico dentro de rutas de
  // servidor -- sin esto, el trazador de dependencias del build standalone
  // no las detecta y el contenedor de Docker se queda sin ellas en runtime.
  serverExternalPackages: ["pdf-parse", "cheerio"],
};

export default nextConfig;

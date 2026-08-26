import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Necesario para el build de Docker: genera server.js + solo las
  // dependencias que realmente se usan, en vez de copiar node_modules entero.
  output: "standalone",
};

export default nextConfig;

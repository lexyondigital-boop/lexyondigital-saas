import type { NextRequest } from "next/server";

// Detrás de Traefik, request.nextUrl.origin / request.url pueden resolver al
// hostname interno del contenedor (ej. "https://03c18176a084:3000") en vez
// del dominio público -- se vio primero como el link de "definir contraseña"
// mandando a esa dirección, y probablemente explica también el
// "Error 400: invalid_request" que dio Google en el connect de Calendar (el
// redirect_uri enviado no coincidía con el registrado). Traefik sí manda
// X-Forwarded-Proto/X-Forwarded-Host en cada request proxeado, así que se
// usan esos primero en vez de confiar en cómo Next.js reconstruye la URL.
export function origenPublico(request: NextRequest): string {
  const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
  return `${proto}://${host}`;
}

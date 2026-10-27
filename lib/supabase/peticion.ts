import "server-only"

import { MAX_BYTES_PETICION } from "@/lib/etl/carga"

/**
 * Lee un cuerpo JSON limitando su tamaño. Exigir application/json obliga al
 * navegador a hacer preflight CORS en peticiones de otros orígenes, que este
 * servidor no autoriza.
 */
export async function leerJsonLimitado(
  request: Request
): Promise<{ ok: true; cuerpo: unknown } | { ok: false; error: string; status: number }> {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return { ok: false, error: "Se esperaba Content-Type: application/json.", status: 415 }
  }
  const declarado = Number(request.headers.get("content-length") ?? 0)
  if (declarado > MAX_BYTES_PETICION) {
    return { ok: false, error: "La petición supera el tamaño máximo permitido.", status: 413 }
  }
  const texto = await request.text()
  if (new TextEncoder().encode(texto).length > MAX_BYTES_PETICION) {
    return { ok: false, error: "La petición supera el tamaño máximo permitido.", status: 413 }
  }
  try {
    return { ok: true, cuerpo: JSON.parse(texto) }
  } catch {
    return { ok: false, error: "El cuerpo no es JSON válido.", status: 400 }
  }
}

const enteros = new Intl.NumberFormat("es-ES")
const decimales = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 })

export function formatoEntero(n: number) {
  return enteros.format(n)
}

export function formatoNumero(n: number) {
  return decimales.format(n)
}

/** "2026-09-01T00:00:00.000Z" → "2026-09-01 00:00 UTC". */
export function formatoFechaHoraUtc(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`
}

export function formatoDuracion(ms: number | undefined) {
  if (ms === undefined) return "—"
  if (ms < 1) return "< 1 ms"
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toLocaleString("es-ES", { maximumFractionDigits: 2 })} s`
}

/** Muestra un valor tal como llegó, sin ocultar null, cadenas o ausencias. */
export function formatoValorCrudo(v: unknown): string {
  if (v === undefined) return "(ausente)"
  if (v === null) return "null"
  if (typeof v === "string") return JSON.stringify(v)
  if (typeof v === "number") return String(v)
  return JSON.stringify(v) ?? String(v)
}

/**
 * JSON legible con los arrays de primitivos en una sola línea, para que una
 * respuesta de 744 horas no ocupe miles de líneas.
 */
export function formatoJsonCompacto(valor: unknown, sangria = ""): string {
  const siguiente = sangria + "  "
  if (Array.isArray(valor)) {
    if (valor.every((x) => x === null || typeof x !== "object")) {
      return `[${valor.map((x) => JSON.stringify(x) ?? "null").join(", ")}]`
    }
    return `[\n${valor.map((x) => siguiente + formatoJsonCompacto(x, siguiente)).join(",\n")}\n${sangria}]`
  }
  if (valor && typeof valor === "object") {
    const entradas = Object.entries(valor)
    if (entradas.length === 0) return "{}"
    return `{\n${entradas
      .map(([k, v]) => `${siguiente}${JSON.stringify(k)}: ${formatoJsonCompacto(v, siguiente)}`)
      .join(",\n")}\n${sangria}}`
  }
  return JSON.stringify(valor) ?? "null"
}

export function descargarJson(nombreArchivo: string, datos: unknown) {
  const blob = new Blob([JSON.stringify(datos, null, 2)], {
    type: "application/json",
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = nombreArchivo
  a.click()
  URL.revokeObjectURL(url)
}

/** Ejecuta fn y devuelve su resultado junto con la duración real en ms. */
export function medir<T>(fn: () => T): { resultado: T; duracionMs: number } {
  const inicio = performance.now()
  const resultado = fn()
  return { resultado, duracionMs: performance.now() - inicio }
}

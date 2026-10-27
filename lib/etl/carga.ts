import { NOMBRES_CIUDADES } from "./ciudades"
import { claveMedicion, problemaNumerico } from "./limpieza"
import type { Medicion } from "./tipos"

export const TAMANO_LOTE = 500
/** 500 registros ocupan unos 70 KB en JSON; se deja margen. */
export const MAX_BYTES_PETICION = 256 * 1024

export function dividirEnLotes<T>(filas: T[], tamano = TAMANO_LOTE): T[][] {
  const lotes: T[][] = []
  for (let i = 0; i < filas.length; i += tamano) {
    lotes.push(filas.slice(i, i + tamano))
  }
  return lotes
}

/** Normaliza una marca de tiempo a ISO UTC; null si no es válida. */
export function normalizarFechaHora(valor: unknown): string | null {
  if (typeof valor !== "string" || valor.length > 40) return null
  // Exige zona explícita (Z u offset) para no depender de la zona del servidor.
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(valor)) return null
  const ms = Date.parse(valor)
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null
}

const CAMPOS_MEDICION = [
  "ciudad",
  "fecha_hora",
  "temperatura_c",
  "humedad_pct",
  "precipitacion_mm",
] as const

type Resultado<T> = { ok: true; valor: T } | { ok: false; error: string }

function validarMedicion(valor: unknown, i: number): Resultado<Medicion> {
  const fallo = (m: string) => ({ ok: false as const, error: `Registro ${i}: ${m}` })
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) {
    return fallo("no es un objeto")
  }
  const o = valor as Record<string, unknown>
  const extra = Object.keys(o).filter(
    (k) => !(CAMPOS_MEDICION as readonly string[]).includes(k)
  )
  if (extra.length > 0) return fallo(`campos no permitidos: ${extra.join(", ")}`)
  if (typeof o.ciudad !== "string" || !NOMBRES_CIUDADES.includes(o.ciudad)) {
    return fallo("ciudad desconocida")
  }
  const fecha = normalizarFechaHora(o.fecha_hora)
  if (!fecha) return fallo("fecha_hora no es una marca de tiempo ISO con zona")
  for (const campo of ["temperatura_c", "humedad_pct", "precipitacion_mm"] as const) {
    const problema = problemaNumerico(o[campo])
    if (problema) return fallo(`${campo} ${problema}`)
  }
  const h = o.humedad_pct as number
  const p = o.precipitacion_mm as number
  if (h < 0 || h > 100) return fallo("humedad_pct fuera de 0–100")
  if (p < 0) return fallo("precipitacion_mm negativa")
  return {
    ok: true,
    valor: {
      ciudad: o.ciudad,
      fecha_hora: fecha,
      temperatura_c: o.temperatura_c as number,
      humedad_pct: h,
      precipitacion_mm: p,
    },
  }
}

/** Validación en servidor del cuerpo de POST /api/supabase/cargar. */
export function validarPeticionCarga(cuerpo: unknown): Resultado<Medicion[]> {
  if (!cuerpo || typeof cuerpo !== "object" || !("registros" in cuerpo)) {
    return { ok: false, error: "Se esperaba un objeto con la propiedad registros." }
  }
  const registros = (cuerpo as { registros: unknown }).registros
  if (!Array.isArray(registros)) {
    return { ok: false, error: "registros debe ser un array." }
  }
  if (registros.length === 0 || registros.length > TAMANO_LOTE) {
    return {
      ok: false,
      error: `Cada lote debe tener entre 1 y ${TAMANO_LOTE} registros (recibidos: ${registros.length}).`,
    }
  }
  const validos: Medicion[] = []
  const claves = new Set<string>()
  for (let i = 0; i < registros.length; i++) {
    const r = validarMedicion(registros[i], i)
    if (!r.ok) return r
    const clave = claveMedicion(r.valor)
    // Postgres rechaza un upsert que toca dos veces la misma fila.
    if (claves.has(clave)) {
      return { ok: false, error: `Registro ${i}: clave duplicada en el lote (${clave}).` }
    }
    claves.add(clave)
    validos.push(r.valor)
  }
  return { ok: true, valor: validos }
}

export type ClaveMedicion = { ciudad: string; fecha_hora: string }

/** Validación en servidor del cuerpo de POST /api/supabase/verificar. */
export function validarPeticionVerificacion(
  cuerpo: unknown
): Resultado<ClaveMedicion[]> {
  if (!cuerpo || typeof cuerpo !== "object" || !("claves" in cuerpo)) {
    return { ok: false, error: "Se esperaba un objeto con la propiedad claves." }
  }
  const claves = (cuerpo as { claves: unknown }).claves
  if (!Array.isArray(claves) || claves.length === 0 || claves.length > TAMANO_LOTE) {
    return { ok: false, error: `claves debe ser un array de 1 a ${TAMANO_LOTE} elementos.` }
  }
  const resultado: ClaveMedicion[] = []
  for (let i = 0; i < claves.length; i++) {
    const c = claves[i] as Record<string, unknown> | null
    const fecha = c ? normalizarFechaHora(c.fecha_hora) : null
    if (!c || typeof c.ciudad !== "string" || !NOMBRES_CIUDADES.includes(c.ciudad) || !fecha) {
      return { ok: false, error: `Clave ${i} no válida.` }
    }
    resultado.push({ ciudad: c.ciudad, fecha_hora: fecha })
  }
  return { ok: true, valor: resultado }
}

/* ---------- Orquestación de la carga por lotes (cliente) ---------- */

export type EstadoVerificacion =
  | { estado: "pendiente" }
  | { estado: "verificando" }
  | { estado: "correcta"; encontrados: number }
  | { estado: "incompleta"; encontrados: number; faltantes: string[] }
  | { estado: "error"; error: string }

export type EstadoLote = {
  numero: number
  registros: Medicion[]
  estado: "pendiente" | "enviando" | "correcto" | "error"
  /** Filas que Supabase informa como procesadas (insertadas o actualizadas). */
  procesados?: number | null
  error?: string
  duracionMs?: number
  intentos: number
  verificacion: EstadoVerificacion
}

export function crearLotes(registros: Medicion[]): EstadoLote[] {
  // Copia profunda: la carga queda congelada aunque cambien filtros o selección.
  const copia: Medicion[] = registros.map((r) => ({ ...r }))
  return dividirEnLotes(copia).map((regs, i) => ({
    numero: i + 1,
    registros: regs,
    estado: "pendiente",
    intentos: 0,
    verificacion: { estado: "pendiente" },
  }))
}

export type EnviarLote = (
  registros: Medicion[]
) => Promise<{ procesados: number | null }>
export type VerificarLote = (
  claves: ClaveMedicion[]
) => Promise<{ encontradas: string[] }>

/**
 * Envía en secuencia los lotes indicados. Un fallo no detiene los lotes
 * siguientes ni altera los ya completados; cada lote es idempotente gracias
 * al upsert por (ciudad, fecha_hora). Tras cada envío correcto se verifica
 * que las claves existen en destino.
 */
export async function ejecutarLotes(
  lotes: EstadoLote[],
  indices: number[],
  enviar: EnviarLote,
  verificar: VerificarLote,
  actualizar: (indice: number, cambios: Partial<EstadoLote>) => void,
  ahora: () => number = () => performance.now()
): Promise<void> {
  for (const i of indices) {
    const lote = lotes[i]
    const intentos = lote.intentos + 1
    actualizar(i, {
      estado: "enviando",
      error: undefined,
      intentos,
      verificacion: { estado: "pendiente" },
    })
    const inicio = ahora()
    try {
      const { procesados } = await enviar(lote.registros)
      actualizar(i, {
        estado: "correcto",
        procesados,
        duracionMs: ahora() - inicio,
      })
    } catch (e) {
      actualizar(i, {
        estado: "error",
        error: e instanceof Error ? e.message : String(e),
        duracionMs: ahora() - inicio,
      })
      continue
    }

    actualizar(i, { verificacion: { estado: "verificando" } })
    try {
      const { encontradas } = await verificar(
        lote.registros.map((r) => ({ ciudad: r.ciudad, fecha_hora: r.fecha_hora }))
      )
      const conjunto = new Set(encontradas)
      const faltantes = lote.registros
        .map(claveMedicion)
        .filter((k) => !conjunto.has(k))
      actualizar(i, {
        verificacion:
          faltantes.length === 0
            ? { estado: "correcta", encontrados: lote.registros.length }
            : {
                estado: "incompleta",
                encontrados: lote.registros.length - faltantes.length,
                faltantes,
              },
      })
    } catch (e) {
      actualizar(i, {
        verificacion: {
          estado: "error",
          error: e instanceof Error ? e.message : String(e),
        },
      })
    }
  }
}

export function resumirCarga(lotes: EstadoLote[]) {
  let correctos = 0
  let fallidos = 0
  let pendientes = 0
  let verificados = 0
  let noEncontrados = 0
  let procesadosInformados: number | null = 0
  for (const l of lotes) {
    const n = l.registros.length
    if (l.estado === "correcto") {
      correctos += n
      if (l.procesados == null) procesadosInformados = null
      else if (procesadosInformados !== null) procesadosInformados += l.procesados
    } else if (l.estado === "error") fallidos += n
    else pendientes += n
    if (l.verificacion.estado === "correcta") verificados += l.verificacion.encontrados
    if (l.verificacion.estado === "incompleta") {
      verificados += l.verificacion.encontrados
      noEncontrados += l.verificacion.faltantes.length
    }
  }
  return {
    total: lotes.reduce((s, l) => s + l.registros.length, 0),
    correctos,
    fallidos,
    pendientes,
    verificados,
    noEncontrados,
    procesadosInformados,
  }
}

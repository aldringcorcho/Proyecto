import { claveMedicion } from "./limpieza"
import type { Medicion } from "./tipos"

export type Filtros = {
  /** Nombres de ciudad incluidos. */
  ciudades: string[]
  /** "YYYY-MM-DDTHH:mm" interpretado en UTC, o "" para no filtrar. */
  desde: string
  hasta: string
  temperaturaMin: string
  temperaturaMax: string
  humedadMin: string
  humedadMax: string
  precipitacionMin: string
  precipitacionMax: string
  soloLluvia: boolean
}

export type CampoOrden =
  | "ciudad"
  | "fecha_hora"
  | "temperatura_c"
  | "humedad_pct"
  | "precipitacion_mm"

export type Orden = { campo: CampoOrden; direccion: "asc" | "desc" }

export const ORDEN_INICIAL: Orden = { campo: "fecha_hora", direccion: "asc" }

export function filtrosIniciales(ciudades: string[]): Filtros {
  return {
    ciudades,
    desde: "",
    hasta: "",
    temperaturaMin: "",
    temperaturaMax: "",
    humedadMin: "",
    humedadMax: "",
    precipitacionMin: "",
    precipitacionMax: "",
    soloLluvia: false,
  }
}

function leerNumero(texto: string): number | null | "invalido" {
  const t = texto.trim().replace(",", ".")
  if (t === "") return null
  const n = Number(t)
  return Number.isFinite(n) ? n : "invalido"
}

function leerFechaHora(texto: string): number | null | "invalido" {
  if (texto.trim() === "") return null
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(texto.trim())
  if (!m) return "invalido"
  const [a, mes, d, h, min] = m.slice(1).map(Number)
  const ms = Date.UTC(a, mes - 1, d, h, min)
  return Number.isFinite(ms) ? ms : "invalido"
}

type Intervalo = { min: number | null; max: number | null }

export type FiltrosInterpretados = {
  ciudades: Set<string>
  fecha: Intervalo
  temperatura: Intervalo
  humedad: Intervalo
  precipitacion: Intervalo
  soloLluvia: boolean
  errores: string[]
}

export function interpretarFiltros(f: Filtros): FiltrosInterpretados {
  const errores: string[] = []

  function intervalo(
    min: number | null | "invalido",
    max: number | null | "invalido",
    nombre: string
  ): Intervalo {
    if (min === "invalido") errores.push(`${nombre}: el mínimo no es válido.`)
    if (max === "invalido") errores.push(`${nombre}: el máximo no es válido.`)
    const a = min === "invalido" ? null : min
    const b = max === "invalido" ? null : max
    if (a !== null && b !== null && a > b) {
      errores.push(`${nombre}: el mínimo es mayor que el máximo.`)
    }
    return { min: a, max: b }
  }

  return {
    ciudades: new Set(f.ciudades),
    fecha: intervalo(
      leerFechaHora(f.desde),
      leerFechaHora(f.hasta),
      "Fecha y hora"
    ),
    temperatura: intervalo(
      leerNumero(f.temperaturaMin),
      leerNumero(f.temperaturaMax),
      "Temperatura"
    ),
    humedad: intervalo(
      leerNumero(f.humedadMin),
      leerNumero(f.humedadMax),
      "Humedad"
    ),
    precipitacion: intervalo(
      leerNumero(f.precipitacionMin),
      leerNumero(f.precipitacionMax),
      "Precipitación"
    ),
    soloLluvia: f.soloLluvia,
    errores,
  }
}

function dentro(valor: number, { min, max }: Intervalo) {
  return (min === null || valor >= min) && (max === null || valor <= max)
}

export function cumpleFiltros(m: Medicion, f: FiltrosInterpretados): boolean {
  return (
    f.ciudades.has(m.ciudad) &&
    dentro(Date.parse(m.fecha_hora), f.fecha) &&
    dentro(m.temperatura_c, f.temperatura) &&
    dentro(m.humedad_pct, f.humedad) &&
    dentro(m.precipitacion_mm, f.precipitacion) &&
    (!f.soloLluvia || m.precipitacion_mm > 0)
  )
}

const comparadorCiudad = new Intl.Collator("es")

function comparar(a: Medicion, b: Medicion, campo: CampoOrden): number {
  if (campo === "ciudad") return comparadorCiudad.compare(a.ciudad, b.ciudad)
  if (campo === "fecha_hora") {
    return a.fecha_hora < b.fecha_hora ? -1 : a.fecha_hora > b.fecha_hora ? 1 : 0
  }
  return a[campo] - b[campo]
}

/**
 * Ordena sin modificar el array original. Los empates se resuelven por
 * ciudad y fecha (ascendente) para que el orden sea determinista.
 */
export function ordenar(registros: Medicion[], orden: Orden): Medicion[] {
  const signo = orden.direccion === "asc" ? 1 : -1
  return [...registros].sort(
    (a, b) =>
      signo * comparar(a, b, orden.campo) ||
      comparar(a, b, "ciudad") ||
      comparar(a, b, "fecha_hora")
  )
}

/** válidos → filtros → ordenación. La paginación se aplica después, solo al mostrar. */
export function filtrarYOrdenar(
  validos: Medicion[],
  filtros: Filtros,
  orden: Orden
) {
  const interpretados = interpretarFiltros(filtros)
  const filtrados = validos.filter((m) => cumpleFiltros(m, interpretados))
  return {
    ordenados: ordenar(filtrados, orden),
    errores: interpretados.errores,
  }
}

/**
 * Conjunto exacto a subir: filas seleccionadas que siguen cumpliendo los
 * filtros, en el orden elegido.
 */
export function conjuntoDeCarga(
  ordenados: Medicion[],
  seleccion: ReadonlySet<string>
): Medicion[] {
  return ordenados.filter((m) => seleccion.has(claveMedicion(m)))
}

export function paginar<T>(filas: T[], pagina: number, tamano: number): T[] {
  return filas.slice(pagina * tamano, (pagina + 1) * tamano)
}

// Tipos y colores del mapa, sin importar Leaflet: se pueden usar también en el servidor.
import type { Ciudad, EstadoFase } from "@/lib/etl/tipos"

/** Datos de la ficha que se abre al pulsar una ciudad. */
export type FichaCiudad = {
  url: string
  /** true si la URL es la de la última extracción; false si es la que se usaría ahora. */
  extraida: boolean
  horas: number | null
  validos: number | null
  rechazados: number | null
  temperaturaMin: number | null
  temperaturaMedia: number | null
  temperaturaMax: number | null
  lluvia: number | null
  humedad: number | null
  duracionMs?: number
  error?: string
}

export type PuntoCiudad = {
  ciudad: Ciudad
  marcada: boolean
  /** Estado de la ciudad en la extracción actual; null si no forma parte de ella. */
  estado: EstadoFase | null
  /** Texto corto bajo el nombre (p. ej. temperatura media); null si aún no hay datos. */
  resumen: string | null
  ficha: FichaCiudad
}

/** Color del punto: el estado de la extracción manda; si no hay, la selección. */
export const COLOR_PUNTO = {
  pendiente: "#ffffff",
  en_curso: "#0466c8",
  completada: "#059669",
  error: "#c62828",
  marcada: "#0466c8",
  sinMarcar: "#979dac",
} as const

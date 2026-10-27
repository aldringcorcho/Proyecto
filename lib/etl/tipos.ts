export type Ciudad = {
  id: string
  nombre: string
  latitud: number
  longitud: number
}

export type EstadoFase = "pendiente" | "en_curso" | "completada" | "error"

/** Respuesta JSON tal y como la devuelve Open-Meteo (sin modificar). */
export type RespuestaOpenMeteo = {
  latitude?: number
  longitude?: number
  utc_offset_seconds?: number
  timezone?: string
  hourly_units?: Record<string, string>
  hourly?: Record<string, unknown>
  [clave: string]: unknown
}

export type ResultadoExtraccionCiudad = {
  ciudadId: string
  estado: "pendiente" | "en_curso" | "completada" | "error"
  url: string
  respuesta?: RespuestaOpenMeteo
  error?: string
  duracionMs?: number
  intentos: number
}

/**
 * Registro tras convertir los arrays paralelos en filas. Las mediciones se
 * conservan tal y como llegaron (pueden ser null, cadenas, etc.); la
 * validación ocurre en la fase de limpieza.
 */
export type RegistroTransformado = {
  ciudad: string
  /** Posición dentro de los arrays de la respuesta original. */
  indice: number
  hora_original: unknown
  /** ISO 8601 en UTC (terminado en Z) o null si la hora no es válida. */
  fecha_hora: string | null
  temperatura_c: unknown
  humedad_pct: unknown
  precipitacion_mm: unknown
  /** Problemas de la respuesta que afectan a todas sus filas. */
  problemas_origen: string[]
}

export type IncidenciaEstructura = {
  ciudad: string
  mensaje: string
}

/** Registro válido con la estructura normalizada que se sube a Supabase. */
export type Medicion = {
  ciudad: string
  fecha_hora: string
  temperatura_c: number
  humedad_pct: number
  precipitacion_mm: number
}

export type RegistroRechazado = {
  registro: RegistroTransformado
  motivos: string[]
}

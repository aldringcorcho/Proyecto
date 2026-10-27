import type {
  IncidenciaEstructura,
  RegistroTransformado,
  RespuestaOpenMeteo,
} from "./tipos"

/** Variable de Open-Meteo → columna normalizada y unidad esperada. */
export const MAPEO_VARIABLES = [
  { origen: "temperature_2m", destino: "temperatura_c", unidad: "°C" },
  { origen: "relative_humidity_2m", destino: "humedad_pct", unidad: "%" },
  { origen: "precipitation", destino: "precipitacion_mm", unidad: "mm" },
] as const

const PATRON_HORA = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/

/**
 * Interpreta "YYYY-MM-DDTHH:mm" como hora local con el desfase indicado
 * (0 cuando se pide timezone=UTC) y devuelve ISO 8601 en UTC. No se usa
 * `new Date(texto)` porque, sin sufijo de zona, el navegador la tomaría como
 * hora local del equipo.
 */
export function interpretarHoraUtc(
  valor: unknown,
  desfaseSegundos = 0
): string | null {
  if (typeof valor !== "string") return null
  const m = PATRON_HORA.exec(valor)
  if (!m) return null
  const [a, mes, d, h, min, s] = m.slice(1).map((x) => Number(x ?? 0))
  if (h > 23 || min > 59 || s > 59) return null
  const ms = Date.UTC(a, mes - 1, d, h, min, s)
  const f = new Date(ms)
  if (
    f.getUTCFullYear() !== a ||
    f.getUTCMonth() !== mes - 1 ||
    f.getUTCDate() !== d
  ) {
    return null
  }
  return new Date(ms - desfaseSegundos * 1000).toISOString()
}

export type ResultadoTransformacion = {
  registros: RegistroTransformado[]
  incidencias: IncidenciaEstructura[]
}

/** Convierte los arrays paralelos de una respuesta en un registro por hora. */
export function transformarRespuesta(
  ciudad: string,
  respuesta: RespuestaOpenMeteo
): ResultadoTransformacion {
  const incidencias: IncidenciaEstructura[] = []
  const problemas: string[] = []
  const horario = respuesta.hourly ?? {}
  const horas = Array.isArray(horario.time) ? horario.time : []

  const desfase =
    typeof respuesta.utc_offset_seconds === "number"
      ? respuesta.utc_offset_seconds
      : 0
  if (desfase !== 0) {
    incidencias.push({
      ciudad,
      mensaje: `utc_offset_seconds = ${desfase}; las horas se convierten a UTC restando el desfase.`,
    })
  }

  const columnas = MAPEO_VARIABLES.map((v) => {
    const valores = horario[v.origen]
    if (!Array.isArray(valores)) {
      problemas.push(`Falta el array ${v.origen} en la respuesta`)
      return { ...v, valores: [] as unknown[] }
    }
    if (valores.length !== horas.length) {
      problemas.push(
        `Longitudes incoherentes: ${v.origen} tiene ${valores.length} valores y time tiene ${horas.length}`
      )
    }
    const unidad = respuesta.hourly_units?.[v.origen]
    if (unidad !== undefined && unidad !== v.unidad) {
      problemas.push(
        `Unidad inesperada en ${v.origen}: "${unidad}" (se esperaba "${v.unidad}")`
      )
    }
    return { ...v, valores: valores as unknown[] }
  })

  for (const p of problemas) incidencias.push({ ciudad, mensaje: p })

  const registros = horas.map((hora, i): RegistroTransformado => {
    const registro: RegistroTransformado = {
      ciudad,
      indice: i,
      hora_original: hora,
      fecha_hora: interpretarHoraUtc(hora, desfase),
      temperatura_c: undefined,
      humedad_pct: undefined,
      precipitacion_mm: undefined,
      problemas_origen: problemas,
    }
    for (const c of columnas) {
      // Un índice fuera del array queda como undefined ("ausente"), nunca 0.
      registro[c.destino] = i < c.valores.length ? c.valores[i] : undefined
    }
    return registro
  })

  return { registros, incidencias }
}

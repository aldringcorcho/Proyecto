import type { Ciudad, RespuestaOpenMeteo } from "./tipos"

export const URL_ARCHIVO_OPEN_METEO =
  "https://archive-api.open-meteo.com/v1/archive"
export const VARIABLES_HORARIAS = [
  "temperature_2m",
  "relative_humidity_2m",
  "precipitation",
] as const
export const MAX_DIAS_EXTRACCION = 31
export const FECHA_MINIMA_ARCHIVO = "1940-01-01"
/** Open-Meteo indica un retraso aproximado de 5 días en los datos ERA5. */
export const DIAS_RETRASO_ARCHIVO = 5

const MS_DIA = 86_400_000
const PATRON_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/

/** Convierte "YYYY-MM-DD" en milisegundos UTC; null si la fecha no existe. */
export function fechaUtcAMs(fecha: string): number | null {
  const m = PATRON_FECHA.exec(fecha)
  if (!m) return null
  const [a, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const ms = Date.UTC(a, mes - 1, d)
  const f = new Date(ms)
  if (
    f.getUTCFullYear() !== a ||
    f.getUTCMonth() !== mes - 1 ||
    f.getUTCDate() !== d
  ) {
    return null
  }
  return ms
}

export function hoyUtc(ahora = new Date()): string {
  return ahora.toISOString().slice(0, 10)
}

export type ValidacionConfiguracion = {
  errores: string[]
  avisos: string[]
  dias: number
  registrosPrevistos: number
}

export function validarConfiguracion(
  ciudadIds: string[],
  fechaInicio: string,
  fechaFin: string,
  hoy: string = hoyUtc()
): ValidacionConfiguracion {
  const errores: string[] = []
  const avisos: string[] = []
  let dias = 0

  if (ciudadIds.length === 0) errores.push("Selecciona al menos una ciudad.")

  const inicio = fechaUtcAMs(fechaInicio)
  const fin = fechaUtcAMs(fechaFin)
  const hoyMs = fechaUtcAMs(hoy)!

  if (inicio === null) errores.push("La fecha inicial no es válida.")
  if (fin === null) errores.push("La fecha final no es válida.")

  if (inicio !== null && fin !== null) {
    if (inicio > fin) {
      errores.push("La fecha inicial debe ser anterior o igual a la final.")
    } else {
      dias = Math.round((fin - inicio) / MS_DIA) + 1
      if (dias > MAX_DIAS_EXTRACCION) {
        errores.push(
          `El periodo abarca ${dias} días; el máximo por extracción es ${MAX_DIAS_EXTRACCION}.`
        )
      }
    }
    if (inicio < fechaUtcAMs(FECHA_MINIMA_ARCHIVO)!) {
      errores.push("El archivo histórico empieza el 1 de enero de 1940.")
    }
    if (fin > hoyMs) {
      errores.push(
        `La fecha final es posterior a hoy (${hoy}, UTC): la API histórica no tiene datos futuros.`
      )
    } else if (fin > hoyMs - DIAS_RETRASO_ARCHIVO * MS_DIA) {
      avisos.push(
        `Los últimos ${DIAS_RETRASO_ARCHIVO} días pueden llegar incompletos: Open-Meteo devolverá null en las horas que aún no ha procesado y esas filas se rechazarán en la limpieza.`
      )
    }
  }

  const valido = errores.length === 0
  return {
    errores,
    avisos,
    dias: valido ? dias : 0,
    registrosPrevistos: valido ? dias * 24 * ciudadIds.length : 0,
  }
}

export function construirUrlExtraccion(
  ciudad: Ciudad,
  fechaInicio: string,
  fechaFin: string
): string {
  const params = new URLSearchParams({
    latitude: String(ciudad.latitud),
    longitude: String(ciudad.longitud),
    start_date: fechaInicio,
    end_date: fechaFin,
    hourly: VARIABLES_HORARIAS.join(","),
    timezone: "UTC",
    temperature_unit: "celsius",
    precipitation_unit: "mm",
    timeformat: "iso8601",
  })
  return `${URL_ARCHIVO_OPEN_METEO}?${params.toString()}`
}

/**
 * Descarga la respuesta de una ciudad. Lanza un Error con un mensaje en
 * castellano si la petición falla o la respuesta no tiene la forma esperada.
 */
export async function descargarCiudad(
  url: string,
  fetchFn: typeof fetch = fetch,
  timeoutMs = 30_000
): Promise<RespuestaOpenMeteo> {
  let respuesta: Response
  try {
    respuesta = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) })
  } catch (e) {
    const nombre = e instanceof Error ? e.name : ""
    if (nombre === "TimeoutError") {
      throw new Error(`Tiempo de espera agotado (${timeoutMs / 1000} s).`)
    }
    throw new Error(
      "No se pudo conectar con Open-Meteo. Comprueba la conexión a internet."
    )
  }

  let cuerpo: unknown
  try {
    cuerpo = await respuesta.json()
  } catch {
    throw new Error(
      `Open-Meteo respondió HTTP ${respuesta.status} con un cuerpo que no es JSON.`
    )
  }

  if (!respuesta.ok) {
    const motivo =
      cuerpo && typeof cuerpo === "object" && "reason" in cuerpo
        ? String((cuerpo as { reason: unknown }).reason)
        : "sin detalle"
    throw new Error(`Open-Meteo respondió HTTP ${respuesta.status}: ${motivo}`)
  }

  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) {
    throw new Error("La respuesta de Open-Meteo no es un objeto JSON.")
  }
  const json = cuerpo as RespuestaOpenMeteo
  if (!json.hourly || !Array.isArray(json.hourly.time)) {
    throw new Error("La respuesta no contiene el array hourly.time.")
  }
  return json
}

import type { Medicion, RegistroRechazado, RegistroTransformado } from "./tipos"

export function claveMedicion(m: { ciudad: string; fecha_hora: string }) {
  return `${m.ciudad}|${m.fecha_hora}`
}

/**
 * Describe por qué un valor no es un número finito. Devuelve null si es
 * válido. No hay conversión implícita: "12", "", null o undefined nunca se
 * convierten en número (y en particular, nunca en 0).
 */
export function problemaNumerico(valor: unknown): string | null {
  if (valor === undefined) return "ausente"
  if (valor === null) return "nulo"
  if (typeof valor === "string") {
    return valor.trim() === "" ? "cadena vacía" : `texto "${valor}"`
  }
  if (typeof valor !== "number") return `tipo ${typeof valor}`
  if (Number.isNaN(valor)) return "NaN"
  if (!Number.isFinite(valor)) return "infinito"
  return null
}

const CAMPOS = [
  { campo: "temperatura_c", etiqueta: "Temperatura" },
  { campo: "humedad_pct", etiqueta: "Humedad" },
  { campo: "precipitacion_mm", etiqueta: "Precipitación" },
] as const

/** Motivos de rechazo de un registro individual (vacío si es válido). */
export function motivosRechazo(r: RegistroTransformado): string[] {
  const motivos = [...r.problemas_origen]

  if (typeof r.ciudad !== "string" || r.ciudad.trim() === "") {
    motivos.push("Sin ciudad")
  }
  if (r.fecha_hora === null) {
    motivos.push(`Fecha y hora no válida (${JSON.stringify(r.hora_original)})`)
  }
  for (const { campo, etiqueta } of CAMPOS) {
    const problema = problemaNumerico(r[campo])
    if (problema) motivos.push(`${etiqueta}: valor ${problema}`)
  }

  const humedad = r.humedad_pct
  if (typeof humedad === "number" && Number.isFinite(humedad)) {
    if (humedad < 0 || humedad > 100) {
      motivos.push(`Humedad fuera de 0–100 % (${humedad})`)
    }
  }
  const precipitacion = r.precipitacion_mm
  if (typeof precipitacion === "number" && Number.isFinite(precipitacion)) {
    if (precipitacion < 0) {
      motivos.push(`Precipitación negativa (${precipitacion} mm)`)
    }
  }
  // La temperatura no se acota: un valor extremo pero finito es un dato
  // legítimo y descartarlo con un umbral arbitrario sesgaría el análisis.
  return motivos
}

export type ResultadoLimpieza = {
  validos: Medicion[]
  rechazados: RegistroRechazado[]
  duplicados: number
}

/**
 * Valida cada registro y elimina duplicados por (ciudad, fecha_hora).
 * Criterio: se conserva la PRIMERA aparición válida en el orden de
 * extracción (orden de ciudades y, dentro de cada ciudad, orden de la API);
 * las siguientes se rechazan indicando con qué índice coinciden.
 */
export function limpiar(registros: RegistroTransformado[]): ResultadoLimpieza {
  const validos: Medicion[] = []
  const rechazados: RegistroRechazado[] = []
  const vistos = new Map<string, number>()
  let duplicados = 0

  for (const r of registros) {
    const motivos = motivosRechazo(r)
    if (motivos.length > 0) {
      rechazados.push({ registro: r, motivos })
      continue
    }
    const medicion: Medicion = {
      ciudad: r.ciudad.trim(),
      fecha_hora: r.fecha_hora!,
      temperatura_c: r.temperatura_c as number,
      humedad_pct: r.humedad_pct as number,
      precipitacion_mm: r.precipitacion_mm as number,
    }
    const clave = claveMedicion(medicion)
    const primero = vistos.get(clave)
    if (primero !== undefined) {
      duplicados++
      rechazados.push({
        registro: r,
        motivos: [
          `Duplicado de ciudad y fecha_hora: se conserva la primera aparición (índice ${primero})`,
        ],
      })
      continue
    }
    vistos.set(clave, r.indice)
    validos.push(medicion)
  }

  return { validos, rechazados, duplicados }
}

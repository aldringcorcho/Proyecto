import { describe, expect, it, vi } from "vitest"

import {
  crearLotes,
  dividirEnLotes,
  ejecutarLotes,
  resumirCarga,
  validarPeticionCarga,
  type EstadoLote,
} from "@/lib/etl/carga"
import { CIUDADES } from "@/lib/etl/ciudades"
import {
  construirUrlExtraccion,
  descargarCiudad,
  validarConfiguracion,
} from "@/lib/etl/extraccion"
import {
  conjuntoDeCarga,
  filtrarYOrdenar,
  filtrosIniciales,
  paginar,
} from "@/lib/etl/filtrado"
import { formatoJsonCompacto } from "@/lib/etl/formato"
import { claveMedicion, limpiar } from "@/lib/etl/limpieza"
import type { Medicion, RespuestaOpenMeteo } from "@/lib/etl/tipos"
import {
  interpretarHoraUtc,
  transformarRespuesta,
} from "@/lib/etl/transformacion"

import fixtureNulos from "./fixtures/respuesta-con-nulos.json"
import fixtureLongitudes from "./fixtures/respuesta-longitudes-incoherentes.json"

const NOMBRES = CIUDADES.map((c) => c.nombre)

function medicion(
  ciudad: string,
  hora: number,
  t: number,
  h = 50,
  p = 0
): Medicion {
  return {
    ciudad,
    fecha_hora: new Date(Date.UTC(2026, 8, 1, hora)).toISOString(),
    temperatura_c: t,
    humedad_pct: h,
    precipitacion_mm: p,
  }
}

describe("configuración de la extracción", () => {
  it("septiembre de 2026 completo: 30 días × 24 h × ciudades", () => {
    const v = validarConfiguracion(["madrid", "bilbao"], "2026-09-01", "2026-09-30", "2026-10-26")
    expect(v.errores).toEqual([])
    expect(v.dias).toBe(30)
    expect(v.registrosPrevistos).toBe(30 * 24 * 2)
  })

  it("rechaza más de 31 días, fechas invertidas, futuras e inexistentes", () => {
    const hoy = "2026-10-26"
    expect(validarConfiguracion(["madrid"], "2026-08-01", "2026-09-01", hoy).errores[0]).toMatch(/32 días/)
    expect(validarConfiguracion(["madrid"], "2026-09-10", "2026-09-01", hoy).errores[0]).toMatch(/anterior/)
    expect(validarConfiguracion(["madrid"], "2026-10-26", "2026-10-27", hoy).errores[0]).toMatch(/posterior a hoy/)
    expect(validarConfiguracion(["madrid"], "2026-02-30", "2026-03-01", hoy).errores[0]).toMatch(/inicial no es válida/)
    expect(validarConfiguracion([], "2026-09-01", "2026-09-01", hoy).errores[0]).toMatch(/al menos una ciudad/)
  })

  it("avisa de posibles nulos en los últimos días", () => {
    const v = validarConfiguracion(["madrid"], "2026-10-20", "2026-10-25", "2026-10-26")
    expect(v.errores).toEqual([])
    expect(v.avisos).toHaveLength(1)
  })

  it("la URL pide UTC, °C, mm y las tres variables", () => {
    const url = new URL(construirUrlExtraccion(CIUDADES[0], "2026-09-01", "2026-09-01"))
    expect(url.origin + url.pathname).toBe("https://archive-api.open-meteo.com/v1/archive")
    expect(url.searchParams.get("timezone")).toBe("UTC")
    expect(url.searchParams.get("temperature_unit")).toBe("celsius")
    expect(url.searchParams.get("precipitation_unit")).toBe("mm")
    expect(url.searchParams.get("hourly")).toBe("temperature_2m,relative_humidity_2m,precipitation")
    expect(url.searchParams.get("latitude")).toBe("41.3874")
  })

  it("propaga el motivo de error de Open-Meteo", async () => {
    const fetchFalso = vi.fn(async () =>
      Response.json({ error: true, reason: "Parameter 'start_date' is out of allowed range" }, { status: 400 })
    ) as unknown as typeof fetch
    await expect(descargarCiudad("https://x", fetchFalso)).rejects.toThrow(/HTTP 400: Parameter/)
  })
})

describe("transformación", () => {
  it("interpreta las horas como UTC explícito", () => {
    expect(interpretarHoraUtc("2026-09-01T00:00")).toBe("2026-09-01T00:00:00.000Z")
    expect(interpretarHoraUtc("2026-09-01T23:00")).toBe("2026-09-01T23:00:00.000Z")
    expect(interpretarHoraUtc("2026-09-01T02:00", 7200)).toBe("2026-09-01T00:00:00.000Z")
    expect(interpretarHoraUtc("2026-02-30T00:00")).toBeNull()
    expect(interpretarHoraUtc("2026-09-01T24:00")).toBeNull()
    expect(interpretarHoraUtc(null)).toBeNull()
  })

  it("convierte arrays paralelos en un registro por hora", () => {
    const { registros, incidencias } = transformarRespuesta(
      "Barcelona",
      fixtureNulos as RespuestaOpenMeteo
    )
    expect(incidencias).toEqual([])
    expect(registros).toHaveLength(10)
    expect(registros[0]).toMatchObject({
      ciudad: "Barcelona",
      indice: 0,
      fecha_hora: "2026-09-01T00:00:00.000Z",
      temperatura_c: 24.2,
      humedad_pct: 77,
      precipitacion_mm: 0,
    })
    // Los valores se conservan tal cual: null sigue siendo null.
    expect(registros[1].temperatura_c).toBeNull()
    expect(registros[2].humedad_pct).toBe("")
  })

  it("detecta longitudes incoherentes y no rellena con ceros", () => {
    const { registros, incidencias } = transformarRespuesta(
      "Madrid",
      fixtureLongitudes as RespuestaOpenMeteo
    )
    expect(incidencias.map((i) => i.mensaje).join()).toMatch(/relative_humidity_2m tiene 2 valores y time tiene 3/)
    expect(registros[2].humedad_pct).toBeUndefined()
    const { validos, rechazados } = limpiar(registros)
    expect(validos).toHaveLength(0)
    expect(rechazados.every((r) => r.motivos.some((m) => /Longitudes incoherentes/.test(m)))).toBe(true)
  })
})

describe("limpieza", () => {
  const { registros } = transformarRespuesta("Barcelona", fixtureNulos as RespuestaOpenMeteo)
  const { validos, rechazados, duplicados } = limpiar(registros)
  const motivos = (indice: number) =>
    rechazados.find((r) => r.registro.indice === indice)?.motivos.join(" | ")

  it("null, cadena vacía y texto no se convierten en cero: se rechazan", () => {
    expect(motivos(1)).toMatch(/Temperatura: valor nulo/)
    expect(motivos(2)).toMatch(/Humedad: valor cadena vacía/)
    expect(motivos(3)).toMatch(/Precipitación: valor nulo/)
    expect(motivos(4)).toMatch(/Temperatura: valor texto "21.5"/)
    expect(validos.some((v) => v.temperatura_c === 0 || v.humedad_pct === 0)).toBe(false)
  })

  it("valida rangos de humedad y precipitación, y fechas", () => {
    expect(motivos(5)).toMatch(/Humedad fuera de 0–100/)
    expect(motivos(6)).toMatch(/Precipitación negativa/)
    expect(motivos(8)).toMatch(/Fecha y hora no válida/)
  })

  it("elimina duplicados conservando la primera aparición", () => {
    expect(duplicados).toBe(1)
    expect(motivos(7)).toMatch(/Duplicado.*primera aparición \(índice 0\)/)
    const conservado = validos.find((v) => v.fecha_hora === "2026-09-01T00:00:00.000Z")
    expect(conservado?.temperatura_c).toBe(24.2)
  })

  it("no descarta temperaturas extremas", () => {
    expect(validos.map((v) => v.temperatura_c)).toEqual([24.2, 52.3])
    expect(validos.length + rechazados.length).toBe(registros.length)
  })

  it("un duplicado cuyo primer registro era inválido se conserva", () => {
    const base = transformarRespuesta("Madrid", {
      utc_offset_seconds: 0,
      hourly: {
        time: ["2026-09-01T00:00", "2026-09-01T00:00"],
        temperature_2m: [null, 18],
        relative_humidity_2m: [50, 50],
        precipitation: [0, 0],
      },
    }).registros
    const r = limpiar(base)
    expect(r.validos).toHaveLength(1)
    expect(r.duplicados).toBe(0)
  })
})

describe("filtros, ordenación, selección y paginación", () => {
  // 3 ciudades × 24 h = 72 registros válidos con valores conocidos.
  const validos: Medicion[] = []
  for (const ciudad of ["Madrid", "Bilbao", "Sevilla"]) {
    for (let h = 0; h < 24; h++) {
      validos.push(medicion(ciudad, h, ciudad === "Sevilla" ? 30 + h : h, 40 + h, h % 6 === 0 ? 1.5 : 0))
    }
  }

  it("filtra y ordena el conjunto completo antes de paginar", () => {
    const filtros = { ...filtrosIniciales(NOMBRES), temperaturaMin: "10" }
    const { ordenados } = filtrarYOrdenar(validos, filtros, {
      campo: "temperatura_c",
      direccion: "desc",
    })
    // Madrid y Bilbao 10..23 (14 cada una) + Sevilla 24 = 52.
    expect(ordenados).toHaveLength(52)
    // La primera página contiene los máximos globales, no los de las primeras filas.
    const pagina0 = paginar(ordenados, 0, 10)
    expect(pagina0[0]).toMatchObject({ ciudad: "Sevilla", temperatura_c: 53 })
    expect(pagina0.map((m) => m.temperatura_c)).toEqual([53, 52, 51, 50, 49, 48, 47, 46, 45, 44])
    const ultima = paginar(ordenados, 5, 10)
    expect(ultima.at(-1)).toMatchObject({ temperatura_c: 10 })
  })

  it("solo lluvia significa precipitación > 0", () => {
    const { ordenados } = filtrarYOrdenar(
      validos,
      { ...filtrosIniciales(NOMBRES), soloLluvia: true },
      { campo: "fecha_hora", direccion: "asc" }
    )
    expect(ordenados).toHaveLength(12)
    expect(ordenados.every((m) => m.precipitacion_mm > 0)).toBe(true)
  })

  it("filtra por intervalo UTC y ciudad, e informa de errores", () => {
    const { ordenados } = filtrarYOrdenar(
      validos,
      { ...filtrosIniciales(["Bilbao"]), desde: "2026-09-01T05:00", hasta: "2026-09-01T07:00" },
      { campo: "fecha_hora", direccion: "asc" }
    )
    expect(ordenados.map((m) => m.fecha_hora.slice(11, 13))).toEqual(["05", "06", "07"])
    const { errores } = filtrarYOrdenar(
      validos,
      { ...filtrosIniciales(NOMBRES), humedadMin: "80", humedadMax: "20" },
      { campo: "fecha_hora", direccion: "asc" }
    )
    expect(errores[0]).toMatch(/mínimo es mayor/)
  })

  it("la selección abarca varias páginas y se respeta el orden y el filtro", () => {
    const orden = { campo: "temperatura_c" as const, direccion: "asc" as const }
    const todos = filtrarYOrdenar(validos, filtrosIniciales(NOMBRES), orden).ordenados
    // Seleccionamos una fila de la página 0 y otra de la página 6 (tamaño 10).
    const seleccion = new Set([claveMedicion(paginar(todos, 0, 10)[3]), claveMedicion(paginar(todos, 6, 10)[1])])
    expect(conjuntoDeCarga(todos, seleccion)).toHaveLength(2)

    // "Seleccionar todas las que cumplen los filtros" incluye filas fuera de la página visible.
    const lluvia = filtrarYOrdenar(validos, { ...filtrosIniciales(NOMBRES), soloLluvia: true }, orden).ordenados
    const seleccionLluvia = new Set(lluvia.map(claveMedicion))
    expect(conjuntoDeCarga(lluvia, seleccionLluvia)).toHaveLength(12)

    // Si después se restringe el filtro, solo se suben las seleccionadas que siguen cumpliéndolo
    // y no se añaden filas nuevas a la selección.
    const soloMadrid = filtrarYOrdenar(
      validos,
      { ...filtrosIniciales(["Madrid"]), soloLluvia: false },
      orden
    ).ordenados
    const carga = conjuntoDeCarga(soloMadrid, seleccionLluvia)
    expect(carga).toHaveLength(4)
    expect(carga.every((m) => m.ciudad === "Madrid" && m.precipitacion_mm > 0)).toBe(true)
    expect(seleccionLluvia.size - carga.length).toBe(8) // seleccionadas fuera de filtros
    expect(carga.map((m) => m.temperatura_c)).toEqual([0, 6, 12, 18])
  })
})

describe("carga por lotes", () => {
  const registros = Array.from({ length: 1234 }, (_, i) =>
    medicion(NOMBRES[i % 5], Math.floor(i / 5), i)
  )

  it("divide en lotes de 500 como máximo", () => {
    expect(dividirEnLotes(registros).map((l) => l.length)).toEqual([500, 500, 234])
  })

  it("la carga congelada coincide con la vista previa y no cambia después", () => {
    const vistaPrevia = registros.slice(0, 600)
    const lotes = crearLotes(vistaPrevia)
    expect(lotes.flatMap((l) => l.registros)).toEqual(vistaPrevia)
    vistaPrevia[0].temperatura_c = -999
    vistaPrevia.reverse()
    expect(lotes[0].registros[0].temperatura_c).toBe(0)
  })

  it("un fallo parcial conserva los lotes correctos y permite reintentar solo el fallido", async () => {
    let lotes: EstadoLote[] = crearLotes(registros)
    const actualizar = (i: number, cambios: Partial<EstadoLote>) => {
      lotes = lotes.map((l, j) => (j === i ? { ...l, ...cambios } : l))
    }
    const enviados: number[] = []
    let fallar = true
    const enviar = vi.fn(async (regs: Medicion[]) => {
      const n = lotes.findIndex((l) => l.registros === regs)
      if (n === 1 && fallar) throw new Error("HTTP 502: fallo simulado")
      enviados.push(n)
      return { procesados: regs.length }
    })
    const verificar = vi.fn(async (claves: { ciudad: string; fecha_hora: string }[]) => ({
      encontradas: claves.map(claveMedicion),
    }))

    await ejecutarLotes(lotes, [0, 1, 2], enviar, verificar, actualizar)
    expect(lotes.map((l) => l.estado)).toEqual(["correcto", "error", "correcto"])
    expect(lotes[1].error).toMatch(/fallo simulado/)
    expect(resumirCarga(lotes)).toMatchObject({ correctos: 734, fallidos: 500, verificados: 734 })

    fallar = false
    const fallidos = lotes.flatMap((l, i) => (l.estado === "error" ? [i] : []))
    await ejecutarLotes(lotes, fallidos, enviar, verificar, actualizar)
    expect(enviados).toEqual([0, 2, 1])
    expect(lotes.map((l) => l.estado)).toEqual(["correcto", "correcto", "correcto"])
    expect(lotes[1].intentos).toBe(2)
    expect(resumirCarga(lotes)).toMatchObject({ correctos: 1234, fallidos: 0, verificados: 1234 })
  })

  it("detecta claves que no aparecen en destino", async () => {
    let lotes = crearLotes(registros.slice(0, 3))
    await ejecutarLotes(
      lotes,
      [0],
      async () => ({ procesados: null }),
      async (claves) => ({ encontradas: claves.slice(1).map(claveMedicion) }),
      (i, c) => (lotes = lotes.map((l, j) => (j === i ? { ...l, ...c } : l)))
    )
    expect(lotes[0].verificacion).toMatchObject({ estado: "incompleta", encontrados: 2 })
    expect(resumirCarga(lotes).procesadosInformados).toBeNull()
  })
})

describe("validación en servidor", () => {
  const ok = medicion("Madrid", 0, 20)

  it("acepta un lote válido y normaliza la fecha", () => {
    const r = validarPeticionCarga({
      registros: [{ ...ok, fecha_hora: "2026-09-01T00:00:00+00:00" }],
    })
    expect(r).toEqual({ ok: true, valor: [ok] })
  })

  it("rechaza lotes vacíos, demasiado grandes, campos extra, nulos y duplicados", () => {
    expect(validarPeticionCarga({ registros: [] }).ok).toBe(false)
    expect(validarPeticionCarga({ registros: Array(501).fill(ok) }).ok).toBe(false)
    expect(validarPeticionCarga({ registros: [{ ...ok, id: 1 }] })).toMatchObject({ error: /campos no permitidos/ })
    expect(validarPeticionCarga({ registros: [{ ...ok, temperatura_c: null }] })).toMatchObject({ error: /nulo/ })
    expect(validarPeticionCarga({ registros: [{ ...ok, humedad_pct: 101 }] })).toMatchObject({ error: /0–100/ })
    expect(validarPeticionCarga({ registros: [{ ...ok, ciudad: "Lugo" }] })).toMatchObject({ error: /ciudad/ })
    expect(validarPeticionCarga({ registros: [{ ...ok, fecha_hora: "2026-09-01T00:00" }] })).toMatchObject({ error: /zona/ })
    expect(validarPeticionCarga({ registros: [ok, ok] })).toMatchObject({ error: /duplicada/ })
  })
})

describe("vista previa del JSON", () => {
  const respuesta = { hourly: { time: ["a", "b", "c", "d"], temperature_2m: [1, null, 3, 4] } }

  it("recorta los arrays largos e indica cuántos valores faltan", () => {
    const texto = formatoJsonCompacto(respuesta, "", 2)
    expect(texto).toContain('["a", "b", … (+2 más)]')
    expect(texto).toContain("[1, null, … (+2 más)]")
  })

  it("sin límite muestra todo y sigue siendo JSON válido", () => {
    expect(JSON.parse(formatoJsonCompacto(respuesta))).toEqual(respuesta)
  })
})

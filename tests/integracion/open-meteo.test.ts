import { describe, expect, it } from "vitest"

import { buscarCiudad } from "@/lib/etl/ciudades"
import { construirUrlExtraccion, descargarCiudad, hoyUtc } from "@/lib/etl/extraccion"
import { limpiar } from "@/lib/etl/limpieza"
import { transformarRespuesta } from "@/lib/etl/transformacion"

const DIA = 86_400_000

describe("Open-Meteo (API real)", () => {
  it("una ciudad durante un día devuelve 24 registros horarios en UTC", async () => {
    const barcelona = buscarCiudad("barcelona")!
    const json = await descargarCiudad(construirUrlExtraccion(barcelona, "2026-09-01", "2026-09-01"))
    expect(json.utc_offset_seconds).toBe(0)
    expect(json.hourly_units).toMatchObject({
      temperature_2m: "°C",
      relative_humidity_2m: "%",
      precipitation: "mm",
    })

    const { registros, incidencias } = transformarRespuesta("Barcelona", json)
    expect(incidencias).toEqual([])
    expect(registros).toHaveLength(24)
    expect(registros[0].fecha_hora).toBe("2026-09-01T00:00:00.000Z")
    expect(registros[23].fecha_hora).toBe("2026-09-01T23:00:00.000Z")
    // Los arrays paralelos se combinan posición a posición.
    const h = json.hourly as Record<string, unknown[]>
    registros.forEach((r, i) => {
      expect(r.temperatura_c).toBe(h.temperature_2m[i])
      expect(r.humedad_pct).toBe(h.relative_humidity_2m[i])
      expect(r.precipitacion_mm).toBe(h.precipitation[i])
    })
    expect(limpiar(registros).validos).toHaveLength(24)
  })

  // Si Open-Meteo no devuelve null en esas fechas, el caso queda cubierto por
  // los fixtures controlados de tests/etl.test.ts.
  it("los null reales de días recientes (si los hay) se rechazan, nunca se convierten en 0", async () => {
    const hoy = Date.parse(hoyUtc())
    const inicio = new Date(hoy - 6 * DIA).toISOString().slice(0, 10)
    const fin = new Date(hoy - 1 * DIA).toISOString().slice(0, 10)
    const json = await descargarCiudad(construirUrlExtraccion(buscarCiudad("madrid")!, inicio, fin))
    const h = json.hourly as Record<string, unknown[]>
    const conNulo = h.time.filter(
      (_, i) =>
        h.temperature_2m[i] === null ||
        h.relative_humidity_2m[i] === null ||
        h.precipitation[i] === null
    ).length

    const { registros } = transformarRespuesta("Madrid", json)
    const { validos, rechazados } = limpiar(registros)
    console.info(
      `Madrid ${inicio}→${fin}: ${registros.length} horas, ${conNulo} con algún null, ${rechazados.length} rechazadas`
    )
    expect(rechazados.length).toBe(conNulo)
    expect(validos.length + rechazados.length).toBe(registros.length)
    for (const r of rechazados) expect(r.motivos.join()).toMatch(/valor nulo/)
  })

  it("informa del motivo cuando Open-Meteo rechaza la petición", async () => {
    const url = construirUrlExtraccion(buscarCiudad("bilbao")!, "1900-01-01", "1900-01-02")
    await expect(descargarCiudad(url)).rejects.toThrow(/HTTP 400/)
  })
})

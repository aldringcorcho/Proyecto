import { existsSync } from "node:fs"

import { createClient } from "@supabase/supabase-js"
import { beforeAll, describe, expect, it } from "vitest"

import { POST as cargar } from "@/app/api/supabase/cargar/route"
import { GET as estado } from "@/app/api/supabase/estado/route"
import { GET as leer } from "@/app/api/supabase/mediciones/route"
import { POST as verificar } from "@/app/api/supabase/verificar/route"
import {
  crearLotes,
  dividirEnLotes,
  ejecutarLotes,
  resumirCarga,
  type EnviarLote,
  type EstadoLote,
  type VerificarLote,
} from "@/lib/etl/carga"
import { buscarCiudad } from "@/lib/etl/ciudades"
import { construirUrlExtraccion, descargarCiudad } from "@/lib/etl/extraccion"
import { limpiar } from "@/lib/etl/limpieza"
import type { Medicion } from "@/lib/etl/tipos"
import { transformarRespuesta } from "@/lib/etl/transformacion"

if (existsSync(".env.local")) process.loadEnvFile(".env.local")

const hayCredenciales =
  !!(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  !!process.env.SUPABASE_SECRET_KEY

function post(ruta: string, cuerpo: unknown, tipo = "application/json") {
  return new Request(`http://localhost${ruta}`, {
    method: "POST",
    headers: { "content-type": tipo },
    body: JSON.stringify(cuerpo),
  })
}

async function json(r: Response) {
  const cuerpo = await r.json()
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${cuerpo.error}`)
  return cuerpo
}

const enviar: EnviarLote = async (registros) => json(await cargar(post("/api/supabase/cargar", { registros })))
const comprobar: VerificarLote = async (claves) => json(await verificar(post("/api/supabase/verificar", { claves })))

async function contar(ciudad: string, desde: string, hasta: string) {
  const q = new URLSearchParams({ ciudad, desde, hasta, tamano: "10" })
  const r = await json(await leer(new Request(`http://localhost/api/supabase/mediciones?${q}`)))
  return r.total as number
}

async function extraer(ciudadId: string, inicio: string, fin: string) {
  const ciudad = buscarCiudad(ciudadId)!
  const respuesta = await descargarCiudad(construirUrlExtraccion(ciudad, inicio, fin))
  return limpiar(transformarRespuesta(ciudad.nombre, respuesta).registros).validos
}

function lotesManuales(registros: Medicion[], tamano: number): EstadoLote[] {
  return dividirEnLotes(registros, tamano).map((r, i) => ({
    numero: i + 1,
    registros: r,
    estado: "pendiente",
    intentos: 0,
    verificacion: { estado: "pendiente" },
  }))
}

describe.skipIf(!hayCredenciales)("Supabase (integración real)", () => {
  beforeAll(async () => {
    const e = await (await estado()).json()
    if (!e.tablaDisponible) throw new Error(`Destino no disponible: ${e.mensaje}`)
  })

  it("carga 720 registros en 2 lotes, verifica y una segunda carga no duplica", async () => {
    const validos = await extraer("sevilla", "2026-09-01", "2026-09-30")
    expect(validos).toHaveLength(720)
    const rango = ["Sevilla", "2026-09-01T00:00:00Z", "2026-09-30T23:00:00Z"] as const

    for (const intento of [1, 2]) {
      let lotes = crearLotes(validos)
      expect(lotes.map((l) => l.registros.length)).toEqual([500, 220])
      await ejecutarLotes(lotes, [0, 1], enviar, comprobar, (i, c) => {
        lotes = lotes.map((l, j) => (j === i ? { ...l, ...c } : l))
      })
      const resumen = resumirCarga(lotes)
      console.info(`Carga ${intento}:`, resumen)
      expect(resumen).toMatchObject({ correctos: 720, fallidos: 0, verificados: 720, noEncontrados: 0 })
      // Las filas del rango son exactamente las 720 claves: el upsert no duplica.
      expect(await contar(...rango)).toBe(720)
    }
  })

  it("un fallo parcial conserva los lotes anteriores y se reintenta solo el fallido", async () => {
    const validos = await extraer("bilbao", "2026-09-01", "2026-09-02")
    let lotes = lotesManuales(validos, 20) // 20 + 20 + 8
    const actualizar = (i: number, c: Partial<EstadoLote>) => {
      lotes = lotes.map((l, j) => (j === i ? { ...l, ...c } : l))
    }
    // Primer intento del lote 2: petición mal formada → el servidor la rechaza (HTTP 415 real).
    let primero = true
    const enviarConFallo: EnviarLote = async (registros) => {
      if (registros === lotes[1].registros && primero) {
        primero = false
        return json(await cargar(post("/api/supabase/cargar", { registros }, "text/plain")))
      }
      return enviar(registros)
    }

    await ejecutarLotes(lotes, [0, 1, 2], enviarConFallo, comprobar, actualizar)
    expect(lotes.map((l) => l.estado)).toEqual(["correcto", "error", "correcto"])
    expect(lotes[1].error).toMatch(/HTTP 415/)
    expect(resumirCarga(lotes)).toMatchObject({ correctos: 28, fallidos: 20 })

    await ejecutarLotes(lotes, [1], enviarConFallo, comprobar, actualizar)
    expect(lotes.map((l) => l.estado)).toEqual(["correcto", "correcto", "correcto"])
    expect(lotes[0].intentos).toBe(1)
    expect(lotes[1].intentos).toBe(2)
    expect(resumirCarga(lotes)).toMatchObject({ correctos: 48, verificados: 48 })
    expect(await contar("Bilbao", "2026-09-01T00:00:00Z", "2026-09-02T23:00:00Z")).toBe(48)
  })

  it("el servidor valida los registros y la base de datos aplica las restricciones", async () => {
    const malo = {
      ciudad: "Valencia",
      fecha_hora: "2026-09-01T00:00:00.000Z",
      temperatura_c: 20,
      humedad_pct: 150,
      precipitacion_mm: 0,
    }
    const r = await cargar(post("/api/supabase/cargar", { registros: [malo] }))
    expect(r.status).toBe(400)
    expect((await r.json()).error).toMatch(/humedad_pct fuera de 0–100/)

    // Saltándose la validación del servidor, la restricción CHECK de la tabla lo impide.
    const directo = createClient(
      (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)!,
      process.env.SUPABASE_SECRET_KEY!,
      { auth: { persistSession: false } }
    )
    const { error } = await directo.from("mediciones_meteorologicas").insert(malo)
    expect(error?.code).toBe("23514")

    // La clave publicable (rol anon) no puede escribir: RLS sin políticas.
    const publica = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    if (publica) {
      const anonimo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, publica, {
        auth: { persistSession: false },
      })
      const { error: e2 } = await anonimo
        .from("mediciones_meteorologicas")
        .insert({ ...malo, humedad_pct: 50 })
      expect(e2).not.toBeNull()
      const { data } = await anonimo.from("mediciones_meteorologicas").select("id").limit(1)
      expect(data ?? []).toEqual([])
    }
  })
})

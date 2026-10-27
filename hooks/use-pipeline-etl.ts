"use client"

import * as React from "react"

import {
  crearLotes,
  ejecutarLotes,
  resumirCarga,
  type EnviarLote,
  type EstadoLote,
  type VerificarLote,
} from "@/lib/etl/carga"
import { CIUDADES, NOMBRES_CIUDADES, buscarCiudad } from "@/lib/etl/ciudades"
import {
  construirUrlExtraccion,
  descargarCiudad,
  validarConfiguracion,
} from "@/lib/etl/extraccion"
import {
  conjuntoDeCarga,
  filtrarYOrdenar,
  filtrosIniciales,
  ORDEN_INICIAL,
  type Filtros,
  type Orden,
} from "@/lib/etl/filtrado"
import { medir } from "@/lib/etl/formato"
import { claveMedicion, limpiar, type ResultadoLimpieza } from "@/lib/etl/limpieza"
import type { ResultadoExtraccionCiudad } from "@/lib/etl/tipos"
import {
  transformarRespuesta,
  type ResultadoTransformacion,
} from "@/lib/etl/transformacion"

export type Extraccion = {
  fechaInicio: string
  fechaFin: string
  ciudades: ResultadoExtraccionCiudad[]
  estado: "en_curso" | "completada" | "error"
  duracionMs?: number
}

export type Procesamiento = {
  respuestas: number
  transformacion: ResultadoTransformacion & { duracionMs: number }
  limpieza: ResultadoLimpieza & { duracionMs: number }
}

export type Carga = {
  lotes: EstadoLote[]
  enCurso: boolean
  duracionMs: number
}

function procesar(resultados: ResultadoExtraccionCiudad[]): Procesamiento {
  const completadas = resultados.filter((r) => r.estado === "completada" && r.respuesta)
  const transformacion = medir(() => {
    const salida: ResultadoTransformacion = { registros: [], incidencias: [] }
    for (const r of completadas) {
      const nombre = buscarCiudad(r.ciudadId)?.nombre ?? r.ciudadId
      const t = transformarRespuesta(nombre, r.respuesta!)
      salida.registros.push(...t.registros)
      salida.incidencias.push(...t.incidencias)
    }
    return salida
  })
  const limpieza = medir(() => limpiar(transformacion.resultado.registros))
  return {
    respuestas: completadas.length,
    transformacion: { ...transformacion.resultado, duracionMs: transformacion.duracionMs },
    limpieza: { ...limpieza.resultado, duracionMs: limpieza.duracionMs },
  }
}

async function leerError(respuesta: Response) {
  try {
    const cuerpo = await respuesta.json()
    if (cuerpo?.error) return `HTTP ${respuesta.status}: ${cuerpo.error}`
  } catch {}
  return `HTTP ${respuesta.status}`
}

async function postJson(url: string, cuerpo: unknown) {
  let respuesta: Response
  try {
    respuesta = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    })
  } catch {
    throw new Error("No se pudo contactar con el servidor de la aplicación.")
  }
  if (!respuesta.ok) throw new Error(await leerError(respuesta))
  return respuesta.json()
}

const enviarLote: EnviarLote = async (registros) => {
  const r = await postJson("/api/supabase/cargar", { registros })
  return { procesados: typeof r.procesados === "number" ? r.procesados : null }
}

const verificarLote: VerificarLote = async (claves) => {
  const r = await postJson("/api/supabase/verificar", { claves })
  return { encontradas: Array.isArray(r.encontradas) ? r.encontradas : [] }
}

export function usePipelineEtl() {
  // Configuración
  const [ciudadIds, setCiudadIds] = React.useState<string[]>(CIUDADES.map((c) => c.id))
  const [fechaInicio, setFechaInicio] = React.useState("2026-09-01")
  const [fechaFin, setFechaFin] = React.useState("2026-09-30")
  const validacion = validarConfiguracion(ciudadIds, fechaInicio, fechaFin)

  // Extracción y procesamiento
  const [extraccion, setExtraccion] = React.useState<Extraccion | null>(null)
  const [procesamiento, setProcesamiento] = React.useState<Procesamiento | null>(null)
  const resultadosRef = React.useRef<ResultadoExtraccionCiudad[]>([])
  const extrayendoRef = React.useRef(false)

  // Filtros, orden y selección
  const [filtros, setFiltros] = React.useState<Filtros>(() => filtrosIniciales(NOMBRES_CIUDADES))
  const [orden, setOrden] = React.useState<Orden>(ORDEN_INICIAL)
  const [seleccion, setSeleccion] = React.useState<ReadonlySet<string>>(new Set())

  // Carga
  const [carga, setCarga] = React.useState<Carga | null>(null)
  const cargaRef = React.useRef<Carga | null>(null)
  const [versionDestino, setVersionDestino] = React.useState(0)

  const validos = React.useMemo(() => procesamiento?.limpieza.validos ?? [], [procesamiento])

  // datos válidos → filtros → ordenación (la paginación se aplica al mostrar)
  const filtrado = React.useMemo(
    () => medir(() => filtrarYOrdenar(validos, filtros, orden)),
    [validos, filtros, orden]
  )
  const ordenados = filtrado.resultado.ordenados
  // → selección: conjunto exacto que se enviaría, en el orden elegido
  const vistaPrevia = React.useMemo(
    () => conjuntoDeCarga(ordenados, seleccion),
    [ordenados, seleccion]
  )

  function publicarResultados(resultados: ResultadoExtraccionCiudad[]) {
    resultadosRef.current = resultados
    setExtraccion((e) => (e ? { ...e, ciudades: resultados } : e))
  }

  function actualizarCiudad(id: string, cambios: Partial<ResultadoExtraccionCiudad>) {
    publicarResultados(
      resultadosRef.current.map((r) => (r.ciudadId === id ? { ...r, ...cambios } : r))
    )
  }

  async function descargar(id: string, url: string) {
    const previo = resultadosRef.current.find((r) => r.ciudadId === id)
    actualizarCiudad(id, {
      estado: "en_curso",
      error: undefined,
      intentos: (previo?.intentos ?? 0) + 1,
    })
    const inicio = performance.now()
    try {
      const respuesta = await descargarCiudad(url)
      actualizarCiudad(id, {
        estado: "completada",
        respuesta,
        duracionMs: performance.now() - inicio,
      })
    } catch (e) {
      actualizarCiudad(id, {
        estado: "error",
        respuesta: undefined,
        error: e instanceof Error ? e.message : String(e),
        duracionMs: performance.now() - inicio,
      })
    }
  }

  function aplicarProcesamiento() {
    const p = procesar(resultadosRef.current)
    setProcesamiento(p)
    // La selección solo conserva claves que siguen existiendo; nunca añade.
    const existentes = new Set(p.limpieza.validos.map(claveMedicion))
    setSeleccion((s) => new Set([...s].filter((k) => existentes.has(k))))
    const hayErrores = resultadosRef.current.some((r) => r.estado === "error")
    setExtraccion((e) => (e ? { ...e, estado: hayErrores ? "error" : "completada" } : e))
  }

  async function extraer() {
    if (extrayendoRef.current || cargaRef.current?.enCurso) return
    if (validacion.errores.length > 0) return
    extrayendoRef.current = true

    const ciudades = CIUDADES.filter((c) => ciudadIds.includes(c.id))
    const inicial = ciudades.map(
      (c): ResultadoExtraccionCiudad => ({
        ciudadId: c.id,
        estado: "pendiente",
        url: construirUrlExtraccion(c, fechaInicio, fechaFin),
        intentos: 0,
      })
    )
    resultadosRef.current = inicial
    setExtraccion({ fechaInicio, fechaFin, ciudades: inicial, estado: "en_curso" })
    setProcesamiento(null)
    setSeleccion(new Set())
    cargaRef.current = null
    setCarga(null)

    const inicio = performance.now()
    // En secuencia: se ve qué ciudad está en curso y se respeta la API pública.
    for (const r of inicial) await descargar(r.ciudadId, r.url)
    const duracionMs = performance.now() - inicio
    setExtraccion((e) => (e ? { ...e, duracionMs } : e))
    aplicarProcesamiento()
    extrayendoRef.current = false
  }

  /** Reintenta una ciudad: reemplaza su respuesta (no la añade), así no hay duplicados. */
  async function reintentarCiudad(id: string) {
    if (extrayendoRef.current || cargaRef.current?.enCurso) return
    const previo = resultadosRef.current.find((r) => r.ciudadId === id)
    if (!previo) return
    extrayendoRef.current = true
    setExtraccion((e) => (e ? { ...e, estado: "en_curso" } : e))
    const inicio = performance.now()
    await descargar(id, previo.url)
    const duracion = performance.now() - inicio
    setExtraccion((e) => (e ? { ...e, duracionMs: (e.duracionMs ?? 0) + duracion } : e))
    aplicarProcesamiento()
    extrayendoRef.current = false
  }

  function publicarCarga(c: Carga) {
    cargaRef.current = c
    setCarga(c)
  }

  async function ejecutar(indices: number[]) {
    const actual = cargaRef.current!
    const inicio = performance.now()
    await ejecutarLotes(actual.lotes, indices, enviarLote, verificarLote, (i, cambios) => {
      const c = cargaRef.current!
      publicarCarga({
        ...c,
        lotes: c.lotes.map((l, j) => (j === i ? { ...l, ...cambios } : l)),
      })
    })
    const c = cargaRef.current!
    publicarCarga({ ...c, enCurso: false, duracionMs: c.duracionMs + performance.now() - inicio })
    setVersionDestino((v) => v + 1)
  }

  async function subir() {
    // El ref evita envíos simultáneos incluso con dobles clics rápidos.
    if (cargaRef.current?.enCurso || extrayendoRef.current) return
    if (vistaPrevia.length === 0 || filtrado.resultado.errores.length > 0) return
    const lotes = crearLotes(vistaPrevia) // copia congelada en el orden actual
    publicarCarga({ lotes, enCurso: true, duracionMs: 0 })
    await ejecutar(lotes.map((_, i) => i))
  }

  async function reintentarLotesFallidos() {
    const c = cargaRef.current
    if (!c || c.enCurso) return
    const fallidos = c.lotes.flatMap((l, i) =>
      l.estado === "error" || l.verificacion.estado === "error" || l.verificacion.estado === "incompleta"
        ? [i]
        : []
    )
    if (fallidos.length === 0) return
    publicarCarga({ ...c, enCurso: true })
    await ejecutar(fallidos)
  }

  const claves = (filas: { ciudad: string; fecha_hora: string }[]) => filas.map(claveMedicion)

  return {
    configuracion: {
      ciudadIds,
      setCiudadIds,
      fechaInicio,
      setFechaInicio,
      fechaFin,
      setFechaFin,
      validacion,
    },
    extraccion,
    procesamiento,
    filtrado: {
      filtros,
      setFiltros,
      orden,
      setOrden,
      ordenados,
      errores: filtrado.resultado.errores,
      duracionMs: filtrado.duracionMs,
      restablecer: () => setFiltros(filtrosIniciales(NOMBRES_CIUDADES)),
    },
    seleccion: {
      claves: seleccion,
      alternar: (clave: string, marcada: boolean) =>
        setSeleccion((s) => {
          const n = new Set(s)
          if (marcada) n.add(clave)
          else n.delete(clave)
          return n
        }),
      marcar: (filas: { ciudad: string; fecha_hora: string }[], marcada: boolean) =>
        setSeleccion((s) => {
          const n = new Set(s)
          for (const k of claves(filas)) {
            if (marcada) n.add(k)
            else n.delete(k)
          }
          return n
        }),
      seleccionarFiltradas: () => setSeleccion((s) => new Set([...s, ...claves(ordenados)])),
      vaciar: () => setSeleccion(new Set()),
      fueraDeFiltros: seleccion.size - vistaPrevia.length,
    },
    vistaPrevia,
    carga,
    resumenCarga: carga ? resumirCarga(carga.lotes) : null,
    versionDestino,
    acciones: { extraer, reintentarCiudad, subir, reintentarLotesFallidos },
  }
}

export type PipelineEtl = ReturnType<typeof usePipelineEtl>

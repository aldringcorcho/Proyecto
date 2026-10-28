"use client"

import * as React from "react"
import { AlertTriangleIcon, CheckIcon, ChevronRightIcon, CircleDashedIcon } from "lucide-react"
import { cn } from "cn"

import { Ayuda } from "@/components/etl/ayuda"
import { NumeroSeccion } from "@/components/etl/estado"
import { Button } from "@/components/ui/button"
import type { PipelineEtl } from "@/hooks/use-pipeline-etl"
import { buscarCiudad } from "@/lib/etl/ciudades"
import {
  formatoDuracion,
  formatoEntero,
  formatoNumero,
  formatoValorCrudo,
} from "@/lib/etl/formato"
import { claveMedicion } from "@/lib/etl/limpieza"
import type { EstadoFase } from "@/lib/etl/tipos"

export type PestanaId =
  | "json"
  | "transformados"
  | "validos"
  | "rechazados"
  | "carga"
  | "supabase"

type Fase = {
  titulo: string
  explicacion: string
  estado: EstadoFase
  entrada: string
  salida: string
  detalle?: string
  duracionMs?: number
  pestana: PestanaId
}

function fases(etl: PipelineEtl): Fase[] {
  const { extraccion: ex, procesamiento: pr, filtrado, vistaPrevia, carga, resumenCarga } = etl
  const n = (x: number) => formatoEntero(x)
  const horasRecibidas = ex
    ? ex.ciudades.reduce(
        (s, r) => s + (Array.isArray(r.respuesta?.hourly?.time) ? r.respuesta.hourly.time.length : 0),
        0
      )
    : 0
  const fallidas = ex?.ciudades.filter((r) => r.estado === "error").length ?? 0
  const listo = !!pr && ex?.estado !== "en_curso"

  let estadoCarga: EstadoFase = "pendiente"
  if (carga?.enCurso) estadoCarga = "en_curso"
  else if (resumenCarga && carga) {
    const malVerificados = carga.lotes.some(
      (l) => l.verificacion.estado === "incompleta" || l.verificacion.estado === "error"
    )
    estadoCarga = resumenCarga.fallidos > 0 || malVerificados ? "error" : "completada"
  }

  return [
    {
      titulo: "Extracción",
      explicacion:
        "Una petición HTTP por ciudad a la API histórica. Se guarda el JSON original sin modificar.",
      estado: ex ? ex.estado : "pendiente",
      entrada: ex ? `${ex.ciudades.length} ciudades` : "—",
      salida: ex ? `${n(horasRecibidas)} horas recibidas` : "—",
      detalle: fallidas > 0 ? `${fallidas} ciudad(es) con error` : undefined,
      duracionMs: ex?.duracionMs,
      pestana: "json",
    },
    {
      titulo: "Transformación",
      explicacion:
        "Los arrays paralelos (time, temperature_2m…) se combinan en un registro por ciudad y hora; las horas se interpretan como UTC.",
      estado: listo ? "completada" : "pendiente",
      entrada: pr ? `${pr.respuestas} respuestas JSON` : "—",
      salida: pr ? `${n(pr.transformacion.registros.length)} registros` : "—",
      detalle:
        pr && pr.transformacion.incidencias.length > 0
          ? `${pr.transformacion.incidencias.length} incidencia(s) de estructura`
          : undefined,
      duracionMs: listo ? pr?.transformacion.duracionMs : undefined,
      pestana: "transformados",
    },
    {
      titulo: "Limpieza",
      explicacion:
        "Se validan ciudad, fecha, tipos numéricos y rangos; null nunca se convierte en 0. Se eliminan duplicados.",
      estado: listo ? "completada" : "pendiente",
      entrada: pr ? `${n(pr.transformacion.registros.length)} registros` : "—",
      salida: pr ? `${n(pr.limpieza.validos.length)} válidos` : "—",
      detalle: pr
        ? `${n(pr.limpieza.rechazados.length)} rechazados (${n(pr.limpieza.duplicados)} duplicados)`
        : undefined,
      duracionMs: listo ? pr?.limpieza.duracionMs : undefined,
      pestana: "rechazados",
    },
    {
      titulo: "Filtrado y selección",
      explicacion:
        "Sobre los válidos se aplican filtros y orden; tú eliges qué filas se subirán.",
      estado: !listo ? "pendiente" : filtrado.errores.length > 0 ? "error" : "completada",
      entrada: pr ? `${n(pr.limpieza.validos.length)} válidos` : "—",
      salida: pr ? `${n(vistaPrevia.length)} seleccionados` : "—",
      detalle: pr ? `${n(filtrado.ordenados.length)} coinciden con los filtros` : undefined,
      duracionMs: listo ? filtrado.duracionMs : undefined,
      pestana: "validos",
    },
    {
      titulo: "Carga",
      explicacion:
        "Upsert en Supabase por lotes de 500, desde el servidor, y verificación posterior de las claves.",
      estado: estadoCarga,
      entrada: resumenCarga ? `${n(resumenCarga.total)} congelados` : "—",
      salida: resumenCarga ? `${n(resumenCarga.correctos)} subidos` : "—",
      detalle: resumenCarga
        ? `${n(resumenCarga.fallidos)} fallidos · ${n(resumenCarga.verificados)} verificados`
        : undefined,
      duracionMs: carga && !carga.enCurso ? carga.duracionMs : undefined,
      pestana: "carga",
    },
  ]
}

type Tabla = { leyenda: string; columnas: string[]; filas: React.ReactNode[][]; numericas?: number[] }

const FILAS_MUESTRA = 5
const ESTADO_LOTE_TEXTO = { pendiente: "Pendiente", enviando: "Enviando", correcto: "Subido", error: "Error" } as const

/** Mini tabla (3 columnas) con una muestra real de los datos de cada fase; null si aún no hay datos. */
function muestras(etl: PipelineEtl): (Tabla | null)[] {
  const { extraccion: ex, procesamiento: pr, filtrado, seleccion, vistaPrevia, carga } = etl
  // "2026-09-01T05:00:00Z" → "01/09 05h", para que quepa en la mini tabla.
  const hora = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)} ${iso.slice(11, 13)}h` : "—")
  const ciudadCorta = (c: string) => c.slice(0, 3).toUpperCase()

  let extraccion: Tabla | null = null
  const primera = ex?.ciudades.find((r) => r.respuesta?.hourly)
  if (primera?.respuesta?.hourly) {
    const h = primera.respuesta.hourly
    const col = (k: string) => (Array.isArray(h[k]) ? (h[k] as unknown[]) : [])
    extraccion = {
      leyenda: `Arrays de ${buscarCiudad(primera.ciudadId)?.nombre}`,
      columnas: ["time", "temp.", "hum."],
      numericas: [1, 2],
      filas: col("time").slice(0, FILAS_MUESTRA).map((t, i) => [
        String(t).slice(8),
        formatoValorCrudo(col("temperature_2m")[i]),
        formatoValorCrudo(col("relative_humidity_2m")[i]),
      ]),
    }
  }

  const transformacion: Tabla | null = pr
    ? {
        leyenda: "Una fila por ciudad y hora",
        columnas: ["Ciudad", "Hora", "°C"],
        numericas: [2],
        filas: pr.transformacion.registros.slice(0, FILAS_MUESTRA).map((r) => [
          ciudadCorta(r.ciudad),
          hora(r.fecha_hora),
          formatoValorCrudo(r.temperatura_c),
        ]),
      }
    : null

  let limpieza: Tabla | null = null
  if (pr && pr.limpieza.rechazados.length > 0) {
    limpieza = {
      leyenda: `Primeros de ${formatoEntero(pr.limpieza.rechazados.length)} rechazos`,
      columnas: ["Ciudad", "Hora", "Motivo"],
      filas: pr.limpieza.rechazados.slice(0, FILAS_MUESTRA).map((r) => [
        ciudadCorta(r.registro.ciudad),
        hora(r.registro.fecha_hora),
        r.motivos[0],
      ]),
    }
  } else if (pr) {
    const porCiudad = new Map<string, number>()
    for (const m of pr.limpieza.validos) porCiudad.set(m.ciudad, (porCiudad.get(m.ciudad) ?? 0) + 1)
    limpieza = {
      leyenda: "Sin rechazos",
      columnas: ["Ciudad", "Válidos", "Rech."],
      numericas: [1, 2],
      filas: [...porCiudad].slice(0, FILAS_MUESTRA).map(([c, n]) => [ciudadCorta(c), formatoEntero(n), 0]),
    }
  }

  const filtradoTabla: Tabla | null = pr
    ? {
        leyenda: `${formatoEntero(vistaPrevia.length)} de ${formatoEntero(filtrado.ordenados.length)} seleccionados`,
        columnas: ["", "Ciudad", "Hora"],
        filas: filtrado.ordenados.slice(0, FILAS_MUESTRA).map((m) => [
          seleccion.claves.has(claveMedicion(m)) ? "✓" : "·",
          ciudadCorta(m.ciudad),
          hora(m.fecha_hora),
        ]),
      }
    : null

  let cargaTabla: Tabla | null = null
  if (carga) {
    cargaTabla = {
      leyenda: `${carga.lotes.length} lote(s) de hasta 500`,
      columnas: ["Lote", "Filas", "Estado"],
      numericas: [0, 1],
      filas: carga.lotes.slice(0, FILAS_MUESTRA).map((l) => [
        l.numero,
        formatoEntero(l.registros.length),
        l.verificacion.estado === "correcta" ? "Verificado ✓" : ESTADO_LOTE_TEXTO[l.estado],
      ]),
    }
  } else if (pr && vistaPrevia.length > 0) {
    cargaTabla = {
      leyenda: "Pendientes de subir",
      columnas: ["Ciudad", "Hora", "°C"],
      numericas: [2],
      filas: vistaPrevia.slice(0, FILAS_MUESTRA).map((m) => [
        ciudadCorta(m.ciudad),
        hora(m.fecha_hora),
        formatoNumero(m.temperatura_c),
      ]),
    }
  }

  return [extraccion, transformacion, limpieza, filtradoTabla, cargaTabla]
}

const ACENTO_FASE = [
  { fondo: "bg-azul", texto: "text-azul" },
  { fondo: "bg-acero", texto: "text-acero" },
  { fondo: "bg-marino", texto: "text-marino" },
  { fondo: "bg-prusia-1", texto: "text-prusia-1" },
  { fondo: "bg-indigo-noche", texto: "text-indigo-noche" },
]

/** Icono de estado de cada fase: ✓ verde, punto que late, aviso o círculo discontinuo. */
function IconoEstado({ estado, oscura }: { estado: EstadoFase; oscura: boolean }) {
  if (estado === "completada") {
    return (
      <span className="flex size-6 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm" aria-hidden>
        <CheckIcon className="size-3.5" strokeWidth={3} />
      </span>
    )
  }
  if (estado === "en_curso") {
    return (
      <span className="relative flex size-6 items-center justify-center" aria-hidden>
        <span className="absolute inline-flex size-4 animate-ping rounded-full bg-azul/60" />
        <span className="relative inline-flex size-3 rounded-full bg-azul" />
      </span>
    )
  }
  if (estado === "error") {
    return (
      <span className="flex size-6 items-center justify-center rounded-full bg-destructive text-white" aria-hidden>
        <AlertTriangleIcon className="size-3.5" />
      </span>
    )
  }
  return <CircleDashedIcon className={cn("size-6", oscura ? "text-acero-frio" : "text-gris-pizarra")} aria-hidden />
}

const ETIQUETA_ESTADO: Record<EstadoFase, string> = {
  pendiente: "Pendiente",
  en_curso: "En curso",
  completada: "Completada",
  error: "Con errores",
}

function MiniTabla({ tabla, oscura }: { tabla: Tabla; oscura: boolean }) {
  return (
    <figure className="flex flex-col gap-1.5">
      <figcaption className={cn("truncate text-xs", oscura ? "text-[#979dac]" : "text-muted-foreground")}>
        {tabla.leyenda}
      </figcaption>
      <div className={cn("overflow-hidden rounded-lg", oscura ? "bg-white/5" : "bg-muted/60")}>
        <table className="w-full text-xs tabular-nums">
          <thead>
            <tr className={cn("text-left", oscura ? "bg-white/10 text-acero-frio" : "bg-secondary text-marino")}>
              {tabla.columnas.map((c, i) => (
                <th key={i} scope="col" className={cn("px-2 py-1.5 font-medium whitespace-nowrap", tabla.numericas?.includes(i) && "text-right")}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tabla.filas.map((fila, i) => (
              <tr
                key={i}
                className={cn("animate-in fade-in slide-in-from-bottom-1 fill-mode-both border-t", oscura ? "border-white/10" : "border-border")}
                style={{ animationDelay: `${i * 60}ms` }}
              >
                {fila.map((celda, j) => (
                  <td key={j} className={cn("max-w-28 truncate px-2 py-1 whitespace-nowrap", tabla.numericas?.includes(j) && "text-right")}>
                    {celda}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}

function TablaVacia({ oscura }: { oscura: boolean }) {
  return (
    <div className={cn("flex h-36 flex-col gap-1.5 rounded-lg p-2.5", oscura ? "bg-white/5" : "bg-muted/60")}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={cn("h-3 rounded", oscura ? "bg-white/10" : "bg-border/70")} style={{ width: `${92 - i * 9}%` }} aria-hidden />
      ))}
      <span className={cn("mt-auto text-xs", oscura ? "text-[#979dac]" : "text-muted-foreground")}>
        Se llenará al ejecutar esta fase.
      </span>
    </div>
  )
}

export function VisualizacionPipeline({
  etl,
  onInspeccionar,
}: {
  etl: PipelineEtl
  onInspeccionar: (p: PestanaId) => void
}) {
  const lista = fases(etl)
  const tablas = muestras(etl)

  // La tarjeta destacada (oscura) es la fase en la que está el pipeline.
  const enCurso = lista.findIndex((f) => f.estado === "en_curso")
  const siguiente = lista.findIndex((f) => f.estado !== "completada")
  const destacada = enCurso >= 0 ? enCurso : siguiente >= 0 ? siguiente : lista.length - 1

  return (
    <section id="pipeline" aria-labelledby="titulo-pipeline" className="flex scroll-mt-24 flex-col gap-5">
      <h2 id="titulo-pipeline" className="text-2xl font-semibold sm:text-3xl">
        <NumeroSeccion n={3} className="bg-marino" />
        Pipeline ETL.{" "}
        <span className="text-muted-foreground">Echa un ojo a los datos en cada fase.</span>{" "}
        <Ayuda titulo="¿Qué es un pipeline ETL?">
          <p>Es el camino que siguen los datos desde que se descargan hasta que se guardan. ETL son las iniciales en inglés de sus tres partes:</p>
          <p><strong>Extraer:</strong> pedir los datos a Open-Meteo. <strong>Transformar:</strong> ordenarlos en una fila por ciudad y hora, y limpiar los erróneos. <strong>Cargar:</strong> guardarlos en la base de datos.</p>
          <p>Cada tarjeta es una fase. El ✓ verde indica que ya terminó, y la tarjeta oscura, la fase que toca ahora.</p>
        </Ayuda>
      </h2>
      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {lista.map((f, i) => {
          const oscura = i === destacada
          const tabla = tablas[i]
          const tenue = oscura ? "text-[#c5cad4]" : "text-muted-foreground"
          const fuerte = oscura ? "text-white" : "text-foreground"
          return (
            <li key={f.titulo} className="flex min-w-0">
              <article
                aria-label={`Fase ${i + 1}: ${f.titulo}`}
                className={cn(
                  "flex w-full min-w-0 flex-col gap-3 rounded-[18px] p-5 transition-shadow duration-300",
                  oscura
                    ? "bg-prusia-3/92 text-white ring-1 ring-white/10 shadow-[0_8px_28px_rgb(0_18_51/0.3),inset_0_1px_0_rgb(255_255_255/0.15)]"
                    : "tarjeta hover:shadow-(--sombra-tarjeta-hover)"
                )}
              >
                <header className="flex flex-col gap-1">
                  <div className="mb-2 flex items-center justify-between">
                    <span className={cn("h-1 w-10 rounded-full", oscura ? "bg-azul" : ACENTO_FASE[i].fondo)} aria-hidden />
                    <IconoEstado estado={f.estado} oscura={oscura} />
                  </div>
                  <p
                    className={cn(
                      "text-xs font-semibold tracking-wide uppercase",
                      f.estado === "error" ? "text-destructive" : oscura ? "text-[#4d94e0]" : ACENTO_FASE[i].texto
                    )}
                  >
                    Fase {i + 1} · {ETIQUETA_ESTADO[f.estado]}
                  </p>
                  <h3 className="text-xl font-semibold">{f.titulo}</h3>
                  <p className="text-sm font-semibold">{f.salida !== "—" ? f.salida : "Sin datos todavía."}</p>
                  <p className={cn("line-clamp-3 text-xs leading-relaxed", tenue)} title={f.explicacion}>
                    {f.explicacion}
                  </p>
                </header>

                <div className="flex-1">
                  {tabla && tabla.filas.length > 0 ? (
                    <MiniTabla key={tabla.leyenda} tabla={tabla} oscura={oscura} />
                  ) : (
                    <TablaVacia oscura={oscura} />
                  )}
                </div>

                <footer className="flex flex-col gap-2.5">
                  <dl className={cn("grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs", tenue)}>
                    <dt>Entrada</dt>
                    <dd className={cn("truncate text-right font-medium tabular-nums", fuerte)}>{f.entrada}</dd>
                    <dt>Duración</dt>
                    <dd className={cn("text-right font-medium tabular-nums", fuerte)}>{formatoDuracion(f.duracionMs)}</dd>
                  </dl>
                  {f.detalle && <p className={cn("text-xs", tenue)}>{f.detalle}</p>}
                  <Button
                    variant={oscura ? "default" : "outline"}
                    size="sm"
                    className="self-start"
                    onClick={() => onInspeccionar(f.pestana)}
                    disabled={f.estado === "pendiente"}
                  >
                    Inspeccionar
                    <ChevronRightIcon data-icon="inline-end" />
                  </Button>
                </footer>
              </article>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

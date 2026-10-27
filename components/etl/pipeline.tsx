"use client"

import { ArrowRightIcon, SearchIcon } from "lucide-react"
import { cn } from "cn"

import { EstadoBadge } from "@/components/etl/estado"
import { Button } from "@/components/ui/button"
import type { PipelineEtl } from "@/hooks/use-pipeline-etl"
import { formatoDuracion, formatoEntero } from "@/lib/etl/formato"
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

export function VisualizacionPipeline({
  etl,
  onInspeccionar,
}: {
  etl: PipelineEtl
  onInspeccionar: (p: PestanaId) => void
}) {
  const lista = fases(etl)
  return (
    <section aria-labelledby="titulo-pipeline" className="flex flex-col gap-3">
      <h2 id="titulo-pipeline" className="text-base font-medium">
        2. Pipeline ETL
      </h2>
      <ol className="grid gap-2 lg:grid-cols-[repeat(5,minmax(0,1fr))]">
        {lista.map((f, i) => (
          <li key={f.titulo} className="relative flex">
            <article
              className={cn(
                "flex w-full flex-col gap-2 rounded-xl border bg-card p-3 text-sm",
                f.estado === "en_curso" && "border-sky-600/50",
                f.estado === "error" && "border-destructive/50"
              )}
              aria-label={`Fase ${i + 1}: ${f.titulo}`}
            >
              <header className="flex flex-wrap items-center justify-between gap-1.5">
                <h3 className="font-medium">
                  <span className="text-muted-foreground">{i + 1}.</span> {f.titulo}
                </h3>
                <EstadoBadge estado={f.estado} />
              </header>
              <p className="text-xs leading-relaxed text-muted-foreground">{f.explicacion}</p>
              <dl className="mt-auto grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs">
                <dt className="text-muted-foreground">Entrada</dt>
                <dd className="text-right font-medium tabular-nums">{f.entrada}</dd>
                <dt className="text-muted-foreground">Salida</dt>
                <dd className="text-right font-medium tabular-nums">{f.salida}</dd>
                <dt className="text-muted-foreground">Duración</dt>
                <dd className="text-right tabular-nums">{formatoDuracion(f.duracionMs)}</dd>
              </dl>
              {f.detalle && <p className="text-xs">{f.detalle}</p>}
              <Button
                variant="outline"
                size="sm"
                onClick={() => onInspeccionar(f.pestana)}
                disabled={f.estado === "pendiente"}
              >
                <SearchIcon data-icon="inline-start" />
                Inspeccionar
              </Button>
            </article>
            {i < lista.length - 1 && (
              <ArrowRightIcon
                className="absolute top-1/2 -right-2.5 z-10 hidden size-4 -translate-y-1/2 rounded-full bg-background text-muted-foreground lg:block"
                aria-hidden
              />
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}

export function Contadores({ etl }: { etl: PipelineEtl }) {
  const pr = etl.procesamiento
  const n = formatoEntero
  const items = [
    { titulo: "Total extraído", valor: pr?.transformacion.registros.length, ayuda: "registros horarios recibidos" },
    { titulo: "Válidos", valor: pr?.limpieza.validos.length, ayuda: "superan la limpieza" },
    { titulo: "Rechazados", valor: pr?.limpieza.rechazados.length, ayuda: "descartes por calidad" },
    { titulo: "Coinciden con los filtros", valor: pr ? etl.filtrado.ordenados.length : undefined, ayuda: pr ? `${n(pr.limpieza.validos.length - etl.filtrado.ordenados.length)} excluidos por filtros` : "" },
    { titulo: "Seleccionados para cargar", valor: pr ? etl.vistaPrevia.length : undefined, ayuda: etl.seleccion.fueraDeFiltros > 0 ? `+${n(etl.seleccion.fueraDeFiltros)} seleccionados fuera de filtros (no se suben)` : "seleccionados y dentro de filtros", destacado: true },
  ]
  return (
    <section aria-label="Contadores" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((it) => (
        <div
          key={it.titulo}
          className={cn(
            "flex flex-col gap-0.5 rounded-xl border bg-card p-3",
            it.destacado && "border-primary/40 bg-primary/5"
          )}
        >
          <span className="text-xs text-muted-foreground">{it.titulo}</span>
          <span className="text-2xl font-semibold tabular-nums">
            {it.valor === undefined ? "—" : n(it.valor)}
          </span>
          <span
            className={cn(
              "text-xs text-muted-foreground",
              it.destacado && etl.seleccion.fueraDeFiltros > 0 && "font-medium text-amber-700 dark:text-amber-400"
            )}
          >
            {it.ayuda}
          </span>
        </div>
      ))}
    </section>
  )
}

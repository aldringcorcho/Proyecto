"use client"

import * as React from "react"
import { cn } from "cn"

import { Ayuda } from "@/components/etl/ayuda"
import { ConfiguracionExtraccion } from "@/components/etl/configuracion-extraccion"
import { NumeroSeccion } from "@/components/etl/estado"
import { GraficoTemperatura } from "@/components/etl/grafico-temperatura"
import { GuiaInicio, SiguientePaso } from "@/components/etl/guia"
import { Indicadores } from "@/components/etl/indicadores"
import { BarraCarga, PestanaCarga } from "@/components/etl/pestana-carga"
import { PestanaSupabase } from "@/components/etl/pestana-supabase"
import { PestanaValidos } from "@/components/etl/pestana-validos"
import {
  PestanaJson,
  PestanaRechazados,
  PestanaTransformados,
} from "@/components/etl/pestanas-datos"
import { VisualizacionPipeline, type PestanaId } from "@/components/etl/pipeline"
import { desplazarA } from "@/components/etl/scroll-suave"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { EstadoSupabase } from "@/hooks/use-estado-supabase"
import type { PipelineEtl } from "@/hooks/use-pipeline-etl"
import { formatoEntero } from "@/lib/etl/formato"

/** Las 6 vistas se agrupan en 4 pestañas; dos de ellas tienen dos vistas internas. */
type Grupo = "api" | "seleccion" | "rechazados" | "supabase"

const GRUPO_DE: Record<PestanaId, Grupo> = {
  json: "api",
  transformados: "api",
  validos: "seleccion",
  carga: "seleccion",
  rechazados: "rechazados",
  supabase: "supabase",
}

/** Selector de dos vistas dentro de una pestaña. */
function Vistas<T extends string>({
  etiqueta,
  valor,
  opciones,
  onCambiar,
}: {
  etiqueta: string
  valor: T
  opciones: { id: T; texto: string; cuenta?: number }[]
  onCambiar: (v: T) => void
}) {
  return (
    <div role="group" aria-label={etiqueta} className="inline-flex self-start rounded-full bg-secondary p-1">
      {opciones.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={valor === o.id}
          onClick={() => onCambiar(o.id)}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
            valor === o.id ? "bg-card text-marino shadow-sm" : "text-pizarra hover:text-marino"
          )}
        >
          {o.texto}
          {o.cuenta !== undefined && <span className="text-xs tabular-nums text-muted-foreground">{formatoEntero(o.cuenta)}</span>}
        </button>
      ))}
    </div>
  )
}

/**
 * Vista completa: todo el detalle técnico del pipeline. Va en su propio archivo
 * para que la vista sencilla no tenga que descargarla.
 */
export default function VistaCompleta({
  etl,
  supabase,
  pestanaInicial,
}: {
  etl: PipelineEtl
  supabase: EstadoSupabase | null
  /** Pestaña que se abre al llegar desde la vista sencilla (p. ej. «Ver lo guardado»). */
  pestanaInicial: PestanaId | null
}) {
  const [grupo, setGrupo] = React.useState<Grupo>(pestanaInicial ? GRUPO_DE[pestanaInicial] : "api")
  const [ciudadAbierta, setCiudadAbierta] = React.useState<string | null>(null)
  const [vistaApi, setVistaApi] = React.useState<"json" | "transformados">(
    pestanaInicial === "transformados" ? "transformados" : "json"
  )
  const [vistaSeleccion, setVistaSeleccion] = React.useState<"validos" | "carga">(
    pestanaInicial === "carga" ? "carga" : "validos"
  )
  const refInspeccion = React.useRef<HTMLElement>(null)
  const pr = etl.procesamiento

  function mostrar(p: PestanaId) {
    setGrupo(GRUPO_DE[p])
    if (p === "json" || p === "transformados") setVistaApi(p)
    if (p === "validos" || p === "carga") setVistaSeleccion(p)
  }

  function inspeccionar(p: PestanaId) {
    mostrar(p)
    if (refInspeccion.current) desplazarA(refInspeccion.current)
  }

  // Al llegar desde la vista sencilla con una pestaña pedida, baja hasta ella.
  React.useEffect(() => {
    if (pestanaInicial && refInspeccion.current) desplazarA(refInspeccion.current)
  }, [pestanaInicial])

  const pestanas: { id: Grupo; texto: string; cuenta?: number }[] = [
    { id: "api", texto: "Datos de la API", cuenta: pr?.transformacion.registros.length },
    { id: "seleccion", texto: "Válidos y carga", cuenta: pr?.limpieza.validos.length },
    { id: "rechazados", texto: "Rechazados", cuenta: pr?.limpieza.rechazados.length },
    { id: "supabase", texto: "Datos en Supabase", cuenta: supabase?.total ?? undefined },
  ]

  return (
    <>
      <SiguientePaso etl={etl} supabase={supabase} onVer={inspeccionar} />
      <header className="cabecera-vidrio relative mt-4 flex flex-col gap-3 overflow-hidden rounded-[28px] px-6 py-10 text-white sm:px-10 sm:py-14">
        <p className="self-start rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-acero-frio uppercase ring-1 ring-white/15">
          Big Data · Práctica 1
        </p>
        <h1 className="max-w-4xl text-4xl leading-[1.08] font-semibold tracking-tight sm:text-5xl">
          Pipeline ETL.{" "}
          <span className="text-white/60">
            De Open-Meteo a Supabase, observando cada registro por el camino.
          </span>
        </h1>
        <p className="max-w-3xl text-base text-white/75">
          Extrae mediciones horarias reales, observa cómo cambian en cada fase y decide exactamente
          qué registros se cargan en la base de datos.
        </p>
      </header>

      <GuiaInicio etl={etl} />
      <Indicadores etl={etl} />
      <ConfiguracionExtraccion etl={etl} abierta={ciudadAbierta} onAbrir={setCiudadAbierta} />
      <GraficoTemperatura etl={etl} foco={ciudadAbierta} onFoco={setCiudadAbierta} />
      <VisualizacionPipeline etl={etl} onInspeccionar={inspeccionar} />
      <BarraCarga etl={etl} supabase={supabase} onVerCarga={() => mostrar("carga")} />

      <section ref={refInspeccion} id="inspeccion" aria-labelledby="titulo-inspeccion" className="flex scroll-mt-24 flex-col gap-3">
        <h2 id="titulo-inspeccion" className="text-2xl font-semibold">
          <NumeroSeccion n={4} className="bg-prusia-1" />
          Inspección de datos.{" "}
          <span className="text-muted-foreground">Los registros, tal como son en cada fase.</span>{" "}
          <Ayuda titulo="¿Qué hay en cada pestaña?">
            <p><strong>Datos de la API:</strong> lo que respondió Open-Meteo tal cual (en formato JSON, un texto con llaves y corchetes) y esos mismos datos ya ordenados en una tabla.</p>
            <p><strong>Válidos y carga:</strong> los datos buenos. Aquí puedes filtrarlos, marcar cuáles guardar y ver exactamente qué se va a subir.</p>
            <p><strong>Rechazados:</strong> los datos descartados por estar mal (vacíos, repetidos o imposibles) y el motivo.</p>
            <p><strong>Datos en Supabase:</strong> lo que ya está guardado en la base de datos.</p>
          </Ayuda>
        </h2>
        <Tabs value={grupo} onValueChange={(v) => setGrupo(v as Grupo)}>
          <div className="overflow-x-auto pb-1">
            <TabsList className="vidrio relative h-10! rounded-full p-1">
              {pestanas.map((p) => (
                <TabsTrigger key={p.id} value={p.id} className="rounded-full px-3 data-active:bg-azul data-active:text-white">
                  {p.texto}
                  {p.cuenta !== undefined && (
                    <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground in-data-active:bg-white/20 in-data-active:text-white">
                      {formatoEntero(p.cuenta)}
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <TabsContent value="api" className="flex flex-col gap-4 pt-2">
            <Vistas
              etiqueta="Vista de los datos de la API"
              valor={vistaApi}
              onCambiar={setVistaApi}
              opciones={[
                { id: "json", texto: "JSON original", cuenta: etl.extraccion?.ciudades.filter((c) => c.respuesta).length },
                { id: "transformados", texto: "Transformados", cuenta: pr?.transformacion.registros.length },
              ]}
            />
            {vistaApi === "json" ? <PestanaJson etl={etl} /> : <PestanaTransformados etl={etl} />}
          </TabsContent>
          <TabsContent value="seleccion" className="flex flex-col gap-4 pt-2">
            <Vistas
              etiqueta="Vista de válidos y carga"
              valor={vistaSeleccion}
              onCambiar={setVistaSeleccion}
              opciones={[
                { id: "validos", texto: "Válidos y selección", cuenta: pr?.limpieza.validos.length },
                { id: "carga", texto: "Vista previa de la carga", cuenta: pr ? etl.vistaPrevia.length : undefined },
              ]}
            />
            {vistaSeleccion === "validos" ? (
              <PestanaValidos etl={etl} />
            ) : (
              <PestanaCarga etl={etl} supabase={supabase} />
            )}
          </TabsContent>
          <TabsContent value="rechazados" className="pt-2"><PestanaRechazados etl={etl} /></TabsContent>
          <TabsContent value="supabase" className="pt-2">
            <PestanaSupabase
              supabase={supabase}
              version={etl.versionDestino}
              pendientesLocales={etl.vistaPrevia.length}
            />
          </TabsContent>
        </Tabs>
      </section>
    </>
  )
}

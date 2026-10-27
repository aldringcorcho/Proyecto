"use client"

import * as React from "react"

import { ConfiguracionExtraccion } from "@/components/etl/configuracion-extraccion"
import { BarraCarga, PestanaCarga } from "@/components/etl/pestana-carga"
import { PestanaSupabase } from "@/components/etl/pestana-supabase"
import { PestanaValidos } from "@/components/etl/pestana-validos"
import {
  PestanaJson,
  PestanaRechazados,
  PestanaTransformados,
} from "@/components/etl/pestanas-datos"
import { Contadores, VisualizacionPipeline, type PestanaId } from "@/components/etl/pipeline"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useEstadoSupabase } from "@/hooks/use-estado-supabase"
import { usePipelineEtl } from "@/hooks/use-pipeline-etl"
import { formatoEntero } from "@/lib/etl/formato"

export function AreaTrabajo() {
  const etl = usePipelineEtl()
  const supabase = useEstadoSupabase(etl.versionDestino)
  const [pestana, setPestana] = React.useState<PestanaId>("json")
  const refInspeccion = React.useRef<HTMLElement>(null)
  const pr = etl.procesamiento

  function inspeccionar(p: PestanaId) {
    setPestana(p)
    refInspeccion.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const pestanas: { id: PestanaId; texto: string; cuenta?: number }[] = [
    { id: "json", texto: "JSON original", cuenta: etl.extraccion?.ciudades.filter((c) => c.respuesta).length },
    { id: "transformados", texto: "Transformados", cuenta: pr?.transformacion.registros.length },
    { id: "validos", texto: "Válidos y selección", cuenta: pr?.limpieza.validos.length },
    { id: "rechazados", texto: "Rechazados", cuenta: pr?.limpieza.rechazados.length },
    { id: "carga", texto: "Vista previa de la carga", cuenta: pr ? etl.vistaPrevia.length : undefined },
    { id: "supabase", texto: "Datos en Supabase", cuenta: supabase.estado?.total ?? undefined },
  ]

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-1">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Big Data · Práctica 1
        </p>
        <h1 className="text-2xl font-semibold">Pipeline ETL: Open-Meteo → Supabase</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Extrae mediciones horarias reales, observa cómo cambian en cada fase y decide exactamente
          qué registros se cargan en la base de datos.
        </p>
      </header>

      <ConfiguracionExtraccion etl={etl} />
      <VisualizacionPipeline etl={etl} onInspeccionar={inspeccionar} />
      <Contadores etl={etl} />
      <BarraCarga etl={etl} supabase={supabase.estado} onVerCarga={() => setPestana("carga")} />

      <section ref={refInspeccion} aria-labelledby="titulo-inspeccion" className="flex scroll-mt-4 flex-col gap-3">
        <h2 id="titulo-inspeccion" className="text-base font-medium">
          3. Inspección de datos
        </h2>
        <Tabs value={pestana} onValueChange={(v) => setPestana(v as PestanaId)}>
          <div className="overflow-x-auto pb-1">
            <TabsList>
              {pestanas.map((p) => (
                <TabsTrigger key={p.id} value={p.id} className="px-2.5">
                  {p.texto}
                  {p.cuenta !== undefined && (
                    <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">
                      {formatoEntero(p.cuenta)}
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <TabsContent value="json" className="pt-2"><PestanaJson etl={etl} /></TabsContent>
          <TabsContent value="transformados" className="pt-2"><PestanaTransformados etl={etl} /></TabsContent>
          <TabsContent value="validos" className="pt-2"><PestanaValidos etl={etl} /></TabsContent>
          <TabsContent value="rechazados" className="pt-2"><PestanaRechazados etl={etl} /></TabsContent>
          <TabsContent value="carga" className="pt-2"><PestanaCarga etl={etl} supabase={supabase.estado} /></TabsContent>
          <TabsContent value="supabase" className="pt-2">
            <PestanaSupabase
              supabase={supabase.estado}
              version={etl.versionDestino}
              pendientesLocales={etl.vistaPrevia.length}
            />
          </TabsContent>
        </Tabs>
      </section>
    </main>
  )
}

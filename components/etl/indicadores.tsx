"use client"

import { CloudRainIcon, DatabaseIcon, ThermometerSunIcon } from "lucide-react"

import type { PipelineEtl } from "@/hooks/use-pipeline-etl"
import { formatoEntero, formatoNumero } from "@/lib/etl/formato"

const unDecimal = (n: number) => formatoNumero(Math.round(n * 10) / 10)
const fechaCorta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)} ${iso.slice(11, 13)}h UTC`

/** Tres cifras clave de la última extracción, calculadas sobre los registros válidos. */
export function Indicadores({ etl }: { etl: PipelineEtl }) {
  const pr = etl.procesamiento
  const validos = pr?.limpieza.validos ?? []

  let maxima = validos[0]
  const lluviaPorCiudad = new Map<string, number>()
  for (const m of validos) {
    if (m.temperatura_c > maxima.temperatura_c) maxima = m
    lluviaPorCiudad.set(m.ciudad, (lluviaPorCiudad.get(m.ciudad) ?? 0) + m.precipitacion_mm)
  }
  const lluviaTotal = [...lluviaPorCiudad.values()].reduce((s, v) => s + v, 0)
  const masLluviosa = [...lluviaPorCiudad].sort((a, b) => b[1] - a[1])[0]

  const items = [
    {
      icono: ThermometerSunIcon,
      titulo: "Temperatura máxima",
      valor: maxima ? `${unDecimal(maxima.temperatura_c)} °C` : "—",
      detalle: maxima ? `${maxima.ciudad} · ${fechaCorta(maxima.fecha_hora)}` : "Se calculará al extraer",
      acento: "from-[#eb6834] to-[#a83c0f]",
    },
    {
      icono: CloudRainIcon,
      titulo: "Lluvia total",
      valor: pr ? `${unDecimal(lluviaTotal)} mm` : "—",
      detalle: masLluviosa ? `La que más: ${masLluviosa[0]} (${unDecimal(masLluviosa[1])} mm)` : "Se calculará al extraer",
      acento: "from-azul to-marino",
    },
    {
      icono: DatabaseIcon,
      titulo: "Registros extraídos",
      valor: pr ? formatoEntero(pr.transformacion.registros.length) : "—",
      detalle: pr
        ? `${formatoEntero(validos.length)} válidos · ${formatoEntero(pr.limpieza.rechazados.length)} rechazados`
        : "Pulsa «Extraer datos»",
      acento: "from-acero to-prusia-1",
    },
  ]

  return (
    <section aria-label="Resumen de la extracción" className="grid gap-4 sm:grid-cols-3">
      {items.map((it) => (
        <div key={it.titulo} className="tarjeta flex items-center gap-4 p-4">
          <span
            className={`flex size-11 flex-none items-center justify-center rounded-2xl bg-linear-to-br text-white shadow-sm ${it.acento}`}
            aria-hidden
          >
            <it.icono className="size-5" />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="text-xs font-medium text-muted-foreground">{it.titulo}</span>
            <span className="text-2xl font-semibold tracking-tight tabular-nums">{it.valor}</span>
            <span className="truncate text-xs text-muted-foreground" title={it.detalle}>
              {it.detalle}
            </span>
          </div>
        </div>
      ))}
    </section>
  )
}

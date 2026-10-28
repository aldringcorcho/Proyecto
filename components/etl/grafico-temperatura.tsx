"use client"

import * as React from "react"
import { cn } from "cn"

import { Ayuda } from "@/components/etl/ayuda"
import { NumeroSeccion } from "@/components/etl/estado"
import type { PipelineEtl } from "@/hooks/use-pipeline-etl"
import { CIUDADES } from "@/lib/etl/ciudades"
import { formatoNumero } from "@/lib/etl/formato"
import type { Medicion } from "@/lib/etl/tipos"

/** Temperatura de una ciudad en un día UTC: media, mínima y máxima de sus horas válidas. */
type Dia = { media: number; min: number; max: number }

/** Serie por ciudad (nombre) → día "YYYY-MM-DD" → agregado. */
function agregarPorDia(validos: readonly Medicion[]) {
  const acumulado = new Map<string, Map<string, { suma: number; n: number; min: number; max: number }>>()
  for (const m of validos) {
    const dia = m.fecha_hora.slice(0, 10)
    const porDia = acumulado.get(m.ciudad) ?? new Map()
    const a = porDia.get(dia) ?? { suma: 0, n: 0, min: Infinity, max: -Infinity }
    a.suma += m.temperatura_c
    a.n += 1
    a.min = Math.min(a.min, m.temperatura_c)
    a.max = Math.max(a.max, m.temperatura_c)
    porDia.set(dia, a)
    acumulado.set(m.ciudad, porDia)
  }
  const dias = [...new Set([...acumulado.values()].flatMap((d) => [...d.keys()]))].sort()
  const series = new Map<string, Map<string, Dia>>()
  for (const [ciudad, porDia] of acumulado) {
    series.set(ciudad, new Map([...porDia].map(([d, a]) => [d, { media: a.suma / a.n, min: a.min, max: a.max }])))
  }
  return { dias, series }
}

/**
 * Escala divergente: azules de la paleta para el frío, naranjas para el calor y un gris claro
 * neutro en TEMPERATURA_NEUTRA. Se interpola en RGB entre paradas cercanas, así que no aparecen
 * tonos intermedios raros.
 */
const TEMPERATURA_NEUTRA = 20

const PARADAS = ["#023e7d", "#0466c8", "#9cc3ec", "#eef0f4", "#f8c4a0", "#eb6834", "#a83c0f"].map((h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
])

function colorEscala(t: number) {
  const u = Math.min(1, Math.max(0, t)) * (PARADAS.length - 1)
  const i = Math.min(PARADAS.length - 2, Math.floor(u))
  const f = u - i
  const [r, g, b] = PARADAS[i].map((c, k) => Math.round(c + (PARADAS[i + 1][k] - c) * f))
  return `rgb(${r} ${g} ${b})`
}

const GRADIENTE = `linear-gradient(to top, ${PARADAS.map((_, i) => colorEscala(i / (PARADAS.length - 1))).join(", ")})`

const unDecimal = (n: number) => formatoNumero(Math.round(n * 10) / 10)
const diaCorto = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

export function GraficoTemperatura({
  etl,
  foco,
  onFoco,
}: {
  etl: PipelineEtl
  /** Id de la ciudad resaltada (la misma que está abierta en el mapa). */
  foco: string | null
  onFoco: (id: string) => void
}) {
  const validos = etl.procesamiento?.limpieza.validos
  // Memorizado: pasar el ratón por las celdas no vuelve a recorrer todas las mediciones.
  const { dias, series } = React.useMemo(() => agregarPorDia(validos ?? []), [validos])
  const [activa, setActiva] = React.useState<{ ciudad: string; dia: string } | null>(null)

  // Orden fijo de ciudades (el de la configuración), nunca por valor.
  const ciudades = CIUDADES.filter((c) => series.has(c.nombre))

  const titulo = (
    <h2 id="titulo-grafico" className="text-2xl font-semibold sm:text-3xl">
      <NumeroSeccion n={2} className="bg-acero" />
      Temperatura diaria.{" "}
      <span className="text-muted-foreground">Azul cuando hizo frío, naranja cuando hizo calor.</span>{" "}
      <Ayuda titulo="¿Cómo se lee este gráfico?">
        <p>Cada fila es una ciudad y cada columna, un día. Cada cuadrito es la <strong>temperatura media</strong> de ese día.</p>
        <p>Si el cuadrito es <strong>naranja</strong>, hizo más de 20 °C; si es <strong>azul</strong>, menos. Cuanto más intenso el color, más calor o más frío.</p>
        <p>Pasa el ratón por un cuadrito para ver los grados exactos.</p>
      </Ayuda>
    </h2>
  )

  if (ciudades.length === 0 || dias.length === 0) {
    return (
      <section id="temperatura" aria-labelledby="titulo-grafico" className="flex scroll-mt-24 flex-col gap-5">
        {titulo}
        <div className="tarjeta flex h-40 items-center justify-center p-5 text-sm text-muted-foreground">
          El mapa de calor aparecerá al extraer los datos.
        </div>
      </section>
    )
  }

  const medias = [...series.values()].flatMap((s) => [...s.values()].map((d) => d.media))
  // Escala simétrica alrededor de TEMPERATURA_NEUTRA: un grado de más o de menos pesa lo mismo
  // en los dos lados, así el naranja y el azul son comparables.
  const radio = Math.max(
    Math.ceil(Math.max(...medias) - TEMPERATURA_NEUTRA),
    Math.ceil(TEMPERATURA_NEUTRA - Math.min(...medias)),
    1
  )
  const minimo = TEMPERATURA_NEUTRA - radio
  const maximo = TEMPERATURA_NEUTRA + radio
  const t = (v: number) => (v - minimo) / (maximo - minimo)
  // Marcas del eje de la leyenda en números redondos, siempre incluido el punto neutro.
  const paso = radio > 6 ? 5 : 2
  const marcas = Array.from({ length: Math.floor(radio / paso) * 2 + 1 }, (_, i) => TEMPERATURA_NEUTRA + (i - Math.floor(radio / paso)) * paso)
  const pasoEtiquetas = dias.length > 16 ? 2 : 1

  const detalle = activa ? series.get(activa.ciudad)?.get(activa.dia) : undefined

  return (
    <section id="temperatura" aria-labelledby="titulo-grafico" className="flex scroll-mt-24 flex-col gap-5">
      {titulo}
      {/* Casi opaca: los colores del mapa de calor tienen que verse limpios, sin el fondo mezclándose. */}
      <div className="tarjeta flex flex-col gap-4 p-5" style={{ backgroundColor: "rgb(246 248 251 / 0.95)" }}>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Cada celda es la temperatura media de un día (UTC) en una ciudad. Por debajo de{" "}
          {TEMPERATURA_NEUTRA} °C es azul (más intenso cuanto más frío) y por encima, naranja (más
          intenso cuanto más calor). Pasa el ratón por una celda para ver la media, la mínima y la
          máxima; pulsa una ciudad para abrirla en el mapa.
        </p>

        <div className="flex items-stretch gap-4">
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div
            role="group"
            aria-label="Temperatura media diaria por ciudad"
            className="grid min-w-[40rem] gap-[2px]"
            style={{ gridTemplateColumns: `6.5rem repeat(${dias.length}, minmax(0, 1fr))` }}
            onPointerLeave={() => setActiva(null)}
          >
            {/* Cabecera de días. */}
            <span aria-hidden />
            {dias.map((d, i) => (
              <span
                key={d}
                className={cn(
                  "pb-1 text-center text-xs text-muted-foreground tabular-nums",
                  activa?.dia === d && "font-semibold text-marino"
                )}
              >
                {i % pasoEtiquetas === 0 || activa?.dia === d ? d.slice(8, 10) : ""}
              </span>
            ))}

            {ciudades.map((c) => {
              const enFoco = c.id === foco
              const serie = series.get(c.nombre)!
              return (
                <React.Fragment key={c.id}>
                  <button
                    type="button"
                    onClick={() => onFoco(c.id)}
                    aria-pressed={enFoco}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-2 text-left text-xs transition-colors",
                      enFoco ? "bg-azul/10 font-semibold text-marino shadow-[inset_3px_0_0_var(--color-azul)]" : "text-foreground hover:bg-secondary"
                    )}
                  >
                    {c.nombre}
                  </button>
                  {dias.map((d) => {
                    const v = serie.get(d)
                    const resaltada = activa?.ciudad === c.nombre && activa.dia === d
                    return (
                      <span
                        key={d}
                        tabIndex={v ? 0 : -1}
                        aria-label={v ? `${c.nombre}, ${diaCorto(d)}: ${unDecimal(v.media)} °C de media` : `${c.nombre}, ${diaCorto(d)}: sin datos`}
                        onPointerEnter={() => v && setActiva({ ciudad: c.nombre, dia: d })}
                        onFocus={() => v && setActiva({ ciudad: c.nombre, dia: d })}
                        onClick={() => onFoco(c.id)}
                        className={cn(
                          "h-7 cursor-pointer rounded-[4px] outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ring",
                          !v && "bg-muted",
                          resaltada && "relative z-10 scale-110 ring-2 ring-white shadow-md",
                          enFoco && !resaltada && "ring-1 ring-marino/40"
                        )}
                        style={v ? { background: colorEscala(t(v.media)) } : undefined}
                      />
                    )
                  })}
                </React.Fragment>
              )
            })}
          </div>
        </div>

          {/* Leyenda vertical de la escala, a la altura de la cuadrícula. */}
          <figure
            className="flex flex-none flex-col items-center gap-1.5 pt-5"
            aria-label={`Escala de ${minimo} a ${maximo} °C, neutra en ${TEMPERATURA_NEUTRA} °C`}
          >
            <span className="text-xs font-semibold text-[#a83c0f]">Calor</span>
            <div className="flex flex-1 gap-1.5">
              <div className="w-3 rounded-full ring-1 ring-black/5" style={{ background: GRADIENTE }} />
              <div className="relative w-8 text-xs text-muted-foreground tabular-nums">
                {marcas.map((v) => (
                  <span
                    key={v}
                    className={cn("absolute left-0 -translate-y-1/2", v === TEMPERATURA_NEUTRA && "font-semibold text-foreground")}
                    style={{ top: `${(1 - t(v)) * 100}%` }}
                  >
                    {v}°
                  </span>
                ))}
              </div>
            </div>
            <span className="text-xs font-semibold text-marino">Frío</span>
          </figure>
        </div>

        {/* Lectura de la celda activa: siempre en el mismo sitio, para que no tape la cuadrícula. */}
        <p className="min-h-5 text-sm" aria-live="polite">
          {activa && detalle ? (
            <>
              <strong className="text-marino">{activa.ciudad}</strong>
              <span className="text-muted-foreground"> · {diaCorto(activa.dia)} · </span>
              <strong className="tabular-nums">{unDecimal(detalle.media)} °C</strong>
              <span className="text-muted-foreground"> de media · mín. </span>
              <span className="tabular-nums">{unDecimal(detalle.min)} °C</span>
              <span className="text-muted-foreground"> · máx. </span>
              <span className="tabular-nums">{unDecimal(detalle.max)} °C</span>
            </>
          ) : (
            <span className="text-muted-foreground">Pasa el ratón por una celda para ver su detalle.</span>
          )}
        </p>
      </div>
    </section>
  )
}

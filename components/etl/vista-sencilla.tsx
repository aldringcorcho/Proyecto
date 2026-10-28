"use client"

import * as React from "react"
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  CloudRainIcon,
  DatabaseIcon,
  DropletsIcon,
  LoaderCircleIcon,
  RotateCwIcon,
  SunIcon,
  ThermometerIcon,
} from "lucide-react"
import { cn } from "cn"

import { MapaVidrio } from "@/components/etl/mapa-vidrio"
import { motivoBloqueo } from "@/components/etl/motivo-bloqueo"
import type { PestanaId } from "@/components/etl/pipeline"
import { desplazarA } from "@/components/etl/scroll-suave"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { EstadoSupabase } from "@/hooks/use-estado-supabase"
import type { PipelineEtl } from "@/hooks/use-pipeline-etl"
import { CIUDADES, buscarCiudad } from "@/lib/etl/ciudades"
import { DIAS_RETRASO_ARCHIVO, hoyUtc } from "@/lib/etl/extraccion"
import { formatoEntero, formatoNumero } from "@/lib/etl/formato"
import type { Medicion } from "@/lib/etl/tipos"

const unDecimal = (n: number) => formatoNumero(Math.round(n * 10) / 10)
const nombreMes = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" })
const fechaLarga = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", timeZone: "UTC" })

function sumarDias(fecha: string, dias: number) {
  const d = new Date(`${fecha}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** Periodos listos para elegir sin tocar fechas. */
function periodos() {
  const hoy = hoyUtc()
  const finMesPasado = sumarDias(`${hoy.slice(0, 8)}01`, -1)
  const ultimoCompleto = sumarDias(hoy, -DIAS_RETRASO_ARCHIVO)
  return [
    {
      id: "mes",
      texto: `Todo ${nombreMes.format(new Date(`${finMesPasado}T00:00:00Z`))}`,
      inicio: `${finMesPasado.slice(0, 8)}01`,
      fin: finMesPasado,
    },
    {
      id: "semana",
      texto: "La última semana",
      inicio: sumarDias(ultimoCompleto, -6),
      fin: ultimoCompleto,
    },
  ]
}

type Resumen = { ciudad: string; horas: number; media: number; min: number; max: number; lluvia: number; humedad: number }

function resumirPorCiudad(validos: readonly Medicion[]): Resumen[] {
  const datos = new Map<string, Resumen>()
  for (const m of validos) {
    const r = datos.get(m.ciudad) ?? { ciudad: m.ciudad, horas: 0, media: 0, min: Infinity, max: -Infinity, lluvia: 0, humedad: 0 }
    r.horas += 1
    r.media += m.temperatura_c
    r.min = Math.min(r.min, m.temperatura_c)
    r.max = Math.max(r.max, m.temperatura_c)
    r.lluvia += m.precipitacion_mm
    r.humedad += m.humedad_pct
    datos.set(m.ciudad, r)
  }
  return CIUDADES.flatMap((c) => {
    const r = datos.get(c.nombre)
    return r ? [{ ...r, media: r.media / r.horas, humedad: r.humedad / r.horas }] : []
  })
}

/** Frases cotidianas para describir el tiempo de una ciudad. */
function fraseTemperatura(media: number) {
  if (media >= 25) return { texto: "Hizo calor", color: "text-[#a83c0f]", fondo: "from-[#f8b98f]/45 to-white/25" }
  if (media >= 18) return { texto: "Temperatura agradable", color: "text-[#9a5a00]", fondo: "from-[#f6d58f]/45 to-white/25" }
  return { texto: "Hizo fresco", color: "text-marino", fondo: "from-[#9cc3ec]/50 to-white/25" }
}
function fraseLluvia(mm: number) {
  if (mm < 1) return "Casi no llovió"
  if (mm < 20) return "Llovió poco"
  if (mm < 60) return "Llovió algo"
  return "Llovió bastante"
}

const PANTALLAS = ["Elegir", "Ver el resultado", "Guardar"]

export function VistaSencilla({
  etl,
  supabase,
  onVerCompleta,
}: {
  etl: PipelineEtl
  supabase: EstadoSupabase | null
  /** Cambia a la vista completa mostrando una pestaña concreta. */
  onVerCompleta: (p: PestanaId) => void
}) {
  const { configuracion: c, extraccion, carga, resumenCarga: r, acciones } = etl
  const [pantalla, setPantalla] = React.useState<0 | 1 | 2>(etl.procesamiento ? (carga ? 2 : 1) : 0)
  const [fechasAMano, setFechasAMano] = React.useState(false)
  const guardarPendiente = React.useRef(false)
  const [guardando, setGuardando] = React.useState(false)

  const extrayendo = extraccion?.estado === "en_curso"
  const subiendo = !!carga?.enCurso
  const opciones = periodos()
  const elegido = fechasAMano ? null : opciones.find((o) => o.inicio === c.fechaInicio && o.fin === c.fechaFin)

  // «Guardar» primero elige todos los datos correctos; en cuanto la selección existe, los sube.
  React.useEffect(() => {
    if (guardarPendiente.current && etl.vistaPrevia.length > 0) {
      guardarPendiente.current = false
      void acciones.subir()
    }
  }, [etl.vistaPrevia.length, acciones])

  function irA(p: 0 | 1 | 2) {
    setPantalla(p)
    if (p !== 2) setGuardando(false)
    desplazarA(0)
  }

  function verTiempo() {
    irA(1)
    void acciones.extraer()
  }

  function guardar() {
    irA(2)
    setGuardando(true)
    if (etl.vistaPrevia.length > 0) void acciones.subir()
    else {
      guardarPendiente.current = true
      etl.seleccion.seleccionarFiltradas()
    }
  }

  function alternarCiudad(id: string) {
    const marcada = c.ciudadIds.includes(id)
    c.setCiudadIds(CIUDADES.filter((x) => (x.id === id ? !marcada : c.ciudadIds.includes(x.id))).map((x) => x.id))
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Indicador de pantallas: 1 Elegir · 2 Ver el resultado · 3 Guardar */}
      <ol className="tarjeta flex items-center justify-between gap-2 p-3 sm:p-4" aria-label="Pasos">
        {PANTALLAS.map((p, i) => {
          const hecho = i < pantalla
          const actual = i === pantalla
          return (
            <li key={p} className="flex flex-1 items-center gap-2" aria-current={actual ? "step" : undefined}>
              <span
                className={cn(
                  "flex size-10 flex-none items-center justify-center rounded-full text-lg font-semibold",
                  actual ? "bg-azul text-white shadow-md" : hecho ? "bg-emerald-600 text-white" : "bg-muted text-pizarra"
                )}
              >
                {hecho ? <CheckIcon className="size-5" strokeWidth={3} /> : i + 1}
              </span>
              <span className={cn("hidden text-base sm:inline", actual ? "font-semibold text-marino" : "text-muted-foreground")}>{p}</span>
              {i < PANTALLAS.length - 1 && <span className="mx-1 h-0.5 flex-1 rounded-full bg-border" aria-hidden />}
            </li>
          )
        })}
      </ol>

      {pantalla === 0 && (
        <section className="tarjeta flex flex-col gap-8 p-6 sm:p-10">
          <div className="flex flex-col gap-4">
            <h2 className="text-3xl font-semibold sm:text-4xl">¿De qué ciudades quieres saber el tiempo?</h2>
            <p className="text-lg text-muted-foreground">Toca una ciudad (aquí o en el mapa) para elegirla o quitarla.</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {CIUDADES.map((ciudad) => {
                const marcada = c.ciudadIds.includes(ciudad.id)
                return (
                  <button
                    key={ciudad.id}
                    type="button"
                    aria-pressed={marcada}
                    onClick={() => alternarCiudad(ciudad.id)}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-2xl border px-5 py-4 text-left text-lg font-semibold transition-all duration-300",
                      marcada
                        ? "border-white/40 bg-linear-to-b from-[#2a82dc]/90 to-azul/90 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.45),0_10px_24px_rgb(4_102_200/0.35)] hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.5),0_14px_30px_rgb(4_102_200/0.45)] active:translate-y-0"
                        : "border-white/70 bg-white/55 text-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.9),0_4px_14px_rgb(0_18_51/0.06)] hover:-translate-y-0.5 hover:bg-white/60"
                    )}
                  >
                    {ciudad.nombre}
                    <span
                      className={cn(
                        "flex size-7 flex-none items-center justify-center rounded-full border-2",
                        marcada ? "border-white bg-white text-azul" : "border-border"
                      )}
                      aria-hidden
                    >
                      {marcada && <CheckIcon className="size-4" strokeWidth={3} />}
                    </span>
                  </button>
                )
              })}
            </div>
            <div className="rounded-3xl border border-white/70 bg-linear-to-b from-[#d3dae5] to-[#c5cedb] p-4 shadow-[inset_0_1px_0_rgb(255_255_255/0.8),inset_0_2px_14px_rgb(0_18_51/0.12)] sm:p-6">
              <MapaVidrio marcadas={c.ciudadIds} onAlternar={alternarCiudad} />
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <h2 className="text-3xl font-semibold sm:text-4xl">¿De qué días?</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {opciones.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={elegido?.id === o.id}
                  onClick={() => {
                    setFechasAMano(false)
                    c.setFechaInicio(o.inicio)
                    c.setFechaFin(o.fin)
                  }}
                  className={cn(
                    "rounded-2xl border px-5 py-4 text-left transition-all duration-300",
                    elegido?.id === o.id ? "border-azul/70 bg-azul/15 shadow-[inset_0_1px_0_rgb(255_255_255/0.8),0_8px_20px_rgb(4_102_200/0.2)]" : "border-white/70 bg-white/55 text-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.9),0_4px_14px_rgb(0_18_51/0.06)] hover:-translate-y-0.5 hover:bg-white/60"
                  )}
                >
                  <span className="block text-lg font-semibold first-letter:uppercase">{o.texto}</span>
                  <span className="text-sm text-muted-foreground">
                    Del {fechaLarga.format(new Date(`${o.inicio}T00:00:00Z`))} al {fechaLarga.format(new Date(`${o.fin}T00:00:00Z`))}
                  </span>
                </button>
              ))}
              <button
                type="button"
                aria-pressed={!elegido}
                onClick={() => setFechasAMano(true)}
                className={cn(
                  "rounded-2xl border px-5 py-4 text-left transition-all duration-300",
                  !elegido ? "border-azul/70 bg-azul/15 shadow-[inset_0_1px_0_rgb(255_255_255/0.8),0_8px_20px_rgb(4_102_200/0.2)]" : "border-white/70 bg-white/55 text-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.9),0_4px_14px_rgb(0_18_51/0.06)] hover:-translate-y-0.5 hover:bg-white/60"
                )}
              >
                <span className="block text-lg font-semibold">Elegir yo las fechas</span>
                <span className="text-sm text-muted-foreground">Como máximo, un mes</span>
              </button>
            </div>
            {!elegido && (
              <div className="grid max-w-md grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5 text-base font-medium">
                  Desde
                  <Input type="date" value={c.fechaInicio} onChange={(e) => c.setFechaInicio(e.target.value)} className="h-11 text-base" />
                </label>
                <label className="flex flex-col gap-1.5 text-base font-medium">
                  Hasta
                  <Input type="date" value={c.fechaFin} onChange={(e) => c.setFechaFin(e.target.value)} className="h-11 text-base" />
                </label>
              </div>
            )}
          </div>

          <div className="flex flex-col items-start gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-lg" aria-live="polite">
              {c.validacion.errores.length > 0 ? (
                <span className="text-destructive">{c.validacion.errores[0]}</span>
              ) : (
                <>
                  Vas a ver el tiempo de <strong>{c.ciudadIds.length} {c.ciudadIds.length === 1 ? "ciudad" : "ciudades"}</strong>{" "}
                  durante <strong>{c.validacion.dias} {c.validacion.dias === 1 ? "día" : "días"}</strong>.
                </>
              )}
            </p>
            <Button size="lg" className="h-14 px-8 text-lg" onClick={verTiempo} disabled={c.validacion.errores.length > 0}>
              Ver el tiempo
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
          </div>
        </section>
      )}

      {pantalla === 1 && (
        <PantallaResultado
          etl={etl}
          supabase={supabase}
          extrayendo={extrayendo}
          onVolver={() => irA(0)}
          onGuardar={guardar}
        />
      )}

      {pantalla === 2 && (
        <section className="tarjeta flex flex-col items-center gap-6 p-8 text-center sm:p-12">
          {subiendo || (guardando && !r) ? (
            <>
              <LoaderCircleIcon className="size-14 animate-spin text-azul" aria-hidden />
              <h2 className="text-3xl font-semibold">Guardando en la base de datos…</h2>
              <Progreso hechos={r?.correctos ?? 0} total={r?.total ?? etl.vistaPrevia.length} />
              <p className="text-lg text-muted-foreground">No cierres la página.</p>
            </>
          ) : r && (r.fallidos > 0 || r.noEncontrados > 0) ? (
            <>
              <span className="flex size-16 items-center justify-center rounded-full bg-destructive/10 text-3xl text-destructive" aria-hidden>!</span>
              <h2 className="text-3xl font-semibold">Algunos datos no se pudieron guardar</h2>
              <p className="max-w-xl text-lg text-muted-foreground">
                Se guardaron {formatoEntero(r.correctos)} de {formatoEntero(r.total)}. Los que faltan se pueden volver a intentar sin repetir los que ya están.
              </p>
              <Button size="lg" className="h-14 px-8 text-lg" onClick={() => void acciones.reintentarLotesFallidos()}>
                <RotateCwIcon data-icon="inline-start" />
                Intentar otra vez
              </Button>
            </>
          ) : r ? (
            <>
              <span className="flex size-20 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg" aria-hidden>
                <CheckIcon className="size-10" strokeWidth={3} />
              </span>
              <h2 className="text-3xl font-semibold sm:text-4xl">¡Guardado!</h2>
              <p className="max-w-xl text-lg text-muted-foreground">
                <strong className="text-foreground">{formatoEntero(r.total)} datos del tiempo</strong> están ahora en la base de datos
                (Supabase). Hemos comprobado uno a uno que han llegado bien.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Button variant="outline" size="lg" className="h-12 px-6 text-base" onClick={() => irA(0)}>
                  Empezar de nuevo
                </Button>
                <Button size="lg" className="h-12 px-6 text-base" onClick={() => onVerCompleta("supabase")}>
                  <DatabaseIcon data-icon="inline-start" />
                  Ver lo guardado
                </Button>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-3xl font-semibold">Todavía no se ha guardado nada</h2>
              <p className="max-w-xl text-lg text-muted-foreground">{motivoBloqueo(etl, supabase) ?? "Vuelve al resultado y pulsa «Guardar»."}</p>
              <Button variant="outline" size="lg" className="h-12 px-6 text-base" onClick={() => irA(1)}>
                <ArrowLeftIcon data-icon="inline-start" />
                Volver al resultado
              </Button>
            </>
          )}
        </section>
      )}
    </div>
  )
}

function Progreso({ hechos, total }: { hechos: number; total: number }) {
  const pct = total > 0 ? Math.round((hechos / total) * 100) : 0
  return (
    <div className="flex w-full max-w-md flex-col gap-2">
      <div className="h-3 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-linear-to-r from-azul to-acero transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-base text-muted-foreground tabular-nums">
        {formatoEntero(hechos)} de {formatoEntero(total)}
      </p>
    </div>
  )
}

function PantallaResultado({
  etl,
  supabase,
  extrayendo,
  onVolver,
  onGuardar,
}: {
  etl: PipelineEtl
  supabase: EstadoSupabase | null
  extrayendo: boolean
  onVolver: () => void
  onGuardar: () => void
}) {
  const { extraccion, procesamiento: pr, acciones } = etl
  const validos = pr?.limpieza.validos
  const resumen = React.useMemo(() => resumirPorCiudad(validos ?? []), [validos])

  if (extrayendo || !pr) {
    const hechas = extraccion?.ciudades.filter((x) => x.estado === "completada" || x.estado === "error").length ?? 0
    return (
      <section className="tarjeta flex flex-col items-center gap-6 p-8 text-center sm:p-12">
        <LoaderCircleIcon className="size-14 animate-spin text-azul" aria-hidden />
        <h2 className="text-3xl font-semibold">Descargando el tiempo…</h2>
        <Progreso hechos={hechas} total={extraccion?.ciudades.length ?? 0} />
        <p className="text-lg text-muted-foreground">Pedimos los datos a Open-Meteo, un servicio meteorológico gratuito.</p>
      </section>
    )
  }

  const fallidas = extraccion?.ciudades.filter((x) => x.estado === "error") ?? []
  const rechazados = pr.limpieza.rechazados.length
  const total = pr.transformacion.registros.length
  const masCalor = [...resumen].sort((a, b) => b.media - a.media)[0]
  const masLluvia = [...resumen].sort((a, b) => b.lluvia - a.lluvia)[0]
  // Solo bloquea si no se puede escribir en la base de datos; la selección se hace al pulsar «Guardar».
  const sinDestino = !supabase || !supabase.cargaPermitida || !supabase.configurado || !supabase.tablaDisponible
  const bloqueo = sinDestino ? motivoBloqueo(etl, supabase) : null
  const aGuardar = etl.filtrado.ordenados.length

  return (
    <section className="flex flex-col gap-6">
      <div className="tarjeta flex flex-col gap-3 p-6 sm:p-8">
        <h2 className="text-3xl font-semibold sm:text-4xl">¡Listo! Esto es el tiempo que hizo</h2>
        {resumen.length > 1 && masCalor && masLluvia && (
          <p className="text-lg text-muted-foreground">
            <strong className="text-foreground">{masCalor.ciudad}</strong> fue la ciudad más calurosa y{" "}
            <strong className="text-foreground">{masLluvia.ciudad}</strong> la más lluviosa.
          </p>
        )}
        <p className="flex items-center gap-2 text-lg">
          <span className="flex size-7 flex-none items-center justify-center rounded-full bg-emerald-600 text-white" aria-hidden>
            <CheckIcon className="size-4" strokeWidth={3} />
          </span>
          {rechazados === 0 ? (
            <span>Hemos revisado las <strong>{formatoEntero(total)} mediciones</strong> y todas estaban bien.</span>
          ) : (
            <span>
              Hemos revisado <strong>{formatoEntero(total)} mediciones</strong>: {formatoEntero(rechazados)} tenían errores (por ejemplo,
              estaban vacías) y las hemos apartado.
            </span>
          )}
        </p>
      </div>

      {fallidas.map((f) => (
        <div key={f.ciudadId} className="tarjeta flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-lg">
            No pudimos descargar <strong>{buscarCiudad(f.ciudadId)?.nombre}</strong>. Suele ser un fallo momentáneo.
          </p>
          <Button variant="outline" size="lg" onClick={() => void acciones.reintentarCiudad(f.ciudadId)}>
            <RotateCwIcon data-icon="inline-start" />
            Intentar otra vez
          </Button>
        </div>
      ))}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {resumen.map((x) => {
          const t = fraseTemperatura(x.media)
          return (
            <article key={x.ciudad} className={cn("tarjeta flex flex-col gap-4 bg-linear-to-br p-6", t.fondo)}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-2xl font-semibold">{x.ciudad}</h3>
                <SunIcon className={cn("size-7", t.color)} aria-hidden />
              </div>
              <div>
                <p className={cn("text-lg font-semibold", t.color)}>{t.texto}</p>
                <p className="text-5xl font-semibold tracking-tight tabular-nums">{unDecimal(x.media)} °C</p>
                <p className="text-base text-muted-foreground">de media</p>
              </div>
              <ul className="flex flex-col gap-2 text-base">
                {/* El texto va en un solo bloque junto al icono para que no se parta en columnas. */}
                <li className="flex items-start gap-2">
                  <ThermometerIcon className="mt-0.5 size-5 flex-none text-pizarra" aria-hidden />
                  <span>
                    La más alta: <strong className="tabular-nums whitespace-nowrap">{unDecimal(x.max)} °C</strong>
                    <br />
                    La más baja: <strong className="tabular-nums whitespace-nowrap">{unDecimal(x.min)} °C</strong>
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CloudRainIcon className="mt-0.5 size-5 flex-none text-pizarra" aria-hidden />
                  <span>
                    {fraseLluvia(x.lluvia)}: <strong className="tabular-nums whitespace-nowrap">{unDecimal(x.lluvia)} mm</strong>
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <DropletsIcon className="mt-0.5 size-5 flex-none text-pizarra" aria-hidden />
                  <span>
                    Humedad media: <strong className="tabular-nums whitespace-nowrap">{formatoEntero(Math.round(x.humedad))} %</strong>
                  </span>
                </li>
              </ul>
            </article>
          )
        })}
      </div>

      <div className="tarjeta flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="outline" size="lg" className="h-12 px-6 text-base" onClick={onVolver}>
          <ArrowLeftIcon data-icon="inline-start" />
          Cambiar ciudades o fechas
        </Button>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <Button
            size="lg"
            className="h-14 px-8 text-lg"
            onClick={onGuardar}
            disabled={!!bloqueo || aGuardar === 0}
          >
            <DatabaseIcon data-icon="inline-start" />
            Guardar en la base de datos
          </Button>
          <p className="max-w-md text-sm text-muted-foreground sm:text-right">
            {bloqueo ?? `Se guardarán las ${formatoEntero(aGuardar)} mediciones correctas.`}
          </p>
        </div>
      </div>
    </section>
  )
}

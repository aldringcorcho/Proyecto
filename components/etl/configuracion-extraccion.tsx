"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import { cn } from "cn"
import { DownloadCloudIcon, RotateCwIcon } from "lucide-react"

import { Ayuda } from "@/components/etl/ayuda"
import { EstadoBadge, Nota, NumeroSeccion } from "@/components/etl/estado"
import { COLOR_PUNTO, type PuntoCiudad } from "@/components/etl/mapa-tipos"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { PipelineEtl } from "@/hooks/use-pipeline-etl"
import { CIUDADES, buscarCiudad } from "@/lib/etl/ciudades"
import { MAX_DIAS_EXTRACCION, construirUrlExtraccion } from "@/lib/etl/extraccion"
import { formatoEntero, formatoNumero } from "@/lib/etl/formato"
import type { Medicion } from "@/lib/etl/tipos"

// Leaflet usa `window`, así que el mapa no se prerenderiza en el servidor.
const MapaLeaflet = dynamic(() => import("@/components/etl/mapa-leaflet"), {
  ssr: false,
  loading: () => <div className="h-full min-h-72 w-full animate-pulse rounded-xl bg-muted" />,
})

type Estadistica = {
  horas: number
  temperatura: number
  temperaturaMin: number
  temperaturaMax: number
  lluvia: number
  humedad: number
}

/** Medias de temperatura y humedad, extremos y lluvia total por ciudad, sobre los registros válidos. */
function estadisticas(validos: readonly Medicion[]): Map<string, Estadistica> {
  const acumulado = new Map<string, Estadistica>()
  for (const m of validos) {
    const e = acumulado.get(m.ciudad) ?? {
      horas: 0,
      temperatura: 0,
      temperaturaMin: Infinity,
      temperaturaMax: -Infinity,
      lluvia: 0,
      humedad: 0,
    }
    e.horas += 1
    e.temperatura += m.temperatura_c
    e.temperaturaMin = Math.min(e.temperaturaMin, m.temperatura_c)
    e.temperaturaMax = Math.max(e.temperaturaMax, m.temperatura_c)
    e.lluvia += m.precipitacion_mm
    e.humedad += m.humedad_pct
    acumulado.set(m.ciudad, e)
  }
  for (const e of acumulado.values()) {
    e.temperatura /= e.horas
    e.humedad /= e.horas
  }
  return acumulado
}

const unDecimal = (n: number) => formatoNumero(Math.round(n * 10) / 10)

export function ConfiguracionExtraccion({
  etl,
  abierta,
  onAbrir: setAbierta,
}: {
  etl: PipelineEtl
  /** Ciudad cuya ficha está abierta en el mapa; también se resalta en la tabla y el gráfico. */
  abierta: string | null
  onAbrir: (id: string | null) => void
}) {
  const { configuracion: c, extraccion, carga, acciones } = etl
  const extrayendo = extraccion?.estado === "en_curso"
  const bloqueado = extrayendo || !!carga?.enCurso
  const { validacion } = c
  const validos = etl.procesamiento?.limpieza.validos
  const datos = React.useMemo(() => estadisticas(validos ?? []), [validos])

  function alternarCiudad(id: string, marcada: boolean) {
    c.setCiudadIds(
      CIUDADES.filter((x) => (x.id === id ? marcada : c.ciudadIds.includes(x.id))).map((x) => x.id)
    )
  }

  const rechazadosPorCiudad = new Map<string, number>()
  for (const r of etl.procesamiento?.limpieza.rechazados ?? []) {
    rechazadosPorCiudad.set(r.registro.ciudad, (rechazadosPorCiudad.get(r.registro.ciudad) ?? 0) + 1)
  }

  const puntos: PuntoCiudad[] = CIUDADES.map((ciudad) => {
    const e = datos.get(ciudad.nombre)
    const r = extraccion?.ciudades.find((x) => x.ciudadId === ciudad.id)
    const horas = Array.isArray(r?.respuesta?.hourly?.time) ? r.respuesta.hourly.time.length : null
    return {
      ciudad,
      marcada: c.ciudadIds.includes(ciudad.id),
      estado: r?.estado ?? null,
      resumen: e ? `${unDecimal(e.temperatura)} °C de media` : null,
      ficha: {
        url: r?.url ?? construirUrlExtraccion(ciudad, c.fechaInicio, c.fechaFin),
        extraida: !!r,
        horas,
        validos: horas === null ? null : (e?.horas ?? 0),
        rechazados: horas === null ? null : (rechazadosPorCiudad.get(ciudad.nombre) ?? 0),
        temperaturaMin: e?.temperaturaMin ?? null,
        temperaturaMedia: e?.temperatura ?? null,
        temperaturaMax: e?.temperaturaMax ?? null,
        lluvia: e?.lluvia ?? null,
        humedad: e?.humedad ?? null,
        duracionMs: r?.duracionMs,
        error: r?.estado === "error" ? r.error : undefined,
      },
    }
  })

  const leyenda: { color: string; borde?: string; texto: string }[] = extraccion
    ? [
        { color: COLOR_PUNTO.pendiente, borde: "#0466c8", texto: "En cola" },
        { color: COLOR_PUNTO.en_curso, texto: "Descargando (late)" },
        { color: COLOR_PUNTO.completada, texto: "Descargada" },
        { color: COLOR_PUNTO.error, texto: "Error" },
        { color: COLOR_PUNTO.marcada, texto: "Marcada, sin extraer" },
      ]
    : [
        { color: COLOR_PUNTO.marcada, texto: "Marcada" },
        { color: COLOR_PUNTO.sinMarcar, texto: "Sin marcar" },
      ]

  return (
    <Card id="configuracion" className="scroll-mt-24">
      <CardHeader>
        <CardTitle className="text-2xl font-semibold">
          <NumeroSeccion n={1} className="bg-azul" />
          Configuración de la extracción.{" "}
          <Ayuda titulo="¿Qué hago aquí?">
            <p>Aquí eliges <strong>de qué ciudades</strong> y <strong>de qué días</strong> quieres el tiempo.</p>
            <p>Marca las ciudades en la lista (o pulsa un punto del mapa y usa su ficha) y cambia las fechas si quieres. Después pulsa <strong>«Extraer datos»</strong>.</p>
            <p>Los datos vienen de <strong>Open-Meteo</strong>, un servicio gratuito con el tiempo que hizo cada hora. Las horas van en <strong>UTC</strong>, la hora universal: en España es una hora más en invierno y dos en verano.</p>
          </Ayuda>
        </CardTitle>
        <CardDescription>
          Elige de qué ciudades y de qué días quieres el tiempo, y pulsa «Extraer datos». Se descarga
          la temperatura (°C), la humedad (%) y la lluvia (mm) de cada hora.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {/* Barra superior: fechas, volumen y acción principal en una sola fila. */}
        <div className="flex flex-col gap-3 rounded-xl bg-linear-to-br from-secondary to-muted p-3 ring-1 ring-azul/10 lg:flex-row lg:items-end">
          <div className="grid grid-cols-2 gap-3 lg:w-[22rem] lg:flex-none">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fecha-inicio">Fecha inicial (UTC)</Label>
              <Input
                id="fecha-inicio"
                type="date"
                value={c.fechaInicio}
                onChange={(e) => c.setFechaInicio(e.target.value)}
                disabled={bloqueado}
                aria-invalid={validacion.errores.length > 0 || undefined}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fecha-fin">Fecha final (UTC)</Label>
              <Input
                id="fecha-fin"
                type="date"
                value={c.fechaFin}
                onChange={(e) => c.setFechaFin(e.target.value)}
                disabled={bloqueado}
                aria-invalid={validacion.errores.length > 0 || undefined}
              />
            </div>
          </div>
          <div className="flex-1 text-sm lg:pb-2" aria-live="polite">
            {extrayendo && extraccion ? (
              <span className="flex items-center gap-2 text-muted-foreground">
                <EstadoBadge estado="en_curso" texto="Descargando" />
                {extraccion.ciudades.filter((r) => r.estado === "completada" || r.estado === "error").length} de{" "}
                {extraccion.ciudades.length} ciudades
              </span>
            ) : validacion.errores.length === 0 ? (
              <>
                {c.ciudadIds.length} {c.ciudadIds.length === 1 ? "ciudad" : "ciudades"} ×{" "}
                {validacion.dias} {validacion.dias === 1 ? "día" : "días"} × 24 h ={" "}
                <strong className="tabular-nums">{formatoEntero(validacion.registrosPrevistos)} registros</strong>{" "}
                <span className="text-muted-foreground">(máx. {MAX_DIAS_EXTRACCION} días)</span>
              </>
            ) : (
              <span className="text-muted-foreground">Corrige la configuración para poder extraer.</span>
            )}
          </div>
          <Button
            size="lg"
            className="lg:w-56"
            onClick={acciones.extraer}
            disabled={bloqueado || validacion.errores.length > 0}
          >
            <DownloadCloudIcon data-icon="inline-start" />
            {extrayendo ? "Extrayendo…" : "Extraer datos"}
          </Button>
        </div>

        {validacion.errores.length > 0 && (
          <Alert variant="destructive">
            <AlertTitle>No se puede extraer</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-4">
                {validacion.errores.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
        {validacion.avisos.map((a) => (
          <Nota key={a}>⚠ {a}</Nota>
        ))}
        {extraccion?.ciudades
          .filter((r) => r.estado === "error")
          .map((r) => (
            <Alert key={r.ciudadId} variant="destructive">
              <AlertTitle>No se pudo descargar {buscarCiudad(r.ciudadId)?.nombre}</AlertTitle>
              <AlertDescription className="flex flex-col items-start gap-2">
                <span>
                  {r.error}
                  {r.intentos > 1 && ` (intentos: ${r.intentos})`}
                </span>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => acciones.reintentarCiudad(r.ciudadId)}
                  disabled={bloqueado}
                >
                  <RotateCwIcon data-icon="inline-start" />
                  Reintentar solo esta ciudad
                </Button>
              </AlertDescription>
            </Alert>
          ))}

        {/* Mapa y tabla de ciudades con todo el ancho disponible. */}
        <div className="grid gap-5 lg:grid-cols-[1fr_24rem]">
          <div className="flex flex-col gap-2">
            <div className="h-80 lg:h-auto lg:min-h-[28rem] lg:flex-1">
              <MapaLeaflet
                puntos={puntos}
                abierta={abierta}
                onAbrir={setAbierta}
                onAlternar={(id) => alternarCiudad(id, !c.ciudadIds.includes(id))}
                bloqueado={bloqueado}
              />
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="font-medium text-marino">Pulsa una ciudad para ver su ficha.</span>
              {leyenda.map((l) => (
                <span key={l.texto} className="flex items-center gap-1.5">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ background: l.color, boxShadow: `inset 0 0 0 1.5px ${l.borde ?? l.color}` }}
                    aria-hidden
                  />
                  {l.texto}
                </span>
              ))}
            </div>
          </div>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-sm font-medium">
              Ciudades <span className="font-normal text-muted-foreground">· marca aquí o desde la ficha del mapa</span>
            </legend>
            <div className="overflow-hidden rounded-xl bg-muted/60">
              <table className="w-full text-xs tabular-nums">
                <thead>
                  <tr className="bg-secondary text-left text-marino">
                    <th scope="col" className="px-3 py-2.5 font-medium">Ciudad</th>
                    <th scope="col" className="px-2 py-2.5 text-right font-medium">Temp.</th>
                    <th scope="col" className="px-2 py-2.5 text-right font-medium">Lluvia</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">Hum.</th>
                  </tr>
                </thead>
                <tbody>
                  {CIUDADES.map((ciudad) => {
                    const e = datos.get(ciudad.nombre)
                    return (
                      <tr
                        key={ciudad.id}
                        onClick={() => setAbierta(abierta === ciudad.id ? null : ciudad.id)}
                        title="Ver su ficha en el mapa"
                        aria-current={abierta === ciudad.id || undefined}
                        className={cn(
                          "cursor-pointer border-t border-border transition-colors",
                          abierta === ciudad.id
                            ? "bg-azul/10 font-semibold text-marino shadow-[inset_3px_0_0_var(--color-azul)]"
                            : "hover:bg-secondary/70"
                        )}
                      >
                        <td className="px-3 py-2.5">
                          {/* La casilla marca la ciudad; el resto de la fila abre su ficha. */}
                          <Label className="text-xs font-[inherit]" onClick={(ev) => ev.stopPropagation()}>
                            <Checkbox
                              checked={c.ciudadIds.includes(ciudad.id)}
                              onCheckedChange={(v) => alternarCiudad(ciudad.id, v)}
                              disabled={bloqueado}
                            />
                            {ciudad.nombre}
                          </Label>
                        </td>
                        <td className="px-2 py-2.5 text-right">{e ? `${unDecimal(e.temperatura)} °C` : "—"}</td>
                        <td className="px-2 py-2.5 text-right">{e ? `${unDecimal(e.lluvia)} mm` : "—"}</td>
                        <td className="px-3 py-2.5 text-right">{e ? `${formatoEntero(Math.round(e.humedad))} %` : "—"}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Nota>
              {datos.size > 0
                ? "Temperatura y humedad medias, y lluvia total, de los registros válidos extraídos."
                : "Los datos de cada ciudad aparecerán al extraer."}
            </Nota>
          </fieldset>
        </div>
      </CardContent>
    </Card>
  )
}

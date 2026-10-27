"use client"

import * as React from "react"
import { DownloadIcon, RotateCwIcon } from "lucide-react"
import { cn } from "cn"

import { EstadoBadge, Nota } from "@/components/etl/estado"
import { TablaPaginada, type Columna } from "@/components/etl/tabla-paginada"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import type { PipelineEtl } from "@/hooks/use-pipeline-etl"
import { buscarCiudad } from "@/lib/etl/ciudades"
import {
  descargarJson,
  formatoFechaHoraUtc,
  formatoJsonCompacto,
  formatoValorCrudo,
} from "@/lib/etl/formato"
import type { RegistroRechazado, RegistroTransformado } from "@/lib/etl/tipos"

function ValorCrudo({ valor }: { valor: unknown }) {
  const numero = typeof valor === "number" && Number.isFinite(valor)
  return (
    <span
      className={cn(
        !numero && "rounded bg-amber-100 px-1 text-amber-900 italic dark:bg-amber-950 dark:text-amber-200"
      )}
    >
      {formatoValorCrudo(valor)}
    </span>
  )
}

function SinDatos() {
  return <p className="py-6 text-sm text-muted-foreground">Ejecuta una extracción para ver datos.</p>
}

export function PestanaJson({ etl }: { etl: PipelineEtl }) {
  const ex = etl.extraccion
  const [elegida, setElegida] = React.useState<string | null>(null)
  if (!ex) return <SinDatos />

  const actual = ex.ciudades.find((r) => r.ciudadId === elegida) ?? ex.ciudades[0]
  const nombre = (id: string) => buscarCiudad(id)?.nombre ?? id
  const completadas = ex.ciudades.filter((r) => r.respuesta)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Ciudad" className="flex flex-wrap gap-1">
          {ex.ciudades.map((r) => (
            <Button
              key={r.ciudadId}
              size="sm"
              variant={r.ciudadId === actual.ciudadId ? "default" : "outline"}
              aria-pressed={r.ciudadId === actual.ciudadId}
              onClick={() => setElegida(r.ciudadId)}
            >
              {nombre(r.ciudadId)}
              {r.estado === "error" && " ⚠"}
            </Button>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={completadas.length === 0}
          onClick={() =>
            descargarJson(
              `open-meteo_${ex.fechaInicio}_${ex.fechaFin}.json`,
              completadas.map((r) => ({ ciudad: nombre(r.ciudadId), url: r.url, respuesta: r.respuesta }))
            )
          }
        >
          <DownloadIcon data-icon="inline-start" />
          Descargar todos ({completadas.length})
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <EstadoBadge estado={actual.estado} />
        <code className="min-w-0 flex-1 truncate rounded bg-muted px-1.5 py-0.5" title={actual.url}>
          GET {actual.url}
        </code>
        {actual.respuesta && (
          <Button
            variant="outline"
            size="xs"
            onClick={() =>
              descargarJson(
                `open-meteo_${actual.ciudadId}_${ex.fechaInicio}_${ex.fechaFin}.json`,
                actual.respuesta
              )
            }
          >
            <DownloadIcon data-icon="inline-start" />
            Descargar JSON
          </Button>
        )}
      </div>

      {actual.estado === "error" && (
        <Alert variant="destructive">
          <AlertTitle>La descarga de {nombre(actual.ciudadId)} falló</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-2">
            {actual.error}
            <Button
              size="sm"
              variant="outline"
              onClick={() => etl.acciones.reintentarCiudad(actual.ciudadId)}
              disabled={ex.estado === "en_curso" || !!etl.carga?.enCurso}
            >
              <RotateCwIcon data-icon="inline-start" />
              Reintentar solo esta ciudad
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {actual.respuesta && (
        <>
          <Nota>
            Respuesta original sin modificar, conservada en memoria durante la sesión. Observa que{" "}
            <code>hourly</code> contiene arrays paralelos: la posición <em>i</em> de cada array
            corresponde a la hora <code>time[i]</code>.
          </Nota>
          <pre className="max-h-[28rem] overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap">
            {formatoJsonCompacto(actual.respuesta)}
          </pre>
        </>
      )}
    </div>
  )
}

export function PestanaTransformados({ etl }: { etl: PipelineEtl }) {
  const pr = etl.procesamiento
  if (!pr) return <SinDatos />
  const columnas: Columna<RegistroTransformado>[] = [
    { id: "ciudad", encabezado: "Ciudad", celda: (r) => r.ciudad },
    { id: "indice", encabezado: "Índice", numerica: true, celda: (r) => r.indice },
    {
      id: "hora",
      encabezado: "time (original)",
      celda: (r) => <code className="text-xs">{formatoValorCrudo(r.hora_original)}</code>,
    },
    {
      id: "fecha_hora",
      encabezado: "fecha_hora",
      unidad: "UTC",
      celda: (r) => (r.fecha_hora ? formatoFechaHoraUtc(r.fecha_hora) : <ValorCrudo valor={null} />),
    },
    { id: "t", encabezado: "temperatura_c", unidad: "°C", numerica: true, celda: (r) => <ValorCrudo valor={r.temperatura_c} /> },
    { id: "h", encabezado: "humedad_pct", unidad: "%", numerica: true, celda: (r) => <ValorCrudo valor={r.humedad_pct} /> },
    { id: "p", encabezado: "precipitacion_mm", unidad: "mm", numerica: true, celda: (r) => <ValorCrudo valor={r.precipitacion_mm} /> },
  ]
  return (
    <div className="flex flex-col gap-3">
      <Nota>
        Un registro por ciudad y hora, todavía sin validar: los valores se muestran tal como
        llegaron. Los resaltados (null, texto, ausente) se rechazarán en la limpieza.
      </Nota>
      {pr.transformacion.incidencias.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>Incidencias de estructura</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {pr.transformacion.incidencias.map((i, n) => (
                <li key={n}>
                  {i.ciudad}: {i.mensaje}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      <TablaPaginada
        etiqueta="Datos transformados"
        filas={pr.transformacion.registros}
        columnas={columnas}
        claveFila={(r) => `${r.ciudad}#${r.indice}`}
        vacio="No hay registros transformados."
      />
    </div>
  )
}

export function PestanaRechazados({ etl }: { etl: PipelineEtl }) {
  const pr = etl.procesamiento
  if (!pr) return <SinDatos />
  const columnas: Columna<RegistroRechazado>[] = [
    { id: "ciudad", encabezado: "Ciudad", celda: (r) => r.registro.ciudad || <ValorCrudo valor="" /> },
    { id: "indice", encabezado: "Índice", numerica: true, celda: (r) => r.registro.indice },
    { id: "hora", encabezado: "time (original)", celda: (r) => <code className="text-xs">{formatoValorCrudo(r.registro.hora_original)}</code> },
    { id: "t", encabezado: "Temperatura", unidad: "°C", numerica: true, celda: (r) => <ValorCrudo valor={r.registro.temperatura_c} /> },
    { id: "h", encabezado: "Humedad", unidad: "%", numerica: true, celda: (r) => <ValorCrudo valor={r.registro.humedad_pct} /> },
    { id: "p", encabezado: "Precipitación", unidad: "mm", numerica: true, celda: (r) => <ValorCrudo valor={r.registro.precipitacion_mm} /> },
    {
      id: "motivo",
      encabezado: "Motivo del rechazo",
      celda: (r) => (
        <ul className="min-w-56 whitespace-normal">
          {r.motivos.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      ),
    },
  ]
  return (
    <div className="flex flex-col gap-3">
      <Nota>
        Descartes <strong>por calidad</strong>: no cumplen las reglas de limpieza. Los registros
        válidos que no coinciden con tus filtros <strong>no</strong> aparecen aquí: siguen en
        «Válidos y selección». Duplicados: se conserva la primera aparición válida por ciudad y
        fecha_hora (orden de extracción) y se rechazan las siguientes.
      </Nota>
      <TablaPaginada
        etiqueta="Registros rechazados"
        filas={pr.limpieza.rechazados}
        columnas={columnas}
        claveFila={(r) => `${r.registro.ciudad}#${r.registro.indice}`}
        vacio="Ningún registro rechazado: todos superaron la limpieza."
      />
    </div>
  )
}

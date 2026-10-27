"use client"

import * as React from "react"
import { DownloadIcon, ListChecksIcon, RotateCwIcon, UploadCloudIcon } from "lucide-react"

import { EstadoBadge, Nota } from "@/components/etl/estado"
import { columnasMedicion } from "@/components/etl/pestana-validos"
import { TablaPaginada, type Columna } from "@/components/etl/tabla-paginada"
import { Button } from "@/components/ui/button"
import type { PipelineEtl } from "@/hooks/use-pipeline-etl"
import type { EstadoSupabase } from "@/hooks/use-estado-supabase"
import type { EstadoLote } from "@/lib/etl/carga"
import { TAMANO_LOTE } from "@/lib/etl/carga"
import { descargarJson, formatoDuracion, formatoEntero } from "@/lib/etl/formato"
import { claveMedicion } from "@/lib/etl/limpieza"
import type { EstadoFase, Medicion } from "@/lib/etl/tipos"

const ESTADO_LOTE: Record<EstadoLote["estado"], EstadoFase> = {
  pendiente: "pendiente",
  enviando: "en_curso",
  correcto: "completada",
  error: "error",
}

function Verificacion({ lote }: { lote: EstadoLote }) {
  const v = lote.verificacion
  if (lote.estado !== "correcto") return <span className="text-muted-foreground">—</span>
  switch (v.estado) {
    case "pendiente":
      return <EstadoBadge estado="pendiente" />
    case "verificando":
      return <EstadoBadge estado="en_curso" texto="Verificando" />
    case "correcta":
      return <EstadoBadge estado="completada" texto={`${formatoEntero(v.encontrados)} encontradas`} />
    case "incompleta":
      return (
        <span className="flex flex-col gap-1">
          <EstadoBadge estado="error" texto={`Faltan ${formatoEntero(v.faltantes.length)}`} />
          <span className="text-xs">{v.faltantes.slice(0, 3).join(", ")}{v.faltantes.length > 3 && "…"}</span>
        </span>
      )
    case "error":
      return (
        <span className="flex flex-col gap-1">
          <EstadoBadge estado="error" texto="No verificado" />
          <span className="text-xs whitespace-normal">{v.error}</span>
        </span>
      )
  }
}

/** Motivo por el que no se puede subir ahora mismo, o null si se puede. */
function motivoBloqueo(etl: PipelineEtl, supabase: EstadoSupabase | null): string | null {
  if (!etl.procesamiento) return "Primero pulsa «Extraer datos»."
  if (etl.extraccion?.estado === "en_curso") return "Espera a que termine la extracción."
  if (etl.carga?.enCurso) return null
  if (!supabase) return "Comprobando la conexión con Supabase…"
  if (!supabase.cargaPermitida) {
    return "La escritura está deshabilitada en producción porque la aplicación no tiene autenticación (ver README)."
  }
  if (!supabase.configurado || !supabase.tablaDisponible) return supabase.mensaje
  if (etl.filtrado.errores.length > 0) return "Corrige los filtros no válidos."
  if (etl.vistaPrevia.length === 0) {
    return etl.seleccion.fueraDeFiltros > 0
      ? "Las filas seleccionadas no cumplen los filtros actuales: ajusta los filtros o selecciona otras."
      : "No hay filas seleccionadas. Marca filas en «Válidos y selección» o selecciona todas las filtradas."
  }
  return null
}

/** Botón de carga siempre visible, con el motivo cuando está desactivado. */
export function BarraCarga({
  etl,
  supabase,
  onVerCarga,
  children,
}: {
  etl: PipelineEtl
  supabase: EstadoSupabase | null
  onVerCarga?: () => void
  children?: React.ReactNode
}) {
  const n = etl.vistaPrevia.length
  const enCurso = !!etl.carga?.enCurso
  const motivo = motivoBloqueo(etl, supabase)
  const puedeSeleccionar =
    !!etl.procesamiento && n === 0 && etl.filtrado.ordenados.length > 0 && etl.filtrado.errores.length === 0

  return (
    <section
      aria-label="Carga en Supabase"
      className="flex flex-col gap-2 rounded-xl border border-primary/40 bg-primary/5 p-3 sm:flex-row sm:items-center"
    >
      <Button
        size="lg"
        onClick={() => {
          onVerCarga?.()
          void etl.acciones.subir()
        }}
        disabled={motivo !== null || enCurso}
      >
        <UploadCloudIcon data-icon="inline-start" />
        {enCurso ? "Subiendo…" : `Subir ${formatoEntero(n)} registros a Supabase`}
      </Button>
      <p className="flex-1 text-xs text-muted-foreground" aria-live="polite">
        {enCurso
          ? "Carga en curso: puedes seguir su estado lote a lote en «Vista previa de la carga»."
          : motivo ?? `${Math.ceil(n / TAMANO_LOTE)} lote(s) de hasta ${TAMANO_LOTE} · upsert por (ciudad, fecha_hora) · se sube exactamente la vista previa.`}
      </p>
      {puedeSeleccionar && (
        <Button variant="outline" size="sm" onClick={etl.seleccion.seleccionarFiltradas}>
          <ListChecksIcon data-icon="inline-start" />
          Seleccionar las {formatoEntero(etl.filtrado.ordenados.length)} filtradas
        </Button>
      )}
      {children}
    </section>
  )
}

export function PestanaCarga({ etl, supabase }: { etl: PipelineEtl; supabase: EstadoSupabase | null }) {
  const { vistaPrevia, carga, resumenCarga: r, acciones } = etl
  const n = vistaPrevia.length
  const enCurso = !!carga?.enCurso
  const hayFallidos =
    !!carga &&
    carga.lotes.some(
      (l) => l.estado === "error" || l.verificacion.estado === "error" || l.verificacion.estado === "incompleta"
    )

  const columnas: Columna<Medicion>[] = [
    { id: "pos", encabezado: "#", numerica: true, celda: (_, i) => formatoEntero(i + 1) },
    ...columnasMedicion(),
  ]
  const columnasLote: Columna<EstadoLote>[] = [
    { id: "n", encabezado: "Lote", numerica: true, celda: (l) => l.numero },
    { id: "filas", encabezado: "Registros", numerica: true, celda: (l) => formatoEntero(l.registros.length) },
    { id: "estado", encabezado: "Envío", celda: (l) => <EstadoBadge estado={ESTADO_LOTE[l.estado]} texto={l.estado === "enviando" ? "Enviando" : undefined} /> },
    { id: "proc", encabezado: "Procesados según Supabase", numerica: true, celda: (l) => (l.estado === "correcto" ? (l.procesados == null ? "no informado" : formatoEntero(l.procesados)) : "—") },
    { id: "verif", encabezado: "Verificación en destino", celda: (l) => <Verificacion lote={l} /> },
    { id: "dur", encabezado: "Duración", numerica: true, celda: (l) => formatoDuracion(l.duracionMs) },
    { id: "int", encabezado: "Intentos", numerica: true, celda: (l) => l.intentos },
    { id: "err", encabezado: "Error", celda: (l) => <span className="text-destructive whitespace-normal">{l.error ?? ""}</span> },
  ]

  return (
    <div className="flex flex-col gap-4">
      <Nota>
        Esta tabla es <strong>exactamente</strong> lo que se enviará, en este orden: filas
        seleccionadas que cumplen los filtros actuales. Al pulsar «Subir» se congela una copia; los
        cambios posteriores de filtros o selección no afectan a la carga en curso. Ojo: una base de
        datos <strong>no conserva el orden de inserción</strong>; para leer los datos ordenados,
        cualquier consulta posterior necesita <code>ORDER BY</code>.
      </Nota>

      <BarraCarga etl={etl} supabase={supabase}>
        <Button
          variant="outline"
          size="sm"
          disabled={n === 0}
          onClick={() => descargarJson("vista-previa-carga.json", vistaPrevia)}
        >
          <DownloadIcon data-icon="inline-start" />
          Descargar vista previa
        </Button>
      </BarraCarga>

      {carga && r && (
        <section aria-label="Estado de la carga" className="flex flex-col gap-3 rounded-xl border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium">Carga congelada: {formatoEntero(r.total)} registros en {carga.lotes.length} lote(s)</h3>
            {hayFallidos && !enCurso && (
              <Button variant="outline" size="sm" onClick={acciones.reintentarLotesFallidos}>
                <RotateCwIcon data-icon="inline-start" />
                Reintentar lotes fallidos
              </Button>
            )}
          </div>
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5" aria-live="polite">
            {[
              ["Enviados correctamente", r.correctos],
              ["Fallidos", r.fallidos],
              ["Pendientes", r.pendientes],
              ["Verificados en destino", r.verificados],
              ["No encontrados en destino", r.noEncontrados],
            ].map(([t, v]) => (
              <div key={t as string} className="rounded-lg bg-muted/50 p-2">
                <dt className="text-xs text-muted-foreground">{t}</dt>
                <dd className="text-lg font-semibold tabular-nums">{formatoEntero(v as number)}</dd>
              </div>
            ))}
          </dl>
          <Nota>
            Supabase informa del número de filas afectadas por el upsert, pero no distingue cuántas
            se insertaron y cuántas se actualizaron, así que no se muestra ese desglose.
            {r.procesadosInformados !== null && r.correctos > 0 &&
              ` Total informado: ${formatoEntero(r.procesadosInformados)} filas procesadas (insertadas o actualizadas).`}
          </Nota>
          <TablaPaginada
            etiqueta="Lotes de la carga"
            filas={carga.lotes}
            columnas={columnasLote}
            claveFila={(l) => String(l.numero)}
            vacio="Sin lotes."
          />
        </section>
      )}

      <TablaPaginada
        etiqueta="Vista previa de la carga"
        filas={vistaPrevia}
        columnas={columnas}
        claveFila={claveMedicion}
        vacio="No hay filas seleccionadas que cumplan los filtros. Selecciónalas en «Válidos y selección»."
      />
    </div>
  )
}

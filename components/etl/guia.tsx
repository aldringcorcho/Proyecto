"use client"

import * as React from "react"
import {
  CheckIcon,
  DatabaseIcon,
  DownloadCloudIcon,
  ListChecksIcon,
  LoaderCircleIcon,
  MapPinnedIcon,
  RotateCwIcon,
  UploadCloudIcon,
} from "lucide-react"
import { cn } from "cn"

import { Ayuda } from "@/components/etl/ayuda"
import { motivoBloqueo } from "@/components/etl/motivo-bloqueo"
import type { PestanaId } from "@/components/etl/pipeline"
import { desplazarA } from "@/components/etl/scroll-suave"
import { Button } from "@/components/ui/button"
import type { EstadoSupabase } from "@/hooks/use-estado-supabase"
import type { PipelineEtl } from "@/hooks/use-pipeline-etl"
import { formatoEntero } from "@/lib/etl/formato"

const PASOS = [
  {
    titulo: "Elige ciudades y fechas",
    texto: "Marca en el mapa o en la lista de qué ciudades quieres el tiempo y de qué días.",
    icono: MapPinnedIcon,
  },
  {
    titulo: "Descarga los datos",
    texto: "Pulsa «Extraer datos»: la app pide a Open-Meteo la temperatura, humedad y lluvia de cada hora.",
    icono: DownloadCloudIcon,
  },
  {
    titulo: "Elige qué guardar",
    texto: "La app limpia los datos y descarta los erróneos. Tú decides cuáles de los buenos guardar.",
    icono: ListChecksIcon,
  },
  {
    titulo: "Guárdalos en la base de datos",
    texto: "Se suben a Supabase (una base de datos en internet) y se comprueba que han llegado bien.",
    icono: DatabaseIcon,
  },
]

/** Paso en el que está el usuario: 0–3, o 4 cuando ya está todo guardado. */
export function pasoActual(etl: PipelineEtl): number {
  const { configuracion: c, extraccion, procesamiento, vistaPrevia, carga, resumenCarga: r } = etl
  if (c.validacion.errores.length > 0) return 0
  if (!procesamiento || extraccion?.estado === "en_curso") return 1
  if (carga?.enCurso) return 3
  if (r && carga && r.total > 0 && r.correctos === r.total && r.verificados === r.total) return 4
  if (r || vistaPrevia.length > 0) return 3
  return 2
}

// Preferencia «guía oculta», guardada en este navegador.
const CLAVE_GUIA = "etl-guia-oculta"
const avisarCambio = () => window.dispatchEvent(new Event(CLAVE_GUIA))
function leerOculta() {
  try {
    return localStorage.getItem(CLAVE_GUIA) === "1"
  } catch {
    return false
  }
}
function guardarOculta(oculta: boolean) {
  try {
    if (oculta) localStorage.setItem(CLAVE_GUIA, "1")
    else localStorage.removeItem(CLAVE_GUIA)
  } catch {}
  avisarCambio()
}
function suscribir(cb: () => void) {
  window.addEventListener(CLAVE_GUIA, cb)
  window.addEventListener("storage", cb)
  return () => {
    window.removeEventListener(CLAVE_GUIA, cb)
    window.removeEventListener("storage", cb)
  }
}

/** Tarjeta «¿Primera vez?» con los 4 pasos y cuál toca ahora. */
export function GuiaInicio({ etl }: { etl: PipelineEtl }) {
  const oculta = React.useSyncExternalStore(suscribir, leerOculta, () => false)
  const paso = pasoActual(etl)

  if (oculta) {
    return (
      <button
        type="button"
        onClick={() => guardarOculta(false)}
        className="self-start text-sm font-medium text-azul hover:underline"
      >
        ¿Primera vez? Ver cómo funciona en 4 pasos
      </button>
    )
  }

  return (
    <section aria-labelledby="titulo-guia" className="tarjeta flex flex-col gap-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="titulo-guia" className="text-2xl font-semibold">
            ¿Primera vez aquí? <span className="text-muted-foreground">Así funciona, en 4 pasos.</span>{" "}
            <Ayuda titulo="¿Para qué sirve esta app?">
              <p>Descarga el tiempo que hizo (temperatura, humedad y lluvia) hora a hora en cinco ciudades de España, lo revisa y lo guarda en una base de datos.</p>
              <p>Por el camino puedes ver cómo cambian los datos en cada paso: es lo que se llama un <strong>pipeline ETL</strong>.</p>
            </Ayuda>
          </h2>
          <p className="text-base text-muted-foreground">
            No necesitas saber nada de programación: sigue los pasos en orden. Abajo tienes siempre un
            botón con lo siguiente que hay que hacer.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => guardarOculta(true)}>
          Ocultar guía
        </Button>
      </div>

      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PASOS.map((p, i) => {
          const hecho = i < paso
          const actual = i === paso
          return (
            <li
              key={p.titulo}
              aria-current={actual ? "step" : undefined}
              className={cn(
                "relative flex flex-col gap-2 rounded-2xl p-4 transition-colors",
                actual ? "bg-azul/10 ring-2 ring-azul" : hecho ? "bg-emerald-50/70" : "bg-muted/60"
              )}
            >
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex size-9 flex-none items-center justify-center rounded-full text-base font-semibold",
                    actual ? "bg-azul text-white" : hecho ? "bg-emerald-600 text-white" : "bg-white text-pizarra"
                  )}
                >
                  {hecho ? <CheckIcon className="size-5" strokeWidth={3} /> : i + 1}
                </span>
                <p.icono className={cn("size-5", actual ? "text-azul" : "text-gris-pizarra")} aria-hidden />
                {actual && (
                  <span className="ml-auto rounded-full bg-azul px-2.5 py-0.5 text-xs font-semibold text-white">
                    Estás aquí
                  </span>
                )}
              </div>
              <p className="text-base font-semibold">{p.titulo}</p>
              <p className="text-sm text-muted-foreground">{p.texto}</p>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

/** Barra flotante con la siguiente acción, siempre visible abajo. */
export function SiguientePaso({
  etl,
  supabase,
  onVer,
}: {
  etl: PipelineEtl
  supabase: EstadoSupabase | null
  /** Lleva a una pestaña de la sección de inspección. */
  onVer: (p: PestanaId) => void
}) {
  const paso = pasoActual(etl)
  const { configuracion: c, extraccion, carga, resumenCarga: r, vistaPrevia, filtrado, acciones } = etl
  const extrayendo = extraccion?.estado === "en_curso"
  const subiendo = !!carga?.enCurso

  let texto: React.ReactNode
  let accion: React.ReactNode

  if (paso === 0) {
    texto = c.validacion.errores[0] ?? "Elige al menos una ciudad y unas fechas."
    accion = (
      <Button size="lg" onClick={() => desplazarA("#configuracion")}>
        <MapPinnedIcon data-icon="inline-start" />
        Ir a elegir
      </Button>
    )
  } else if (paso === 1) {
    texto = extrayendo ? (
      <>
        Descargando el tiempo de cada ciudad…{" "}
        <strong>
          {extraccion!.ciudades.filter((x) => x.estado === "completada" || x.estado === "error").length} de{" "}
          {extraccion!.ciudades.length}
        </strong>
      </>
    ) : (
      <>
        Descarga el tiempo de <strong>{c.ciudadIds.length} {c.ciudadIds.length === 1 ? "ciudad" : "ciudades"}</strong> (
        {formatoEntero(c.validacion.registrosPrevistos)} mediciones).
      </>
    )
    accion = (
      <Button size="lg" onClick={acciones.extraer} disabled={extrayendo}>
        {extrayendo ? <LoaderCircleIcon className="animate-spin" data-icon="inline-start" /> : <DownloadCloudIcon data-icon="inline-start" />}
        {extrayendo ? "Descargando…" : "Extraer datos"}
      </Button>
    )
  } else if (paso === 2) {
    const n = filtrado.ordenados.length
    texto = (
      <>
        ¡Datos descargados! Ahora elige cuáles guardar. Hay <strong>{formatoEntero(n)} válidos</strong>.
      </>
    )
    accion = (
      <>
        <Button variant="outline" size="lg" onClick={() => onVer("validos")}>
          Elegir a mano
        </Button>
        <Button size="lg" onClick={filtrado.errores.length === 0 ? etl.seleccion.seleccionarFiltradas : undefined} disabled={n === 0 || filtrado.errores.length > 0}>
          <ListChecksIcon data-icon="inline-start" />
          Elegir todos
        </Button>
      </>
    )
  } else if (paso === 3) {
    const motivo = motivoBloqueo(etl, supabase)
    const hayFallos = !!r && !subiendo && (r.fallidos > 0 || r.noEncontrados > 0)
    texto = subiendo ? (
      <>
        Guardando en la base de datos…{" "}
        <strong>
          {formatoEntero(r?.correctos ?? 0)} de {formatoEntero(r?.total ?? vistaPrevia.length)}
        </strong>
      </>
    ) : hayFallos ? (
      "Algunos registros no se pudieron guardar. Puedes volver a intentarlo solo con esos."
    ) : (
      motivo ?? (
        <>
          Listo: guarda <strong>{formatoEntero(vistaPrevia.length)} registros</strong> en la base de datos.
        </>
      )
    )
    accion = hayFallos ? (
      <Button size="lg" onClick={() => { onVer("carga"); void acciones.reintentarLotesFallidos() }}>
        <RotateCwIcon data-icon="inline-start" />
        Reintentar
      </Button>
    ) : (
      <Button size="lg" onClick={() => { onVer("carga"); void acciones.subir() }} disabled={motivo !== null || subiendo}>
        {subiendo ? <LoaderCircleIcon className="animate-spin" data-icon="inline-start" /> : <UploadCloudIcon data-icon="inline-start" />}
        {subiendo ? "Guardando…" : "Guardar en Supabase"}
      </Button>
    )
  } else {
    texto = (
      <>
        ¡Hecho! <strong>{formatoEntero(r?.total ?? 0)} registros</strong> guardados y comprobados.
      </>
    )
    accion = (
      <Button size="lg" onClick={() => onVer("supabase")}>
        <DatabaseIcon data-icon="inline-start" />
        Ver los datos guardados
      </Button>
    )
  }

  return (
    <aside
      aria-label="Tu siguiente paso"
      className="vidrio fixed bottom-4 left-1/2 z-[1100] flex w-[min(56rem,calc(100vw-1.5rem))] -translate-x-1/2 flex-col gap-3 rounded-3xl p-3 pl-4 sm:flex-row sm:items-center"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="flex size-10 flex-none flex-col items-center justify-center rounded-full bg-azul text-white shadow-sm">
          {paso === 4 ? <CheckIcon className="size-5" strokeWidth={3} /> : <span className="text-base leading-none font-semibold">{paso + 1}</span>}
        </span>
        <div className="min-w-0" aria-live="polite">
          <p className="text-xs font-semibold tracking-wide text-azul uppercase">
            {paso === 4 ? "Completado" : `Tu siguiente paso · ${paso + 1} de 4`}
          </p>
          <p className="text-base leading-snug">{texto}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 sm:flex-none">{accion}</div>
    </aside>
  )
}

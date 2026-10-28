"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import { cn } from "cn"

import { Bienvenida } from "@/components/etl/bienvenida"
import { FondoLiquido } from "@/components/etl/fondo-liquido"
import type { PestanaId } from "@/components/etl/pipeline"
import { ScrollSuave } from "@/components/etl/scroll-suave"
import { VistaSencilla } from "@/components/etl/vista-sencilla"
import { useEstadoSupabase } from "@/hooks/use-estado-supabase"
import { usePipelineEtl } from "@/hooks/use-pipeline-etl"

// La vista completa (mapa, pipeline, tablas, JSON…) solo se descarga al pedirla.
const VistaCompleta = dynamic(() => import("@/components/etl/vista-completa"), {
  loading: () => <div className="tarjeta h-96 animate-pulse" aria-label="Cargando la vista completa" />,
})

type Vista = "sencilla" | "completa"
const CLAVE_VISTA = "etl-vista"
function leerVista(): Vista {
  try {
    return localStorage.getItem(CLAVE_VISTA) === "completa" ? "completa" : "sencilla"
  } catch {
    return "sencilla"
  }
}
function guardarVista(v: Vista) {
  try {
    localStorage.setItem(CLAVE_VISTA, v)
  } catch {}
  window.dispatchEvent(new Event(CLAVE_VISTA))
}
function suscribirVista(cb: () => void) {
  window.addEventListener(CLAVE_VISTA, cb)
  window.addEventListener("storage", cb)
  return () => {
    window.removeEventListener(CLAVE_VISTA, cb)
    window.removeEventListener("storage", cb)
  }
}

/**
 * Interruptor flotante entre la vista sencilla (asistente) y la completa (todo el
 * detalle técnico), fijo arriba en el centro en las dos vistas.
 */
function SelectorVista({ vista, onCambiar }: { vista: Vista; onCambiar: (v: Vista) => void }) {
  return (
    <nav aria-label="Tipo de vista" className="fixed top-3 left-1/2 z-[1100] -translate-x-1/2">
      <div role="group" aria-labelledby="pregunta-vista" className="vidrio vidrio-liquido relative inline-flex items-center gap-1 rounded-full p-1.5">
        <span id="pregunta-vista" className="hidden pr-2 pl-4 text-sm font-medium whitespace-nowrap text-marino sm:inline">
          ¿Cómo prefieres verlo?
        </span>
        {(
          [
            { id: "sencilla", texto: "Vista sencilla" },
            { id: "completa", texto: "Vista completa" },
          ] as const
        ).map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={vista === o.id}
            onClick={() => onCambiar(o.id)}
            className={cn(
              "rounded-full px-5 py-2 text-sm font-semibold whitespace-nowrap transition-all duration-300",
              vista === o.id ? "bg-azul text-white shadow-[0_4px_14px_rgb(4_102_200/0.35)]" : "text-pizarra hover:bg-white/60 hover:text-marino"
            )}
          >
            {o.texto}
          </button>
        ))}
      </div>
    </nav>
  )
}

export function AreaTrabajo() {
  const vista = React.useSyncExternalStore(suscribirVista, leerVista, () => "sencilla" as Vista)
  // La bienvenida sale en cada carga de la página (también en el HTML del servidor, sin parpadeo).
  const [bienvenida, setBienvenida] = React.useState(true)
  const etl = usePipelineEtl()
  const supabase = useEstadoSupabase(etl.versionDestino)
  // Pestaña que se abre al pasar a la vista completa desde «Ver lo guardado».
  const [pestanaInicial, setPestanaInicial] = React.useState<PestanaId | null>(null)

  function verEnVistaCompleta(p: PestanaId) {
    setPestanaInicial(p)
    guardarVista("completa")
  }

  function cambiarVista(v: Vista) {
    setPestanaInicial(null)
    guardarVista(v)
  }

  return (
    <main className={cn("mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 sm:px-6", vista === "completa" ? "pt-20 pb-40" : "pt-20 pb-16")}>
      <ScrollSuave />
      <FondoLiquido />
      <SelectorVista vista={vista} onCambiar={cambiarVista} />
      {bienvenida && (
        <Bienvenida
          onElegir={(v) => {
            cambiarVista(v)
            setBienvenida(false)
          }}
        />
      )}

      {vista === "sencilla" ? (
        <>
          <header className="cabecera-vidrio relative flex flex-col gap-3 overflow-hidden rounded-[28px] px-6 py-8 text-white sm:px-10 sm:py-12">
            <h1 className="text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">El tiempo en 5 ciudades de España</h1>
            <p className="max-w-3xl text-lg text-white/80">
              Elige ciudades y días, mira qué tiempo hizo y guárdalo en una base de datos. Son solo 3 pasos.
            </p>
          </header>
          <VistaSencilla etl={etl} supabase={supabase.estado} onVerCompleta={verEnVistaCompleta} />
        </>
      ) : (
        <VistaCompleta etl={etl} supabase={supabase.estado} pestanaInicial={pestanaInicial} />
      )}
    </main>
  )
}

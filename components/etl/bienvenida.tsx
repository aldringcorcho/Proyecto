"use client"

import * as React from "react"
import { ArrowRightIcon, SmileIcon, WrenchIcon } from "lucide-react"

type Vista = "sencilla" | "completa"

const OPCIONES: {
  id: Vista
  icono: typeof SmileIcon
  titulo: string
  para: string
  texto: string
  boton: string
  destacada: boolean
}[] = [
  {
    id: "sencilla",
    icono: SmileIcon,
    titulo: "Vista sencilla",
    para: "No sé nada del tema.",
    texto: "Elige ciudades, mira qué tiempo hizo y guárdalo en 3 pasos fáciles.",
    boton: "Empezar fácil",
    destacada: true,
  },
  {
    id: "completa",
    icono: WrenchIcon,
    titulo: "Vista completa",
    para: "Sé de datos o de programación.",
    texto: "Ve cómo funciona por dentro: el pipeline ETL, el JSON de la API, los filtros, los lotes y la base de datos.",
    boton: "Ver todo el detalle",
    destacada: false,
  },
]

/** Pantalla de bienvenida: la primera vez, pregunta qué vista usar según lo que sepa la persona. */
export function Bienvenida({ onElegir }: { onElegir: (v: Vista) => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-bienvenida"
      className="animate-in fade-in fixed inset-0 z-[1200] flex items-center justify-center overflow-y-auto bg-prusia-3/25 p-4 backdrop-blur-sm duration-300"
    >
      <div className="tarjeta animate-in zoom-in-95 slide-in-from-bottom-4 flex w-full max-w-4xl flex-col gap-6 p-6 duration-500 sm:p-10">
        <div className="flex flex-col gap-2 text-center">
          <p className="text-sm font-semibold tracking-wide text-azul uppercase">El tiempo en 5 ciudades de España</p>
          <h2 id="titulo-bienvenida" className="text-3xl font-semibold sm:text-4xl">
            ¿Cómo quieres usar la app?
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {OPCIONES.map((o, i) => (
            <button
              key={o.id}
              type="button"
              autoFocus={i === 0}
              onClick={() => onElegir(o.id)}
              className={
                "group flex flex-col items-start gap-4 rounded-3xl border p-6 text-left transition-all duration-300 hover:-translate-y-1 focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:outline-none " +
                (o.destacada
                  ? "border-azul/40 bg-linear-to-b from-white/90 to-[#e2edfa]/90 shadow-[inset_0_1px_0_rgb(255_255_255/0.95),0_14px_34px_-10px_rgb(4_102_200/0.45)] hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.95),0_20px_44px_-10px_rgb(4_102_200/0.55)]"
                  : "border-white/80 bg-white/70 shadow-[inset_0_1px_0_rgb(255_255_255/0.95),0_12px_30px_-10px_rgb(0_18_51/0.3)] hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.95),0_18px_40px_-10px_rgb(0_18_51/0.4)]")
              }
            >
              <span
                className={
                  "flex size-14 items-center justify-center rounded-2xl text-white shadow-md transition-transform duration-300 group-hover:scale-110 " +
                  (o.destacada ? "bg-linear-to-br from-[#2a82dc] to-azul" : "bg-linear-to-br from-indigo-noche to-prusia-2")
                }
                aria-hidden
              >
                <o.icono className="size-7" />
              </span>
              <span className="flex flex-col gap-1">
                <span className="text-2xl font-semibold">{o.titulo}</span>
                <span className="text-lg font-medium text-marino italic">{o.para}</span>
              </span>
              <span className="text-base text-muted-foreground">{o.texto}</span>
              <span
                className={
                  "mt-auto inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-base font-semibold transition-colors " +
                  (o.destacada
                    ? "bg-linear-to-b from-[#2a82dc] to-azul text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_6px_16px_rgb(4_102_200/0.3)]"
                    : "border border-white/80 bg-white/80 text-foreground shadow-sm group-hover:bg-white")
                }
              >
                {o.boton}
                <ArrowRightIcon className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
              </span>
            </button>
          ))}
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Puedes cambiar de vista cuando quieras desde el botón de arriba.
        </p>
      </div>
    </div>
  )
}

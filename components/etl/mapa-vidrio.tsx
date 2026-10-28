"use client"

import * as React from "react"
import type { Geometry, Position } from "geojson"
import { CheckIcon } from "lucide-react"
import { cn } from "cn"

import { CIUDADES } from "@/lib/etl/ciudades"
import provinciasCiudades from "@/lib/etl/provincias-ciudades.json"
import siluetaEspana from "@/lib/etl/silueta-espana.json"

const PROVINCIAS = provinciasCiudades.provincias as Record<string, { nombre: string; geometria: Geometry }>
const SILUETA = siluetaEspana.geometria as Geometry

// Proyección sencilla para un país de este tamaño: longitud escalada por el coseno de la latitud media.
const LON_MIN = -9.9
const LON_MAX = 4.9
const LAT_MIN = 35.6
const LAT_MAX = 44.2
const ESCALA_X = Math.cos(((LAT_MIN + LAT_MAX) / 2) * (Math.PI / 180))
const ANCHO = (LON_MAX - LON_MIN) * ESCALA_X
const ALTO = LAT_MAX - LAT_MIN

/** Separación de la cuadrícula de puntos, en las mismas unidades que el dibujo. */
const PASO = 0.2
const RADIO_PUNTO = 0.062

const proyectar = ([lon, lat]: Position) => [(lon - LON_MIN) * ESCALA_X, LAT_MAX - lat] as const

/** Anillos exteriores de un polígono o multipolígono (los huecos no hacen falta a esta escala). */
function anillos(g: Geometry): Position[][] {
  if (g.type === "Polygon") return [g.coordinates[0]]
  if (g.type === "MultiPolygon") return g.coordinates.map((p) => p[0])
  return []
}

/** Punto dentro de alguno de los anillos (regla par-impar). */
function dentro([lon, lat]: Position, rs: Position[][]) {
  return rs.some((r) => {
    let d = false
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i]
      const [xj, yj] = r[j]
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) d = !d
    }
    return d
  })
}

type Punto = { x: number; y: number; provincia: string | null }

/** La cuadrícula se calcula una sola vez: qué puntos caen en España y en qué provincia. */
const PUNTOS: Punto[] = (() => {
  const espana = anillos(SILUETA)
  const provincias = Object.entries(PROVINCIAS).map(([id, p]) => [id, anillos(p.geometria)] as const)
  const puntos: Punto[] = []
  // Contadores enteros: sumar decimales en cada paso acumula error y descuadra la trama.
  for (let fila = 0; PASO / 2 + fila * PASO < ALTO; fila++) {
    const y = PASO / 2 + fila * PASO
    // Filas alternas desplazadas medio paso: la trama queda más orgánica, como en los mapas de Apple.
    const desfase = fila % 2 ? PASO / 2 : 0
    for (let col = 0; PASO / 2 + desfase + col * PASO < ANCHO; col++) {
      const x = PASO / 2 + desfase + col * PASO
      const pos: Position = [x / ESCALA_X + LON_MIN, LAT_MAX - y]
      if (!dentro(pos, espana)) continue
      const provincia = provincias.find(([, rs]) => dentro(pos, rs))?.[0] ?? null
      puntos.push({ x, y, provincia })
    }
  }
  return puntos
})()

/** Lado de la etiqueta de cada ciudad, para que no se tapen entre sí ni se salgan del mapa. */
const LADO: Record<string, "arriba" | "abajo" | "izquierda" | "derecha"> = {
  bilbao: "arriba",
  barcelona: "izquierda",
  madrid: "izquierda",
  valencia: "derecha",
  sevilla: "abajo",
}

/**
 * Mapa de puntos de España (estilo Apple) para la vista sencilla: una trama de
 * puntitos, las provincias de las ciudades elegidas encendidas, líneas que unen
 * las ciudades elegidas y un botón por ciudad para elegirla o quitarla.
 */
export function MapaVidrio({ marcadas, onAlternar }: { marcadas: readonly string[]; onAlternar: (id: string) => void }) {
  const [sobre, setSobre] = React.useState<string | null>(null)

  // Ciudades elegidas unidas en un recorrido cerrado, ordenadas por ángulo alrededor de su centro.
  const elegidas = CIUDADES.filter((c) => marcadas.includes(c.id)).map((c) => proyectar([c.longitud, c.latitud]))
  const cx = elegidas.reduce((s, p) => s + p[0], 0) / (elegidas.length || 1)
  const cy = elegidas.reduce((s, p) => s + p[1], 0) / (elegidas.length || 1)
  const ruta = [...elegidas].sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx))
  const trazoRuta =
    ruta.length < 2
      ? ""
      : ruta.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(3)},${y.toFixed(3)}`).join("") + (ruta.length > 2 ? "Z" : "")

  return (
    <div className="relative mx-auto w-full max-w-2xl" style={{ aspectRatio: `${ANCHO} / ${ALTO}` }}>
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} className="absolute inset-0 size-full overflow-visible" aria-hidden>
        <defs>
          <linearGradient id="ruta-luz" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4d9be6" />
            <stop offset="100%" stopColor="#0466c8" />
          </linearGradient>
          <filter id="resplandor" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="0.08" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {PUNTOS.map((p, i) => {
          const marcada = !!p.provincia && marcadas.includes(p.provincia)
          const encima = !!p.provincia && p.provincia === sobre
          return (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={marcada ? RADIO_PUNTO * 1.15 : RADIO_PUNTO}
              className="transition-[fill,r] duration-500"
              fill={
                marcada
                  ? encima
                    ? "#4d9be6"
                    : "#0466c8"
                  : encima
                    ? "rgb(4 102 200 / 0.55)"
                    : "rgb(51 65 92 / 0.55)"
              }
              stroke={marcada ? "none" : "rgb(255 255 255 / 0.5)"}
              strokeWidth={0.012}
            />
          )
        })}

        {/* Líneas luminosas entre las ciudades elegidas: una base suave y un trazo que avanza. */}
        {trazoRuta && (
          <g filter="url(#resplandor)">
            <path d={trazoRuta} fill="none" stroke="rgb(4 102 200 / 0.25)" strokeWidth={0.07} strokeLinejoin="round" />
            <path
              d={trazoRuta}
              fill="none"
              stroke="url(#ruta-luz)"
              strokeWidth={0.05}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="0.35 0.25"
              className="ruta-animada"
            />
          </g>
        )}
      </svg>

      {CIUDADES.map((c) => {
        const [x, y] = proyectar([c.longitud, c.latitud])
        const marcada = marcadas.includes(c.id)
        const lado = LADO[c.id] ?? "arriba"
        return (
          <button
            key={c.id}
            type="button"
            aria-pressed={marcada}
            aria-label={`${c.nombre}: ${marcada ? "elegida, pulsa para quitarla" : "sin elegir, pulsa para elegirla"}`}
            onClick={() => onAlternar(c.id)}
            onPointerEnter={() => setSobre(c.id)}
            onPointerLeave={() => setSobre((s) => (s === c.id ? null : s))}
            onFocus={() => setSobre(c.id)}
            onBlur={() => setSobre((s) => (s === c.id ? null : s))}
            // El botón es un ancla sin tamaño en la coordenada exacta de la ciudad:
            // el punto se centra en ella y la etiqueta se coloca al lado elegido.
            className="group absolute size-0 outline-none"
            style={{ left: `${(x / ANCHO) * 100}%`, top: `${(y / ALTO) * 100}%` }}
          >
            {/* Halo que late alrededor de las ciudades elegidas. */}
            {marcada && (
              <span className="absolute top-0 left-0 size-12 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full bg-azul/25 [animation-duration:2.4s]" />
            )}
            <span
              className={cn(
                "absolute top-0 left-0 flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[3px] border-white transition-all duration-300 group-hover:scale-125",
                marcada
                  ? "bg-azul shadow-[0_0_0_4px_rgb(4_102_200/0.25),0_4px_14px_rgb(4_102_200/0.5)]"
                  : "bg-acero-frio shadow-[0_4px_12px_rgb(0_18_51/0.25)]"
              )}
            />
            <span
              className={cn(
                "absolute flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-base font-semibold whitespace-nowrap transition-all duration-300 group-hover:scale-105 group-focus-visible:ring-3 group-focus-visible:ring-ring/60",
                lado === "arriba" && "bottom-5 left-0 -translate-x-1/2",
                lado === "abajo" && "top-5 left-0 -translate-x-1/2",
                lado === "izquierda" && "top-0 right-5 -translate-y-1/2",
                lado === "derecha" && "top-0 left-5 -translate-y-1/2",
                marcada
                  ? "border-white/40 bg-linear-to-b from-[#2a82dc]/90 to-azul/90 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.45),0_8px_20px_rgb(4_102_200/0.35)]"
                  : "border-white/80 bg-white/80 text-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.9),0_4px_14px_rgb(0_18_51/0.1)]"
              )}
            >
              {marcada && <CheckIcon className="size-4" strokeWidth={3} aria-hidden />}
              {c.nombre}
            </span>
          </button>
        )
      })}
    </div>
  )
}

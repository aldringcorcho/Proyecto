"use client"

import "leaflet/dist/leaflet.css"

import * as React from "react"
import { XIcon } from "lucide-react"
import { cn } from "cn"
import L from "leaflet"
import type { Geometry } from "geojson"
import { CircleMarker, GeoJSON, MapContainer, TileLayer, Tooltip } from "react-leaflet"

import { formatoDuracion, formatoEntero, formatoNumero } from "@/lib/etl/formato"
import { COLOR_PUNTO, type PuntoCiudad } from "@/components/etl/mapa-tipos"
import provinciasCiudades from "@/lib/etl/provincias-ciudades.json"
import type { EstadoFase } from "@/lib/etl/tipos"

/** Provincia de cada ciudad (por id), que se resalta cuando la ciudad está marcada. */
const PROVINCIAS = provinciasCiudades.provincias as Record<string, { nombre: string; geometria: Geometry }>

/** Vista fija: España peninsular con las provincias de todas las ciudades dentro. */
const VISTA_ESPANA = L.geoJSON(Object.values(PROVINCIAS).map((x) => x.geometria) as never).getBounds().pad(0.08)

type Direccion = "top" | "bottom" | "left" | "right"

// Madrid y Valencia están cerca: sus etiquetas van a lados opuestos para no taparse.
const DIRECCION_ETIQUETA: Record<string, Direccion> = {
  madrid: "left",
  valencia: "right",
  barcelona: "right",
  sevilla: "bottom",
}

const DESPLAZAMIENTO: Record<Direccion, [number, number]> = {
  top: [0, -10],
  bottom: [0, 10],
  left: [-10, 0],
  right: [10, 0],
}

function estilo(p: PuntoCiudad) {
  if (p.estado === "pendiente") return { fillColor: COLOR_PUNTO.pendiente, color: "#0466c8" }
  if (p.estado === "en_curso") return { fillColor: COLOR_PUNTO.en_curso, color: "#0466c8" }
  if (p.estado) return { fillColor: COLOR_PUNTO[p.estado], color: "#ffffff" }
  return { fillColor: p.marcada ? COLOR_PUNTO.marcada : COLOR_PUNTO.sinMarcar, color: "#ffffff" }
}

const TEXTO_ESTADO: Record<EstadoFase, string> = {
  pendiente: "En cola",
  en_curso: "Descargando…",
  completada: "Descargada",
  error: "Error",
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs tracking-wide text-[#5c677d] uppercase">{titulo}</dt>
      <dd className="text-sm font-semibold tabular-nums text-[#001233]">{valor}</dd>
    </div>
  )
}

function Ficha({ p, onAlternar, bloqueado }: { p: PuntoCiudad; onAlternar: () => void; bloqueado: boolean }) {
  const f = p.ficha
  const n = (v: number | null, u: string) => (v === null ? "—" : `${formatoNumero(Math.round(v * 10) / 10)} ${u}`)
  return (
    <div className="flex w-64 flex-col gap-3">
      <header className="flex items-start justify-between gap-2 pr-6">
        <div>
          <p className="text-base font-semibold text-[#001233]">{p.ciudad.nombre}</p>
          <p className="text-xs text-[#5c677d] tabular-nums">
            {p.ciudad.latitud}, {p.ciudad.longitud}
          </p>
        </div>
        {p.estado && (
          <span
            className="rounded-full px-2 py-0.5 text-xs font-semibold text-white"
            style={{ background: p.estado === "pendiente" ? "#7d8597" : COLOR_PUNTO[p.estado] }}
          >
            {TEXTO_ESTADO[p.estado]}
          </span>
        )}
      </header>

      <div className="flex flex-col gap-1">
        <p className="text-xs tracking-wide text-[#5c677d] uppercase">
          {f.extraida ? "Petición enviada a Open-Meteo" : "Petición que se enviaría"}
        </p>
        <a
          href={f.url}
          target="_blank"
          rel="noreferrer"
          className="rounded-md bg-[#e8f0fa] px-2 py-1.5 font-mono text-xs leading-snug break-all text-[#023e7d] hover:underline"
        >
          GET {f.url.replace("https://", "")}
        </a>
      </div>

      {f.error ? (
        <p className="rounded-md bg-red-50 px-2 py-1.5 text-xs text-[#c62828]">{f.error}</p>
      ) : f.horas !== null ? (
        <dl className="grid grid-cols-3 gap-x-2 gap-y-2">
          <Dato titulo="Horas" valor={formatoEntero(f.horas)} />
          <Dato titulo="Válidos" valor={f.validos === null ? "—" : formatoEntero(f.validos)} />
          <Dato titulo="Rechaz." valor={f.rechazados === null ? "—" : formatoEntero(f.rechazados)} />
          <Dato titulo="T. mín." valor={n(f.temperaturaMin, "°C")} />
          <Dato titulo="T. media" valor={n(f.temperaturaMedia, "°C")} />
          <Dato titulo="T. máx." valor={n(f.temperaturaMax, "°C")} />
          <Dato titulo="Lluvia" valor={n(f.lluvia, "mm")} />
          <Dato titulo="Humedad" valor={n(f.humedad, "%")} />
          <Dato titulo="Descarga" valor={formatoDuracion(f.duracionMs)} />
        </dl>
      ) : (
        <p className="text-xs text-[#5c677d]">Aún no hay datos: pulsa «Extraer datos» para descargarlos.</p>
      )}

      <button
        type="button"
        onClick={onAlternar}
        disabled={bloqueado}
        className={
          p.marcada
            ? "rounded-full border border-[#c9cdd6] px-3 py-1.5 text-xs font-medium text-[#001233] hover:bg-[#eef0f4] disabled:opacity-50"
            : "rounded-full bg-[#0466c8] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#0353a4] disabled:opacity-50"
        }
      >
        {p.marcada ? "Quitar de la extracción" : "Añadir a la extracción"}
      </button>
    </div>
  )
}

/** Mapa de Leaflet: solo se carga en el navegador (ver configuracion-extraccion.tsx). */
export default function MapaLeaflet({
  puntos,
  abierta,
  onAbrir,
  onAlternar,
  bloqueado,
}: {
  puntos: PuntoCiudad[]
  /** Ciudad cuya ficha está abierta (también se resalta en la tabla de ciudades). */
  abierta: string | null
  onAbrir: (id: string | null) => void
  onAlternar: (id: string) => void
  bloqueado: boolean
}) {
  const lons = puntos.map((p) => p.ciudad.longitud)
  // Ciudad bajo el cursor: se resaltan su punto, su etiqueta y su provincia.
  const [sobre, setSobre] = React.useState<string | null>(null)

  const seleccionada = puntos.find((p) => p.ciudad.id === abierta)
  // La ficha se abre en el lado contrario a la ciudad para no taparla.
  const longitudMedia = lons.reduce((s, x) => s + x, 0) / lons.length
  const fichaIzquierda = !!seleccionada && seleccionada.ciudad.longitud > longitudMedia

  return (
    <div className="relative h-full min-h-72 w-full">
      <MapContainer
        bounds={VISTA_ESPANA}
        maxBounds={VISTA_ESPANA.pad(0.5)}
        scrollWheelZoom={false}
        zoomSnap={0.25}
        className="h-full min-h-72 w-full rounded-xl"
        style={{ background: "var(--muted)" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          className="grayscale-[60%]"
        />
        {puntos
          // Provincias de las ciudades marcadas y, además, la de la ciudad bajo el cursor.
          .filter((p) => (p.marcada || p.ciudad.id === sobre) && PROVINCIAS[p.ciudad.id])
          .map((p) => {
            const activa = p.ciudad.id === abierta
            const encima = p.ciudad.id === sobre
            const intensa = activa || encima
            return (
              <GeoJSON
                key={`${p.ciudad.id}-${activa}-${encima}`}
                data={PROVINCIAS[p.ciudad.id].geometria}
                interactive={false}
                // Siempre por debajo de los puntos, aunque se añada después (p. ej. al pasar el cursor).
                eventHandlers={{ add: (e) => (e.target as L.GeoJSON).bringToBack() }}
                style={{
                  color: intensa ? "#023e7d" : "#0466c8",
                  weight: intensa ? 2.5 : 1.5,
                  fillColor: intensa ? "#023e7d" : "#0466c8",
                  fillOpacity: activa ? 0.32 : encima ? (p.marcada ? 0.28 : 0.14) : 0.16,
                  dashArray: encima && !p.marcada ? "4 4" : undefined,
                }}
              />
            )
          })}
        {puntos.map((p) => {
          const direccion = DIRECCION_ETIQUETA[p.ciudad.id] ?? "top"
          const activa = p.ciudad.id === abierta
          return (
            <CircleMarker
              // Las clases CSS (latido, etiqueta activa) solo se aplican al crear el punto: se recrea al cambiar.
              key={`${p.ciudad.id}-${p.estado ?? "sin"}-${activa}`}
              center={[p.ciudad.latitud, p.ciudad.longitud]}
              radius={(p.marcada ? 11 : 8) + (activa ? 3 : 0)}
              pathOptions={{
                ...estilo(p),
                ...(activa && { color: "#001233" }),
                weight: activa ? 3 : 2,
                fillOpacity: p.marcada ? 1 : 0.55,
                className: p.estado === "en_curso" ? "punto-descargando" : undefined,
              }}
              eventHandlers={{
                click: () => onAbrir(activa ? null : p.ciudad.id),
                // El efecto se aplica sobre el propio elemento (sin re-renderizar el punto) para que no parpadee.
                mouseover: (e) => {
                  const capa = e.target as L.CircleMarker
                  capa.bringToFront()
                  capa.getElement()?.classList.add("punto-hover")
                  capa.getTooltip()?.getElement()?.classList.add("etiqueta-hover")
                  setSobre(p.ciudad.id)
                },
                mouseout: (e) => {
                  const capa = e.target as L.CircleMarker
                  capa.getElement()?.classList.remove("punto-hover")
                  capa.getTooltip()?.getElement()?.classList.remove("etiqueta-hover")
                  setSobre((s) => (s === p.ciudad.id ? null : s))
                },
              }}
            >
              <Tooltip direction={direccion} offset={DESPLAZAMIENTO[direccion]} permanent className={activa ? "etiqueta-activa" : undefined}>
                <span className="font-semibold">{p.ciudad.nombre}</span>
                {p.resumen && <span className="block text-xs opacity-75">{p.resumen}</span>}
              </Tooltip>
            </CircleMarker>
          )
        })}
      </MapContainer>

      {/* La ficha va fija en una esquina (no un popup) para que el mapa no se desplace al abrirla. */}
      {seleccionada && (
        <div
          role="dialog"
          aria-label={`Ficha de ${seleccionada.ciudad.nombre}`}
          className={cn(
            "animate-in fade-in absolute top-3 z-[1000] max-h-[calc(100%-1.5rem)] overflow-y-auto rounded-2xl p-4 vidrio",
            fichaIzquierda ? "slide-in-from-left-2 left-14" : "slide-in-from-right-2 right-3"
          )}
        >
          <button
            type="button"
            onClick={() => onAbrir(null)}
            aria-label="Cerrar la ficha"
            className="absolute top-2.5 right-2.5 flex size-6 items-center justify-center rounded-full text-[#5c677d] hover:bg-[#eef0f4]"
          >
            <XIcon className="size-4" />
          </button>
          <Ficha p={seleccionada} onAlternar={() => onAlternar(seleccionada.ciudad.id)} bloqueado={bloqueado} />
        </div>
      )}
    </div>
  )
}

"use client"

import * as React from "react"
import { DatabaseIcon, RefreshCwIcon } from "lucide-react"

import { EstadoBadge, Nota } from "@/components/etl/estado"
import { TablaPaginada, type Columna } from "@/components/etl/tabla-paginada"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import type { EstadoSupabase } from "@/hooks/use-estado-supabase"
import { NOMBRES_CIUDADES } from "@/lib/etl/ciudades"
import { formatoEntero, formatoFechaHoraUtc, formatoNumero } from "@/lib/etl/formato"

type FilaDestino = {
  id: number
  ciudad: string
  fecha_hora: string
  temperatura_c: number
  humedad_pct: number
  precipitacion_mm: number
  importado_en: string
}

type Respuesta = { clave: string; filas: FilaDestino[]; total: number | null; error?: string }

const ORDENABLES = ["ciudad", "fecha_hora", "temperatura_c", "humedad_pct", "precipitacion_mm", "importado_en"]

/** "YYYY-MM-DDTHH:mm" (UTC) → ISO con Z. */
function aIso(v: string) {
  return v ? `${v}:00Z` : ""
}

export function PestanaSupabase({
  supabase,
  version,
  pendientesLocales,
}: {
  supabase: EstadoSupabase | null
  version: number
  pendientesLocales: number
}) {
  const [ciudad, setCiudad] = React.useState("")
  const [desde, setDesde] = React.useState("")
  const [hasta, setHasta] = React.useState("")
  const [orden, setOrden] = React.useState({ campo: "fecha_hora", direccion: "asc" as "asc" | "desc" })
  const [pagina, setPagina] = React.useState(0)
  const [tamano, setTamano] = React.useState(25)
  const [recarga, setRecarga] = React.useState(0)
  const [respuesta, setRespuesta] = React.useState<Respuesta | null>(null)

  const parametros = new URLSearchParams({
    ciudad,
    desde: aIso(desde),
    hasta: aIso(hasta),
    orden: orden.campo,
    direccion: orden.direccion,
    pagina: String(pagina),
    tamano: String(tamano),
  }).toString()
  const clave = `${parametros}#${version}#${recarga}`
  const disponible = !!supabase?.configurado && supabase.tablaDisponible
  const cargando = disponible && respuesta?.clave !== clave

  React.useEffect(() => {
    if (!disponible) return
    let vigente = true
    fetch(`/api/supabase/mediciones?${parametros}`, { cache: "no-store" })
      .then(async (r) => {
        const cuerpo = await r.json()
        if (!vigente) return
        setRespuesta(
          r.ok
            ? { clave, filas: cuerpo.filas, total: cuerpo.total }
            : { clave, filas: [], total: 0, error: cuerpo.error ?? `HTTP ${r.status}` }
        )
      })
      .catch(() => {
        if (vigente) setRespuesta({ clave, filas: [], total: 0, error: "No se pudo contactar con el servidor." })
      })
    return () => {
      vigente = false
    }
  }, [clave, parametros, disponible])

  function filtro<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v)
      setPagina(0)
    }
  }

  const columnas: Columna<FilaDestino>[] = [
    { id: "id", encabezado: "id", numerica: true, celda: (f) => f.id },
    { id: "ciudad", encabezado: "Ciudad", celda: (f) => f.ciudad },
    { id: "fecha_hora", encabezado: "Fecha y hora", unidad: "UTC", celda: (f) => formatoFechaHoraUtc(f.fecha_hora) },
    { id: "temperatura_c", encabezado: "Temperatura", unidad: "°C", numerica: true, celda: (f) => formatoNumero(f.temperatura_c) },
    { id: "humedad_pct", encabezado: "Humedad", unidad: "%", numerica: true, celda: (f) => formatoNumero(f.humedad_pct) },
    { id: "precipitacion_mm", encabezado: "Precipitación", unidad: "mm", numerica: true, celda: (f) => formatoNumero(f.precipitacion_mm) },
    { id: "importado_en", encabezado: "Importado en", unidad: "UTC", celda: (f) => formatoFechaHoraUtc(f.importado_en) },
  ]

  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <DatabaseIcon />
        <AlertTitle>Datos persistidos en Supabase</AlertTitle>
        <AlertDescription>
          Lectura real de la tabla <code>mediciones_meteorologicas</code> a través del servidor
          (consulta con <code>ORDER BY</code> explícito). Los registros locales de las otras pestañas
          viven solo en tu navegador hasta que se suben
          {pendientesLocales > 0 && (
            <> — ahora mismo hay {formatoEntero(pendientesLocales)} seleccionados en local, pendientes de subir o ya subidos</>
          )}
          .
        </AlertDescription>
      </Alert>

      {supabase && !disponible && (
        <Alert variant="destructive">
          <AlertTitle>Supabase no disponible</AlertTitle>
          <AlertDescription>{supabase.mensaje}</AlertDescription>
        </Alert>
      )}

      <div className="tarjeta flex flex-wrap items-end gap-3 p-4">
        <label className="flex flex-col gap-1 text-xs font-medium">
          Ciudad
          <NativeSelect className="w-36" value={ciudad} onChange={(e) => filtro(setCiudad)(e.target.value)}>
            <option value="">Todas</option>
            {NOMBRES_CIUDADES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          Desde (UTC)
          <Input type="datetime-local" value={desde} onChange={(e) => filtro(setDesde)(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          Hasta (UTC)
          <Input type="datetime-local" value={hasta} onChange={(e) => filtro(setHasta)(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          Ordenar por
          <NativeSelect className="w-40" value={orden.campo} onChange={(e) => filtro(setOrden)({ ...orden, campo: e.target.value })}>
            <option value="ciudad">Ciudad</option>
            <option value="fecha_hora">Fecha y hora</option>
            <option value="temperatura_c">Temperatura</option>
            <option value="humedad_pct">Humedad</option>
            <option value="precipitacion_mm">Precipitación</option>
            <option value="importado_en">Importado en</option>
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          Dirección
          <NativeSelect className="w-36" value={orden.direccion} onChange={(e) => filtro(setOrden)({ ...orden, direccion: e.target.value as "asc" | "desc" })}>
            <option value="asc">Ascendente</option>
            <option value="desc">Descendente</option>
          </NativeSelect>
        </label>
        <div className="ml-auto flex items-center gap-2">
          {cargando && <EstadoBadge estado="en_curso" texto="Consultando" />}
          <Button variant="outline" onClick={() => setRecarga((n) => n + 1)} disabled={!disponible}>
            <RefreshCwIcon data-icon="inline-start" />
            Actualizar
          </Button>
        </div>
      </div>

      {respuesta?.error && (
        <Alert variant="destructive">
          <AlertDescription>{respuesta.error}</AlertDescription>
        </Alert>
      )}
      <Nota>
        {respuesta && !respuesta.error && respuesta.total !== null &&
          `${formatoEntero(respuesta.total)} registros persistidos coinciden con estos filtros.`}
      </Nota>

      <TablaPaginada
        etiqueta="Registros almacenados en Supabase"
        filas={respuesta?.filas ?? []}
        columnas={columnas}
        claveFila={(f) => String(f.id)}
        ordenables={ORDENABLES}
        orden={orden}
        onOrdenar={(campo) =>
          filtro(setOrden)(
            orden.campo === campo
              ? { campo, direccion: orden.direccion === "asc" ? "desc" : "asc" }
              : { campo, direccion: "asc" }
          )
        }
        vacio={disponible ? (cargando ? "Consultando…" : "No hay registros persistidos con estos filtros.") : "Configura Supabase para consultar el destino."}
        servidor={{
          total: respuesta?.total ?? 0,
          pagina,
          tamano,
          onCambiar: (p, t) => {
            setPagina(p)
            setTamano(t)
          },
        }}
      />
    </div>
  )
}

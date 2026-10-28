"use client"

import { FilterXIcon, ListChecksIcon, ListXIcon } from "lucide-react"

import { Nota } from "@/components/etl/estado"
import { TablaPaginada, type Columna } from "@/components/etl/tabla-paginada"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import type { PipelineEtl } from "@/hooks/use-pipeline-etl"
import { NOMBRES_CIUDADES } from "@/lib/etl/ciudades"
import type { CampoOrden, Filtros } from "@/lib/etl/filtrado"
import { formatoEntero, formatoFechaHoraUtc, formatoNumero } from "@/lib/etl/formato"
import { claveMedicion } from "@/lib/etl/limpieza"
import type { Medicion } from "@/lib/etl/tipos"

export const CAMPOS_ORDEN: { id: CampoOrden; texto: string }[] = [
  { id: "ciudad", texto: "Ciudad" },
  { id: "fecha_hora", texto: "Fecha y hora" },
  { id: "temperatura_c", texto: "Temperatura" },
  { id: "humedad_pct", texto: "Humedad" },
  { id: "precipitacion_mm", texto: "Precipitación" },
]

export function columnasMedicion(): Columna<Medicion>[] {
  return [
    { id: "ciudad", encabezado: "Ciudad", celda: (m) => m.ciudad },
    { id: "fecha_hora", encabezado: "Fecha y hora", unidad: "UTC", celda: (m) => formatoFechaHoraUtc(m.fecha_hora) },
    { id: "temperatura_c", encabezado: "Temperatura", unidad: "°C", numerica: true, celda: (m) => formatoNumero(m.temperatura_c) },
    { id: "humedad_pct", encabezado: "Humedad", unidad: "%", numerica: true, celda: (m) => formatoNumero(m.humedad_pct) },
    { id: "precipitacion_mm", encabezado: "Precipitación", unidad: "mm", numerica: true, celda: (m) => formatoNumero(m.precipitacion_mm) },
  ]
}

function Rango({
  titulo,
  unidad,
  min,
  max,
  onMin,
  onMax,
  id,
  step,
}: {
  titulo: string
  unidad: string
  min: string
  max: string
  onMin: (v: string) => void
  onMax: (v: string) => void
  id: string
  step: string
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-xs font-medium">
        {titulo} ({unidad})
      </legend>
      <div className="flex gap-2">
        <Input id={`${id}-min`} type="number" inputMode="decimal" step={step} placeholder="mín." aria-label={`${titulo} mínima`} value={min} onChange={(e) => onMin(e.target.value)} />
        <Input id={`${id}-max`} type="number" inputMode="decimal" step={step} placeholder="máx." aria-label={`${titulo} máxima`} value={max} onChange={(e) => onMax(e.target.value)} />
      </div>
    </fieldset>
  )
}

export function PestanaValidos({ etl }: { etl: PipelineEtl }) {
  const { filtrado: f, seleccion: s, procesamiento: pr } = etl
  if (!pr) return <p className="py-6 text-sm text-muted-foreground">Ejecuta una extracción para ver datos.</p>

  const filtros = f.filtros
  const cambiar = <K extends keyof Filtros>(k: K, v: Filtros[K]) => f.setFiltros({ ...filtros, [k]: v })

  function ordenarPor(campo: string) {
    const c = campo as CampoOrden
    f.setOrden(
      f.orden.campo === c
        ? { campo: c, direccion: f.orden.direccion === "asc" ? "desc" : "asc" }
        : { campo: c, direccion: "asc" }
    )
  }

  const seleccionadasFiltradas = etl.vistaPrevia.length

  return (
    <div className="flex flex-col gap-4">
      <Nota>
        Orden de operaciones: <strong>datos válidos → filtros → ordenación → selección → carga</strong>.
        La paginación solo afecta a lo que ves. Cambiar los filtros nunca selecciona filas nuevas.
      </Nota>

      <section aria-label="Filtros" className="tarjeta flex flex-col gap-3 p-4">
        <fieldset>
          <legend className="mb-2 text-xs font-medium">Ciudades</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {NOMBRES_CIUDADES.map((c) => (
              <Label key={c} className="font-normal">
                <Checkbox
                  checked={filtros.ciudades.includes(c)}
                  onCheckedChange={(v) =>
                    cambiar(
                      "ciudades",
                      NOMBRES_CIUDADES.filter((x) => (x === c ? v : filtros.ciudades.includes(x)))
                    )
                  }
                />
                {c}
              </Label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <fieldset className="flex flex-col gap-1.5 sm:col-span-2 xl:col-span-2">
            <legend className="mb-1.5 text-xs font-medium">Intervalo de fecha y hora (UTC, inclusivo)</legend>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input type="datetime-local" aria-label="Desde (UTC)" value={filtros.desde} onChange={(e) => cambiar("desde", e.target.value)} />
              <Input type="datetime-local" aria-label="Hasta (UTC)" value={filtros.hasta} onChange={(e) => cambiar("hasta", e.target.value)} />
            </div>
          </fieldset>
          <Rango id="temp" titulo="Temperatura" unidad="°C" step="0.1" min={filtros.temperaturaMin} max={filtros.temperaturaMax} onMin={(v) => cambiar("temperaturaMin", v)} onMax={(v) => cambiar("temperaturaMax", v)} />
          <Rango id="hum" titulo="Humedad" unidad="%" step="1" min={filtros.humedadMin} max={filtros.humedadMax} onMin={(v) => cambiar("humedadMin", v)} onMax={(v) => cambiar("humedadMax", v)} />
          <Rango id="prec" titulo="Precipitación" unidad="mm" step="0.1" min={filtros.precipitacionMin} max={filtros.precipitacionMax} onMin={(v) => cambiar("precipitacionMin", v)} onMax={(v) => cambiar("precipitacionMax", v)} />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Label className="font-normal">
            <Checkbox checked={filtros.soloLluvia} onCheckedChange={(v) => cambiar("soloLluvia", v)} />
            Solo registros con lluvia (precipitación &gt; 0 mm)
          </Label>
          <div className="ml-auto flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs font-medium">
              Ordenar por
              <NativeSelect className="w-40" value={f.orden.campo} onChange={(e) => f.setOrden({ ...f.orden, campo: e.target.value as CampoOrden })}>
                {CAMPOS_ORDEN.map((c) => (
                  <option key={c.id} value={c.id}>{c.texto}</option>
                ))}
              </NativeSelect>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium">
              Dirección
              <NativeSelect className="w-36" value={f.orden.direccion} onChange={(e) => f.setOrden({ ...f.orden, direccion: e.target.value as "asc" | "desc" })}>
                <option value="asc">Ascendente</option>
                <option value="desc">Descendente</option>
              </NativeSelect>
            </label>
            <Button variant="outline" onClick={f.restablecer}>
              <FilterXIcon data-icon="inline-start" />
              Restablecer filtros
            </Button>
          </div>
        </div>
        {f.errores.length > 0 && (
          <Alert variant="destructive">
            <AlertDescription>
              <ul className="list-disc pl-4">
                {f.errores.map((e) => <li key={e}>{e}</li>)}
              </ul>
              El valor no válido se ignora al filtrar y la carga queda bloqueada hasta corregirlo.
            </AlertDescription>
          </Alert>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm" aria-live="polite">
          <strong className="tabular-nums">{formatoEntero(f.ordenados.length)}</strong> coinciden con los filtros ·{" "}
          <strong className="tabular-nums">{formatoEntero(seleccionadasFiltradas)}</strong> seleccionados para cargar
          {s.fueraDeFiltros > 0 && (
            <span className="text-amber-700 dark:text-amber-400">
              {" "}· {formatoEntero(s.fueraDeFiltros)} seleccionados quedan fuera de los filtros y no se subirán
            </span>
          )}
        </p>
        <Button variant="outline" size="sm" onClick={s.seleccionarFiltradas} disabled={f.ordenados.length === 0}>
          <ListChecksIcon data-icon="inline-start" />
          Seleccionar las {formatoEntero(f.ordenados.length)} filtradas
        </Button>
        <Button variant="outline" size="sm" onClick={s.vaciar} disabled={s.claves.size === 0}>
          <ListXIcon data-icon="inline-start" />
          Vaciar selección
        </Button>
      </div>

      <TablaPaginada
        etiqueta="Registros válidos filtrados y ordenados"
        filas={f.ordenados}
        columnas={columnasMedicion()}
        claveFila={claveMedicion}
        ordenables={CAMPOS_ORDEN.map((c) => c.id)}
        orden={f.orden}
        onOrdenar={ordenarPor}
        vacio="Ningún registro válido coincide con los filtros."
        claseFila={(m) => (s.claves.has(claveMedicion(m)) ? "bg-primary/5" : undefined)}
        prefijo={{
          encabezado: (pagina) => {
            const marcadas = pagina.filter((m) => s.claves.has(claveMedicion(m))).length
            return (
              <Checkbox
                aria-label="Seleccionar las filas de esta página"
                checked={pagina.length > 0 && marcadas === pagina.length}
                indeterminate={marcadas > 0 && marcadas < pagina.length}
                onCheckedChange={(v) => s.marcar(pagina, v)}
                disabled={pagina.length === 0}
              />
            )
          },
          celda: (m) => (
            <Checkbox
              aria-label={`Seleccionar ${m.ciudad} ${formatoFechaHoraUtc(m.fecha_hora)}`}
              checked={s.claves.has(claveMedicion(m))}
              onCheckedChange={(v) => s.alternar(claveMedicion(m), v)}
             
            />
          ),
        }}
      />
    </div>
  )
}

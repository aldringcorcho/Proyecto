"use client"

import { DownloadCloudIcon, RotateCwIcon } from "lucide-react"

import { EstadoBadge, Nota } from "@/components/etl/estado"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { PipelineEtl } from "@/hooks/use-pipeline-etl"
import { CIUDADES, buscarCiudad } from "@/lib/etl/ciudades"
import { MAX_DIAS_EXTRACCION } from "@/lib/etl/extraccion"
import { formatoDuracion, formatoEntero } from "@/lib/etl/formato"

export function ConfiguracionExtraccion({ etl }: { etl: PipelineEtl }) {
  const { configuracion: c, extraccion, carga, acciones } = etl
  const extrayendo = extraccion?.estado === "en_curso"
  const bloqueado = extrayendo || !!carga?.enCurso
  const { validacion } = c

  function alternarCiudad(id: string, marcada: boolean) {
    c.setCiudadIds(
      CIUDADES.filter((x) => (x.id === id ? marcada : c.ciudadIds.includes(x.id))).map((x) => x.id)
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>1. Configuración de la extracción</CardTitle>
        <CardDescription>
          API histórica de Open-Meteo · variables horarias de temperatura, humedad relativa y
          precipitación · horas en UTC, °C y mm.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-4 md:grid-cols-[1fr_auto]">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">Ciudades</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {CIUDADES.map((ciudad) => (
                <Label key={ciudad.id} className="font-normal">
                  <Checkbox
                    checked={c.ciudadIds.includes(ciudad.id)}
                    onCheckedChange={(v) => alternarCiudad(ciudad.id, v)}
                    disabled={bloqueado}
                  />
                  {ciudad.nombre}
                  <span className="text-xs text-muted-foreground tabular-nums">
                    ({ciudad.latitud}, {ciudad.longitud})
                  </span>
                </Label>
              ))}
            </div>
          </fieldset>
          <div className="grid grid-cols-2 gap-3 sm:w-80">
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
        </div>

        <div className="flex flex-col gap-3 rounded-lg bg-muted/50 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm" aria-live="polite">
            <span className="font-medium">Volumen previsto: </span>
            {validacion.errores.length === 0 ? (
              <>
                {c.ciudadIds.length} {c.ciudadIds.length === 1 ? "ciudad" : "ciudades"} ×{" "}
                {validacion.dias} {validacion.dias === 1 ? "día" : "días"} × 24 h ={" "}
                <strong className="tabular-nums">
                  {formatoEntero(validacion.registrosPrevistos)} registros horarios
                </strong>{" "}
                <span className="text-muted-foreground">
                  ({c.ciudadIds.length} {c.ciudadIds.length === 1 ? "petición" : "peticiones"}; máx.{" "}
                  {MAX_DIAS_EXTRACCION} días)
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">corrige la configuración</span>
            )}
          </div>
          <Button
            size="lg"
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

        {extraccion && (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">
              Peticiones ({extraccion.fechaInicio} → {extraccion.fechaFin}):{" "}
              <span className="font-normal text-muted-foreground">
                {extraccion.ciudades.filter((r) => r.estado === "completada" || r.estado === "error").length}{" "}
                procesadas · {extraccion.ciudades.filter((r) => r.estado === "pendiente" || r.estado === "en_curso").length}{" "}
                pendientes
              </span>
            </h3>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {extraccion.ciudades.map((r) => {
                const horas = Array.isArray(r.respuesta?.hourly?.time) ? r.respuesta.hourly.time.length : 0
                return (
                  <li key={r.ciudadId} className="flex flex-col gap-1 rounded-lg border p-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{buscarCiudad(r.ciudadId)?.nombre}</span>
                      <EstadoBadge
                        estado={r.estado}
                        texto={r.estado === "en_curso" ? "Descargando" : undefined}
                      />
                    </div>
                    {r.estado === "completada" && (
                      <span className="text-muted-foreground">
                        {formatoEntero(horas)} horas · {formatoDuracion(r.duracionMs)}
                      </span>
                    )}
                    {r.estado === "error" && (
                      <>
                        <span className="text-destructive" role="alert">
                          {r.error}
                        </span>
                        <Button
                          variant="outline"
                          size="xs"
                          className="self-start"
                          onClick={() => acciones.reintentarCiudad(r.ciudadId)}
                          disabled={bloqueado}
                        >
                          <RotateCwIcon data-icon="inline-start" />
                          Reintentar solo esta ciudad
                        </Button>
                      </>
                    )}
                    {r.intentos > 1 && (
                      <span className="text-muted-foreground">Intentos: {r.intentos}</span>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

"use client"

import * as React from "react"
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { NativeSelect } from "@/components/ui/native-select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatoEntero } from "@/lib/etl/formato"

export type Columna<T> = {
  id: string
  encabezado: string
  unidad?: string
  numerica?: boolean
  celda: (fila: T, posicion: number) => React.ReactNode
}

export type OrdenTabla = { campo: string; direccion: "asc" | "desc" }

const TAMANOS = [10, 25, 50, 100]

type Props<T> = {
  etiqueta: string
  filas: T[]
  columnas: Columna<T>[]
  claveFila: (fila: T, posicion: number) => string
  vacio: React.ReactNode
  /** Columnas por las que se puede ordenar haciendo clic en el encabezado. */
  ordenables?: string[]
  orden?: OrdenTabla
  onOrdenar?: (campo: string) => void
  /** Columna inicial opcional (p. ej. casillas de selección). */
  prefijo?: {
    encabezado: (filasPagina: T[]) => React.ReactNode
    celda: (fila: T) => React.ReactNode
  }
  claseFila?: (fila: T) => string | undefined
  /** Para paginación en servidor: total real y página controlada. */
  servidor?: {
    total: number
    pagina: number
    tamano: number
    onCambiar: (pagina: number, tamano: number) => void
  }
}

export function TablaPaginada<T>({
  etiqueta,
  filas,
  columnas,
  claveFila,
  vacio,
  ordenables = [],
  orden,
  onOrdenar,
  prefijo,
  claseFila,
  servidor,
}: Props<T>) {
  const [paginaLocal, setPaginaLocal] = React.useState(0)
  const [tamanoLocal, setTamanoLocal] = React.useState(25)

  const tamano = servidor?.tamano ?? tamanoLocal
  const total = servidor?.total ?? filas.length
  const totalPaginas = Math.max(1, Math.ceil(total / tamano))
  // Si el número de filas baja (p. ej. al filtrar), la página se ajusta sola.
  const pagina = Math.min(servidor?.pagina ?? paginaLocal, totalPaginas - 1)
  const desde = pagina * tamano
  const filasPagina = servidor ? filas : filas.slice(desde, desde + tamano)

  function irA(p: number, t = tamano) {
    if (servidor) servidor.onCambiar(p, t)
    else {
      setPaginaLocal(p)
      setTamanoLocal(t)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-lg border">
        <Table aria-label={etiqueta}>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              {prefijo && <TableHead className="w-10">{prefijo.encabezado(filasPagina)}</TableHead>}
              {columnas.map((c) => {
                const ordenable = onOrdenar && ordenables.includes(c.id)
                const activo = orden?.campo === c.id
                const texto = (
                  <>
                    {c.encabezado}
                    {c.unidad && (
                      <span className="font-normal text-muted-foreground"> ({c.unidad})</span>
                    )}
                  </>
                )
                return (
                  <TableHead
                    key={c.id}
                    className={cn(c.numerica && "text-right")}
                    aria-sort={
                      activo ? (orden!.direccion === "asc" ? "ascending" : "descending") : undefined
                    }
                  >
                    {ordenable ? (
                      <button
                        type="button"
                        onClick={() => onOrdenar(c.id)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                          c.numerica && "flex-row-reverse"
                        )}
                        title={`Ordenar por ${c.encabezado.toLowerCase()}`}
                      >
                        <span>{texto}</span>
                        {activo ? (
                          orden!.direccion === "asc" ? (
                            <ArrowUpIcon className="size-3.5" aria-hidden />
                          ) : (
                            <ArrowDownIcon className="size-3.5" aria-hidden />
                          )
                        ) : (
                          <ArrowUpDownIcon className="size-3.5 text-muted-foreground/60" aria-hidden />
                        )}
                      </button>
                    ) : (
                      texto
                    )}
                  </TableHead>
                )
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filasPagina.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columnas.length + (prefijo ? 1 : 0)}
                  className="py-8 text-center whitespace-normal text-muted-foreground"
                >
                  {vacio}
                </TableCell>
              </TableRow>
            ) : (
              filasPagina.map((fila, i) => (
                <TableRow key={claveFila(fila, desde + i)} className={claseFila?.(fila)}>
                  {prefijo && <TableCell>{prefijo.celda(fila)}</TableCell>}
                  {columnas.map((c) => (
                    <TableCell
                      key={c.id}
                      className={cn(c.numerica && "text-right font-mono tabular-nums")}
                    >
                      {c.celda(fila, desde + i)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <p aria-live="polite">
          {total === 0
            ? "Sin filas"
            : `Filas ${formatoEntero(desde + 1)}–${formatoEntero(Math.min(desde + tamano, total))} de ${formatoEntero(total)}`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5">
            Filas por página
            <NativeSelect
              className="h-7 w-16"
              value={tamano}
              onChange={(e) => irA(0, Number(e.target.value))}
            >
              {TAMANOS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </NativeSelect>
          </label>
          <span>
            Página {formatoEntero(pagina + 1)} de {formatoEntero(totalPaginas)}
          </span>
          <div className="flex gap-1">
            <Button variant="outline" size="icon-sm" onClick={() => irA(0)} disabled={pagina === 0} aria-label="Primera página">
              <ChevronsLeftIcon />
            </Button>
            <Button variant="outline" size="icon-sm" onClick={() => irA(pagina - 1)} disabled={pagina === 0} aria-label="Página anterior">
              <ChevronLeftIcon />
            </Button>
            <Button variant="outline" size="icon-sm" onClick={() => irA(pagina + 1)} disabled={pagina >= totalPaginas - 1} aria-label="Página siguiente">
              <ChevronRightIcon />
            </Button>
            <Button variant="outline" size="icon-sm" onClick={() => irA(totalPaginas - 1)} disabled={pagina >= totalPaginas - 1} aria-label="Última página">
              <ChevronsRightIcon />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

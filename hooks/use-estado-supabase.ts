"use client"

import * as React from "react"

export type EstadoSupabase = {
  configurado: boolean
  tablaDisponible: boolean
  cargaPermitida: boolean
  total?: number | null
  mensaje: string | null
}

/** Consulta /api/supabase/estado al montar y cada vez que cambia `version`. */
export function useEstadoSupabase(version: number) {
  const [estado, setEstado] = React.useState<EstadoSupabase | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [recarga, setRecarga] = React.useState(0)

  React.useEffect(() => {
    let vigente = true
    fetch("/api/supabase/estado", { cache: "no-store" })
      .then((r) => r.json())
      .then((e: EstadoSupabase) => {
        if (!vigente) return
        setEstado(e)
        setError(null)
      })
      .catch(() => vigente && setError("No se pudo consultar el estado de Supabase."))
    return () => {
      vigente = false
    }
  }, [version, recarga])

  return { estado, error, recargar: () => setRecarga((n) => n + 1) }
}

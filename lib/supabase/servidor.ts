import "server-only"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

export const TABLA_MEDICIONES = "mediciones_meteorologicas"

/** Mensaje que se muestra cuando faltan variables de entorno. */
export const MENSAJE_SIN_CREDENCIALES =
  "Supabase no está configurado: define SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL) y SUPABASE_SECRET_KEY en .env.local y reinicia el servidor."

let cliente: SupabaseClient | null = null

/**
 * Cliente con la clave secreta (rol service_role). Solo se importa desde
 * código de servidor: "server-only" hace fallar el build si un componente
 * de cliente lo importa. La clave nunca se registra en logs.
 */
export function clienteSupabaseServidor(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const clave = process.env.SUPABASE_SECRET_KEY
  if (!url || !clave) return null
  cliente ??= createClient(url, clave, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cliente
}

/**
 * Sin autenticación en el proyecto, la escritura solo se permite en
 * desarrollo. En producción hay que proteger el endpoint (o activar
 * explícitamente ETL_PERMITIR_CARGA=true bajo tu responsabilidad).
 */
export function cargaPermitida(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.ETL_PERMITIR_CARGA === "true"
  )
}

/** Traduce errores de PostgREST a mensajes útiles sin filtrar secretos. */
export function describirErrorSupabase(error: {
  code?: string
  message?: string
}): string {
  if (error.code === "PGRST205" || error.code === "42P01") {
    return `La tabla ${TABLA_MEDICIONES} no existe. Ejecuta la migración de supabase/migrations en el SQL Editor de Supabase.`
  }
  if (error.code === "42501") {
    return "Permiso denegado en la tabla. Revisa los GRANT de la migración y que uses la clave secreta."
  }
  if (error.code === "23514") {
    return `Un registro incumple una restricción CHECK: ${error.message ?? ""}`
  }
  return `Error de Supabase${error.code ? ` (${error.code})` : ""}: ${error.message ?? "desconocido"}`
}

export function respuestaError(mensaje: string, status: number) {
  return Response.json({ error: mensaje }, { status })
}

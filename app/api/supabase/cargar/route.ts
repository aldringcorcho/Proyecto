import { validarPeticionCarga } from "@/lib/etl/carga"
import { leerJsonLimitado } from "@/lib/supabase/peticion"
import {
  cargaPermitida,
  clienteSupabaseServidor,
  describirErrorSupabase,
  MENSAJE_SIN_CREDENCIALES,
  respuestaError,
  TABLA_MEDICIONES,
} from "@/lib/supabase/servidor"

/** Upsert de un lote (máx. 500) por (ciudad, fecha_hora). */
export async function POST(request: Request) {
  if (!cargaPermitida()) {
    return respuestaError(
      "La carga está deshabilitada en producción hasta que el endpoint se proteja con autenticación.",
      403
    )
  }
  const supabase = clienteSupabaseServidor()
  if (!supabase) return respuestaError(MENSAJE_SIN_CREDENCIALES, 503)

  const lectura = await leerJsonLimitado(request)
  if (!lectura.ok) return respuestaError(lectura.error, lectura.status)

  const validacion = validarPeticionCarga(lectura.cuerpo)
  if (!validacion.ok) return respuestaError(validacion.error, 400)

  const { error, count } = await supabase
    .from(TABLA_MEDICIONES)
    .upsert(validacion.valor, { onConflict: "ciudad,fecha_hora", count: "exact" })

  if (error) {
    console.error("Error en upsert:", error.code, error.message)
    return respuestaError(describirErrorSupabase(error), 502)
  }

  // PostgREST no distingue insertadas de actualizadas en un upsert: solo
  // informa del total de filas afectadas (o nada si no se pudo contar).
  return Response.json({
    recibidos: validacion.valor.length,
    procesados: count ?? null,
  })
}

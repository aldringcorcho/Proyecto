import {
  cargaPermitida,
  clienteSupabaseServidor,
  describirErrorSupabase,
  MENSAJE_SIN_CREDENCIALES,
  TABLA_MEDICIONES,
} from "@/lib/supabase/servidor"

/** Indica si Supabase está configurado y la tabla destino es accesible. */
export async function GET() {
  const supabase = clienteSupabaseServidor()
  if (!supabase) {
    return Response.json({
      configurado: false,
      tablaDisponible: false,
      cargaPermitida: cargaPermitida(),
      mensaje: MENSAJE_SIN_CREDENCIALES,
    })
  }
  // GET con limit(1) en lugar de HEAD: una respuesta HEAD 404 no trae cuerpo
  // y supabase-js no la reporta como error.
  const { error, count } = await supabase
    .from(TABLA_MEDICIONES)
    .select("id", { count: "exact" })
    .limit(1)
  return Response.json({
    configurado: true,
    tablaDisponible: !error,
    cargaPermitida: cargaPermitida(),
    total: error ? null : count,
    mensaje: error ? describirErrorSupabase(error) : null,
  })
}

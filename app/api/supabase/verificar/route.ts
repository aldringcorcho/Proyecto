import { validarPeticionVerificacion } from "@/lib/etl/carga"
import { claveMedicion } from "@/lib/etl/limpieza"
import { leerJsonLimitado } from "@/lib/supabase/peticion"
import {
  clienteSupabaseServidor,
  describirErrorSupabase,
  MENSAJE_SIN_CREDENCIALES,
  respuestaError,
  TABLA_MEDICIONES,
} from "@/lib/supabase/servidor"

/** Fechas por consulta: mantiene la URL de PostgREST en un tamaño seguro. */
const FECHAS_POR_CONSULTA = 100

/** Devuelve cuáles de las claves recibidas existen en la tabla destino. */
export async function POST(request: Request) {
  const supabase = clienteSupabaseServidor()
  if (!supabase) return respuestaError(MENSAJE_SIN_CREDENCIALES, 503)

  const lectura = await leerJsonLimitado(request)
  if (!lectura.ok) return respuestaError(lectura.error, lectura.status)

  const validacion = validarPeticionVerificacion(lectura.cuerpo)
  if (!validacion.ok) return respuestaError(validacion.error, 400)

  const porCiudad = new Map<string, string[]>()
  for (const c of validacion.valor) {
    porCiudad.set(c.ciudad, [...(porCiudad.get(c.ciudad) ?? []), c.fecha_hora])
  }

  const encontradas: string[] = []
  for (const [ciudad, fechas] of porCiudad) {
    for (let i = 0; i < fechas.length; i += FECHAS_POR_CONSULTA) {
      const { data, error } = await supabase
        .from(TABLA_MEDICIONES)
        .select("ciudad, fecha_hora")
        .eq("ciudad", ciudad)
        .in("fecha_hora", fechas.slice(i, i + FECHAS_POR_CONSULTA))
      if (error) {
        console.error("Error al verificar:", error.code, error.message)
        return respuestaError(describirErrorSupabase(error), 502)
      }
      for (const fila of data) {
        encontradas.push(
          claveMedicion({
            ciudad: fila.ciudad,
            fecha_hora: new Date(fila.fecha_hora).toISOString(),
          })
        )
      }
    }
  }

  return Response.json({ encontradas })
}

import { NOMBRES_CIUDADES } from "@/lib/etl/ciudades"
import { normalizarFechaHora } from "@/lib/etl/carga"
import {
  clienteSupabaseServidor,
  describirErrorSupabase,
  MENSAJE_SIN_CREDENCIALES,
  respuestaError,
  TABLA_MEDICIONES,
} from "@/lib/supabase/servidor"

const COLUMNAS_ORDEN = [
  "ciudad",
  "fecha_hora",
  "temperatura_c",
  "humedad_pct",
  "precipitacion_mm",
  "importado_en",
] as const
const TAMANOS_PAGINA = [10, 25, 50, 100]

/** Lectura paginada de los registros persistidos. */
export async function GET(request: Request) {
  const supabase = clienteSupabaseServidor()
  if (!supabase) return respuestaError(MENSAJE_SIN_CREDENCIALES, 503)

  const p = new URL(request.url).searchParams
  const ciudad = p.get("ciudad") ?? ""
  const desde = p.get("desde") ?? ""
  const hasta = p.get("hasta") ?? ""
  const orden = p.get("orden") ?? "fecha_hora"
  const ascendente = p.get("direccion") !== "desc"
  const pagina = Number(p.get("pagina") ?? 0)
  const tamano = Number(p.get("tamano") ?? 25)

  if (ciudad && !NOMBRES_CIUDADES.includes(ciudad)) {
    return respuestaError("Ciudad no válida.", 400)
  }
  if (!(COLUMNAS_ORDEN as readonly string[]).includes(orden)) {
    return respuestaError("Columna de ordenación no válida.", 400)
  }
  if (!Number.isInteger(pagina) || pagina < 0 || !TAMANOS_PAGINA.includes(tamano)) {
    return respuestaError("Paginación no válida.", 400)
  }
  const desdeIso = desde ? normalizarFechaHora(desde) : null
  const hastaIso = hasta ? normalizarFechaHora(hasta) : null
  if ((desde && !desdeIso) || (hasta && !hastaIso)) {
    return respuestaError("Las fechas deben ser ISO 8601 con zona horaria.", 400)
  }

  let consulta = supabase
    .from(TABLA_MEDICIONES)
    .select("id, ciudad, fecha_hora, temperatura_c, humedad_pct, precipitacion_mm, importado_en", {
      count: "exact",
    })
  if (ciudad) consulta = consulta.eq("ciudad", ciudad)
  if (desdeIso) consulta = consulta.gte("fecha_hora", desdeIso)
  if (hastaIso) consulta = consulta.lte("fecha_hora", hastaIso)

  // ORDER BY explícito: sin él, Postgres no garantiza ningún orden.
  const { data, error, count } = await consulta
    .order(orden, { ascending: ascendente })
    .order("id", { ascending: true })
    .range(pagina * tamano, pagina * tamano + tamano - 1)

  if (error) {
    console.error("Error al leer mediciones:", error.code, error.message)
    return respuestaError(describirErrorSupabase(error), 502)
  }
  return Response.json({ filas: data, total: count ?? null })
}

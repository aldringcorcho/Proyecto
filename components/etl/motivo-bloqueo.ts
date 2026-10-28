import type { EstadoSupabase } from "@/hooks/use-estado-supabase"
import type { PipelineEtl } from "@/hooks/use-pipeline-etl"

/** Motivo por el que no se puede subir ahora mismo, o null si se puede. */
export function motivoBloqueo(etl: PipelineEtl, supabase: EstadoSupabase | null): string | null {
  if (!etl.procesamiento) return "Primero descarga los datos con «Extraer datos»."
  if (etl.extraccion?.estado === "en_curso") return "Espera a que termine la extracción."
  if (etl.carga?.enCurso) return null
  if (!supabase) return "Comprobando la conexión con Supabase…"
  if (!supabase.cargaPermitida) {
    return "En la versión publicada no se puede guardar, por seguridad (la app no tiene inicio de sesión). Hazlo desde tu ordenador con «npm run dev»."
  }
  if (!supabase.configurado || !supabase.tablaDisponible) return supabase.mensaje
  if (etl.filtrado.errores.length > 0) return "Corrige los filtros no válidos."
  if (etl.vistaPrevia.length === 0) {
    return etl.seleccion.fueraDeFiltros > 0
      ? "Las filas seleccionadas no cumplen los filtros actuales: ajusta los filtros o selecciona otras."
      : "No hay filas seleccionadas. Marca filas en «Válidos y selección» o selecciona todas las filtradas."
  }
  return null
}

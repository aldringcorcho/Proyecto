import {
  AlertTriangleIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  LoaderCircleIcon,
} from "lucide-react"
import { cn } from "cn"

import type { EstadoFase } from "@/lib/etl/tipos"

const ESTADOS: Record<
  EstadoFase,
  { texto: string; icono: typeof CircleCheckIcon; clase: string }
> = {
  pendiente: {
    texto: "Pendiente",
    icono: CircleDashedIcon,
    clase: "border-border text-muted-foreground",
  },
  en_curso: {
    texto: "En curso",
    icono: LoaderCircleIcon,
    clase: "border-sky-600/40 bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  },
  completada: {
    texto: "Completada",
    icono: CircleCheckIcon,
    clase:
      "border-emerald-600/40 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  },
  error: {
    texto: "Con errores",
    icono: AlertTriangleIcon,
    clase: "border-destructive/50 bg-destructive/10 text-destructive",
  },
}

/** Estado con icono y texto: no depende solo del color. */
export function EstadoBadge({
  estado,
  texto,
  className,
}: {
  estado: EstadoFase
  texto?: string
  className?: string
}) {
  const e = ESTADOS[estado]
  const Icono = e.icono
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs font-medium whitespace-nowrap",
        e.clase,
        className
      )}
    >
      <Icono className={cn("size-3.5", estado === "en_curso" && "animate-spin")} aria-hidden />
      {texto ?? e.texto}
    </span>
  )
}

export function Nota({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-xs leading-relaxed text-muted-foreground", className)}>{children}</p>
}

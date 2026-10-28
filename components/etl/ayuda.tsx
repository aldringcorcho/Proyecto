"use client"

import * as React from "react"
import { Popover } from "@base-ui/react/popover"
import { CircleHelpIcon } from "lucide-react"

/** Botón «?» que abre una explicación en lenguaje sencillo. */
export function Ayuda({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={`¿Qué es esto? ${titulo}`}
        className="inline-flex size-7 shrink-0 translate-y-[-2px] items-center justify-center rounded-full align-middle text-azul transition-colors hover:bg-azul/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <CircleHelpIcon className="size-5" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} className="z-[1200]">
          <Popover.Popup className="vidrio w-80 max-w-[calc(100vw-2rem)] rounded-2xl p-4 text-base leading-relaxed font-normal tracking-normal text-foreground outline-none">
            <Popover.Title className="mb-1.5 text-base font-semibold text-marino">{titulo}</Popover.Title>
            <Popover.Description render={<div />} className="flex flex-col gap-2 text-sm text-foreground/85">
              {children}
            </Popover.Description>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

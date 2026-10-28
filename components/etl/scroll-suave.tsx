"use client"

import "lenis/dist/lenis.css"

import * as React from "react"
import Lenis from "lenis"

let lenis: Lenis | null = null

/**
 * Lleva la página a un elemento, un ancla ("#pipeline") o una posición, con el
 * mismo desplazamiento suave que la rueda. El hueco para el menú flotante sale
 * del `scroll-margin-top` de cada sección, que Lenis respeta. Sin Lenis (p. ej.
 * antes de montarse) hace un salto normal.
 */
export function desplazarA(destino: HTMLElement | string | number) {
  if (lenis) {
    lenis.scrollTo(destino, { duration: 1.4 })
    return
  }
  if (typeof destino === "number") window.scrollTo({ top: destino })
  else (typeof destino === "string" ? document.querySelector(destino) : destino)?.scrollIntoView()
}

/**
 * Scroll suave con inercia para toda la página (rueda y trackpad). Los enlaces
 * internos usan `desplazarA`. Con «reducir movimiento» Lenis vuelve al
 * desplazamiento normal.
 */
export function ScrollSuave() {
  React.useEffect(() => {
    lenis = new Lenis({
      autoRaf: true,
      // Cuanto más bajo, más suave y con más inercia (por defecto 0,1).
      lerp: 0.075,
      // El JSON, las tablas y la ficha del mapa siguen con su propio scroll.
      allowNestedScroll: true,
      stopInertiaOnNavigate: true,
    })
    return () => {
      lenis?.destroy()
      lenis = null
    }
  }, [])
  return null
}

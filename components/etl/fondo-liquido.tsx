"use client"

import { ShaderMetal } from "@/components/ui/shader-metal"

/** Tono de las cintas de metal: un Smart Blue aclarado, para que reflejen como cromo azulado. */
const TINTE_METAL = "#8fbbea"

/**
 * Fondo «líquido»: una malla de degradados de la paleta, manchas de color que se
 * desplazan despacio, cintas de metal líquido (WebGL) que siguen al cursor y un
 * grano muy fino. También define el filtro SVG de refracción que usan las piezas
 * `vidrio-liquido`. Es puramente decorativo y se queda quieto con «reducir movimiento».
 */
const MANCHAS = [
  { color: "rgb(3 83 164 / 0.38)", tamano: "52rem", posicion: "-14% auto auto -12%", retraso: "0s" },
  { color: "rgb(51 65 92 / 0.32)", tamano: "46rem", posicion: "6% -14% auto auto", retraso: "-8s" },
  { color: "rgb(151 157 172 / 0.6)", tamano: "40rem", posicion: "auto auto 2% 14%", retraso: "-15s" },
  { color: "rgb(92 103 125 / 0.3)", tamano: "38rem", posicion: "auto -8% -12% auto", retraso: "-22s" },
  { color: "rgb(143 187 234 / 0.45)", tamano: "30rem", posicion: "38% auto auto 34%", retraso: "-5s" },
  { color: "rgb(255 255 255 / 0.8)", tamano: "34rem", posicion: "auto 30% 28% auto", retraso: "-12s" },
]

// Grano: ruido fractal en un SVG diminuto, repetido por toda la pantalla.
const GRANO =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E\")"

export function FondoLiquido() {
  return (
    <>
      <div aria-hidden className="fondo-malla pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        {MANCHAS.map((m, i) => (
          <span
            key={i}
            className="mancha-liquida absolute rounded-full"
            style={{
              // Un degradado que se desvanece hacia el borde da el mismo aspecto que un desenfoque, sin filtro.
              background: `radial-gradient(circle closest-side, ${m.color}, transparent)`,
              width: m.tamano,
              height: m.tamano,
              inset: m.posicion,
              animationDelay: m.retraso,
            }}
          />
        ))}
        {/* Cintas de metal líquido: se pausan fuera de pantalla y se quedan quietas con «reducir movimiento». */}
        {/* Al 34 % de resolución y con un desenfoque suave: el fondo acompaña sin robar protagonismo. */}
        <div className="absolute inset-0 opacity-75 blur-[7px]">
          <ShaderMetal color={TINTE_METAL} ribbons={3} speed={0.25} iridescence={0.08} theme="light" resolution={0.34} />
        </div>
        <span className="absolute inset-0 bg-prusia-3/[0.07]" />
        <span className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: GRANO }} />
      </div>

      {/* Filtro de refracción: deforma ligeramente lo que se ve detrás del vidrio, como un cristal curvo. */}
      <svg aria-hidden width="0" height="0" className="absolute">
        <filter id="refraccion-vidrio" x="0%" y="0%" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.018" numOctaves="2" seed="7" result="ruido" />
          <feGaussianBlur in="ruido" stdDeviation="2.5" result="ondas" />
          <feDisplacementMap in="SourceGraphic" in2="ondas" scale="38" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
    </>
  )
}

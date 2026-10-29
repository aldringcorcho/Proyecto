# Pipeline ETL: Open-Meteo → Supabase

Práctica 1 de Big Data. La aplicación extrae mediciones horarias reales de la
[API histórica de Open-Meteo](https://open-meteo.com/en/docs/historical-weather-api)
(temperatura, humedad relativa y precipitación) de Barcelona, Madrid, Sevilla, Bilbao y
Valencia. Después las transforma, limpia y filtra, y carga en Supabase solo los registros
que elijas. En cada fase se puede ver qué les ocurre a los datos.

Stack: Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui (Base UI) ·
supabase-js · Leaflet · Lenis · Vitest.

## Instalación y configuración

```bash
npm install
cp .env.example .env.local   # y rellena los valores
```

| Variable | Dónde obtenerla | Notas |
| --- | --- | --- |
| `SUPABASE_URL` | Project Settings → API | También se acepta `NEXT_PUBLIC_SUPABASE_URL`. |
| `SUPABASE_SECRET_KEY` | Project Settings → API Keys (`sb_secret_…`) | Solo la usa el servidor. Nunca lleva `NEXT_PUBLIC_`. |
| `ETL_PERMITIR_CARGA` | — | Opcional. Si vale `true`, permite escribir en producción (ver Seguridad). |

Crea la tabla ejecutando la migración
[`supabase/migrations/20261026120000_mediciones_meteorologicas.sql`](supabase/migrations/20261026120000_mediciones_meteorologicas.sql),
en el **SQL Editor** de Supabase o con la CLI (`supabase db push`).

## Ejecución

```bash
npm run dev               # http://localhost:5000
npm test                  # pruebas unitarias (fixtures controlados, sin red)
npm run test:integracion  # pruebas contra Open-Meteo y Supabase reales
npm run typecheck && npm run lint && npm run build
```

## Uso

Al abrir la app, una pantalla de bienvenida pregunta cómo quieres usarla. Se puede
cambiar en cualquier momento con el interruptor flotante de arriba.

- **Vista sencilla** («No sé nada del tema»): un asistente de 3 pasos.
  1. **Elegir** ciudades (con botones o en un mapa de puntos de España) y un periodo.
  2. **Ver el resultado**: una tarjeta por ciudad con la temperatura media, máxima y
     mínima, la lluvia total y la humedad, en lenguaje cotidiano.
  3. **Guardar** en la base de datos con un solo botón, con confirmación final.
- **Vista completa** («Sé de datos o de programación»): todo el detalle técnico.
  - Configuración con un mapa de Leaflet que muestra las provincias y una ficha por ciudad
    con la petición real enviada a Open-Meteo.
  - Mapa de calor de la temperatura diaria: azul por debajo de 20 °C y naranja por encima.
  - Las 5 fases del pipeline con una muestra real de los datos de cada una.
  - Pestañas de inspección: JSON original, transformados, válidos y selección, vista
    previa de la carga, rechazados y datos en Supabase.

## El pipeline

1. **Extracción.** Se hace una petición por ciudad, en secuencia, con `timezone=UTC`,
   `temperature_unit=celsius` y `precipitation_unit=mm`. Cada extracción abarca como
   máximo 31 días. El JSON original se guarda en memoria y puede descargarse. Si una
   ciudad falla, se reintenta solo esa ciudad, y su respuesta sustituye a la anterior.
2. **Transformación.** Los arrays paralelos de `hourly` (`time[i]`, `temperature_2m[i]`…)
   se convierten en un registro por ciudad y hora: `ciudad, fecha_hora, temperatura_c,
   humedad_pct, precipitacion_mm`. Las horas se interpretan explícitamente como UTC.
   Si los arrays de una respuesta no tienen la misma longitud, se rechazan todas sus filas.
3. **Limpieza.** Se rechaza cada registro sin ciudad, con una fecha no válida o con alguna
   medición que no sea un número finito: `null`, `""`, el texto `"21.5"` o un valor
   ausente **nunca** se convierten en 0. La humedad debe estar entre 0 y 100 y la
   precipitación debe ser ≥ 0. Ante duplicados por `(ciudad, fecha_hora)` se conserva la
   primera aparición válida. Cada rechazo guarda su motivo.
4. **Filtrado y selección.** El orden es `válidos → filtros → ordenación → selección →
   carga`. Se suben solo las filas seleccionadas que siguen cumpliendo los filtros, y
   cambiar los filtros nunca selecciona filas nuevas.
5. **Carga.** Al pulsar «Subir» se congela una copia del conjunto. Se envía en lotes de
   hasta 500 a `POST /api/supabase/cargar`, que hace un *upsert* por `(ciudad, fecha_hora)`.
   Después, `POST /api/supabase/verificar` comprueba que cada clave existe en destino. Si
   un lote falla, se reintentan solo los fallidos.

Una base de datos no conserva el orden de inserción; la pestaña «Datos en Supabase» lee
siempre con `ORDER BY`.

## Seguridad

- Toda la lectura y escritura de Supabase pasa por route handlers del servidor
  (`app/api/supabase/*`) con la clave secreta, desde `lib/supabase/servidor.ts`
  (marcado `server-only`). La clave nunca llega al navegador ni a los logs.
- El servidor vuelve a validar cada lote: tamaño máximo de 256 KB, entre 1 y 500
  registros, campos y ciudades permitidos, tipos, rangos, duplicados y `Content-Type`.
- La tabla tiene **RLS activado y ninguna política**: `anon` y `authenticated` no pueden
  leer ni escribir.
- La app no tiene autenticación, así que la carga solo se permite con `next dev`. En
  producción (por ejemplo, Vercel) el endpoint de carga responde 403, salvo que se active
  `ETL_PERMITIR_CARGA=true`.

## Estructura

```
app/api/supabase/   cargar · verificar · mediciones · estado
lib/etl/            lógica pura y probada (extracción, transformación, limpieza, filtrado, carga)
                    + contornos de provincias y de España (OpenStreetMap, ODbL)
lib/supabase/       cliente de servidor y lectura limitada de peticiones
hooks/              estado del pipeline en el cliente
components/etl/     interfaz: vista sencilla, vista completa, bienvenida, mapas, pipeline, pestañas
components/ui/      componentes base (shadcn) y el fondo animado (shader-metal)
tests/              pruebas unitarias con fixtures + tests/integracion (servicios reales)
supabase/migrations migración SQL
```

## Resumen de la entrega

### Lo construido

- **Pipeline ETL completo** de Open-Meteo a Supabase: extracción por ciudad con reintento,
  transformación de arrays paralelos en UTC, limpieza con motivos de rechazo, filtrado,
  ordenación y selección, y carga por lotes de 500 con *upsert* y verificación posterior.
- **Migración SQL** con restricción única `(ciudad, fecha_hora)`, comprobaciones de
  rangos, índice por fecha y RLS sin políticas públicas.
- **API de servidor** (cargar, verificar, mediciones y estado) con validación de tamaño,
  de tipos y de rangos, y bloqueo de escritura en producción.
- **Interfaz con dos vistas** y pantalla de bienvenida:
  - Una sencilla, tipo asistente, pensada para quien no conoce el tema.
  - Una completa, que muestra cada fase con datos reales: mapas, mapa de calor, muestras
    por fase, JSON con vista previa, tablas paginadas y lectura de Supabase.

### Pruebas realizadas

| Prueba | Resultado |
| --- | --- |
| `npm test`: 25 pruebas unitarias (configuración, transformación, limpieza con `null` y valores no numéricos, duplicados, filtros y selección, lotes, validación del servidor y vista previa del JSON) | ✅ 25/25 |
| `npm run test:integracion`: 3 pruebas contra Open-Meteo real (24 registros en UTC por día, rechazo de `null` reales, motivo de error de la API) | ✅ 3/3 |
| `npm run test:integracion`: 3 pruebas contra Supabase real (720 registros en 2 lotes sin duplicar en una segunda carga, fallo parcial con reintento solo del lote fallido, restricciones de la base de datos y clave pública sin permiso de escritura) | ✅ 3/3 |
| `npm run typecheck`, `npm run lint`, `npm run build` | ✅ sin errores |
| Pruebas manuales en el navegador de las dos vistas (extracción real de 3600 registros, selección, carga verificada, mapas y cambio de vista) | ✅ |

### Bloqueos pendientes y limitaciones

- **Sin autenticación.** En la versión publicada no se puede guardar en Supabase (responde
  403). Para hacerlo en producción habría que añadir inicio de sesión (por ejemplo,
  Supabase Auth) y proteger también los endpoints de lectura. `ETL_PERMITIR_CARGA=true`
  quita el bloqueo, pero deja que cualquier visitante escriba en la tabla.
- **Retraso de Open-Meteo.** Los últimos ~5 días pueden llegar incompletos, y esas horas se
  rechazan en la limpieza. Hasta ahora la API no ha devuelto `null` reales, así que ese
  caso se prueba con fixtures controlados.
- **Efectos visuales.** El fondo animado usa WebGL y la refracción del vidrio solo se ve
  en Chrome y Edge; en el resto de navegadores queda el vidrio normal. Con «reducir
  movimiento» las animaciones se detienen.

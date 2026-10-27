# Pipeline ETL: Open-Meteo → Supabase

Práctica 1 de Big Data. Esta aplicación extrae mediciones horarias reales de la
[API histórica de Open-Meteo](https://open-meteo.com/en/docs/historical-weather-api).
Después las transforma, limpia y filtra, y carga en Supabase solo los registros
que elijas. En cada fase puedes ver qué les ocurre a los datos.

Stack: Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui (Base UI) · supabase-js · Vitest.

## Instalación y configuración

```bash
npm install
cp .env.example .env.local   # y rellena los valores
```

| Variable | Dónde obtenerla | Notas |
| --- | --- | --- |
| `SUPABASE_URL` | Project Settings → API | También se acepta `NEXT_PUBLIC_SUPABASE_URL`. |
| `SUPABASE_SECRET_KEY` | Project Settings → API Keys (`sb_secret_…`) | Solo la usa el servidor. Nunca lleva `NEXT_PUBLIC_`. |
| `ETL_PERMITIR_CARGA` | — | Opcional. Si vale `true`, se permite escribir en producción (ver Seguridad). |

Crea la tabla ejecutando la migración
[`supabase/migrations/20261026120000_mediciones_meteorologicas.sql`](supabase/migrations/20261026120000_mediciones_meteorologicas.sql).
Puedes hacerlo de dos formas:

- En el **SQL Editor** de Supabase.
- Con la CLI: `supabase db push`.

## Ejecución

```bash
npm run dev               # http://localhost:5000
npm test                  # pruebas unitarias (fixtures controlados, sin red)
npm run test:integracion  # pruebas contra Open-Meteo y Supabase reales
npm run typecheck && npm run lint && npm run build
```

## El pipeline

1. **Extracción.** Se hace una petición por ciudad, en secuencia, con
   `timezone=UTC`, `temperature_unit=celsius` y `precipitation_unit=mm`.
   - Cada extracción abarca como máximo 31 días.
   - El JSON original se guarda en memoria durante la sesión y puede descargarse.
   - Si una ciudad falla, se puede reintentar solo esa ciudad. Su respuesta
     *sustituye* a la anterior, así que no se duplican datos.
2. **Transformación.** Los arrays paralelos `hourly.time[i]`,
   `temperature_2m[i]`, etc. se convierten en un registro por ciudad y hora:
   `ciudad, fecha_hora, temperatura_c, humedad_pct, precipitacion_mm`.
   - Las horas `YYYY-MM-DDTHH:mm` se interpretan explícitamente como UTC
     (`Date.UTC`). No se usa `new Date(texto)`, que las tomaría como hora local.
   - Se comprueba que todos los arrays tengan la misma longitud. Si una
     respuesta no la tiene, se rechazan todas sus filas, porque ya no se puede
     garantizar qué valor corresponde a cada hora.
3. **Limpieza.** Se rechaza cada registro sin ciudad, con una fecha no válida o
   con alguna medición que no sea un número finito.
   - `null`, `""`, el texto `"21.5"` o un valor ausente **nunca** se convierten en 0.
   - La humedad debe estar entre 0 y 100. La precipitación debe ser ≥ 0.
   - La temperatura no se acota con umbrales arbitrarios.
   - **Duplicados** por (ciudad, fecha_hora): se conserva la *primera aparición
     válida* en el orden de extracción y las demás se rechazan indicando con qué
     índice coinciden.
   - Cada rechazo guarda su motivo.
4. **Filtrado y selección.** Las operaciones se aplican en este orden:
   `válidos → filtros → ordenación → selección → carga`.
   - La paginación solo afecta a la visualización.
   - Se suben solo las filas **seleccionadas que siguen cumpliendo los filtros**.
   - Cambiar los filtros nunca selecciona filas nuevas.
   - Los registros excluidos por los filtros no son rechazos: siguen siendo
     válidos.
5. **Carga.** Al pulsar «Subir N registros» se congela una copia del conjunto y
   de su orden.
   - Se envía en lotes de hasta 500 a `POST /api/supabase/cargar`, que hace un
     *upsert* por `(ciudad, fecha_hora)`.
   - Después, `POST /api/supabase/verificar` comprueba por lotes que cada clave
     existe en destino.
   - Si un lote falla, los anteriores conservan su estado y se pueden reintentar
     solo los fallidos.
   - Supabase devuelve el total de filas afectadas por el upsert, pero no
     distingue entre insertadas y actualizadas, así que la aplicación no inventa
     ese desglose.
   - `importado_en` refleja la primera inserción.

Una base de datos **no conserva el orden de inserción**. Para leer los datos
ordenados, cualquier consulta necesita `ORDER BY`, como hace la pestaña
«Datos en Supabase».

## Seguridad

- Toda la escritura y la lectura de Supabase pasan por route handlers de
  servidor (`app/api/supabase/*`). Usan la clave secreta desde
  `lib/supabase/servidor.ts`, que está marcado con `server-only`.
- La clave nunca llega al navegador ni aparece en los logs.
- El servidor vuelve a validar cada lote:
  - Tamaño máximo de 256 KB y entre 1 y 500 registros.
  - Campos permitidos y ciudades conocidas.
  - Tipos, rangos y claves duplicadas.
  - Exige `Content-Type: application/json`.
- La tabla tiene **RLS activado y ninguna política**: los roles `anon` y
  `authenticated` no pueden leer ni escribir.
- **El proyecto no tiene autenticación.** Por eso la carga solo se permite con
  `next dev`. En un despliegue de producción, como Vercel, el endpoint de carga
  responde 403. Antes de publicar la aplicación hay que añadir autenticación
  (por ejemplo, Supabase Auth) y proteger los endpoints `/api/supabase/*`,
  incluidos los de lectura. `ETL_PERMITIR_CARGA=true` desactiva este bloqueo,
  pero deja que cualquier visitante escriba en la tabla.

## Estructura

```
lib/etl/            lógica pura y probada: extracción, transformación, limpieza, filtrado, carga
lib/supabase/       cliente de servidor y lectura limitada de peticiones
app/api/supabase/   cargar · verificar · mediciones · estado
hooks/              estado del pipeline en el cliente
components/etl/     interfaz (configuración, pipeline, contadores, pestañas, tabla paginada)
tests/              pruebas unitarias con fixtures controlados + tests/integracion (servicios reales)
supabase/migrations migración SQL
```

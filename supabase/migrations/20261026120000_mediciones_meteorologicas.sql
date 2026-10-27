-- Tabla de destino del pipeline ETL Open-Meteo → Supabase.
-- Una fila por ciudad y hora (UTC). La clave natural (ciudad, fecha_hora)
-- permite hacer upsert sin duplicar registros al repetir una carga.

create table if not exists public.mediciones_meteorologicas (
  id bigint generated always as identity primary key,
  ciudad text not null,
  fecha_hora timestamptz not null,
  temperatura_c double precision not null,
  humedad_pct double precision not null,
  precipitacion_mm double precision not null,
  importado_en timestamptz not null default now(),

  constraint mediciones_meteorologicas_ciudad_fecha_hora_key
    unique (ciudad, fecha_hora),
  constraint mediciones_meteorologicas_ciudad_no_vacia
    check (length(btrim(ciudad)) > 0),
  -- double precision admite NaN e Infinity: se excluyen explícitamente.
  -- En PostgreSQL NaN se ordena por encima de cualquier número, así que
  -- "< 'infinity'" también lo rechaza.
  constraint mediciones_meteorologicas_temperatura_finita
    check (temperatura_c > '-infinity'::float8 and temperatura_c < 'infinity'::float8),
  constraint mediciones_meteorologicas_humedad_rango
    check (humedad_pct >= 0 and humedad_pct <= 100),
  constraint mediciones_meteorologicas_precipitacion_no_negativa
    check (precipitacion_mm >= 0 and precipitacion_mm < 'infinity'::float8)
);

comment on table public.mediciones_meteorologicas is
  'Mediciones horarias (UTC) extraídas de la API histórica de Open-Meteo.';
comment on column public.mediciones_meteorologicas.fecha_hora is
  'Inicio de la hora medida, en UTC.';
comment on column public.mediciones_meteorologicas.importado_en is
  'Momento de la primera inserción. Un upsert posterior no lo modifica.';

create index if not exists mediciones_meteorologicas_fecha_hora_idx
  on public.mediciones_meteorologicas (fecha_hora);

-- Seguridad: RLS activado y sin políticas. Los roles anon y authenticated
-- no pueden leer ni escribir. La aplicación accede solo desde el servidor
-- con la clave secreta (rol service_role, que ignora RLS).
alter table public.mediciones_meteorologicas enable row level security;

revoke all on table public.mediciones_meteorologicas from anon, authenticated;
grant select, insert, update on table public.mediciones_meteorologicas to service_role;

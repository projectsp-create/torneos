-- =====================================================================
--  PLATAFORMA DE TORNEOS — Esquema de base de datos (Supabase / Postgres)
--  Ejecutar UNA sola vez en: Supabase → SQL Editor → New query → Run
-- =====================================================================

-- ---------- Administradores (correo de quien puede editar) ----------
create table if not exists public.admins (
  email text primary key
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ---------- Torneos ----------
create table if not exists public.tournaments (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  sport       text not null default 'Vóley playa',
  location    text,
  status      text not null default 'borrador'
              check (status in ('borrador','inscripciones','en_curso','finalizado')),
  config      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- Equipos (públicos: nombre y grupo) ----------
create table if not exists public.teams (
  id             uuid primary key default gen_random_uuid(),
  tournament_id  uuid not null references public.tournaments(id) on delete cascade,
  name           text not null,
  group_label    text,
  sort_order     int not null default 0,
  created_at     timestamptz not null default now(),
  unique (tournament_id, name)
);

-- ---------- Datos privados del equipo (pagos) ----------
create table if not exists public.team_private (
  team_id         uuid primary key references public.teams(id) on delete cascade,
  amount_paid     numeric not null default 0,
  payment_method  text,
  payment_date    date,
  notes           text
);

-- ---------- Jugadores (privados: documento, celular) ----------
create table if not exists public.players (
  id        uuid primary key default gen_random_uuid(),
  team_id   uuid not null references public.teams(id) on delete cascade,
  name      text not null,
  document  text,
  sex       text check (sex in ('H','M')),
  phone     text,
  captain   boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- Partidos ----------
create table if not exists public.matches (
  id             uuid primary key default gen_random_uuid(),
  tournament_id  uuid not null references public.tournaments(id) on delete cascade,
  code           text,                     -- ej. G1, C1, S1, 3P, F
  phase          text not null default 'grupos'
                 check (phase in ('grupos','octavos','cuartos','semifinal','tercero','final')),
  group_label    text,
  round          int,
  court          text,
  scheduled_at   timestamptz,
  home_team_id   uuid references public.teams(id) on delete set null,
  away_team_id   uuid references public.teams(id) on delete set null,
  home_source    text,                     -- ej. 'W:C1' (ganador de C1), 'L:S1' (perdedor)
  away_source    text,
  sets           jsonb not null default '[]'::jsonb,   -- [[15,10],[12,15],[15,9]]
  status         text not null default 'pendiente'
                 check (status in ('pendiente','en_juego','finalizado','wo')),
  sort_order     int not null default 0,
  updated_at     timestamptz not null default now()
);

create index if not exists matches_tournament_idx on public.matches(tournament_id);
create index if not exists teams_tournament_idx   on public.teams(tournament_id);
create index if not exists players_team_idx       on public.players(team_id);

-- ---------- updated_at automático ----------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_touch_matches on public.matches;
create trigger trg_touch_matches before update on public.matches
for each row execute function public.touch_updated_at();

drop trigger if exists trg_touch_tournaments on public.tournaments;
create trigger trg_touch_tournaments before update on public.tournaments
for each row execute function public.touch_updated_at();

-- =====================================================================
--  SEGURIDAD (Row Level Security)
--  Público: puede LEER torneos publicados, equipos y partidos.
--  Solo administradores: escriben todo y leen pagos y jugadores.
-- =====================================================================
alter table public.admins       enable row level security;
alter table public.tournaments  enable row level security;
alter table public.teams        enable row level security;
alter table public.team_private enable row level security;
alter table public.players      enable row level security;
alter table public.matches      enable row level security;

drop policy if exists "admins_self" on public.admins;
create policy "admins_self" on public.admins for select using (public.is_admin());

drop policy if exists "t_read" on public.tournaments;
create policy "t_read" on public.tournaments for select
  using (status <> 'borrador' or public.is_admin());
drop policy if exists "t_write" on public.tournaments;
create policy "t_write" on public.tournaments for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "teams_read" on public.teams;
create policy "teams_read" on public.teams for select using (
  public.is_admin() or exists (select 1 from public.tournaments t
    where t.id = tournament_id and t.status <> 'borrador'));
drop policy if exists "teams_write" on public.teams;
create policy "teams_write" on public.teams for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "matches_read" on public.matches;
create policy "matches_read" on public.matches for select using (
  public.is_admin() or exists (select 1 from public.tournaments t
    where t.id = tournament_id and t.status <> 'borrador'));
drop policy if exists "matches_write" on public.matches;
create policy "matches_write" on public.matches for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "tp_admin" on public.team_private;
create policy "tp_admin" on public.team_private for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "players_admin" on public.players;
create policy "players_admin" on public.players for all
  using (public.is_admin()) with check (public.is_admin());

-- Permisos de la API (las reglas de arriba siguen mandando)
grant usage on schema public to anon, authenticated;
grant select on public.tournaments, public.teams, public.matches to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function public.is_admin() to anon, authenticated;

-- Tiempo real para el panel del organizador
do $$ begin
  alter publication supabase_realtime add table public.matches;
exception when others then null; end $$;

-- =====================================================================
--  TU CORREO DE ORGANIZADOR (el mismo del usuario creado en Authentication)
-- =====================================================================
insert into public.admins(email) values ('CAMBIA_ESTE_CORREO@ejemplo.com')
on conflict do nothing;

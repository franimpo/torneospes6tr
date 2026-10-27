-- Ejecutar en SQL Editor de Supabase. Proyecto NUEVO: no importa datos de la versión PHP.
create extension if not exists pgcrypto;

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  season text not null default '',
  max_participants integer not null check (max_participants between 2 and 64),
  format text not null default 'single' check (format in ('single', 'double')),
  status text not null default 'active' check (status in ('active', 'finished')),
  created_at timestamptz not null default now()
);
create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  player_name text not null check (char_length(btrim(player_name)) between 1 and 80),
  team_name text not null check (char_length(btrim(team_name)) between 1 and 80),
  created_at timestamptz not null default now(),
  unique(tournament_id, player_name)
);
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  round_number integer not null check (round_number > 0),
  home_id uuid not null references public.participants(id) on delete cascade,
  away_id uuid not null references public.participants(id) on delete cascade,
  home_score integer check (home_score between 0 and 99),
  away_score integer check (away_score between 0 and 99),
  created_at timestamptz not null default now(),
  check (home_id <> away_id),
  check ((home_score is null and away_score is null) or (home_score is not null and away_score is not null)),
  unique(tournament_id, round_number, home_id, away_id)
);
create index if not exists ix_participants_tournament on public.participants(tournament_id);
create index if not exists ix_matches_tournament_round on public.matches(tournament_id, round_number);

alter table public.tournaments enable row level security;
alter table public.participants enable row level security;
alter table public.matches enable row level security;

-- Lectura pública; escritura denegada para anon y authenticated (sin policies INSERT/UPDATE/DELETE).
drop policy if exists "public_read_tournaments" on public.tournaments;
create policy "public_read_tournaments" on public.tournaments for select to anon, authenticated using (true);
drop policy if exists "public_read_participants" on public.participants;
create policy "public_read_participants" on public.participants for select to anon, authenticated using (true);
drop policy if exists "public_read_matches" on public.matches;
create policy "public_read_matches" on public.matches for select to anon, authenticated using (true);

-- Rechazar llamadas directas de escritura con claves públicas; solo Edge Function service_role puede escribir.
revoke insert, update, delete, truncate on public.tournaments, public.participants, public.matches from anon, authenticated;
grant select on public.tournaments, public.participants, public.matches to anon, authenticated;

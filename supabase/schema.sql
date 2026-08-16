create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 30),
  is_commissioner boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_on date not null,
  ends_on date not null,
  is_active boolean not null default false
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  provider_id integer unique,
  name text not null unique,
  short_name text not null,
  crest_url text,
  league_position smallint,
  recent_form text[] not null default '{}'
);

create table public.fixtures (
  id uuid primary key default gen_random_uuid(),
  provider_id integer not null unique,
  season_id uuid not null references public.seasons on delete cascade,
  home_team_id uuid not null references public.teams,
  away_team_id uuid not null references public.teams,
  kickoff_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'finished', 'postponed', 'cancelled')),
  home_score smallint check (home_score >= 0),
  away_score smallint check (away_score >= 0),
  created_at timestamptz not null default now()
);

create table public.predictions (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.fixtures on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  home_score smallint not null check (home_score between 0 and 20),
  away_score smallint not null check (away_score between 0 and 20),
  is_super_pick boolean not null default false,
  points smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fixture_id, user_id)
);

create table public.survivor_rounds (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons on delete cascade,
  round_number smallint not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  unique (season_id, round_number)
);

create table public.survivor_picks (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.survivor_rounds on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  team_id uuid not null references public.teams,
  created_at timestamptz not null default now(),
  unique (round_id, user_id)
);

alter table public.profiles enable row level security;
alter table public.seasons enable row level security;
alter table public.teams enable row level security;
alter table public.fixtures enable row level security;
alter table public.predictions enable row level security;
alter table public.survivor_rounds enable row level security;
alter table public.survivor_picks enable row level security;

create policy "Members can view profiles" on public.profiles for select to authenticated using (true);
create policy "Members can create their profile" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "Members can update their profile" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "Members can view seasons" on public.seasons for select to authenticated using (true);
create policy "Members can view teams" on public.teams for select to authenticated using (true);
create policy "Members can view fixtures" on public.fixtures for select to authenticated using (true);
create policy "Members can view survivor rounds" on public.survivor_rounds for select to authenticated using (true);

create policy "Members can view their picks or completed fixtures" on public.predictions for select to authenticated using (
  (select auth.uid()) = user_id
  or exists (select 1 from public.fixtures where fixtures.id = predictions.fixture_id and fixtures.kickoff_at <= now())
);

create policy "Members can create pre-kickoff predictions" on public.predictions for insert to authenticated with check (
  (select auth.uid()) = user_id
  and exists (select 1 from public.fixtures where fixtures.id = fixture_id and fixtures.kickoff_at > now())
);

create policy "Members can update pre-kickoff predictions" on public.predictions for update to authenticated using (
  (select auth.uid()) = user_id
  and exists (select 1 from public.fixtures where fixtures.id = fixture_id and fixtures.kickoff_at > now())
) with check ((select auth.uid()) = user_id);

create policy "Members can delete pre-kickoff predictions" on public.predictions for delete to authenticated using (
  (select auth.uid()) = user_id
  and exists (select 1 from public.fixtures where fixtures.id = fixture_id and fixtures.kickoff_at > now())
);

create policy "Members can manage their survivor picks" on public.survivor_picks for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

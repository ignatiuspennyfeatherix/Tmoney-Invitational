create table if not exists public.preseason_predictions (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  league_winner_team_id uuid not null references public.teams,
  champions_league_team_ids uuid[] not null default '{}',
  top_scorer text not null,
  most_assists text not null,
  relegated_team_ids uuid[] not null default '{}',
  points smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, user_id),
  check (cardinality(champions_league_team_ids) = 4),
  check (cardinality(relegated_team_ids) = 3)
);

alter table public.preseason_predictions enable row level security;
create policy "Members can view preseason predictions" on public.preseason_predictions for select to authenticated using (true);
create policy "Members can manage their preseason prediction" on public.preseason_predictions for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

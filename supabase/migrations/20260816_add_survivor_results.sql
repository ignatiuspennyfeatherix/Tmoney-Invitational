alter table public.survivor_picks
  add column if not exists result text check (result in ('pending', 'survived', 'lost')) default 'pending',
  add column if not exists processed_at timestamptz;

create policy "Members can view survivor pick results" on public.survivor_picks
  for select to authenticated using ((select auth.uid()) = user_id);

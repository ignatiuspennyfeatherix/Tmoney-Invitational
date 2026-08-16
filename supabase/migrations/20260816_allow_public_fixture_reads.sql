drop policy if exists "Members can view seasons" on public.seasons;
drop policy if exists "Members can view teams" on public.teams;
drop policy if exists "Members can view fixtures" on public.fixtures;

create policy "Anyone can view seasons" on public.seasons
  for select to anon, authenticated using (true);

create policy "Anyone can view teams" on public.teams
  for select to anon, authenticated using (true);

create policy "Anyone can view fixtures" on public.fixtures
  for select to anon, authenticated using (true);

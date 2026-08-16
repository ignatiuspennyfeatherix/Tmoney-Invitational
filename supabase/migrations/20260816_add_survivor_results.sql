alter table public.survivor_picks
  add column if not exists result text check (result in ('pending', 'survived', 'lost')) default 'pending',
  add column if not exists processed_at timestamptz;

create policy "Members can view survivor pick results" on public.survivor_picks
  for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.reset_survivor_game()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_commissioner) then
    raise exception 'Only the commissioner can reset Survivor.';
  end if;
  delete from public.survivor_picks;
end;
$$;

revoke all on function public.reset_survivor_game() from public;
grant execute on function public.reset_survivor_game() to authenticated;

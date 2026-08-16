alter table public.seasons
  add column if not exists provider_id integer unique;

alter table public.fixtures
  add column if not exists matchday smallint;

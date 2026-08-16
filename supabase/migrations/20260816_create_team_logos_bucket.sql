insert into storage.buckets (id, name, public)
values ('team-logos', 'team-logos', true)
on conflict (id) do update set public = true;

drop policy if exists "Anyone can view team logos" on storage.objects;
create policy "Anyone can view team logos" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'team-logos');

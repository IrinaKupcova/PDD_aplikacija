-- Saliedesana pasākumu pielikumi: jsonb kolonna + publisks Storage bucket (augšupielāde ar auth).

do $$
declare
  t text;
begin
  select c.relname
    into t
  from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and lower(c.relname) = 'saliedesana'
  order by case c.relname when 'Saliedesana' then 0 when 'saliedesana' then 1 else 2 end
  limit 1;

  if t is null then
    raise notice 'Saliedesana tabula netika atrasta — kolonna Pielikumi netika pievienota.';
    return;
  end if;

  execute format(
    'alter table public.%I add column if not exists %I jsonb not null default ''[]''::jsonb;',
    t,
    'Pielikumi'
  );

  execute format(
    'update public.%I set %I = ''[]''::jsonb where %I is null;',
    t,
    'Pielikumi',
    'Pielikumi'
  );
end
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pdd-saliedesana-files',
  'pdd-saliedesana-files',
  true,
  52428800,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "saliedesana_files_read_all" on storage.objects;
create policy "saliedesana_files_read_all"
on storage.objects
for select
using (bucket_id = 'pdd-saliedesana-files');

drop policy if exists "saliedesana_files_insert_own" on storage.objects;
create policy "saliedesana_files_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'pdd-saliedesana-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "saliedesana_files_update_own" on storage.objects;
create policy "saliedesana_files_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'pdd-saliedesana-files'
  and owner = auth.uid()
)
with check (
  bucket_id = 'pdd-saliedesana-files'
  and owner = auth.uid()
);

drop policy if exists "saliedesana_files_delete_own" on storage.objects;
create policy "saliedesana_files_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'pdd-saliedesana-files'
  and owner = auth.uid()
);

-- Procesu vadības modulis: kopīgs stāvoklis (uzdevumi, posmi, darba plāns, Gantt, saturs).

create table if not exists public."Procesu_vadibas_modulis" (
  id text primary key default 'main',
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public."Procesu_vadibas_modulis" enable row level security;

drop policy if exists "procesu_vadibas_modulis_select_public" on public."Procesu_vadibas_modulis";
drop policy if exists "procesu_vadibas_modulis_insert_public" on public."Procesu_vadibas_modulis";
drop policy if exists "procesu_vadibas_modulis_update_public" on public."Procesu_vadibas_modulis";
drop policy if exists "procesu_vadibas_modulis_delete_public" on public."Procesu_vadibas_modulis";

create policy "procesu_vadibas_modulis_select_public"
on public."Procesu_vadibas_modulis"
for select
to anon, authenticated
using (true);

create policy "procesu_vadibas_modulis_insert_public"
on public."Procesu_vadibas_modulis"
for insert
to anon, authenticated
with check (true);

create policy "procesu_vadibas_modulis_update_public"
on public."Procesu_vadibas_modulis"
for update
to anon, authenticated
using (true)
with check (true);

create policy "procesu_vadibas_modulis_delete_public"
on public."Procesu_vadibas_modulis"
for delete
to anon, authenticated
using (true);

grant select, insert, update, delete on public."Procesu_vadibas_modulis" to anon, authenticated, service_role;

insert into public."Procesu_vadibas_modulis" (id, state)
values ('main', '{}'::jsonb)
on conflict (id) do nothing;

-- Pārnes datu no iepriekšējās tabulas, ja tāda eksistē.
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'Procesu_vadiba'
  ) then
    insert into public."Procesu_vadibas_modulis" (id, state, updated_at, updated_by)
    select o.id, o.state, o.updated_at, o.updated_by
    from public."Procesu_vadiba" o
    where o.id = 'main'
      and coalesce(o.state, '{}'::jsonb) <> '{}'::jsonb
      and not exists (
        select 1
        from public."Procesu_vadibas_modulis" n
        where n.id = 'main'
          and coalesce(n.state, '{}'::jsonb) <> '{}'::jsonb
      )
    on conflict (id) do nothing;
  end if;
end $$;

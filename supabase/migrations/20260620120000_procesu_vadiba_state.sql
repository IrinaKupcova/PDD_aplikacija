-- Procesu vadība: kopīgs stāvoklis (posmi, Gantt, Lists reģistri) visai komandai.

create table if not exists public."Procesu_vadiba" (
  id text primary key default 'main',
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public."Procesu_vadiba" enable row level security;

drop policy if exists "procesu_vadiba_select_public" on public."Procesu_vadiba";
drop policy if exists "procesu_vadiba_insert_public" on public."Procesu_vadiba";
drop policy if exists "procesu_vadiba_update_public" on public."Procesu_vadiba";
drop policy if exists "procesu_vadiba_delete_public" on public."Procesu_vadiba";

create policy "procesu_vadiba_select_public"
on public."Procesu_vadiba"
for select
to anon, authenticated
using (true);

create policy "procesu_vadiba_insert_public"
on public."Procesu_vadiba"
for insert
to anon, authenticated
with check (true);

create policy "procesu_vadiba_update_public"
on public."Procesu_vadiba"
for update
to anon, authenticated
using (true)
with check (true);

create policy "procesu_vadiba_delete_public"
on public."Procesu_vadiba"
for delete
to anon, authenticated
using (true);

grant select, insert, update, delete on public."Procesu_vadiba" to anon, authenticated, service_role;

insert into public."Procesu_vadiba" (id, state)
values ('main', '{}'::jsonb)
on conflict (id) do nothing;

-- Izmaiņas PDD aplikācijā: būtisku papildinājumu / izmaiņu vēsture.

create table if not exists public."Aplikacijas_papildinajums" (
  id uuid primary key default gen_random_uuid(),
  nosaukums text not null default '',
  apraksts text not null default '',
  datums date not null default current_date,
  created_at timestamptz not null default now()
);

alter table public."Aplikacijas_papildinajums" enable row level security;
alter table public."Aplikacijas_papildinajums" force row level security;

grant select, insert, update, delete on public."Aplikacijas_papildinajums" to authenticated, service_role;

drop policy if exists "app_changes_select_authenticated" on public."Aplikacijas_papildinajums";
drop policy if exists "app_changes_insert_authenticated" on public."Aplikacijas_papildinajums";
drop policy if exists "app_changes_update_authenticated" on public."Aplikacijas_papildinajums";
drop policy if exists "app_changes_delete_authenticated" on public."Aplikacijas_papildinajums";

create policy "app_changes_select_authenticated"
on public."Aplikacijas_papildinajums"
for select to authenticated
using (true);

create policy "app_changes_insert_authenticated"
on public."Aplikacijas_papildinajums"
for insert to authenticated
with check (true);

create policy "app_changes_update_authenticated"
on public."Aplikacijas_papildinajums"
for update to authenticated
using (true)
with check (true);

create policy "app_changes_delete_authenticated"
on public."Aplikacijas_papildinajums"
for delete to authenticated
using (true);

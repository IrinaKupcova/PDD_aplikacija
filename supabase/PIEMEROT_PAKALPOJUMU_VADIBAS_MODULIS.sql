-- Palaid Supabase → SQL Editor → New query → ielīmē un Run.
-- Izveido Pakalpojumu vadības kopīgo stāvokli + vēsturi (analogs Procesu vadībai).

create table if not exists public."Pakalpojumu_vadibas_modulis" (
  id text primary key default 'main',
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public."Pakalpojumu_vadibas_modulis" enable row level security;

drop policy if exists "pakalpojumu_vadibas_modulis_select_public" on public."Pakalpojumu_vadibas_modulis";
drop policy if exists "pakalpojumu_vadibas_modulis_insert_public" on public."Pakalpojumu_vadibas_modulis";
drop policy if exists "pakalpojumu_vadibas_modulis_update_public" on public."Pakalpojumu_vadibas_modulis";
drop policy if exists "pakalpojumu_vadibas_modulis_delete_public" on public."Pakalpojumu_vadibas_modulis";

create policy "pakalpojumu_vadibas_modulis_select_public"
on public."Pakalpojumu_vadibas_modulis"
for select to anon, authenticated using (true);

create policy "pakalpojumu_vadibas_modulis_insert_public"
on public."Pakalpojumu_vadibas_modulis"
for insert to anon, authenticated with check (true);

create policy "pakalpojumu_vadibas_modulis_update_public"
on public."Pakalpojumu_vadibas_modulis"
for update to anon, authenticated using (true) with check (true);

create policy "pakalpojumu_vadibas_modulis_delete_public"
on public."Pakalpojumu_vadibas_modulis"
for delete to anon, authenticated using (true);

grant select, insert, update, delete on public."Pakalpojumu_vadibas_modulis" to anon, authenticated, service_role;

insert into public."Pakalpojumu_vadibas_modulis" (id, state)
values ('main', '{}'::jsonb)
on conflict (id) do nothing;

create table if not exists public."Pakalpojumu_vadibas_vesture" (
  id uuid primary key default gen_random_uuid(),
  module_id text not null default 'main',
  state jsonb not null,
  saved_at timestamptz not null default now(),
  saved_by text,
  action text not null default 'save'
);

create index if not exists pakalpojumu_vadibas_vesture_module_saved_idx
  on public."Pakalpojumu_vadibas_vesture" (module_id, saved_at desc);

alter table public."Pakalpojumu_vadibas_vesture" enable row level security;

drop policy if exists "pakalpojumu_vadibas_vesture_select_public" on public."Pakalpojumu_vadibas_vesture";
drop policy if exists "pakalpojumu_vadibas_vesture_insert_public" on public."Pakalpojumu_vadibas_vesture";

create policy "pakalpojumu_vadibas_vesture_select_public"
on public."Pakalpojumu_vadibas_vesture"
for select to anon, authenticated using (true);

create policy "pakalpojumu_vadibas_vesture_insert_public"
on public."Pakalpojumu_vadibas_vesture"
for insert to anon, authenticated with check (true);

grant select, insert on public."Pakalpojumu_vadibas_vesture" to anon, authenticated, service_role;

create or replace function public.pdd_pakalpojumu_vadiba_archive_state()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and old.state is distinct from new.state then
    insert into public."Pakalpojumu_vadibas_vesture" (module_id, state, saved_at, saved_by, action)
    values (old.id, old.state, coalesce(old.updated_at, now()), old.updated_by, 'save');

    delete from public."Pakalpojumu_vadibas_vesture" v
    where v.module_id = old.id
      and v.id not in (
        select h.id
        from public."Pakalpojumu_vadibas_vesture" h
        where h.module_id = old.id
        order by h.saved_at desc
        limit 80
      );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pakalpojumu_vadiba_archive_state on public."Pakalpojumu_vadibas_modulis";

create trigger trg_pakalpojumu_vadiba_archive_state
before update on public."Pakalpojumu_vadibas_modulis"
for each row
execute function public.pdd_pakalpojumu_vadiba_archive_state();

create or replace function public.pdd_pakalpojumu_vadiba_atjaunot(p_history_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hist public."Pakalpojumu_vadibas_vesture"%rowtype;
  v_now timestamptz := now();
begin
  select * into v_hist
  from public."Pakalpojumu_vadibas_vesture"
  where id = p_history_id;

  if v_hist.id is null then
    raise exception 'Vēstures ieraksts nav atrasts.';
  end if;

  update public."Pakalpojumu_vadibas_modulis" m
  set
    state = v_hist.state,
    updated_at = v_now,
    updated_by = coalesce(v_hist.saved_by, m.updated_by)
  where m.id = v_hist.module_id;

  if not found then
    insert into public."Pakalpojumu_vadibas_modulis" (id, state, updated_at, updated_by)
    values (v_hist.module_id, v_hist.state, v_now, v_hist.saved_by);
  end if;

  insert into public."Pakalpojumu_vadibas_vesture" (module_id, state, saved_at, saved_by, action)
  values (v_hist.module_id, v_hist.state, v_now, v_hist.saved_by, 'restore');

  return jsonb_build_object('ok', true, 'module_id', v_hist.module_id, 'restored_at', v_now);
end;
$$;

revoke all on function public.pdd_pakalpojumu_vadiba_atjaunot(uuid) from public;
grant execute on function public.pdd_pakalpojumu_vadiba_atjaunot(uuid) to anon, authenticated, service_role;

-- Realtime: lai komanda uzreiz redz citu izmaiņas
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'Pakalpojumu_vadibas_modulis'
     ) then
    alter publication supabase_realtime add table public."Pakalpojumu_vadibas_modulis";
  end if;
end $$;

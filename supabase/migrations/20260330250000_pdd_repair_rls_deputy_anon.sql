-- Vienots remonts: pdd_deputy_state, RLS anon piekļuve statičai lapai (bez JWT),
-- un vadītāja politikas ar lower(role) (Admin).
-- Palaid PĒC 20260330220000 (vai kopā — šis fails ir idempotents).

-- 1) pdd_deputy_state — tabula + rinda + kolonnas (vecām DB)
create table if not exists public.pdd_deputy_state (
  id smallint primary key default 1 check (id = 1),
  deputy_user_id uuid references public.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.pdd_deputy_state
  add column if not exists deputy_valid_from date,
  add column if not exists deputy_valid_to date;

insert into public.pdd_deputy_state (id, deputy_user_id)
values (1, null)
on conflict (id) do nothing;

-- 2) Kolonna „name” obligāta veidu sinhronizācijai (302200 var nebūt palaists)
alter table public.prombutnes_veidi
  add column if not exists name text;

-- Prombūtnes veidu nosaukums: tikai ja pastāv gan „type”, gan „name”
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'prombutnes_veidi' and column_name = 'type'
  )
  and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'prombutnes_veidi' and column_name = 'name'
  ) then
    update public.prombutnes_veidi v
    set name = nullif(trim(coalesce(v.type::text, '')), '')
    where (v.name is null or trim(v.name) = '') and v.type is not null;
  end if;
end $$;

-- 3) pdd_deputy_state politikas — Admin / manager ar lower(role)
alter table public.pdd_deputy_state enable row level security;

drop policy if exists "pdd_deputy_state_select" on public.pdd_deputy_state;
create policy "pdd_deputy_state_select" on public.pdd_deputy_state
  for select to authenticated using (true);

-- Anon (statiskā lapa) maina arī aizvietotāju — bez JWT nav citas iespējas
drop policy if exists "pdd_deputy_state_anon_all" on public.pdd_deputy_state;
create policy "pdd_deputy_state_anon_all" on public.pdd_deputy_state
  for all to anon using (true) with check (true);

drop policy if exists "pdd_deputy_state_update" on public.pdd_deputy_state;
create policy "pdd_deputy_state_update" on public.pdd_deputy_state
  for update to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and lower(trim(coalesce(u.role, ''))) in ('manager', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and lower(trim(coalesce(u.role, ''))) in ('manager', 'admin')
    )
    and (
      deputy_user_id is null
      or exists (select 1 from public.users du where du.id = deputy_user_id)
    )
  );

drop policy if exists "pdd_deputy_state_insert" on public.pdd_deputy_state;
create policy "pdd_deputy_state_insert" on public.pdd_deputy_state
  for insert to authenticated
  with check (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and lower(trim(coalesce(u.role, ''))) in ('manager', 'admin')
    )
  );

-- 4) Anon — statiskā lapa lieto publishable atslēgu bez Supabase Auth.
-- Ja RLS ir ieslēgts, pievieno atļaujas; ja izslēgts — bloks neuztrauc.
-- BRĪDINĀJUMS: anon pilnas tiesības = tikai uzticamai videi / iekšējam tīklam.

do $$
begin
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'users' and c.relrowsecurity
  ) then
    execute 'drop policy if exists pdd_anon_users_all on public.users';
    execute 'create policy pdd_anon_users_all on public.users for all to anon using (true) with check (true)';
  end if;

  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'prombutnes_dati' and c.relrowsecurity
  ) then
    execute 'drop policy if exists pdd_anon_prombutnes_dati_all on public.prombutnes_dati';
    execute 'create policy pdd_anon_prombutnes_dati_all on public.prombutnes_dati for all to anon using (true) with check (true)';
  end if;

  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'prombutnes_veidi' and c.relrowsecurity
  ) then
    execute 'drop policy if exists pdd_anon_prombutnes_veidi_all on public.prombutnes_veidi';
    execute 'create policy pdd_anon_prombutnes_veidi_all on public.prombutnes_veidi for all to anon using (true) with check (true)';
  end if;

  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'pdd_cits_requests' and c.relrowsecurity
  ) then
    execute 'drop policy if exists pdd_anon_cits_all on public.pdd_cits_requests';
    execute 'create policy pdd_anon_cits_all on public.pdd_cits_requests for all to anon using (true) with check (true)';
  end if;
end $$;

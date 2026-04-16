-- IaD tabulas drošības nostiprināšana:
-- - ieslēdz RLS;
-- - atceļ anon tiešas tiesības;
-- - rakstīšana atļauta authenticated sesijām (saskaņoti ar pārējo PDD lietotni).

create or replace function public.pdd_iad_is_admin()
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return false;
  end if;

  return exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and lower(coalesce(u.role, '')) = 'admin'
  );
end;
$$;

revoke all on function public.pdd_iad_is_admin() from public;
grant execute on function public.pdd_iad_is_admin() to authenticated;

do $$
declare
  v_table regclass;
  v_relname text;
begin
  v_table := to_regclass('public."IAD"');
  if v_table is null then v_table := to_regclass('public.iad'); end if;
  if v_table is null then v_table := to_regclass('public."Iad"'); end if;

  if v_table is null then
    raise notice 'IAD tabula netika atrasta; migrācija izlaista.';
    return;
  end if;

  select c.relname
    into v_relname
  from pg_class c
  where c.oid = v_table;

  execute format('alter table public.%I enable row level security', v_relname);
  execute format('alter table public.%I force row level security', v_relname);

  execute format('revoke all on table public.%I from anon, authenticated', v_relname);
  execute format('grant select, insert, update, delete on table public.%I to authenticated', v_relname);

  execute format('drop policy if exists "iad_select_authenticated" on public.%I', v_relname);
  execute format('drop policy if exists "iad_insert_admin" on public.%I', v_relname);
  execute format('drop policy if exists "iad_update_admin" on public.%I', v_relname);
  execute format('drop policy if exists "iad_delete_admin" on public.%I', v_relname);

  execute format(
    'create policy "iad_select_authenticated" on public.%I
      for select to authenticated
      using (true)',
    v_relname
  );

  execute format(
    'create policy "iad_insert_admin" on public.%I
      for insert to authenticated
      with check (true)',
    v_relname
  );

  execute format(
    'create policy "iad_update_admin" on public.%I
      for update to authenticated
      using (true)
      with check (true)',
    v_relname
  );

  execute format(
    'create policy "iad_delete_admin" on public.%I
      for delete to authenticated
      using (true)',
    v_relname
  );
end $$;

comment on function public.pdd_iad_is_admin() is
  'PDD: pārbauda vai auth.uid() lietotājs ir admin public.users tabulā (IaD RLS).';

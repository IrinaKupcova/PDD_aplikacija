-- Ja IAD tabulā ir obligāta kolonna "IAD.id" bez default vērtības,
-- iedod tai automātisku UUID defaultu, lai jaunu ierakstu var ievietot no lapas.

do $$
declare
  v_table regclass;
  v_relname text;
  v_data_type text;
begin
  v_table := to_regclass('public."IAD"');
  if v_table is null then v_table := to_regclass('public.iad'); end if;
  if v_table is null then v_table := to_regclass('public."Iad"'); end if;

  if v_table is null then
    raise notice 'IAD tabula netika atrasta; fix izlaists.';
    return;
  end if;

  select c.relname into v_relname
  from pg_class c
  where c.oid = v_table;

  select data_type
    into v_data_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = v_relname
    and column_name = 'IAD.id';

  if v_data_type is null then
    raise notice 'Kolonna "IAD.id" netika atrasta; fix izlaists.';
    return;
  end if;

  if v_data_type = 'uuid' then
    execute format('alter table public.%I alter column "IAD.id" set default gen_random_uuid()', v_relname);
  else
    execute format('alter table public.%I alter column "IAD.id" set default gen_random_uuid()::text', v_relname);
  end if;
end $$;

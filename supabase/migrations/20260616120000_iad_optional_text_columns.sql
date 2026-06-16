-- IAD papildu teksta kolonnas: Ieteikuma Nr., Kam nodots izpildei, Audita komentārs.

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
    and lower(c.relname) in (lower('IAD'), lower('iad'), lower('Iad'))
  order by case c.relname when 'IAD' then 0 when 'iad' then 1 else 2 end
  limit 1;

  if t is null then
    raise notice 'IAD tabula netika atrasta, migrācija izlaista.';
    return;
  end if;

  execute format(
    'alter table public.%I add column if not exists %I text;',
    t,
    'Ieteikuma_Nr'
  );
  execute format(
    'alter table public.%I add column if not exists %I text;',
    t,
    'Nodots_izpildei'
  );
  execute format(
    'alter table public.%I add column if not exists %I text;',
    t,
    'Audita_komentars'
  );
end
$$;

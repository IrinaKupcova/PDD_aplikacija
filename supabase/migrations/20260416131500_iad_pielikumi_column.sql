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

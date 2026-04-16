-- Security cleanup:
-- 1) noņem vecās "anon all" politikas;
-- 2) noņem anon tiešās tabulu tiesības sensitīvām tabulām;
-- 3) atstāj darbu ar authenticated (t.sk. anonīmi autorizētām sesijām caur signInAnonymously).

do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and (
        policyname ilike 'pdd_anon\_%\_all' escape '\'
        or policyname ilike '%anon_all%'
      )
      and tablename in ('AKTUALITATES', 'AKTUALITĀTES', 'IAD', 'iad', 'Iad', 'Aplikacijas_papildinajums', 'aplikacijas_papildinajums')
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

do $$
declare
  t text;
  candidates text[] := array[
    'AKTUALITATES',
    'AKTUALITĀTES',
    'IAD',
    'iad',
    'Iad',
    'Aplikacijas_papildinajums',
    'aplikacijas_papildinajums'
  ];
begin
  foreach t in array candidates
  loop
    if to_regclass(format('public.%I', t)) is not null then
      execute format('revoke all on table public.%I from anon', t);
      execute format('revoke usage, select on all sequences in schema public from anon');
    end if;
  end loop;
end $$;

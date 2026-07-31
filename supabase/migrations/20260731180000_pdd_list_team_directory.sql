-- Pilns komandas saraksts izpildītāju izvēlei (Procesu / Pakalpojumu vadība u.c.).
-- SECURITY DEFINER, jo anon sesijai RLS ļauj SELECT tikai savu public.users rindu
-- (users_select_anon_self), bet UI vajag redzēt visus kolēģus.

CREATE OR REPLACE FUNCTION public.pdd_list_team_directory()
RETURNS SETOF public.users
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.*
  FROM public.users u
  WHERE lower(trim(coalesce(u.role, ''))) NOT IN ('viesis', 'guest')
  ORDER BY
    nullif(trim(coalesce(u."Vārds uzvārds", '')), '') ASC NULLS LAST,
    nullif(trim(coalesce(u.email::text, '')), '') ASC NULLS LAST;
$$;

COMMENT ON FUNCTION public.pdd_list_team_directory() IS
  'PDD: pilns komandas katalogs izpildītāju / sarakstu UI (apejot anon self-only RLS).';

REVOKE ALL ON FUNCTION public.pdd_list_team_directory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pdd_list_team_directory() TO anon, authenticated;

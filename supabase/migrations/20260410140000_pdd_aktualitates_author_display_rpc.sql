-- Aktualitāšu autora rādāmais vārds: public.users + auth.users (ja profila rinda trūkst vai bez vārda).
-- SECURITY DEFINER, lai autentificēts klients varētu redzēt citu autoru vārdus UI (nevis tikai savu users SELECT).

CREATE OR REPLACE FUNCTION public.pdd_display_name_for_user_ids(p_ids uuid[])
RETURNS TABLE (user_id uuid, display_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    x.uid,
    NULLIF(
      TRIM(
        COALESCE(
          u."Vārds uzvārds",
          u.full_name,
          NULLIF(TRIM(COALESCE(u.email::text, '')), ''),
          NULLIF(TRIM(COALESCE(u."i-mail"::text, '')), ''),
          NULLIF(TRIM(COALESCE(au.raw_user_meta_data->>'full_name', '')), ''),
          NULLIF(TRIM(COALESCE(au.raw_user_meta_data->>'name', '')), ''),
          NULLIF(TRIM(COALESCE(SPLIT_PART(au.email::text, '@', 1), '')), ''),
          ''
        )
      ),
      ''
    ) AS display_name
  FROM UNNEST(COALESCE(p_ids, ARRAY[]::uuid[])) AS x(uid)
  LEFT JOIN public.users u ON u.id = x.uid
  LEFT JOIN auth.users au ON au.id = x.uid;
$$;

REVOKE ALL ON FUNCTION public.pdd_display_name_for_user_ids(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pdd_display_name_for_user_ids(uuid[]) TO authenticated;

COMMENT ON FUNCTION public.pdd_display_name_for_user_ids(uuid[]) IS
  'PDD: lietotāju rādāmie vārdi aktualitātēm (users + auth meta).';

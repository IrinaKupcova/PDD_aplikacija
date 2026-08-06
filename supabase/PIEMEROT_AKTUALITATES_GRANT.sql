-- PALAID ŠO SUPABASE → SQL Editor (uzreiz).
-- Kļūda "permission denied for table AKTUALITATES" nozīmē, ka trūkst GRANT.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."AKTUALITATES" TO anon, authenticated, service_role;

ALTER TABLE public."AKTUALITATES" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aktualitates_select_all ON public."AKTUALITATES";
CREATE POLICY aktualitates_select_all ON public."AKTUALITATES"
  FOR SELECT USING (true);

-- Ja Latvian tabula arī eksistē:
DO $$
BEGIN
  IF to_regclass('public."AKTUALITĀTES"') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."AKTUALITĀTES" TO anon, authenticated, service_role';
  END IF;
END $$;

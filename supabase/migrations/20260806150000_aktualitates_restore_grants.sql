-- Atjauno GRANT uz ASCII tabulu AKTUALITATES (permission denied bez tā).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."AKTUALITATES" TO anon, authenticated, service_role;

ALTER TABLE public."AKTUALITATES" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aktualitates_select_all ON public."AKTUALITATES";
CREATE POLICY aktualitates_select_all ON public."AKTUALITATES"
  FOR SELECT USING (true);

DO $$
BEGIN
  IF to_regclass('public."AKTUALITĀTES"') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."AKTUALITĀTES" TO anon, authenticated, service_role';
  END IF;
END $$;

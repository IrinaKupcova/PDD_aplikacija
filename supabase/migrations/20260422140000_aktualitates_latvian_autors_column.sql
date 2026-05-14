-- Sinhronizācija ar ASCII tabulu: latviskajam nosaukumam pievieno „Autors”, lai UI varētu
-- atrisināt autora vārdu un lai `resolveAktualitatesTableName` var izvēlēties šo tabulu ar `id, Autors`.

DO $$
BEGIN
  IF to_regclass('public."AKTUALITĀTES"') IS NOT NULL THEN
    ALTER TABLE public."AKTUALITĀTES"
      ADD COLUMN IF NOT EXISTS "Autors" uuid REFERENCES auth.users (id) ON DELETE SET NULL;
  END IF;
END
$$;

-- PALAID Supabase → SQL Editor (pēc Restart, ja DB lēna).
-- NEAIZTIEK Pakalpojumu/Procesu tabulas.
-- Griezums: šodiena − 2 mēneši.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.pdd_ideju_chat_reactions') IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE public.pdd_ideju_chat_reactions';
  END IF;
  IF to_regclass('public.pdd_ideju_chat') IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE public.pdd_ideju_chat';
  END IF;
  IF to_regclass('public.aktualitates_reactions') IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE public.aktualitates_reactions';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.pdd_arhiva_aktualitates_meta (
  id uuid PRIMARY KEY,
  "Sakums" date,
  "Beigas" date,
  "Autors" uuid,
  created_at timestamptz,
  html_len integer,
  archived_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pdd_arhiva_prombutnes_meta (
  id uuid PRIMARY KEY,
  payload jsonb NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE
  cutoff date := (CURRENT_DATE - interval '2 months')::date;
BEGIN
  INSERT INTO public.pdd_arhiva_aktualitates_meta (id, "Sakums", "Beigas", "Autors", created_at, html_len)
  SELECT a.id, a."Sakums", a."Beigas", a."Autors", a.created_at,
         length(coalesce(a."Kas_sodien_vel_aktuals", ''))
  FROM public."AKTUALITATES" a
  WHERE a."Beigas" < cutoff
  ON CONFLICT (id) DO UPDATE SET
    "Sakums" = EXCLUDED."Sakums",
    "Beigas" = EXCLUDED."Beigas",
    "Autors" = EXCLUDED."Autors",
    created_at = EXCLUDED.created_at,
    html_len = EXCLUDED.html_len,
    archived_at = now();

  INSERT INTO public.pdd_arhiva_prombutnes_meta (id, payload)
  SELECT p.id, to_jsonb(p) - 'id'
  FROM public.prombutnes_dati p
  WHERE p."Beigu_datums" < cutoff
  ON CONFLICT (id) DO UPDATE
  SET payload = EXCLUDED.payload, archived_at = now();

  DELETE FROM public."AKTUALITATES" WHERE "Beigas" < cutoff;
  DELETE FROM public.prombutnes_dati WHERE "Beigu_datums" < cutoff;
  BEGIN
    DELETE FROM public."Saliedesana" WHERE "Datums" < cutoff;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    RAISE NOTICE 'Saliedesana purge: %', SQLERRM;
  END;
END $$;

UPDATE public."AKTUALITATES"
SET "Kas_sodien_vel_aktuals" = regexp_replace(
  "Kas_sodien_vel_aktuals",
  '<img[^>]*>',
  '<p><em>[Attēls noņemts — vietas taupīšanai]</em></p>',
  'gi'
)
WHERE "Kas_sodien_vel_aktuals" ~* '<img';

DO $$
DECLARE
  cutoff timestamptz := ((CURRENT_DATE - interval '2 months')::timestamp AT TIME ZONE 'Europe/Riga');
BEGIN
  BEGIN
    DELETE FROM public."Auditacijas_vesture" WHERE ts < cutoff;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    BEGIN
      DELETE FROM public."Auditacijas_vesture" WHERE created_at < cutoff;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'audit ascii: %', SQLERRM;
    END;
  END;
  BEGIN
    DELETE FROM public."Auditacijas_vēsture" WHERE ts < cutoff;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    BEGIN
      DELETE FROM public."Auditacijas_vēsture" WHERE created_at < cutoff;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'audit unicode: %', SQLERRM;
    END;
  END;
END $$;

COMMIT;

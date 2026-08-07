-- PALAID SUPABASE → SQL Editor (pēc Restart project, kad Table Editor atkal ielādējas).
-- Mērķis: atbrīvot FREE limitu. NEAIZTIEK Pakalpojumu/Procesu tabulas.
--
-- 0) Izdzēš čatu pilnībā
-- 1) Izveido METADATU arhīvu (bez smagajām bildēm)
-- 2) Dzēš veco vēsturi (pirms iepriekšējā mēneša + neaktuālās aktualitātes)
-- 3) Noņem VISAS bildes no atlikušajām aktualitātēm
-- 4) Dzēš veco auditācijas vēsturi (pirms iepriekšējā mēneša)
--
-- Lokāli JSON arhīvu vari papildus iegūt: py arhiva/iztirit_veco_vesturi.py
-- (kad DB atbild). Metadatu tabulas vari eksportēt: Table Editor → Export.

BEGIN;

-- Čats ārā
DO $$
BEGIN
  IF to_regclass('public.pdd_ideju_chat_reactions') IS NOT NULL THEN
    TRUNCATE TABLE public.pdd_ideju_chat_reactions;
  END IF;
  IF to_regclass('public.pdd_ideju_chat') IS NOT NULL THEN
    TRUNCATE TABLE public.pdd_ideju_chat;
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

-- Griezuma datums: iepriekšējā mēneša 1. diena
-- (tekošais + iepriekšējais mēnesis paliek)
DO $$
DECLARE
  cutoff date := (date_trunc('month', CURRENT_DATE) - interval '1 month')::date;
BEGIN
  INSERT INTO public.pdd_arhiva_aktualitates_meta (id, "Sakums", "Beigas", "Autors", created_at, html_len)
  SELECT
    a.id,
    a."Sakums",
    a."Beigas",
    a."Autors",
    a.created_at,
    length(coalesce(a."Kas_sodien_vel_aktuals", ''))
  FROM public."AKTUALITATES" a
  WHERE a."Beigas" < cutoff
     OR a."Beigas" < CURRENT_DATE
  ON CONFLICT (id) DO UPDATE
  SET
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

  DELETE FROM public."AKTUALITATES"
  WHERE "Beigas" < cutoff
     OR "Beigas" < CURRENT_DATE;

  DELETE FROM public.prombutnes_dati
  WHERE "Beigu_datums" < cutoff;
END $$;

DO $$
BEGIN
  IF to_regclass('public.aktualitates_reactions') IS NOT NULL THEN
    DELETE FROM public.aktualitates_reactions r
    WHERE NOT EXISTS (SELECT 1 FROM public."AKTUALITATES" a WHERE a.id::text = r.aktualitate_id);
  END IF;
  IF to_regclass('public.aktualitates_comments') IS NOT NULL THEN
    DELETE FROM public.aktualitates_comments c
    WHERE NOT EXISTS (SELECT 1 FROM public."AKTUALITATES" a WHERE a.id::text = c.aktualitate_id);
  END IF;
END $$;

UPDATE public."AKTUALITATES"
SET "Kas_sodien_vel_aktuals" = regexp_replace(
  "Kas_sodien_vel_aktuals",
  '<img[^>]*>',
  '<p><em>[Attēls noņemts — vietas taupīšanai. Labāk raksti tekstu.]</em></p>',
  'gi'
)
WHERE "Kas_sodien_vel_aktuals" ~* '<img';

DO $$
DECLARE
  cutoff timestamptz := (date_trunc('month', CURRENT_DATE) - interval '1 month');
BEGIN
  IF to_regclass('public."Auditacijas_vesture"') IS NOT NULL THEN
    BEGIN
      DELETE FROM public."Auditacijas_vesture" WHERE ts < cutoff;
    EXCEPTION WHEN undefined_column THEN
      BEGIN
        DELETE FROM public."Auditacijas_vesture" WHERE created_at < cutoff;
      EXCEPTION WHEN undefined_column THEN
        BEGIN
          DELETE FROM public."Auditacijas_vesture" WHERE "Laiks" < cutoff;
        EXCEPTION WHEN OTHERS THEN
          RAISE NOTICE 'Auditacijas_vesture: %', SQLERRM;
        END;
      END;
    END;
  END IF;
  IF to_regclass('public."Auditacijas_vēsture"') IS NOT NULL THEN
    BEGIN
      DELETE FROM public."Auditacijas_vēsture" WHERE ts < cutoff;
    EXCEPTION WHEN undefined_column THEN
      BEGIN
        DELETE FROM public."Auditacijas_vēsture" WHERE created_at < cutoff;
      EXCEPTION WHEN undefined_column THEN
        BEGIN
          DELETE FROM public."Auditacijas_vēsture" WHERE "Laiks" < cutoff;
        EXCEPTION WHEN OTHERS THEN
          RAISE NOTICE 'Auditacijas_vēsture: %', SQLERRM;
        END;
      END;
    END;
  END IF;
END $$;

COMMIT;

-- Pēc tam (pēc dažām minūtēm) Dashboard → Database → var palīdzēt arī Restart,
-- lai atbrīvotā vieta reāli atspoguļojas FREE limitā.

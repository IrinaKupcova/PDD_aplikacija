-- PALAID SUPABASE → SQL Editor (pēc Restart project, kad Table Editor atkal ielādējas).
-- Mērķis: atbrīvot FREE limitu. NEAIZTIEK Pakalpojumu/Procesu/čatu u.c. tabulas.
--
-- 1) Izveido METADATU arhīvu (bez smagajām bildēm)
-- 2) Dzēš veco vēsturi (jūnijs un vecāk + neaktuālās aktualitātes)
-- 3) Noņem VISAS bildes no atlikušajām aktualitātēm
--
-- Lokāli JSON arhīvu vari papildus iegūt: py arhiva/iztirit_veco_vesturi.py
-- (kad DB atbild). Metadatu tabulas vari eksportēt: Table Editor → Export.

BEGIN;

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

-- Metadatu arhīvs aktualitātēm (bez HTML/bildēm)
INSERT INTO public.pdd_arhiva_aktualitates_meta (id, "Sakums", "Beigas", "Autors", created_at, html_len)
SELECT
  a.id,
  a."Sakums",
  a."Beigas",
  a."Autors",
  a.created_at,
  length(coalesce(a."Kas_sodien_vel_aktuals", ''))
FROM public."AKTUALITATES" a
WHERE a."Beigas" < DATE '2026-07-01'
   OR a."Beigas" < CURRENT_DATE
ON CONFLICT (id) DO UPDATE
SET
  "Sakums" = EXCLUDED."Sakums",
  "Beigas" = EXCLUDED."Beigas",
  "Autors" = EXCLUDED."Autors",
  created_at = EXCLUDED.created_at,
  html_len = EXCLUDED.html_len,
  archived_at = now();

-- Metadatu arhīvs vecajām prombūtnēm
INSERT INTO public.pdd_arhiva_prombutnes_meta (id, payload)
SELECT p.id, to_jsonb(p) - 'id'
FROM public.prombutnes_dati p
WHERE p."Beigu_datums" < DATE '2026-07-01'
ON CONFLICT (id) DO UPDATE
SET payload = EXCLUDED.payload, archived_at = now();

-- Dzēš aktualitātes: jūnijs un vecāk + visas jau beigušās
DELETE FROM public."AKTUALITATES"
WHERE "Beigas" < DATE '2026-07-01'
   OR "Beigas" < CURRENT_DATE;

-- Bāreņu reakcijas/komentāri
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

-- Dzēš vecās prombūtnes
DELETE FROM public.prombutnes_dati
WHERE "Beigu_datums" < DATE '2026-07-01';

-- Noņem VISAS <img> bildes no atlikušajām aktualitātēm
UPDATE public."AKTUALITATES"
SET "Kas_sodien_vel_aktuals" = regexp_replace(
  "Kas_sodien_vel_aktuals",
  '<img[^>]*>',
  '<p><em>[Attēls noņemts — vietas taupīšanai. Labāk raksti tekstu.]</em></p>',
  'gi'
)
WHERE "Kas_sodien_vel_aktuals" ~* '<img';

COMMIT;

-- Pēc tam (pēc dažām minūtēm) Dashboard → Database → var palīdzēt arī Restart,
-- lai atbrīvotā vieta reāli atspoguļojas FREE limitā.

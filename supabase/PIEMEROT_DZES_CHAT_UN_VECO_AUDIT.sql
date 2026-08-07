-- PALAID Supabase → SQL Editor (pēc Restart project, ja DB ir pārslogota).
-- Mērķis: izdzēst čatu + veco auditācijas vēsturi (pirms iepriekšējā mēneša sākuma).
-- NEAIZTIEK Pakalpojumu/Procesu/prombūtņu/aktualitāšu u.c. datus.

BEGIN;

-- 1) Čats — viss ārā
DO $$
BEGIN
  IF to_regclass('public.pdd_ideju_chat_reactions') IS NOT NULL THEN
    TRUNCATE TABLE public.pdd_ideju_chat_reactions;
  END IF;
  IF to_regclass('public.pdd_ideju_chat') IS NOT NULL THEN
    TRUNCATE TABLE public.pdd_ideju_chat;
  END IF;
END $$;

-- 2) Auditācijas vēsture — dzēš visu, kas vecāks par iepriekšējā mēneša 1. datumu
--    (piem. 2026-08 → paturam no 2026-07-01; dzēš < 2026-07-01)
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
          RAISE NOTICE 'Auditacijas_vesture: kolonnu neatpazina — %', SQLERRM;
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
          RAISE NOTICE 'Auditacijas_vēsture: kolonnu neatpazina — %', SQLERRM;
        END;
      END;
    END;
  END IF;
END $$;

COMMIT;

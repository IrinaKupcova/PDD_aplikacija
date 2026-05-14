-- AKTUALITATES.users glabā ievietotāja "Vārds uzvārds" no public.users,
-- lai front-end var tieši attēlot autoru arī gadījumos, kad "Autors" UUID nav atrisināms.

ALTER TABLE public."AKTUALITATES"
  ADD COLUMN IF NOT EXISTS users text;

UPDATE public."AKTUALITATES" a
SET users = COALESCE(
  to_jsonb(u)->>'Vārds uzvārds',
  to_jsonb(u)->>'Vards uzvards',
  u.full_name,
  a.users
)
FROM public.users u
WHERE a."Autors" = u.id
  AND COALESCE(BTRIM(a.users), '') = '';

CREATE OR REPLACE FUNCTION public.pdd_fill_aktualitates_users_name()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_name text;
BEGIN
  IF COALESCE(BTRIM(NEW.users), '') <> '' THEN
    RETURN NEW;
  END IF;
  IF NEW."Autors" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(
      to_jsonb(u)->>'Vārds uzvārds',
      to_jsonb(u)->>'Vards uzvards',
      u.full_name,
      ''
    )
  INTO v_name
  FROM public.users u
  WHERE u.id = NEW."Autors"
  LIMIT 1;

  IF COALESCE(BTRIM(v_name), '') <> '' THEN
    NEW.users := v_name;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pdd_fill_aktualitates_users_name ON public."AKTUALITATES";
CREATE TRIGGER trg_pdd_fill_aktualitates_users_name
BEFORE INSERT OR UPDATE OF "Autors", users
ON public."AKTUALITATES"
FOR EACH ROW
EXECUTE FUNCTION public.pdd_fill_aktualitates_users_name();

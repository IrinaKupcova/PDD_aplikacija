-- Ieplānotie atvaļinājumi (Atvaļinājumu grafiks).
CREATE TABLE IF NOT EXISTS public."Atvalinajumi" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "Atvaļinājuma sākuma datums" date,
  "Atvaļinājuma beigu datums" date,
  "Vārds uzvārds" uuid REFERENCES public.users (id) ON DELETE SET NULL,
  -- Dažās vidēs kolonna jau eksistē ar garāku nosaukumu (sk. Atvalinajumi.js FIELD_ALIAS.veids).
  "Atvaļinājuma veids" text,
  "Papildinformācija" text,
  "Atspoguļot kalendārī" boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public."Atvalinajumi" ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."Atvalinajumi" TO anon, authenticated;

DROP POLICY IF EXISTS "pdd_atvalinajumi_select_all" ON public."Atvalinajumi";
DROP POLICY IF EXISTS "pdd_atvalinajumi_insert_all" ON public."Atvalinajumi";
DROP POLICY IF EXISTS "pdd_atvalinajumi_update_all" ON public."Atvalinajumi";
DROP POLICY IF EXISTS "pdd_atvalinajumi_delete_all" ON public."Atvalinajumi";

CREATE POLICY "pdd_atvalinajumi_select_all"
ON public."Atvalinajumi"
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "pdd_atvalinajumi_insert_all"
ON public."Atvalinajumi"
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "pdd_atvalinajumi_update_all"
ON public."Atvalinajumi"
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "pdd_atvalinajumi_delete_all"
ON public."Atvalinajumi"
FOR DELETE
TO anon, authenticated
USING (true);

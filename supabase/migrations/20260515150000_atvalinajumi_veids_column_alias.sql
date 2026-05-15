-- Ja tabulā ir tikai garā kolonna, bet nav īsās — pievieno īso (lietotne atbalsta abas).
ALTER TABLE public."Atvalinajumi"
ADD COLUMN IF NOT EXISTS "Atvaļinājuma veids" text;

-- Sinhronizē no garās kolonnas, ja tāda ir.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Atvalinajumi'
      AND column_name = 'Atvaļinājuma veids (ikgadējais vai papildatvaļinājums)'
  ) THEN
    EXECUTE $sql$
      UPDATE public."Atvalinajumi"
      SET "Atvaļinājuma veids" = "Atvaļinājuma veids (ikgadējais vai papildatvaļinājums)"
      WHERE "Atvaļinājuma veids" IS NULL
        AND "Atvaļinājuma veids (ikgadējais vai papildatvaļinājums)" IS NOT NULL
    $sql$;
  END IF;
END $$;

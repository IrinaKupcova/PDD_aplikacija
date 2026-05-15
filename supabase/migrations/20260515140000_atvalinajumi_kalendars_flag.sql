-- Atvaļinājumu ieraksts kalendārī tikai pēc lietotāja izvēles (poga grafikā).
ALTER TABLE public."Atvalinajumi"
ADD COLUMN IF NOT EXISTS "Atspoguļot kalendārī" boolean NOT NULL DEFAULT false;

-- Autors → auth.users(id): auth.uid() vienmēr der FK (nav jābūt rindai public.users).
-- Vārdu rādīšanai joprojām izmanto public.users (atsevišķs SELECT no klienta).

ALTER TABLE public."AKTUALITATES"
DROP CONSTRAINT IF EXISTS "AKTUALITATES_Autors_fkey";

ALTER TABLE public."AKTUALITATES"
ADD CONSTRAINT "AKTUALITATES_Autors_fkey" FOREIGN KEY ("Autors") REFERENCES auth.users (id) ON DELETE SET NULL;

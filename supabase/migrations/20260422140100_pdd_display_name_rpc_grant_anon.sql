-- Ļauj arī anon API atslēgai (bez JWT) izsaukt SECURITY DEFINER RPC, ja kādreiz vajag
-- lasīt autorus pirms pilnas sesijas; nepaaugstina datu piekļuvi ārpus funkcijas rezultāta.

GRANT EXECUTE ON FUNCTION public.pdd_display_name_for_user_ids(uuid[]) TO anon;

/**
 * Lietotāju saraksts prombūtnes formai.
 * Supabase tabula: public.users (id, full_name, role, …).
 */
export async function fetchAbsenceFormUsers(supabaseClient, options) {
  const { localMode, localUser } = options;
  if (localMode) return localUser ? [localUser] : [];
  if (!supabaseClient) return [];

  const r = await supabaseClient
    .from("users")
    .select("id, full_name")
    .order("full_name", { ascending: true });
  if (r.error) {
    console.error(r.error);
    return [];
  }
  return r.data ?? [];
}

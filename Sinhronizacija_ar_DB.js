/*
PROMPT: Cursor, izpildi šos soļus lokāli:
1. Pārbaudi, vai localStorage satur pdd_supabase_anon_key un pdd_supabase_url
2. Pārbaudi, vai configured() atgriež true
3. Pieslēdzies Supabase un izvelc visus lietotājus no public.users
4. Atgriez datus un error, ja tāds ir
5. Izdrukā rezultātus konsolē
*/

(async () => {
    // 1️⃣ Pārbaude localStorage
    const anonKey = localStorage.getItem("pdd_supabase_anon_key");
    const url = localStorage.getItem("pdd_supabase_url");
    console.log("localStorage anonKey:", anonKey);
    console.log("localStorage url:", url);
  
    if (!anonKey || !url) {
      console.log("ERROR: localStorage key vai URL nav iestatīts!");
      return;
    }
  
    // 2️⃣ Pārbaude configured()
    console.log("configured():", configured());
  
    // 3️⃣ Supabase pieslēgums
    const supabase = createClient(url, anonKey);
  
    // 4️⃣ Izvelk visus lietotājus
    const { data, error } = await supabase.from("users").select("*");
  
    // 5️⃣ Rezultāti
    console.log("Supabase public.users data:", data);
    if (error) console.error("Supabase error:", error);
  
  })();
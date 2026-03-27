# PDD aplikācija

**Viena `index.html` — bez Node, bez `npm run dev`.** React un date-fns no CDN. Atver failu — **uzreiz moduļu skats** (`TIKAI_VIENKARSI_SKATS = true`), dati `localStorage`.

## Konfigurācija

1. **Noklusējums:** nav API, nav paroles — tieši **Moduļi** → **Prombūtnes**.
2. **Supabase / parole:** `index.html` ieliec `TIKAI_VIENKARSI_SKATS = false`, tad iestati `FILE_SUPABASE_*` vai lokālo paroli (`LocalPasswordScreen`).
2. Supabase **SQL Editor**: palaid `supabase/migrations/20260327220000_initial_pdd.sql`
3. **Authentication → URL configuration**: **Site URL** un **Redirect URLs** — tava lappuse (piem. `https://irinakupcova.github.io/PDD_aplikacija/`) un `http://localhost/**` ja vajag.

## Atvēršana lokāli

- Dubultklikšķis uz `index.html` vai „Open with” pārlūkā.  
- Ja pārlūks bloķē `file://` moduļus, augšupielādē to pašu failu uz **HTTPS** (GitHub Pages) vai izmanto citu statisku hostingu.

## GitHub Pages

Repozitorijs: [IrinaKupcova/PDD_aplikacija](https://github.com/IrinaKupcova/PDD_aplikacija)

1. **Settings → Secrets → Actions**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (tās darbplūsma ieraksta publicētajā HTML).
2. **Settings → Pages**: avots **GitHub Actions**.
3. Push uz `main` — darbplūsma **Deploy GitHub Pages**.

## Piezīmes

- **Anon** atslēga tāpat ir redzama pārlūkā; nepublicē **service_role**.
- Mapes `public/` nav obligātas — darbplūsma izveido `.nojekyll`.

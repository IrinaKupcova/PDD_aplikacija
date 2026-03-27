# PDD aplikācija

**Viena `index.html` — bez Node, bez `npm run dev`.** React, Supabase un date-fns ielādējas no tīkla (CDN). Pietiek atvērt failu pārlūkā vai publicēt uz GitHub Pages.

## Konfigurācija

1. **Pagaidām (bez API):** atver `index.html` — ievadi paroli **`pdd`** (vai maini konstanti `PAGAIDU_PAROLE` failā). Prombūtnes glabājas tikai šajā pārlūkā (`localStorage`).
2. **Vēlāk ar Supabase:** ieraksti `index.html` laukos `FILE_SUPABASE_URL` un `FILE_SUPABASE_ANON_KEY`, vai GitHub Actions Secrets — tad dati mākonī.
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

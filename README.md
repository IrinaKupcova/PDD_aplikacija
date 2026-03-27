# PDD aplikācija

Pakalpojumu dizaina daļas darba organizācija: **React (Vite)**, **Supabase** (auth + dati), izvietošana **GitHub Pages**.

## Kas jau salikts projektā

- Viss avota kods, SQL migrācija un **GitHub Actions** darbplūsma `Deploy GitHub Pages`.
- Lokāli ir **git commit** uz zara `main`. Automātiski nevarēja: **GitHub push** (repozitorijs nepastāv vai nav piekļuves) un **Supabase projekts** (vajadzīgs tavs konts).

### Tūlīt tevis (dažas minūtes)

1. **GitHub:** izveido tukšu repozitoriju `PDD_aplikacija` (vai kā sauc remote), tad projekta mapē:
   ```bash
   git remote set-url origin https://github.com/TAVS_LIETOTAJVARDS/PDD_aplikacija.git
   git push -u origin main
   ```
2. **GitHub:** **Settings → Secrets → Actions** — pievieno `VITE_SUPABASE_URL` un `VITE_SUPABASE_ANON_KEY`.
3. **GitHub:** **Settings → Pages** — **Source: GitHub Actions**.
4. **Supabase:** palaid SQL no `supabase/migrations/…` un iestatījumi zemāk.

Pēc tam automātiski notiks lappuses salikšana katrā `git push` uz `main`.

## Supabase

1. Izveido projektu [supabase.com](https://supabase.com) → **Project URL** un **anon public** atslēga (**Settings → API**).
2. **SQL Editor** → ielīmē un palaid `supabase/migrations/20260327220000_initial_pdd.sql`.
3. **Authentication → URL configuration** (svarīgi GitHub Pages):
   - **Site URL**: `https://TAVS_LIETOTAJVARDS.github.io/PDD_aplikacija/` (ievēro bīdīšanas zīmes beigās, ja tā ir tava publiskā lapa).
   - **Redirect URLs**: pievieno to pašu URL un `http://localhost:5173/**` izstrādei.
4. Pēc pirmā testa lietotāja — SQL (aizstāj UUID):  
   `update public.profiles set role = 'manager' where id = '…';`

## GitHub

1. Repozitorijs `PDD_aplikacija` (vai cits nosaukums — tad pielāgo URL Supabase laukos).
2. **Settings → Secrets and variables → Actions → New repository secret**:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. **Settings → Pages** → **Build and deployment** → avots: **GitHub Actions** (nevis „Deploy from branch”).
4. Push uz `main` (vai `master`) — darbplūsma **Deploy GitHub Pages** saliek lapu. Pēc minūtes būs adrese:  
   `https://TAVS_LIETOTAJVARDS.github.io/PDD_aplikacija/`

## Lokāli

```bash
cp .env.example .env
# aizpildi VITE_SUPABASE_URL un VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

`npm run build` izveido mapi `dist/` — to pašu saturu izmanto arī GitHub Actions.

## Supabase + GitHub Pages ikonas

- Aplikācija pārlūkā runā ar Supabase API; servera koda nav.
- **Anon** atslēga paredzēta klientam; tomēr ieteicams **Row Level Security** (jau migrācijā) un nepublicēt **service_role** atslēgu.

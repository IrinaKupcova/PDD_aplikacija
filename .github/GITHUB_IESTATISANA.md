# GitHub — ko iestatīt (vienreiz)

Repozitorijs: **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.

## 1. Lapa (GitHub Pages + Supabase klientam)

Darbplūsma: `Deploy GitHub Pages`.

| Nosaukums (precīzi) | No kurienes |
|---------------------|-------------|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API → Project URL — **nokopē precīzi** (bez liekām atstarpēm; bieža kļūda: `gqet` ↔ `qget` burtu secība ref ID). |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon public / publishable key |

Bez šīm lapā var palikt vecās vērtības no `index.html`.

## 2. „Cits” e-pasts (Edge Function + Resend)

Darbplūsma: `Supabase Edge — sendEmail + Resend`.

| Nosaukums (precīzi) | No kurienes |
|---------------------|-------------|
| `SUPABASE_ACCESS_TOKEN` | [Supabase Account → Access Tokens](https://supabase.com/dashboard/account/tokens) — izveido jaunu |
| `SUPABASE_PROJECT_REF` | Supabase → Project Settings → General → **Reference ID** (piem. `fdnkvecgqetmwilwolgt`) |
| `RESEND_API_KEY` | [Resend](https://resend.com) → API Keys |
| `RESEND_FROM` | Resend atļauts sūtītājs, piem. `PDD <onboarding@resend.dev>` vai verificēts domēns. Ar `*@resend.dev` funkcija **nesūta CC** (Resend ierobežojums); ar savu domēnu CC atkal strādā. |

Ja `SUPABASE_ACCESS_TOKEN` vai `SUPABASE_PROJECT_REF` nav, šī darbplūsma **netiek palaista** (nekļūda).

Ja nav `RESEND_API_KEY`, funkcija deployojas, bet Resend var nestrādāt, kamēr secret nav ielikts.

Pēc `git push` uz `main` vai `master` darbplūsma pati: uzliek secrets Supabase Edge vidē un `deploy` funkciju `sendEmail` ar `--no-verify-jwt`.

## 3. GitHub Pages

Repozitorijs: **Settings** → **Pages** → **Build and deployment**: **GitHub Actions**.

## 4. Pārbaude

- **Actions** cilnē redzamas zaļas darbplūsmas pēc push.
- E-pastam: Supabase → Edge Functions → `sendEmail` → Logs pēc testa pieteikuma.

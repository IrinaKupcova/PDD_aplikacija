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
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → **service_role** (tikai GitHub Secrets — ne frontend!) |
| `SUPABASE_URL` (neobligāti) | Ja nav, izmanto `VITE_SUPABASE_URL` |
| `RESEND_TO` (neobligāti) | Viena adrese vai vairākas, atdalītas ar **semikolu** vai **komatu** (ar atstarpēm), piem. `katrina.jirgensone@vid.gov.lv; irina.kupcova@vid.gov.lv`. Nedrīkst likt abas kā vienu garu stringu bez atdalītāja. |

Ja `SUPABASE_ACCESS_TOKEN` vai `SUPABASE_PROJECT_REF` nav, šī darbplūsma **netiek palaista** (nekļūda).

Ja nav `RESEND_API_KEY`, funkcija deployojas, bet Resend var nestrādāt, kamēr secret nav ielikts.

Pēc `git push` uz `main` vai `master` darbplūsma pati: uzliek secrets Supabase Edge vidē un `deploy` funkciju `sendEmail` ar `--no-verify-jwt`.

## 2b. IaD mēneša atgādinājumi (servera cron)

Darbplūsma: `IaD monthly reminders` — **katru mēneša 1. datumu** automātiski sūta atgādinājumus atbildīgajiem/līdzatbildīgajiem (neatkarīgi no tā, vai kāds ir atvēris lapu).

| Nosaukums | No kurienes |
|-----------|-------------|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API → service_role |
| `SUPABASE_URL` vai `VITE_SUPABASE_URL` | Project URL |
| `RESEND_API_KEY`, `RESEND_FROM` | kā 2. sadaļā |

Tests: Actions → **IaD monthly reminders** → Run workflow → force: `true`.

## 3. GitHub Pages

Repozitorijs: **Settings** → **Pages** → **Build and deployment**: **GitHub Actions**.

## 4. Pārbaude

- **Actions** cilnē redzamas zaļas darbplūsmas pēc push.
- E-pastam: Supabase → Edge Functions → `sendEmail` → Logs pēc testa pieteikuma.

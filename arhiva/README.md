# Lokālais arhīvs — vecā vēsture

## Svarīgi (DB bloķējums)

Kamēr Supabase rāda **EXCEEDING USAGE LIMITS** / timeout — vispirms:

1. Supabase → **Restart project**
2. SQL Editor → palaid failu **`supabase/PIEMEROT_TIRIT_VECO_VESTURI.sql`**
   - arhivē metadatus tabulās `pdd_arhiva_*_meta`
   - dzēš aktualitātes: **jūnijs un vecāk** + visas **neaktuālās**
   - dzēš prombūtnes: **jūnijs un vecāk**
   - **noņem visas `<img>` bildes** no atlikušajām aktualitātēm
3. Aplikācijā **Ctrl+F5**

## Papildu lokālais JSON

Kad DB atbild:

```text
py iztirit_veco_vesturi.py
```

Saglabā vieglu meta JSON šajā mapē (bez milzu base64).

**Neaizskar:** Pakalpojumu vadība, Procesu vadība, čats, komanda, IAD.

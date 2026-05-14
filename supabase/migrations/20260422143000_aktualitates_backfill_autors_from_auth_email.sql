-- Backfill AKTUALITATES.Autors -> users.id, ja agrāk tika saglabāts auth UID bez rindas public.users.
-- Meklē sakritību pēc auth.users.email = users email/i-mail/e-mail.

update public."AKTUALITATES" a
set "Autors" = u.id
from auth.users au
join public.users u
  on lower(trim(coalesce(au.email, ''))) = lower(trim(coalesce(u.email, u."i-mail", u."e-mail", '')))
where a."Autors" = au.id
  and a."Autors" is not null
  and a."Autors" <> u.id;

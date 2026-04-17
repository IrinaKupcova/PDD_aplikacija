-- Atļauj visiem lietotājiem (anon/authenticated) labot prombūtnes ierakstus.
-- Vajadzīgs, lai "User" var labot prombūtnes tāpat kā "Admin" aplikācijas UI.

alter table if exists public.prombutnes_dati enable row level security;

grant select, update on table public.prombutnes_dati to anon, authenticated;

drop policy if exists "prombutnes_update_own_pending" on public.prombutnes_dati;
drop policy if exists "prombutnes_manager_approve" on public.prombutnes_dati;
drop policy if exists "pdd_prombutnes_update_all_users" on public.prombutnes_dati;

create policy "pdd_prombutnes_update_all_users"
on public.prombutnes_dati
for update
to anon, authenticated
using (true)
with check (true);

-- Restrict Komanda tabulas CRUD: tikai Admin drīkst labot/dzēst/pievienot (caur lapu).
-- Parastam lietotājam (role != 'admin') nedrīkst būt update/delete/insert tiesības.

begin;

alter table public.users enable row level security;

-- Noņem veco “update own” politiku, jo tā ļauj user labot sevi.
drop policy if exists "users_update_own" on public.users;

-- Admin CRUD
drop policy if exists "users_insert_admin" on public.users;
drop policy if exists "users_update_admin" on public.users;
drop policy if exists "users_delete_admin" on public.users;

create policy "users_insert_admin"
  on public.users
  for insert to authenticated
  with check (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and lower(trim(coalesce(u.role, ''))) = 'admin'
    )
  );

create policy "users_update_admin"
  on public.users
  for update to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and lower(trim(coalesce(u.role, ''))) = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and lower(trim(coalesce(u.role, ''))) = 'admin'
    )
  );

create policy "users_delete_admin"
  on public.users
  for delete to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and lower(trim(coalesce(u.role, ''))) = 'admin'
    )
  );

commit;


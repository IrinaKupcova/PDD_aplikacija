-- PDD aplikācija: lietotāju rinda (1:1 ar auth.users), prombūtnes veidi, pieteikumi
-- Palaid Supabase → SQL Editor → ielīmē un „Run”.
--
-- Vadītāja loma (aizstāj UUID):
--   update public.users set role = 'manager' where id = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';

create extension if not exists "pgcrypto";

-- Lietotājs / profils (1:1 ar auth.users). Tabula: public.users
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text,
  role text not null default 'employee' check (role in ('employee', 'manager', 'admin')),
  created_at timestamptz not null default now()
);

create table public.prombutnes_veidi (
  id serial primary key,
  name text not null unique,
  color text not null default '#4f46e5',
  sort_order int not null default 0
);

create table public.prombutnes_dati (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type_id int not null references public.prombutnes_veidi (id),
  start_date date not null,
  end_date date not null,
  comment text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  approved_by uuid references auth.users (id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index idx_prombutnes_dati_range on public.prombutnes_dati (start_date, end_date);
create index idx_prombutnes_dati_user on public.prombutnes_dati (user_id);

-- Jauns auth lietotājs → rinda public.users
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, full_name, role, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    coalesce(nullif(new.raw_user_meta_data ->> 'role', ''), 'employee'),
    new.email
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

insert into public.prombutnes_veidi (name, color, sort_order) values
  ('Atvaļinājums', '#2563eb', 1),
  ('Papildatvaļinājums', '#7c3aed', 2),
  ('Komandējums', '#0891b2', 3),
  ('Mācības', '#059669', 4),
  ('Slimības lapa', '#dc2626', 5),
  ('Neapmaksāta prombūtne', '#ca8a04', 6),
  ('Cits (ar vadītāja saskaņojumu)', '#64748b', 7)
on conflict (name) do nothing;

alter table public.users enable row level security;
alter table public.prombutnes_veidi enable row level security;
alter table public.prombutnes_dati enable row level security;

create policy "users_select_authenticated" on public.users
  for select to authenticated using (true);

create policy "users_update_own" on public.users
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create policy "prombutnes_veidi_select" on public.prombutnes_veidi
  for select to authenticated using (true);

create policy "prombutnes_select" on public.prombutnes_dati
  for select to authenticated using (true);

create policy "prombutnes_insert_own" on public.prombutnes_dati
  for insert to authenticated with check (auth.uid() = user_id);

create policy "prombutnes_update_own_pending" on public.prombutnes_dati
  for update to authenticated
  using (auth.uid() = user_id and status = 'pending')
  with check (auth.uid() = user_id and status = 'pending');

create policy "prombutnes_manager_approve" on public.prombutnes_dati
  for update to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role in ('manager', 'admin')
    )
  );

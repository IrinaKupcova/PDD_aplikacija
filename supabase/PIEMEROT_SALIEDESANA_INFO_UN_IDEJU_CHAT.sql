-- Palaid Supabase → SQL Editor → New query → ielīmē un Run.
-- Saliedēšanas info ieraksti + ideju čats (kopīgs Saliedēšanai un Aktualitātēm).

begin;

create table if not exists public.pdd_saliedesana_info (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  body text not null,
  actor_key text not null default '',
  actor_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pdd_saliedesana_info_created
  on public.pdd_saliedesana_info (created_at desc);

alter table public.pdd_saliedesana_info enable row level security;

drop policy if exists pdd_saliedesana_info_select_all on public.pdd_saliedesana_info;
drop policy if exists pdd_saliedesana_info_insert_all on public.pdd_saliedesana_info;
drop policy if exists pdd_saliedesana_info_update_all on public.pdd_saliedesana_info;
drop policy if exists pdd_saliedesana_info_delete_all on public.pdd_saliedesana_info;

create policy pdd_saliedesana_info_select_all
  on public.pdd_saliedesana_info for select to anon, authenticated
  using (true);

create policy pdd_saliedesana_info_insert_all
  on public.pdd_saliedesana_info for insert to anon, authenticated
  with check (true);

create policy pdd_saliedesana_info_update_all
  on public.pdd_saliedesana_info for update to anon, authenticated
  using (true)
  with check (true);

create policy pdd_saliedesana_info_delete_all
  on public.pdd_saliedesana_info for delete to anon, authenticated
  using (true);

grant select, insert, update, delete on table public.pdd_saliedesana_info to anon, authenticated, service_role;

create table if not exists public.pdd_ideju_chat (
  id uuid primary key default gen_random_uuid(),
  body text not null,
  actor_key text not null,
  actor_name text,
  source text not null default 'saliedesana'
    check (source in ('saliedesana', 'aktualitates', 'other')),
  created_at timestamptz not null default now()
);

create index if not exists idx_pdd_ideju_chat_created
  on public.pdd_ideju_chat (created_at asc);

alter table public.pdd_ideju_chat enable row level security;

drop policy if exists pdd_ideju_chat_select_all on public.pdd_ideju_chat;
drop policy if exists pdd_ideju_chat_insert_all on public.pdd_ideju_chat;
drop policy if exists pdd_ideju_chat_delete_all on public.pdd_ideju_chat;

create policy pdd_ideju_chat_select_all
  on public.pdd_ideju_chat for select to anon, authenticated
  using (true);

create policy pdd_ideju_chat_insert_all
  on public.pdd_ideju_chat for insert to anon, authenticated
  with check (true);

create policy pdd_ideju_chat_delete_all
  on public.pdd_ideju_chat for delete to anon, authenticated
  using (true);

grant select, insert, delete on table public.pdd_ideju_chat to anon, authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'pdd_saliedesana_info'
    ) then
      alter publication supabase_realtime add table public.pdd_saliedesana_info;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'pdd_ideju_chat'
    ) then
      alter publication supabase_realtime add table public.pdd_ideju_chat;
    end if;
  end if;
end $$;

commit;

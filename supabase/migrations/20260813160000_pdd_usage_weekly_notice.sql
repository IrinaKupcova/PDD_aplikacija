-- Nedēļas Supabase Usage/Egress trends — viena rinda, atjaunina GitHub Action.
-- Klienta baneris (admin) lasa; raksta tikai service_role (CI).

create table if not exists public.pdd_usage_weekly_notice (
  id smallint primary key default 1 check (id = 1),
  notice_id text not null default '',
  captured_at timestamptz not null default now(),
  alert boolean not null default false,
  summary text not null default '',
  details jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.pdd_usage_weekly_notice enable row level security;

grant select on public.pdd_usage_weekly_notice to anon, authenticated, service_role;
grant insert, update, delete on public.pdd_usage_weekly_notice to service_role;

drop policy if exists pdd_usage_weekly_notice_select on public.pdd_usage_weekly_notice;
create policy pdd_usage_weekly_notice_select
  on public.pdd_usage_weekly_notice
  for select to anon, authenticated
  using (true);

insert into public.pdd_usage_weekly_notice (id, notice_id, summary)
values (1, '', 'Vēl nav nedēļas Usage pārbaudes.')
on conflict (id) do nothing;

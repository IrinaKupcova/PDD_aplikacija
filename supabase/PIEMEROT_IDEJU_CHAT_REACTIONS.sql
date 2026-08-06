-- Palaid Supabase → SQL Editor → New query → ielīmē un Run.
-- Čata ziņu emoji reakcijas.

begin;

create table if not exists public.pdd_ideju_chat_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id text not null,
  actor_key text not null,
  actor_name text,
  emoji text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (message_id, actor_key)
);

create index if not exists idx_pdd_ideju_chat_reactions_msg
  on public.pdd_ideju_chat_reactions (message_id);

alter table public.pdd_ideju_chat_reactions enable row level security;

drop policy if exists pdd_ideju_chat_reactions_select_all on public.pdd_ideju_chat_reactions;
drop policy if exists pdd_ideju_chat_reactions_insert_all on public.pdd_ideju_chat_reactions;
drop policy if exists pdd_ideju_chat_reactions_update_all on public.pdd_ideju_chat_reactions;
drop policy if exists pdd_ideju_chat_reactions_delete_all on public.pdd_ideju_chat_reactions;

create policy pdd_ideju_chat_reactions_select_all
  on public.pdd_ideju_chat_reactions for select to anon, authenticated
  using (true);

create policy pdd_ideju_chat_reactions_insert_all
  on public.pdd_ideju_chat_reactions for insert to anon, authenticated
  with check (true);

create policy pdd_ideju_chat_reactions_update_all
  on public.pdd_ideju_chat_reactions for update to anon, authenticated
  using (true)
  with check (true);

create policy pdd_ideju_chat_reactions_delete_all
  on public.pdd_ideju_chat_reactions for delete to anon, authenticated
  using (true);

grant select, insert, update, delete on table public.pdd_ideju_chat_reactions to anon, authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'pdd_ideju_chat_reactions'
    ) then
      alter publication supabase_realtime add table public.pdd_ideju_chat_reactions;
    end if;
  end if;
end $$;

commit;

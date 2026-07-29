-- Aktualitāšu novērtējumi (like/dislike) un komentāri.
-- Sinhronizācija ar Sodien.js (localStorage rezerve).

begin;

create table if not exists public.aktualitates_reactions (
  id uuid primary key default gen_random_uuid(),
  aktualitate_id text not null,
  actor_key text not null,
  actor_name text,
  reaction text not null check (reaction in ('like', 'dislike')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (aktualitate_id, actor_key)
);

create index if not exists idx_aktualitates_reactions_akt
  on public.aktualitates_reactions (aktualitate_id);

create table if not exists public.aktualitates_comments (
  id uuid primary key default gen_random_uuid(),
  aktualitate_id text not null,
  actor_key text not null,
  actor_name text,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_aktualitates_comments_akt
  on public.aktualitates_comments (aktualitate_id, created_at);

alter table public.aktualitates_reactions enable row level security;
alter table public.aktualitates_comments enable row level security;

drop policy if exists aktualitates_reactions_select_all on public.aktualitates_reactions;
drop policy if exists aktualitates_reactions_insert_all on public.aktualitates_reactions;
drop policy if exists aktualitates_reactions_update_all on public.aktualitates_reactions;
drop policy if exists aktualitates_reactions_delete_all on public.aktualitates_reactions;

create policy aktualitates_reactions_select_all
  on public.aktualitates_reactions for select to anon, authenticated
  using (true);

create policy aktualitates_reactions_insert_all
  on public.aktualitates_reactions for insert to anon, authenticated
  with check (true);

create policy aktualitates_reactions_update_all
  on public.aktualitates_reactions for update to anon, authenticated
  using (true)
  with check (true);

create policy aktualitates_reactions_delete_all
  on public.aktualitates_reactions for delete to anon, authenticated
  using (true);

drop policy if exists aktualitates_comments_select_all on public.aktualitates_comments;
drop policy if exists aktualitates_comments_insert_all on public.aktualitates_comments;
drop policy if exists aktualitates_comments_update_all on public.aktualitates_comments;
drop policy if exists aktualitates_comments_delete_all on public.aktualitates_comments;

create policy aktualitates_comments_select_all
  on public.aktualitates_comments for select to anon, authenticated
  using (true);

create policy aktualitates_comments_insert_all
  on public.aktualitates_comments for insert to anon, authenticated
  with check (true);

create policy aktualitates_comments_update_all
  on public.aktualitates_comments for update to anon, authenticated
  using (true)
  with check (true);

create policy aktualitates_comments_delete_all
  on public.aktualitates_comments for delete to anon, authenticated
  using (true);

grant select, insert, update, delete on table public.aktualitates_reactions to anon, authenticated;
grant select, insert, update, delete on table public.aktualitates_comments to anon, authenticated;

commit;

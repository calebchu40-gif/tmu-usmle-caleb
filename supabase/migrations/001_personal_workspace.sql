-- Run once in the Supabase SQL editor. The owner must be enrolled separately.
create table public.workspace_owner (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users(id) on delete cascade
);
alter table public.workspace_owner enable row level security;
revoke all on public.workspace_owner from anon, authenticated;
grant select on public.workspace_owner to authenticated;
create policy owner_read on public.workspace_owner for select to authenticated using (user_id = (select auth.uid()));

create function public.is_workspace_owner() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.workspace_owner where user_id = (select auth.uid()));
$$;
revoke all on function public.is_workspace_owner() from public, anon;
grant execute on function public.is_workspace_owner() to authenticated;

create table public.study_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  page_path text not null default '' check (length(page_path) <= 500),
  question_id text check (length(question_id) between 1 and 100),
  title text not null check (length(title) between 1 and 200),
  selected integer check (selected between 0 and 25),
  correct boolean,
  submitted boolean not null default false,
  marked boolean not null default false,
  note text not null default '' check (length(note) <= 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, page_path, question_id)
);
create table public.study_favorites (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  page_path text not null check (length(page_path) between 1 and 500),
  created_at timestamptz not null default now(),
  primary key (user_id, page_path)
);
create table public.study_pages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (length(title) between 1 and 200),
  category text not null check (length(category) between 1 and 100),
  html text not null check (octet_length(html) between 1 and 2097152),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger study_records_updated before update on public.study_records for each row execute function public.touch_updated_at();
create trigger study_pages_updated before update on public.study_pages for each row execute function public.touch_updated_at();

alter table public.study_records enable row level security;
alter table public.study_favorites enable row level security;
alter table public.study_pages enable row level security;
revoke all on public.study_records, public.study_favorites, public.study_pages from anon, authenticated;
grant select, insert, update, delete on public.study_records, public.study_favorites, public.study_pages to authenticated;
create policy personal_records on public.study_records for all to authenticated
  using ((select public.is_workspace_owner()) and user_id = (select auth.uid()))
  with check ((select public.is_workspace_owner()) and user_id = (select auth.uid()));
create policy personal_favorites on public.study_favorites for all to authenticated
  using ((select public.is_workspace_owner()) and user_id = (select auth.uid()))
  with check ((select public.is_workspace_owner()) and user_id = (select auth.uid()));
create policy personal_pages on public.study_pages for all to authenticated
  using ((select public.is_workspace_owner()) and user_id = (select auth.uid()))
  with check ((select public.is_workspace_owner()) and user_id = (select auth.uid()));
create index study_records_user_updated on public.study_records(user_id, updated_at desc);
create index study_pages_user_updated on public.study_pages(user_id, updated_at desc);

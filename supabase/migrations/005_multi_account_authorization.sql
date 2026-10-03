-- Expand the personal-workspace allowlist to support separately authorized accounts.
-- Existing user_id rows are preserved; only the old single-row constraint is removed.
begin;

alter table public.workspace_owner
  drop constraint if exists workspace_owner_pkey;

alter table public.workspace_owner
  drop constraint if exists workspace_owner_user_id_key;

alter table public.workspace_owner
  drop column if exists singleton;

alter table public.workspace_owner
  add constraint workspace_owner_pkey primary key (user_id);

commit;

-- Transactional permission tests. Run in SQL Editor as postgres; leaves no data.
begin;
-- Save the configured owner in this transaction and restore it via rollback.
delete from public.workspace_owner;
insert into auth.users(id) values ('00000000-0000-4000-8000-000000000001'), ('00000000-0000-4000-8000-000000000002');
insert into public.workspace_owner(user_id) values ('00000000-0000-4000-8000-000000000001');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
insert into public.study_records(id,title) values ('00000000-0000-4000-8000-000000000003','permission test');
update public.study_records set note='updated' where id='00000000-0000-4000-8000-000000000003';
insert into public.study_pages(id,title,category,html) values ('00000000-0000-4000-8000-000000000004','test','test','<h1>test</h1>');
insert into public.study_favorites(page_path) values ('permission-test.html');
do $$ begin
  if (select note from public.study_records where id='00000000-0000-4000-8000-000000000003') <> 'updated' then raise exception 'Owner CRUD failed'; end if;
end $$;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';
do $$ begin
  if exists(select 1 from public.study_records) or exists(select 1 from public.study_pages) or exists(select 1 from public.study_favorites) or exists(select 1 from public.workspace_owner) then raise exception 'Non-owner can read data'; end if;
  begin
    insert into public.study_records(title) values ('must fail');
    raise exception 'Non-owner can write records';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.study_pages(title,category,html) values ('must fail','test','test');
    raise exception 'Non-owner can upload HTML';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.workspace_owner(user_id) values ('00000000-0000-4000-8000-000000000002');
    raise exception 'Non-owner can enroll themselves';
  exception when insufficient_privilege then null; end;
end $$;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
delete from public.study_records where id='00000000-0000-4000-8000-000000000003';
delete from public.study_pages where id='00000000-0000-4000-8000-000000000004';
delete from public.study_favorites where page_path='permission-test.html';
do $$ begin
  if exists(select 1 from public.study_records where id='00000000-0000-4000-8000-000000000003') then raise exception 'Owner delete failed'; end if;
end $$;
set local role anon;
do $$ begin
  begin
    perform 1 from public.study_records;
    raise exception 'Anonymous can read records';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
select 'PASS: owner CRUD; non-owner and anonymous access blocked; changes rolled back' as result;

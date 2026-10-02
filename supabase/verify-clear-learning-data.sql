-- Read/write verification inside a transaction that ALWAYS rolls back.
begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.workspace_owner),true);
set local role authenticated;
do $$
declare before_pages jsonb; after_pages jsonb; r public.study_records;
begin
  insert into public.study_pages(title,category,html,question_index)
    values ('Reset verification','Test','<h1>Keep this HTML</h1>','[{"id":"q1","title":"Keep question index"}]');
  insert into public.study_favorites(page_path) values ('__reset_verification__');
  r := public.study_question_event('__reset_verification__','q1','Reset test',gen_random_uuid(),'attempt',0,true);
  r := public.study_question_event('__reset_verification__','q1','Reset test',gen_random_uuid(),'mark',null,null,true);
  insert into public.study_records(title,note) values ('Reset note','Clear this note');
  select jsonb_agg(to_jsonb(p) order by id) into before_pages from public.study_pages p;
  perform public.clear_study_learning_data();
  if exists(select 1 from public.study_records) or exists(select 1 from public.study_attempts)
     or exists(select 1 from public.study_favorites) then raise exception 'Learning data was not cleared'; end if;
  select jsonb_agg(to_jsonb(p) order by id) into after_pages from public.study_pages p;
  if before_pages is distinct from after_pages then raise exception 'HTML pages or metadata changed';end if;
  if not public.is_workspace_owner() then raise exception 'Owner access changed';end if;
  perform public.clear_study_learning_data(); -- Empty reset is safe too.
end $$;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000099';
do $$ begin
  begin
    perform public.clear_study_learning_data();
    raise exception 'Non-owner reset should fail';
  exception when insufficient_privilege then null;end;
end $$;
rollback;
select 'PASS: learning data cleared atomically, HTML unchanged, owner retained, non-owner blocked; ALL changes rolled back' as result;

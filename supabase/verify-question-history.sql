-- All test rows are rolled back. Uses the configured owner's identity.
begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.workspace_owner),true);
set local role authenticated;
do $$
declare r public.study_records; other public.study_records; n integer;
begin
  r := public.study_question_event('__history_verification__','q1','Test question','11111111-1111-4111-8111-111111111111','attempt',1,false);
  if r.correct or r.wrong_count<>1 or r.correct_count<>0 then raise exception 'First wrong answer failed';end if;
  r := public.study_question_event('__history_verification__','q1','Test question','11111111-1111-4111-8111-111111111111','attempt',1,false);
  if r.wrong_count<>1 then raise exception 'Duplicate request counted twice';end if;
  r := public.study_question_event('__history_verification__','q1','Test question','22222222-2222-4222-8222-222222222222','mark',null,null,true);
  if not r.marked or r.wrong_count<>1 then raise exception 'Mark changed history';end if;
  update public.study_records set note='preserve note' where id=r.id;
  r := public.study_question_event('__history_verification__','q1','Test question','33333333-3333-4333-8333-333333333333','attempt',0,true);
  if not r.correct or not r.marked or r.correct_count<>1 or r.wrong_count<>1 or r.note<>'preserve note' then raise exception 'Wrong to correct transition failed';end if;
  r := public.study_question_event('__history_verification__','q1','Test question','44444444-4444-4444-8444-444444444444','attempt',2,false);
  if r.correct or r.correct_count<>1 or r.wrong_count<>2 then raise exception 'Correct to wrong transition failed';end if;
  r := public.study_question_event('__history_verification__','q1','Test question','33333333-3333-4333-8333-333333333333','attempt',0,true);
  if r.correct or r.wrong_count<>2 then raise exception 'Old retry changed latest state';end if;
  select count(*) into n from public.study_attempts where record_id=r.id;
  if n<>3 then raise exception 'Unexpected attempt count';end if;
  other := public.study_question_event('__history_verification__','q2','Untouched question','55555555-5555-4555-8555-555555555555','mark',null,null,true);
  if other.submitted or other.correct_count<>0 or other.wrong_count<>0 then raise exception 'Unanswered mark should not submit';end if;
  begin
    perform public.study_question_event('__history_verification__','q2','Test','11111111-1111-4111-8111-111111111111','attempt',1,false);
    raise exception 'Reusing another question event ID should fail';
  exception when invalid_parameter_value then null;end;
end $$;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000099';
do $$ begin
  if exists(select 1 from public.study_attempts) then raise exception 'Non-owner sees attempt history';end if;
  begin
    perform public.study_question_event('private','q','Test','99999999-9999-4999-8999-999999999999','attempt',0,true);
    raise exception 'Non-owner can submit';
  exception when insufficient_privilege then null;end;
end $$;
rollback;
select 'PASS: last-answer transitions, independent questions, marks, history, idempotent retries, owner isolation; test rows rolled back' as result;

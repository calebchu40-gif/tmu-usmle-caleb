begin;

alter table public.study_records
  add column elapsed_seconds integer not null default 0 check (elapsed_seconds >= 0);
alter table public.study_attempts
  add column elapsed_seconds integer not null default 0 check (elapsed_seconds >= 0);

drop function if exists public.study_question_event(text,text,text,uuid,text,integer,boolean,boolean);

create function public.study_question_event(
  p_page text, p_question text, p_title text, p_event uuid, p_action text,
  p_selected integer default null, p_correct boolean default null, p_marked boolean default null,
  p_elapsed_seconds integer default 0
) returns public.study_records language plpgsql security invoker set search_path = '' as $$
declare r public.study_records; a public.study_attempts; inserted integer;
begin
  if not public.is_workspace_owner() then raise insufficient_privilege using message = 'Owner access required'; end if;
  if p_question is null or p_question !~ '^[a-zA-Z0-9_-]{1,100}$' or p_event is null or
     p_action not in ('attempt','mark') or p_action is null then
    raise invalid_parameter_value using message = 'Invalid question event';
  end if;
  if p_action = 'attempt' and (p_selected is null or p_selected < 0 or p_selected > 25 or p_correct is null or
     p_elapsed_seconds is null or p_elapsed_seconds < 0 or p_elapsed_seconds > 86400) then
    raise invalid_parameter_value using message = 'Invalid answer';
  end if;
  if p_action = 'mark' and p_marked is null then raise invalid_parameter_value using message = 'Invalid mark'; end if;
  insert into public.study_records(user_id,page_path,question_id,title)
    values (auth.uid(),p_page,p_question,p_title)
    on conflict (user_id,page_path,question_id) do nothing;
  select * into strict r from public.study_records
    where user_id=auth.uid() and page_path=p_page and question_id=p_question for update;
  if p_action = 'mark' then
    update public.study_records set marked=p_marked where id=r.id returning * into r;
  else
    insert into public.study_attempts(id,user_id,record_id,selected,correct,elapsed_seconds)
      values (p_event,auth.uid(),r.id,p_selected,p_correct,p_elapsed_seconds) on conflict(id) do nothing;
    get diagnostics inserted = row_count;
    if inserted = 1 then
      update public.study_records set title=p_title,selected=p_selected,correct=p_correct,submitted=true,
        elapsed_seconds=elapsed_seconds + p_elapsed_seconds,
        correct_count=correct_count + case when p_correct then 1 else 0 end,
        wrong_count=wrong_count + case when p_correct then 0 else 1 end
      where id=r.id returning * into r;
    else
      select * into a from public.study_attempts where id=p_event;
      if a.id is null or a.record_id <> r.id or a.selected <> p_selected or a.correct <> p_correct or
         a.elapsed_seconds <> p_elapsed_seconds then
        raise invalid_parameter_value using message = 'Event ID already used for another answer';
      end if;
      select * into strict r from public.study_records where id=r.id;
    end if;
  end if;
  return r;
end;
$$;
revoke all on function public.study_question_event(text,text,text,uuid,text,integer,boolean,boolean,integer) from public,anon;
grant execute on function public.study_question_event(text,text,text,uuid,text,integer,boolean,boolean,integer) to authenticated;
commit;

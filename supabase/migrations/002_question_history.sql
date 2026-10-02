begin;
alter table public.study_records
  add column correct_count integer not null default 0 check (correct_count >= 0),
  add column wrong_count integer not null default 0 check (wrong_count >= 0);
alter table public.study_pages add column question_index jsonb not null default '[]'::jsonb check (jsonb_typeof(question_index) = 'array');
create table public.study_attempts (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  record_id uuid not null references public.study_records(id) on delete cascade,
  selected integer not null check (selected between 0 and 25),
  correct boolean not null,
  answered_at timestamptz not null default now()
);
alter table public.study_attempts enable row level security;
revoke all on public.study_attempts from anon, authenticated;
grant select, insert on public.study_attempts to authenticated;
create policy personal_attempts on public.study_attempts for all to authenticated
  using ((select public.is_workspace_owner()) and user_id = (select auth.uid()))
  with check ((select public.is_workspace_owner()) and user_id = (select auth.uid()) and exists (
    select 1 from public.study_records r where r.id = record_id and r.user_id = (select auth.uid())
  ));
create index study_attempts_record_time on public.study_attempts(record_id, answered_at desc);
-- Previously only the last answer existed. Preserve it as one historical attempt.
insert into public.study_attempts(id,user_id,record_id,selected,correct,answered_at)
select id,user_id,id,selected,correct,updated_at from public.study_records
where question_id is not null and submitted and selected is not null and correct is not null;
update public.study_records set
  correct_count = case when submitted and correct = true and selected is not null then 1 else 0 end,
  wrong_count = case when submitted and correct = false and selected is not null then 1 else 0 end
where question_id is not null;

-- Each submission is atomic and idempotent. A retry with the same event ID never
-- counts twice. Row locking serializes simultaneous submissions from devices.
create function public.study_question_event(
  p_page text, p_question text, p_title text, p_event uuid, p_action text,
  p_selected integer default null, p_correct boolean default null, p_marked boolean default null
) returns public.study_records language plpgsql security invoker set search_path = '' as $$
declare r public.study_records; a public.study_attempts; inserted integer;
begin
  if not public.is_workspace_owner() then raise insufficient_privilege using message = 'Owner access required'; end if;
  if p_question is null or p_question !~ '^[a-zA-Z0-9_-]{1,100}$' or p_event is null or
     p_action not in ('attempt','mark') or p_action is null then raise invalid_parameter_value using message = 'Invalid question event'; end if;
  if p_action = 'attempt' and (p_selected is null or p_selected < 0 or p_selected > 25 or p_correct is null) then
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
    insert into public.study_attempts(id,user_id,record_id,selected,correct)
      values (p_event,auth.uid(),r.id,p_selected,p_correct) on conflict(id) do nothing;
    get diagnostics inserted = row_count;
    if inserted = 1 then
      update public.study_records set title=p_title,selected=p_selected,correct=p_correct,submitted=true,
        correct_count=correct_count + case when p_correct then 1 else 0 end,
        wrong_count=wrong_count + case when p_correct then 0 else 1 end
      where id=r.id returning * into r;
    else
      select * into a from public.study_attempts where id=p_event;
      if a.id is null or a.record_id <> r.id or a.selected <> p_selected or a.correct <> p_correct then
        raise invalid_parameter_value using message = 'Event ID already used for another answer';
      end if;
    end if;
  end if;
  return r;
end;
$$;
revoke all on function public.study_question_event(text,text,text,uuid,text,integer,boolean,boolean) from public,anon;
grant execute on function public.study_question_event(text,text,text,uuid,text,integer,boolean,boolean) to authenticated;
commit;

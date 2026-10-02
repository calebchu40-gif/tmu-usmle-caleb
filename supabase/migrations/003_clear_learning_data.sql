begin;
-- One transaction clears learning data only. Uploaded HTML and owner access stay intact.
create function public.clear_study_learning_data()
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not public.is_workspace_owner() then
    raise insufficient_privilege using message = 'Owner access required';
  end if;
  -- Deleting records cascades to study_attempts, including cumulative answer history.
  delete from public.study_records where user_id = auth.uid();
  delete from public.study_favorites where user_id = auth.uid();
end;
$$;
revoke all on function public.clear_study_learning_data() from public, anon;
grant execute on function public.clear_study_learning_data() to authenticated;
commit;

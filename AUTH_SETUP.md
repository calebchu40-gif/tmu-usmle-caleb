# Account setup

The QBank supports usernames and real email addresses. The current test account is intended to use a real email address so email confirmation and password recovery remain available. Do not put its address or password in this public repository. Email self-registration creates an Auth user, but the user cannot enter the QBank until the owner adds that Auth user to `public.workspace_owner`.

## One-time Supabase setup

1. In Supabase Dashboard → SQL Editor, run `supabase/migrations/005_multi_account_authorization.sql`. It removes the old single-user restriction and preserves existing authorized user IDs.
2. In Authentication → Users → Add user, choose **Create new user** (not invitation), enter the test account's real email and the password chosen by its owner, then confirm the address if the dashboard offers that option. Alternatively, register through the site's email-registration button and complete email confirmation.
3. In SQL Editor, authorize the test account, replacing the placeholder with its real email:

```sql
insert into public.workspace_owner (user_id)
select id from auth.users where email = 'REPLACE_WITH_TEST_EMAIL'
on conflict (user_id) do nothing;
```

4. Verify both accounts remain authorized:

```sql
select u.email, w.user_id
from auth.users u
join public.workspace_owner w on w.user_id = u.id
order by u.email;
```

The existing owner account is retained by the migration. After an email user verifies their address, run the same authorization insert with their email substituted to approve them. Never put a Supabase secret/service-role key or user password into this repository or the browser client.

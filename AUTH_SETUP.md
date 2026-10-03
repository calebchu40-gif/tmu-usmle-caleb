# Account setup

The QBank supports two credential forms:

- The no-mailbox test account uses the username `test123`. Its Supabase Auth email identity is `test123@users.invalid`; `.invalid` is a reserved non-deliverable domain. It cannot use email-based password recovery.
- Other accounts use their actual email address and password. Self-registration creates an Auth user, but the user cannot enter the QBank until the owner adds that Auth user to `public.workspace_owner`.

## One-time Supabase setup

1. In Supabase Dashboard → SQL Editor, run `supabase/migrations/005_multi_account_authorization.sql`. It removes the old single-user restriction and preserves existing authorized user IDs.
2. In Authentication → Users → Add user, choose **Create new user** (not invitation), enter `test123@users.invalid`, set a strong temporary password, and confirm the user if the dashboard offers that option. No real mailbox is involved.
3. In SQL Editor, authorize the test account:

```sql
insert into public.workspace_owner (user_id)
select id from auth.users where email = 'test123@users.invalid'
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

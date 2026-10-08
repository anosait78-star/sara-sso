-- Supabase Auth inserts auth.users first and writes app_metadata in a later update
-- (admin.createUser / invite). The insert trigger therefore sees empty metadata, so the
-- profile is synced again whenever app_metadata changes. app_metadata is only writable
-- with the service role, so this cannot be abused by end users.

create or replace function app.sync_profile_from_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  m jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
begin
  update public.profiles p set
    user_type = coalesce((m ->> 'user_type')::public.user_type, p.user_type),
    full_name = coalesce(nullif(m ->> 'full_name', ''), p.full_name),
    must_change_password = coalesce((m ->> 'must_change_password')::boolean, p.must_change_password),
    email = new.email,
    phone = coalesce(new.phone, p.phone)
  where p.id = new.id;
  return new;
end;
$$;
revoke execute on function app.sync_profile_from_auth() from authenticated, anon, public;

create trigger on_auth_user_metadata_updated
  after update of raw_app_meta_data, email, phone on auth.users
  for each row
  when (old.raw_app_meta_data is distinct from new.raw_app_meta_data
        or old.email is distinct from new.email
        or old.phone is distinct from new.phone)
  execute function app.sync_profile_from_auth();

-- The temporary-password flag must not be re-applied after the user changed it:
-- clear it from app_metadata as well when the profile flag is cleared.
create or replace function public.clear_must_change_password()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set must_change_password = false where id = (select auth.uid());
  update auth.users
     set raw_app_meta_data = raw_app_meta_data - 'must_change_password'
   where id = (select auth.uid());
end;
$$;
revoke execute on function public.clear_must_change_password() from anon, public;
grant execute on function public.clear_must_change_password() to authenticated;

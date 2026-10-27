-- Database for the imMBA website (Supabase project htgopftaykbwpgahkyfl).
-- Already applied. Kept here so the setup can be repeated or reviewed.
-- Replace ADMIN_EMAIL_HERE with the email of the person who may edit announcements.

create table if not exists public.announcements (
  id         text primary key,
  date       date    not null,
  pinned     boolean not null default false,
  "order"    integer not null default 0,
  status     text    not null default 'published' check (status in ('published','draft')),
  url        text    not null,
  title_zh   text    not null default '',
  title_en   text    not null default '',
  content_zh text    not null default '',
  content_en text    not null default '',
  auto_zh    boolean not null default false,   -- Chinese text came from the translator, not reviewed yet
  auto_en    boolean not null default false,   -- English text came from the translator, not reviewed yet
  updated_at timestamptz not null default now()
);

-- Who may edit (first version; replaced by the profiles table at the end of this file): emails listed here, confirmed in Supabase Auth
create table if not exists public.admin_emails (email text primary key);
alter table public.admin_emails enable row level security;   -- no policies: not readable through the API
insert into public.admin_emails (email) values ('ADMIN_EMAIL_HERE') on conflict do nothing;

-- The admin check lives in a private schema, so it cannot be called through the public API
create schema if not exists private;
create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = public, auth
as $$
  select exists (
    select 1 from auth.users u
    join public.admin_emails a on lower(a.email) = lower(u.email)
    where u.id = auth.uid() and u.email_confirmed_at is not null
  );
$$;
revoke all on function private.is_admin() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_admin() to authenticated;

alter table public.announcements enable row level security;

-- Visitors: read published announcements only
create policy "read published" on public.announcements for select to anon using (status = 'published');
-- Admin: read everything (including drafts) and change anything
create policy "admin read all" on public.announcements for select to authenticated using (status = 'published' or private.is_admin());
create policy "admin insert"   on public.announcements for insert to authenticated with check (private.is_admin());
create policy "admin update"   on public.announcements for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "admin delete"   on public.announcements for delete to authenticated using (private.is_admin());

grant select on public.announcements to anon;
grant select, insert, update, delete on public.announcements to authenticated;

-- ---------------------------------------------------------------------------
-- Faculty table (slides Step 4 and 5). One row per faculty member.
-- ---------------------------------------------------------------------------
create table if not exists public.faculty (
  id              uuid    primary key default gen_random_uuid(),   -- unique faculty ID
  name            text    not null,                                -- faculty name
  title           text    not null default '',                     -- academic title
  education       text    not null default '',                     -- education
  research_fields text    not null default '',                     -- research interests
  email           text    not null default '',                     -- contact email
  phone           text    not null default '',                     -- phone
  website         text    not null default '',                     -- personal website
  image_url       text    not null default '',                     -- faculty photo
  category        text    not null default 'Full-time' check (category in ('Full-time','Adjunct')),
  sort_order      integer not null default 0                       -- display order
);

alter table public.faculty enable row level security;

-- Visitors may read; only the admin may change
create policy "faculty public read" on public.faculty for select to anon, authenticated using (true);
create policy "faculty admin insert" on public.faculty for insert to authenticated with check (private.is_admin());
create policy "faculty admin update" on public.faculty for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "faculty admin delete" on public.faculty for delete to authenticated using (private.is_admin());

grant select on public.faculty to anon;
grant select, insert, update, delete on public.faculty to authenticated;

-- Added later (already applied): the "Visiting" category and a bucket for faculty photos.
-- Photos are public to read (the website shows them); only the admin may upload, replace or delete.
alter table public.faculty drop constraint if exists faculty_category_check;
alter table public.faculty add constraint faculty_category_check check (category in ('Full-time','Visiting','Adjunct'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('faculty-photos', 'faculty-photos', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "faculty photos admin insert" on storage.objects for insert to authenticated with check (bucket_id = 'faculty-photos' and private.is_admin());
create policy "faculty photos admin update" on storage.objects for update to authenticated using (bucket_id = 'faculty-photos' and private.is_admin()) with check (bucket_id = 'faculty-photos' and private.is_admin());
create policy "faculty photos admin delete" on storage.objects for delete to authenticated using (bucket_id = 'faculty-photos' and private.is_admin());

-- Added later (already applied): an optional image for announcements that open on this website
-- (announcements with an empty url open inside the site instead of linking out).
alter table public.announcements add column if not exists image_url text not null default '';

-- Added later (already applied): a file can be attached to an announcement (stored in image_url).
-- Images, PDF and Office files, up to 10 MB. Public to read (the announcement shows it); only the admin may upload or delete.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('announcement-files', 'announcement-files', true, 10485760, array[
  'image/jpeg','image/png','image/webp','image/gif','application/pdf',
  'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation'])
on conflict (id) do nothing;

create policy "announcement files admin insert" on storage.objects for insert to authenticated with check (bucket_id = 'announcement-files' and private.is_admin());
create policy "announcement files admin update" on storage.objects for update to authenticated using (bucket_id = 'announcement-files' and private.is_admin()) with check (bucket_id = 'announcement-files' and private.is_admin());
create policy "announcement files admin delete" on storage.objects for delete to authenticated using (bucket_id = 'announcement-files' and private.is_admin());

-- Registration allow-list. Supabase Auth calls this before it creates ANY new user
-- (Authentication > Hooks > "Before User Created" must point at it). Only emails listed in
-- admin_emails may register; everyone else is refused on the server. Nobody can call it through the API.
create or replace function public.hook_only_approved_emails(event jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $$
begin
  if exists (select 1 from public.admin_emails a where lower(a.email) = lower(event->'user'->>'email')) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object('message', 'This email is not authorised to register.', 'http_code', 403));
end;
$$;
revoke all on function public.hook_only_approved_emails(jsonb) from public, anon, authenticated;
grant execute on function public.hook_only_approved_emails(jsonb) to supabase_auth_admin;

-- ---------------------------------------------------------------------------
-- Multi-admin approval (assignment #7). Anyone may register; a new account starts as 'pending' and can do
-- nothing until the super admin approves it. Roles: pending -> admin (or rejected). The super admin is whoever is
-- listed in admin_emails (that table is now the SUPER ADMIN list).
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  email             text not null,
  full_name         text not null default '',
  role              text not null default 'pending' check (role in ('pending','admin','super_admin','rejected')),
  email_verified    boolean not null default false,
  created_at        timestamptz not null default now(),
  reviewed_by       text,
  reviewed_at       timestamptz
);
alter table public.profiles enable row level security;

-- Existing accounts: the super admin list becomes super_admin, everyone else starts as pending
insert into public.profiles (user_id, email, full_name, role, email_verified, created_at)
select u.id, u.email, coalesce(u.raw_user_meta_data->>'full_name', ''),
       case when exists (select 1 from public.admin_emails a where lower(a.email) = lower(u.email)) then 'super_admin' else 'pending' end,
       u.email_confirmed_at is not null, u.created_at
from auth.users u
on conflict (user_id) do nothing;

-- Who may edit announcements / faculty: approved admins (and the super admin) with a confirmed email
create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = public, auth
as $$
  select exists (
    select 1 from public.profiles p
    join auth.users u on u.id = p.user_id
    where p.user_id = auth.uid() and p.role in ('admin','super_admin') and u.email_confirmed_at is not null
  );
$$;
create or replace function private.is_super_admin()
returns boolean language sql stable security definer set search_path = public, auth
as $$
  select exists (
    select 1 from public.profiles p
    join auth.users u on u.id = p.user_id
    where p.user_id = auth.uid() and p.role = 'super_admin' and u.email_confirmed_at is not null
  );
$$;
revoke all on function private.is_super_admin() from public, anon;
grant execute on function private.is_super_admin() to authenticated;

-- Every new account gets a profile row. The super admin list is promoted automatically; everyone else is pending.
-- The row follows the email verification too (email_verified).
create or replace function public.handle_user_change()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.profiles (user_id, email, full_name, role, email_verified)
    values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''),
            case when exists (select 1 from public.admin_emails a where lower(a.email) = lower(new.email)) then 'super_admin' else 'pending' end,
            new.email_confirmed_at is not null)
    on conflict (user_id) do nothing;
  else
    update public.profiles set email_verified = (new.email_confirmed_at is not null), email = new.email
    where user_id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function public.handle_user_change() from public, anon, authenticated;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_user_change();
drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated after update of email_confirmed_at, email on auth.users for each row execute function public.handle_user_change();

-- Who reviewed, and when, is stamped by the database (the page cannot fake it)
create or replace function public.stamp_review()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    new.reviewed_by := (select email from public.profiles where user_id = auth.uid());
    new.reviewed_at := now();
  end if;
  return new;
end;
$$;
revoke all on function public.stamp_review() from public, anon, authenticated;
drop trigger if exists profiles_stamp_review on public.profiles;
create trigger profiles_stamp_review before update on public.profiles for each row execute function public.stamp_review();

-- A person sees only their own profile; the super admin sees all and may only change 'role' (pending/admin/rejected)
-- of OTHER people (never their own, never another super admin).
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (role) on public.profiles to authenticated;
drop policy if exists "profiles read" on public.profiles;
drop policy if exists "profiles review" on public.profiles;
create policy "profiles read" on public.profiles for select to authenticated
  using (user_id = auth.uid() or private.is_super_admin());
create policy "profiles review" on public.profiles for update to authenticated
  using (private.is_super_admin() and user_id <> auth.uid() and role <> 'super_admin')
  with check (private.is_super_admin() and role in ('pending','admin','rejected'));

-- Registration is now open (the approval step is the gate), so the old "approved emails only" check lets everyone through.
create or replace function public.hook_only_approved_emails(event jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $$
begin
  return '{}'::jsonb;
end;
$$;
revoke all on function public.hook_only_approved_emails(jsonb) from public, anon, authenticated;
grant execute on function public.hook_only_approved_emails(jsonb) to supabase_auth_admin;

-- ---------------------------------------------------------------------------
-- Alumni database + audit trail (assignment #7). Only approved admins can read or change alumni.
-- Delete is a "soft delete" (deleted_at is filled in, the row stays and can be restored); nobody can hard-delete.
-- Every create / update / delete / restore is written to audit_log by a database trigger, so it cannot be skipped
-- or faked from the page, and nobody can edit or delete the log.
-- ---------------------------------------------------------------------------
create table if not exists public.alumni (
  id              uuid        primary key default gen_random_uuid(),
  full_name       text        not null check (length(btrim(full_name)) between 1 and 120),
  student_id      text        not null check (length(btrim(student_id)) between 1 and 40),
  department      text        not null check (length(btrim(department)) between 1 and 120),
  degree_program  text        not null check (degree_program in ('Bachelor','Master','Doctoral','Other')),
  admission_year  integer     check (admission_year between 1900 and 2100),
  graduation_year integer     check (graduation_year between 1900 and 2100),
  email           text        not null default '' check (email = '' or (length(email) <= 200 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  phone           text        not null default '' check (length(phone) <= 40),
  company         text        not null default '' check (length(company) <= 120),
  job_title       text        not null default '' check (length(job_title) <= 120),
  notes           text        not null default '' check (length(notes) <= 2000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  check (admission_year is null or graduation_year is null or graduation_year >= admission_year)
);
-- one ACTIVE record per student ID (a deleted record does not block re-adding the ID)
create unique index if not exists alumni_student_id_active on public.alumni (lower(btrim(student_id))) where deleted_at is null;

create or replace function public.alumni_touch() returns trigger language plpgsql
as $$ begin new.updated_at := now(); return new; end; $$;
drop trigger if exists alumni_touch on public.alumni;
create trigger alumni_touch before update on public.alumni for each row execute function public.alumni_touch();

-- Audit log: Who -> did what -> to which record -> when -> what changed
create table if not exists public.audit_log (
  id           bigint      generated always as identity primary key,
  created_at   timestamptz not null default now(),                         -- when
  admin_id     uuid,                                                       -- who (account)
  admin_email  text        not null default 'system',                      -- who (shown)
  action       text        not null check (action in ('CREATE','UPDATE','DELETE','RESTORE')),
  table_name   text        not null,                                       -- which table
  record_id    text        not null,                                       -- which record
  record_label text        not null default '',                            -- readable name of the record
  changes      jsonb       not null default '{}'::jsonb,                   -- {field: [old, new]}
  source       text        not null default 'manual'                       -- manual, or "CSV import: file name"
);
create index if not exists audit_log_record on public.audit_log (record_id, created_at desc);
create index if not exists audit_log_time on public.audit_log (created_at desc);

create or replace function public.audit_alumni() returns trigger language plpgsql security definer set search_path = public
as $$
declare
  act text; chg jsonb := '{}'::jsonb; f text; o jsonb; n jsonb; who text;
  fields text[] := array['full_name','student_id','department','degree_program','admission_year','graduation_year','email','phone','company','job_title','notes'];
begin
  select email into who from public.profiles where user_id = auth.uid();
  n := to_jsonb(new);
  if tg_op = 'INSERT' then
    act := 'CREATE';
    foreach f in array fields loop
      if n->f <> 'null'::jsonb and n->>f <> '' then chg := chg || jsonb_build_object(f, jsonb_build_array(null, n->f)); end if;
    end loop;
  else
    o := to_jsonb(old);
    if old.deleted_at is null and new.deleted_at is not null then act := 'DELETE';
    elsif old.deleted_at is not null and new.deleted_at is null then act := 'RESTORE';
    else
      act := 'UPDATE';
      foreach f in array fields loop
        if o->f is distinct from n->f then chg := chg || jsonb_build_object(f, jsonb_build_array(o->f, n->f)); end if;
      end loop;
      if chg = '{}'::jsonb then return new; end if;   -- nothing important changed
    end if;
  end if;
  insert into public.audit_log (admin_id, admin_email, action, table_name, record_id, record_label, changes, source)
  values (auth.uid(), coalesce(who, 'system'), act, 'alumni', new.id::text, new.full_name || ' (' || new.student_id || ')', chg,
          coalesce(nullif(current_setting('app.audit_source', true), ''), 'manual'));
  return new;
end;
$$;
revoke all on function public.audit_alumni() from public, anon, authenticated;
drop trigger if exists alumni_audit on public.alumni;
create trigger alumni_audit after insert or update on public.alumni for each row execute function public.audit_alumni();

-- Batch import: all rows or none, in one transaction. Runs with the caller's rights, so only approved admins can use it.
create or replace function public.import_alumni(rows jsonb, file_name text default 'file')
returns integer language plpgsql security invoker set search_path = public
as $$
declare n integer;
begin
  if jsonb_typeof(rows) <> 'array' or jsonb_array_length(rows) < 1 or jsonb_array_length(rows) > 1000 then
    raise exception 'Send between 1 and 1000 rows.';
  end if;
  perform set_config('app.audit_source', 'CSV import: ' || left(coalesce(file_name, 'file'), 80), true);
  insert into public.alumni (full_name, student_id, department, degree_program, admission_year, graduation_year, email, phone, company, job_title, notes)
  select r.full_name, r.student_id, r.department, r.degree_program, r.admission_year, r.graduation_year,
         coalesce(r.email, ''), coalesce(r.phone, ''), coalesce(r.company, ''), coalesce(r.job_title, ''), coalesce(r.notes, '')
  from jsonb_to_recordset(rows) as r(full_name text, student_id text, department text, degree_program text, admission_year integer,
                                      graduation_year integer, email text, phone text, company text, job_title text, notes text);
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.import_alumni(jsonb, text) from public, anon;
grant execute on function public.import_alumni(jsonb, text) to authenticated;

alter table public.alumni enable row level security;
alter table public.audit_log enable row level security;
revoke all on public.alumni, public.audit_log from anon, authenticated;
grant select on public.alumni, public.audit_log to authenticated;
grant insert (full_name, student_id, department, degree_program, admission_year, graduation_year, email, phone, company, job_title, notes) on public.alumni to authenticated;
grant update (full_name, student_id, department, degree_program, admission_year, graduation_year, email, phone, company, job_title, notes, deleted_at) on public.alumni to authenticated;
drop policy if exists "alumni admin read" on public.alumni;
drop policy if exists "alumni admin insert" on public.alumni;
drop policy if exists "alumni admin update" on public.alumni;
drop policy if exists "audit admin read" on public.audit_log;
create policy "alumni admin read"   on public.alumni for select to authenticated using (private.is_admin());
create policy "alumni admin insert" on public.alumni for insert to authenticated with check (private.is_admin());
create policy "alumni admin update" on public.alumni for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "audit admin read"    on public.audit_log for select to authenticated using (private.is_admin());
-- no delete policy on alumni and no insert/update/delete on audit_log: nobody can remove records or rewrite history

-- ---------------------------------------------------------------------------
-- Activity Log for the whole back office. The same audit_log table now also records announcements, faculty and
-- admin accounts (alumni was already covered). Written by database triggers, so nothing can skip or fake it.
--   announcements / faculty: CREATE, UPDATE (old -> new values), DELETE (the deleted values are kept in the log)
--   admin accounts (profiles): REGISTER (asked for access), APPROVE, REJECT (also used when access is removed)
-- Faculty re-ordering (sort_order only) is not logged, to avoid dozens of entries for one drag.
-- ---------------------------------------------------------------------------
alter table public.audit_log drop constraint if exists audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in ('CREATE','UPDATE','DELETE','RESTORE','REGISTER','APPROVE','REJECT'));

create or replace function public.audit_changes() returns trigger language plpgsql security definer set search_path = public
as $$
declare
  tbl text := tg_table_name; fields text[]; lbl text; act text; chg jsonb := '{}'::jsonb;
  f text; o jsonb; n jsonb; who text; rec jsonb;
begin
  fields := case tbl
    when 'announcements' then array['date','pinned','order','status','url','title_zh','title_en','content_zh','content_en','image_url']
    when 'faculty'       then array['name','title','education','research_fields','email','phone','website','image_url','category']
  end;
  select email into who from public.profiles where user_id = auth.uid();
  rec := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  lbl := case tbl
    when 'announcements' then coalesce(nullif(rec->>'title_en', ''), nullif(rec->>'title_zh', ''), rec->>'id')
    when 'faculty'       then rec->>'name'
  end;
  if tg_op = 'INSERT' then
    act := 'CREATE'; n := to_jsonb(new);
    foreach f in array fields loop
      if n->f <> 'null'::jsonb and n->>f <> '' then chg := chg || jsonb_build_object(f, jsonb_build_array(null, n->f)); end if;
    end loop;
  elsif tg_op = 'UPDATE' then
    act := 'UPDATE'; o := to_jsonb(old); n := to_jsonb(new);
    foreach f in array fields loop
      if o->f is distinct from n->f then chg := chg || jsonb_build_object(f, jsonb_build_array(o->f, n->f)); end if;
    end loop;
    if chg = '{}'::jsonb then return new; end if;
  else
    act := 'DELETE'; o := to_jsonb(old);
    foreach f in array fields loop
      if o->f <> 'null'::jsonb and o->>f <> '' then chg := chg || jsonb_build_object(f, jsonb_build_array(o->f, null)); end if;
    end loop;
  end if;
  insert into public.audit_log (admin_id, admin_email, action, table_name, record_id, record_label, changes, source)
  values (auth.uid(), coalesce(who, 'system'), act, tbl, rec->>'id', coalesce(lbl, ''), chg, 'manual');
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function public.audit_changes() from public, anon, authenticated;
drop trigger if exists announcements_audit on public.announcements;
create trigger announcements_audit after insert or update or delete on public.announcements for each row execute function public.audit_changes();
drop trigger if exists faculty_audit on public.faculty;
create trigger faculty_audit after insert or update or delete on public.faculty for each row execute function public.audit_changes();

create or replace function public.audit_profiles() returns trigger language plpgsql security definer set search_path = public
as $$
declare who text; act text;
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (admin_id, admin_email, action, table_name, record_id, record_label, changes, source)
    values (new.user_id, new.email, 'REGISTER', 'profiles', new.user_id::text,
            coalesce(nullif(new.full_name, ''), new.email) || ' (' || new.email || ')',
            jsonb_build_object('role', jsonb_build_array(null, new.role)), 'manual');
    return new;
  end if;
  if new.role is not distinct from old.role then return new; end if;
  select email into who from public.profiles where user_id = auth.uid();
  act := case when new.role in ('admin', 'super_admin') then 'APPROVE' when new.role = 'rejected' then 'REJECT' else 'UPDATE' end;
  insert into public.audit_log (admin_id, admin_email, action, table_name, record_id, record_label, changes, source)
  values (auth.uid(), coalesce(who, 'system'), act, 'profiles', new.user_id::text,
          coalesce(nullif(new.full_name, ''), new.email) || ' (' || new.email || ')',
          jsonb_build_object('role', jsonb_build_array(old.role, new.role)), 'manual');
  return new;
end;
$$;
revoke all on function public.audit_profiles() from public, anon, authenticated;
drop trigger if exists profiles_audit on public.profiles;
create trigger profiles_audit after insert or update of role on public.profiles for each row execute function public.audit_profiles();

-- One-time: add the registrations and approvals that happened before logging started (from the profiles table)
insert into public.audit_log (created_at, admin_id, admin_email, action, table_name, record_id, record_label, changes, source)
select p.created_at, p.user_id, p.email, 'REGISTER', 'profiles', p.user_id::text,
       coalesce(nullif(p.full_name, ''), p.email) || ' (' || p.email || ')',
       jsonb_build_object('role', jsonb_build_array(null, case when exists (select 1 from public.admin_emails a where lower(a.email) = lower(p.email)) then 'super_admin' else 'pending' end)),
       'recovered from account records'
from public.profiles p
where not exists (select 1 from public.audit_log l where l.table_name = 'profiles');
insert into public.audit_log (created_at, admin_id, admin_email, action, table_name, record_id, record_label, changes, source)
select p.reviewed_at, (select r.user_id from public.profiles r where r.email = p.reviewed_by), coalesce(p.reviewed_by, 'system'),
       case when p.role in ('admin', 'super_admin') then 'APPROVE' else 'REJECT' end, 'profiles', p.user_id::text,
       coalesce(nullif(p.full_name, ''), p.email) || ' (' || p.email || ')',
       jsonb_build_object('role', jsonb_build_array('pending', p.role)), 'recovered from account records'
from public.profiles p
where p.reviewed_at is not null and p.role <> 'pending'
  and not exists (select 1 from public.audit_log l where l.table_name = 'profiles' and l.action in ('APPROVE', 'REJECT'));

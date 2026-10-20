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

-- Who may edit: emails listed here, and confirmed in Supabase Auth
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

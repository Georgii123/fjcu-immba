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

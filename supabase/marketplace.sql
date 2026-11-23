-- ---------------------------------------------------------------------------
-- imMBA Market: role-based C2C marketplace (Vibe Coding V, 17 Nov 2026).
-- Runs after schema.sql. Safe to run again.
--
-- Roles
--   Visitor         browse listed products (read only)
--   Member          any account with a confirmed email. Can switch between BUYER mode (cart, orders)
--                   and SELLER mode (listings, stock, order processing, sales report).
--   Platform admin  profiles.role admin / super_admin: sees every transaction (read only).
--                   Only the super admin changes the platform fee.
--
-- Order lifecycle (one order per seller):
--   pending_payment -> ready_to_ship (seller confirms payment) -> shipped -> completed
--   pending_payment -> cancelled (buyer or seller; stock goes back)
-- Stock changes and status changes only happen inside the functions below, so the page cannot fake them.
-- Completed orders are never deleted: they stay as business records for buyer, seller and admin.
-- ---------------------------------------------------------------------------

-- Marketplace sign-ups get role 'member' so they never show up as back-office access requests.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('member','pending','admin','super_admin','rejected'));

create or replace function public.handle_user_change()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.profiles (user_id, email, full_name, role, email_verified)
    values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''),
            case
              when exists (select 1 from public.admin_emails a where lower(a.email) = lower(new.email)) then 'super_admin'
              when new.raw_user_meta_data->>'account_type' = 'market' then 'member'
              else 'pending'
            end,
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

-- A member may ask for back-office access later: the super admin can move member -> admin like any request.
drop policy if exists "profiles review" on public.profiles;
create policy "profiles review" on public.profiles for update to authenticated
  using (private.is_super_admin() and user_id <> auth.uid() and role <> 'super_admin')
  with check (private.is_super_admin() and role in ('member','pending','admin','rejected'));

-- Signed in with a confirmed email = may buy and sell.
create or replace function private.is_member()
returns boolean language sql stable security definer set search_path = public, auth
as $$
  select exists (select 1 from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null);
$$;
revoke all on function private.is_member() from public, anon;
grant execute on function private.is_member() to authenticated;

-- ───────────── settings ─────────────
create table if not exists public.market_settings (
  id                    integer primary key default 1 check (id = 1),
  platform_fee          integer not null default 4  check (platform_fee between 0 and 100000),   -- TWD per transaction, paid by the seller
  delivery_fee          integer not null default 80 check (delivery_fee between 0 and 100000),   -- TWD, home delivery
  updated_at            timestamptz not null default now()
);
insert into public.market_settings (id) values (1) on conflict do nothing;
alter table public.market_settings enable row level security;
revoke all on public.market_settings from anon, authenticated;
grant select on public.market_settings to anon, authenticated;
grant update (platform_fee, delivery_fee) on public.market_settings to authenticated;
drop policy if exists "settings read" on public.market_settings;
drop policy if exists "settings super admin" on public.market_settings;
create policy "settings read" on public.market_settings for select to anon, authenticated using (true);
create policy "settings super admin" on public.market_settings for update to authenticated
  using (private.is_super_admin()) with check (private.is_super_admin());

-- ───────────── products ─────────────
create table if not exists public.market_products (
  id          uuid primary key default gen_random_uuid(),
  seller_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  seller_name text not null default '',
  name        text not null check (length(btrim(name)) between 2 and 120),
  category    text not null default 'Other' check (category in ('Electronics','Books','Apparel','Souvenirs','Home','Other')),
  description text not null default '' check (length(description) <= 2000),
  price       integer not null check (price between 0 and 10000000),
  quantity    integer not null default 1 check (quantity between 0 and 100000),
  image_url   text not null default '' check (length(image_url) <= 500),
  status      text not null default 'listed' check (status in ('listed','hidden')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists market_products_seller on public.market_products (seller_id);
create index if not exists market_products_listed on public.market_products (status, created_at desc);

-- seller_id / seller_name are set by the database, never by the page
create or replace function public.market_products_stamp() returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.seller_id := auth.uid();
    new.seller_name := coalesce((select nullif(full_name, '') from public.profiles where user_id = auth.uid()),
                                split_part((select email from public.profiles where user_id = auth.uid()), '@', 1), 'Member');
    new.created_at := now();
  else
    new.seller_id := old.seller_id; new.seller_name := old.seller_name; new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.market_products_stamp() from public, anon, authenticated;
drop trigger if exists market_products_stamp on public.market_products;
create trigger market_products_stamp before insert or update on public.market_products
  for each row execute function public.market_products_stamp();

alter table public.market_products enable row level security;
revoke all on public.market_products from anon, authenticated;
grant select on public.market_products to anon, authenticated;
grant insert (name, category, description, price, quantity, image_url, status) on public.market_products to authenticated;
grant update (name, category, description, price, quantity, image_url, status) on public.market_products to authenticated;
grant delete on public.market_products to authenticated;
drop policy if exists "products read" on public.market_products;
drop policy if exists "products read visitors" on public.market_products;
drop policy if exists "products read members" on public.market_products;
drop policy if exists "products insert own" on public.market_products;
drop policy if exists "products update own" on public.market_products;
drop policy if exists "products delete own" on public.market_products;
-- Separate policy for visitors: they cannot call the private admin check.
create policy "products read visitors" on public.market_products for select to anon
  using (status = 'listed');
create policy "products read members" on public.market_products for select to authenticated
  using (status = 'listed' or seller_id = (select auth.uid()) or (select private.is_admin()));
create policy "products insert own" on public.market_products for insert to authenticated
  with check ((select private.is_member()));
create policy "products update own" on public.market_products for update to authenticated
  using (seller_id = (select auth.uid())) with check (seller_id = (select auth.uid()));
create policy "products delete own" on public.market_products for delete to authenticated
  using (seller_id = (select auth.uid()));

-- ───────────── cart ─────────────
create table if not exists public.market_cart (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id uuid not null references public.market_products(id) on delete cascade,
  qty        integer not null default 1 check (qty between 1 and 1000),
  added_at   timestamptz not null default now(),
  primary key (user_id, product_id)
);
alter table public.market_cart enable row level security;
revoke all on public.market_cart from anon, authenticated;
grant select, delete on public.market_cart to authenticated;
grant insert (product_id, qty), update (qty) on public.market_cart to authenticated;
drop policy if exists "cart own" on public.market_cart;
create policy "cart own" on public.market_cart for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and (select private.is_member()));

-- ───────────── orders ─────────────
create table if not exists public.market_orders (
  id              uuid primary key default gen_random_uuid(),
  buyer_id        uuid references auth.users(id) on delete set null,
  buyer_name      text not null default '',
  buyer_email     text not null default '',
  seller_id       uuid references auth.users(id) on delete set null,
  seller_name     text not null default '',
  seller_email    text not null default '',
  status          text not null default 'pending_payment'
                  check (status in ('pending_payment','ready_to_ship','shipped','completed','cancelled')),
  shipping_method text not null default 'pickup' check (shipping_method in ('pickup','delivery')),
  subtotal        integer not null,
  shipping_fee    integer not null default 0,
  platform_fee    integer not null default 0,
  total           integer not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  paid_at         timestamptz,
  shipped_at      timestamptz,
  completed_at    timestamptz,
  cancelled_at    timestamptz
);
create index if not exists market_orders_buyer on public.market_orders (buyer_id, created_at desc);
create index if not exists market_orders_seller on public.market_orders (seller_id, created_at desc);
create index if not exists market_orders_status on public.market_orders (status, created_at desc);

create table if not exists public.market_order_items (
  id           bigint generated always as identity primary key,
  order_id     uuid not null references public.market_orders(id) on delete cascade,
  product_id   uuid references public.market_products(id) on delete set null,
  product_name text not null,
  image_url    text not null default '',
  unit_price   integer not null,
  qty          integer not null check (qty > 0)
);
create index if not exists market_order_items_order on public.market_order_items (order_id);

alter table public.market_orders enable row level security;
alter table public.market_order_items enable row level security;
revoke all on public.market_orders, public.market_order_items from anon, authenticated;
grant select on public.market_orders, public.market_order_items to authenticated;   -- no insert/update/delete: functions only
drop policy if exists "orders read" on public.market_orders;
drop policy if exists "order items read" on public.market_order_items;
create policy "orders read" on public.market_orders for select to authenticated
  using (buyer_id = (select auth.uid()) or seller_id = (select auth.uid()) or (select private.is_admin()));
create policy "order items read" on public.market_order_items for select to authenticated
  using (exists (select 1 from public.market_orders o where o.id = order_id
                 and (o.buyer_id = (select auth.uid()) or o.seller_id = (select auth.uid()) or (select private.is_admin()))));

-- ───────────── place an order (cart -> one order per seller) ─────────────
create or replace function public.market_place_order(p_shipping text default 'pickup')
returns setof uuid language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid(); me_name text; me_email text;
  s record; it record; oid uuid; sub integer; fee integer; ship integer; cfg public.market_settings;
begin
  if me is null or not private.is_member() then raise exception 'Log in with a confirmed email to place an order.'; end if;
  if p_shipping not in ('pickup','delivery') then raise exception 'Unknown shipping method.'; end if;
  if not exists (select 1 from public.market_cart where user_id = me) then raise exception 'Your cart is empty.'; end if;
  select * into cfg from public.market_settings where id = 1;
  select coalesce(nullif(full_name, ''), split_part(email, '@', 1)), email into me_name, me_email from public.profiles where user_id = me;

  -- lock the products in the cart, then check every line before changing anything
  for it in
    select c.qty, p.* from public.market_cart c join public.market_products p on p.id = c.product_id
    where c.user_id = me order by p.id for update of p
  loop
    if it.seller_id = me then raise exception 'You cannot buy your own product (%).', it.name; end if;
    if it.status <> 'listed' then raise exception '"%" is no longer for sale.', it.name; end if;
    if it.quantity < it.qty then raise exception 'Only % left of "%".', it.quantity, it.name; end if;
  end loop;

  for s in
    select p.seller_id, max(p.seller_name) as seller_name from public.market_cart c
    join public.market_products p on p.id = c.product_id where c.user_id = me group by p.seller_id
  loop
    select coalesce(sum(c.qty * p.price), 0) into sub from public.market_cart c
      join public.market_products p on p.id = c.product_id where c.user_id = me and p.seller_id = s.seller_id;
    ship := case when p_shipping = 'delivery' then cfg.delivery_fee else 0 end;
    fee := cfg.platform_fee;
    insert into public.market_orders (buyer_id, buyer_name, buyer_email, seller_id, seller_name, seller_email,
                                      shipping_method, subtotal, shipping_fee, platform_fee, total)
    values (me, coalesce(me_name, ''), coalesce(me_email, ''), s.seller_id, s.seller_name,
            coalesce((select email from public.profiles where user_id = s.seller_id), ''),
            p_shipping, sub, ship, fee, sub + ship)
    returning id into oid;
    insert into public.market_order_items (order_id, product_id, product_name, image_url, unit_price, qty)
      select oid, p.id, p.name, p.image_url, p.price, c.qty from public.market_cart c
      join public.market_products p on p.id = c.product_id where c.user_id = me and p.seller_id = s.seller_id;
    -- Available stock = current inventory - purchased quantity
    update public.market_products p set quantity = p.quantity - c.qty
      from public.market_cart c where c.user_id = me and c.product_id = p.id and p.seller_id = s.seller_id;
    return next oid;
  end loop;
  delete from public.market_cart where user_id = me;
end;
$$;
revoke all on function public.market_place_order(text) from public, anon;
grant execute on function public.market_place_order(text) to authenticated;

-- ───────────── move an order along ─────────────
--   confirm_payment  seller   pending_payment -> ready_to_ship
--   ship             seller   ready_to_ship   -> shipped
--   complete         seller or buyer (buyer confirms receipt)  shipped -> completed
--   cancel           seller or buyer   pending_payment -> cancelled (stock returns)
create or replace function public.market_advance_order(p_order uuid, p_action text)
returns text language plpgsql security definer set search_path = public
as $$
declare o public.market_orders; me uuid := auth.uid(); nxt text;
begin
  select * into o from public.market_orders where id = p_order for update;
  if not found or me is null or (me is distinct from o.seller_id and me is distinct from o.buyer_id) then
    raise exception 'Order not found.';
  end if;
  if p_action = 'confirm_payment' and me = o.seller_id and o.status = 'pending_payment' then
    update public.market_orders set status = 'ready_to_ship', paid_at = now(), updated_at = now() where id = p_order;
    nxt := 'ready_to_ship';
  elsif p_action = 'ship' and me = o.seller_id and o.status = 'ready_to_ship' then
    update public.market_orders set status = 'shipped', shipped_at = now(), updated_at = now() where id = p_order;
    nxt := 'shipped';
  elsif p_action = 'complete' and o.status = 'shipped' then
    update public.market_orders set status = 'completed', completed_at = now(), updated_at = now() where id = p_order;
    nxt := 'completed';
  elsif p_action = 'cancel' and o.status = 'pending_payment' then
    update public.market_products p set quantity = p.quantity + i.qty
      from public.market_order_items i where i.order_id = p_order and i.product_id = p.id;
    update public.market_orders set status = 'cancelled', cancelled_at = now(), updated_at = now() where id = p_order;
    nxt := 'cancelled';
  else
    raise exception 'This step is not allowed for this order right now.';
  end if;
  return nxt;
end;
$$;
revoke all on function public.market_advance_order(uuid, text) from public, anon;
grant execute on function public.market_advance_order(uuid, text) to authenticated;

-- ───────────── product photos ─────────────
-- Public to read. A member uploads only into a folder named after their own user id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('market-images', 'market-images', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
drop policy if exists "market images member insert" on storage.objects;
drop policy if exists "market images member update" on storage.objects;
drop policy if exists "market images member delete" on storage.objects;
create policy "market images member insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'market-images' and (storage.foldername(name))[1] = (select auth.uid())::text and (select private.is_member()));
create policy "market images member update" on storage.objects for update to authenticated
  using (bucket_id = 'market-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "market images member delete" on storage.objects for delete to authenticated
  using (bucket_id = 'market-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

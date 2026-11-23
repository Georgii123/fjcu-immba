-- ---------------------------------------------------------------------------
-- imMBA Market, part 2 (runs after marketplace.sql). Safe to run again.
--   * Notifications: one user's action shows up in the other user's workflow ("Order created -> seller notified").
--   * Platform admin manages marketplace users: a member is an approved seller/buyer until an admin suspends them.
--   * Platform admin reviews marketplace activity (all listings, member stats) without acting as buyer or seller.
-- ---------------------------------------------------------------------------

-- ───────────── member status (approved / suspended) ─────────────
alter table public.profiles add column if not exists market_status text not null default 'active';
alter table public.profiles drop constraint if exists profiles_market_status_check;
alter table public.profiles add constraint profiles_market_status_check check (market_status in ('active','suspended'));

-- A member = confirmed email AND not suspended from the market.
create or replace function private.is_member()
returns boolean language sql stable security definer set search_path = public, auth
as $$
  select exists (
    select 1 from auth.users u left join public.profiles p on p.user_id = u.id
    where u.id = auth.uid() and u.email_confirmed_at is not null and coalesce(p.market_status, 'active') = 'active'
  );
$$;
revoke all on function private.is_member() from public, anon;
grant execute on function private.is_member() to authenticated;

-- Sellers may only edit their own listings while they are allowed to sell.
drop policy if exists "products update own" on public.market_products;
create policy "products update own" on public.market_products for update to authenticated
  using (seller_id = (select auth.uid()) and (select private.is_member()))
  with check (seller_id = (select auth.uid()));

-- Order actions need an active member (a suspended seller cannot confirm/ship).
create or replace function public.market_advance_order(p_order uuid, p_action text)
returns text language plpgsql security definer set search_path = public
as $$
declare o public.market_orders; me uuid := auth.uid(); nxt text;
begin
  select * into o from public.market_orders where id = p_order for update;
  if not found or me is null or (me is distinct from o.seller_id and me is distinct from o.buyer_id) then
    raise exception 'Order not found.';
  end if;
  if not private.is_member() then raise exception 'Your market account is suspended. Contact the platform admin.'; end if;
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

-- ───────────── notifications ─────────────
create table if not exists public.market_notifications (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  order_id   uuid references public.market_orders(id) on delete cascade,
  message    text not null,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists market_notifications_user on public.market_notifications (user_id, created_at desc);
alter table public.market_notifications enable row level security;
revoke all on public.market_notifications from anon, authenticated;
grant select on public.market_notifications to authenticated;
grant update (read_at) on public.market_notifications to authenticated;
drop policy if exists "notifications own read" on public.market_notifications;
drop policy if exists "notifications own mark read" on public.market_notifications;
create policy "notifications own read" on public.market_notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy "notifications own mark read" on public.market_notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Written by the database whenever an order is created or changes status, for the OTHER party.
create or replace function public.market_notify() returns trigger language plpgsql security definer set search_path = public
as $$
declare ref text := '#' || left(new.id::text, 8); amt text := 'NT$' || to_char(new.total, 'FM999,999,999');
begin
  if tg_op = 'INSERT' then
    insert into public.market_notifications (user_id, order_id, message)
    values (new.seller_id, new.id, 'New order ' || ref || ' from ' || new.buyer_name || ' (' || amt || '). Confirm the payment when you receive it.');
    return new;
  end if;
  if new.status is not distinct from old.status then return new; end if;
  if new.status = 'ready_to_ship' then
    insert into public.market_notifications (user_id, order_id, message)
    values (new.buyer_id, new.id, new.seller_name || ' confirmed your payment for order ' || ref || '. It is being prepared for shipment.');
  elsif new.status = 'shipped' then
    insert into public.market_notifications (user_id, order_id, message)
    values (new.buyer_id, new.id, 'Order ' || ref || ' has been shipped. Mark it as received when it arrives.');
  elsif new.status = 'completed' then
    insert into public.market_notifications (user_id, order_id, message)
    select case when auth.uid() = new.buyer_id then new.seller_id else new.buyer_id end, new.id,
           'Order ' || ref || ' is completed. It stays in your ' || case when auth.uid() = new.buyer_id then 'sales' else 'order' end || ' history.';
  elsif new.status = 'cancelled' then
    insert into public.market_notifications (user_id, order_id, message)
    select case when auth.uid() = new.buyer_id then new.seller_id else new.buyer_id end, new.id,
           'Order ' || ref || ' was cancelled by the ' || case when auth.uid() = new.buyer_id then 'buyer' else 'seller' end || '. Stock was returned.';
  end if;
  return new;
end;
$$;
revoke all on function public.market_notify() from public, anon, authenticated;
drop trigger if exists market_orders_notify on public.market_orders;
create trigger market_orders_notify after insert or update of status on public.market_orders
  for each row execute function public.market_notify();

-- ───────────── platform admin: manage users + review activity ─────────────
-- Members with their marketplace activity. Admins only (checked inside).
create or replace function public.market_admin_members()
returns table (user_id uuid, email text, full_name text, market_status text, joined timestamptz,
               listings bigint, active_listings bigint, orders_bought bigint, orders_sold bigint, sales_amount bigint)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not private.is_admin() then raise exception 'Platform admins only.'; end if;
  return query
    select p.user_id, p.email, p.full_name, p.market_status, p.created_at,
      (select count(*) from public.market_products x where x.seller_id = p.user_id),
      (select count(*) from public.market_products x where x.seller_id = p.user_id and x.status = 'listed'),
      (select count(*) from public.market_orders o where o.buyer_id = p.user_id),
      (select count(*) from public.market_orders o where o.seller_id = p.user_id),
      (select coalesce(sum(o.subtotal), 0)::bigint from public.market_orders o where o.seller_id = p.user_id and o.status = 'completed')
    from public.profiles p
    order by p.created_at desc;
end;
$$;
revoke all on function public.market_admin_members() from public, anon;
grant execute on function public.market_admin_members() to authenticated;

-- Suspend / reactivate a member. Suspending also hides their listings. Admins only; never yourself.
create or replace function public.market_set_member_status(p_user uuid, p_status text)
returns text language plpgsql security definer set search_path = public
as $$
begin
  if not private.is_admin() then raise exception 'Platform admins only.'; end if;
  if p_status not in ('active','suspended') then raise exception 'Unknown status.'; end if;
  if p_user = auth.uid() then raise exception 'You cannot change your own market status.'; end if;
  update public.profiles set market_status = p_status where user_id = p_user;
  if not found then raise exception 'Member not found.'; end if;
  if p_status = 'suspended' then
    update public.market_products set status = 'hidden' where seller_id = p_user and status = 'listed';
  end if;
  return p_status;
end;
$$;
revoke all on function public.market_set_member_status(uuid, text) from public, anon;
grant execute on function public.market_set_member_status(uuid, text) to authenticated;

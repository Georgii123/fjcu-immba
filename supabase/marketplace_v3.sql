-- ---------------------------------------------------------------------------
-- imMBA Market, part 3 (runs after marketplace_v2.sql). Safe to run again.
--   Delivery choice: "Receive in person" (free) or "Shipment" within Taiwan, priced by service:
--     cvs       convenience-store pickup (7-ELEVEN / FamilyMart C2C parcel)   NT$65
--     delivery  home delivery, Taiwan main island (e.g. Black Cat / Hsinchu)   NT$110
--     island    home delivery, offshore islands (Penghu, Kinmen, Matsu, ...)   NT$200
--   Prices are editable by the super admin in the back office; an order keeps the price it was placed with.
--   Platform commission stays NT$4 per transaction (market_settings.platform_fee).
-- ---------------------------------------------------------------------------
alter table public.market_settings add column if not exists cvs_fee    integer not null default 65  check (cvs_fee between 0 and 100000);
alter table public.market_settings add column if not exists island_fee integer not null default 200 check (island_fee between 0 and 100000);
update public.market_settings set delivery_fee = 110 where id = 1 and delivery_fee = 80;
grant update (platform_fee, delivery_fee, cvs_fee, island_fee) on public.market_settings to authenticated;

alter table public.market_orders drop constraint if exists market_orders_shipping_method_check;
alter table public.market_orders add constraint market_orders_shipping_method_check
  check (shipping_method in ('pickup','cvs','delivery','island'));

-- Where to send it (recipient, phone, address or store): required for a shipment, empty for in-person.
alter table public.market_orders add column if not exists ship_to text not null default '' check (length(ship_to) <= 300);
drop function if exists public.market_place_order(text);
create or replace function public.market_place_order(p_shipping text default 'pickup', p_ship_to text default '')
returns setof uuid language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid(); me_name text; me_email text;
  s record; it record; oid uuid; sub integer; fee integer; ship integer; cfg public.market_settings;
begin
  if me is null or not private.is_member() then raise exception 'Log in with a confirmed email to place an order.'; end if;
  if p_shipping not in ('pickup','cvs','delivery','island') then raise exception 'Unknown shipping method.'; end if;
  if not exists (select 1 from public.market_cart where user_id = me) then raise exception 'Your cart is empty.'; end if;
  if p_shipping <> 'pickup' and length(btrim(coalesce(p_ship_to, ''))) < 5 then raise exception 'Enter the delivery details (name, phone, address or store).'; end if;
  if length(coalesce(p_ship_to, '')) > 300 then raise exception 'The delivery details are too long (300 characters at most).'; end if;
  select * into cfg from public.market_settings where id = 1;
  select coalesce(nullif(full_name, ''), split_part(email, '@', 1)), email into me_name, me_email from public.profiles where user_id = me;

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
    ship := case p_shipping when 'cvs' then cfg.cvs_fee when 'delivery' then cfg.delivery_fee when 'island' then cfg.island_fee else 0 end;
    fee := cfg.platform_fee;
    insert into public.market_orders (buyer_id, buyer_name, buyer_email, seller_id, seller_name, seller_email,
                                      shipping_method, ship_to, subtotal, shipping_fee, platform_fee, total)
    values (me, coalesce(me_name, ''), coalesce(me_email, ''), s.seller_id, s.seller_name,
            coalesce((select email from public.profiles where user_id = s.seller_id), ''),
            p_shipping, case when p_shipping = 'pickup' then '' else btrim(p_ship_to) end, sub, ship, fee, sub + ship)
    returning id into oid;
    insert into public.market_order_items (order_id, product_id, product_name, image_url, unit_price, qty)
      select oid, p.id, p.name, p.image_url, p.price, c.qty from public.market_cart c
      join public.market_products p on p.id = c.product_id where c.user_id = me and p.seller_id = s.seller_id;
    update public.market_products p set quantity = p.quantity - c.qty
      from public.market_cart c where c.user_id = me and c.product_id = p.id and p.seller_id = s.seller_id;
    return next oid;
  end loop;
  delete from public.market_cart where user_id = me;
end;
$$;
revoke all on function public.market_place_order(text, text) from public, anon;
grant execute on function public.market_place_order(text, text) to authenticated;

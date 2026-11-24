-- ===========================================================================
-- imMBA Market — database test suite (Vibe Coding VI: Testing & Verification)
-- Covers test types 1–10 at the database level (where the rules are enforced).
-- Run the whole file in the Supabase SQL editor. It ends with ROLLBACK:
-- the test users, products and orders it creates are NOT kept.
-- Output: one row per test case with Expected / Actual / PASS or FAIL.
-- ===========================================================================
begin;

create temp table results (
  n serial, test_type text, test_case text, expected text, actual text, result text
) on commit drop;
grant all on results to anon, authenticated;
grant usage on sequence results_n_seq to anon, authenticated;

-- record one test case
create function pg_temp.chk(t text, c text, e text, a text, ok boolean) returns void language sql as $$
  insert into results (test_type, test_case, expected, actual, result)
  values (t, c, e, coalesce(a, '(nothing)'), case when ok then 'PASS' else 'FAIL' end);
$$;
-- run a statement; return the error message, or NULL when it succeeded
create function pg_temp.err(q text) returns text language plpgsql as $$
begin execute q; return null; exception when others then return sqlerrm; end $$;
-- run a statement and remember its error (if any) in t.e — check the result in the NEXT statement,
-- because a statement cannot see changes made by functions it calls itself
create function pg_temp.run(q text) returns void language plpgsql as $$
begin execute q; perform set_config('t.e', '', true);
exception when others then perform set_config('t.e', sqlerrm, true); end $$;
create function pg_temp.e(ok text) returns text language sql as $$ select coalesce(nullif(current_setting('t.e', true), ''), ok) $$;
-- run a statement; return how many rows it changed (0 = silently blocked by row-level security)
create function pg_temp.rows(q text) returns integer language plpgsql as $$
declare n integer; begin execute q; get diagnostics n = row_count; return n;
exception when others then return -1; end $$;
-- act as a user ('' = visitor)
create function pg_temp.act(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'none', true);   -- back to the session user first
  if uid = '' then
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  else
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  end if;
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;

-- Test accounts: S = seller, B = buyer, C = another buyer, U = unconfirmed email
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at) values
 ('aaaaaaaa-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t.seller@example.com', now(),'{"full_name":"Test Seller","account_type":"market"}',now(),now()),
 ('aaaaaaaa-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t.buyer@example.com',  now(),'{"full_name":"Test Buyer","account_type":"market"}',now(),now()),
 ('aaaaaaaa-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t.other@example.com',  now(),'{"full_name":"Other Buyer","account_type":"market"}',now(),now()),
 ('aaaaaaaa-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t.unconfirmed@example.com', null,'{"full_name":"Not Confirmed","account_type":"market"}',now(),now());
select set_config('t.s', 'aaaaaaaa-0000-0000-0000-000000000001', true),
       set_config('t.b', 'aaaaaaaa-0000-0000-0000-000000000002', true),
       set_config('t.c', 'aaaaaaaa-0000-0000-0000-000000000003', true),
       set_config('t.u', 'aaaaaaaa-0000-0000-0000-000000000004', true),
       set_config('t.admin', coalesce((select user_id::text from public.profiles where role = 'super_admin' limit 1), ''), true);

select pg_temp.chk('Security', 'New market sign-up gets role "member" (not a back-office request)', 'member',
  (select role from public.profiles where email = 't.buyer@example.com'),
  (select role from public.profiles where email = 't.buyer@example.com') = 'member');

-- ───────────── 1. FUNCTIONAL ─────────────
select pg_temp.act(current_setting('t.s'));
select pg_temp.run($$insert into public.market_products (name, category, price, quantity) values ('Test Laptop','Electronics',25000,3)$$);
select pg_temp.chk('1 Functional', 'Seller creates a product listing', 'listing saved, seller name filled in',
  pg_temp.e((select 'saved: seller_name=' || seller_name || ', qty=' || quantity from public.market_products where name = 'Test Laptop')),
  exists (select 1 from public.market_products where name = 'Test Laptop' and seller_name = 'Test Seller'));
select set_config('t.p', (select id::text from public.market_products where name = 'Test Laptop'), true);
insert into public.market_products (name, category, price, quantity) values ('Test Mug','Souvenirs',300,1);
select set_config('t.mug', (select id::text from public.market_products where name = 'Test Mug'), true);

select pg_temp.run(format($$update public.market_products set quantity = 5 where id = %L$$, current_setting('t.p')));
select pg_temp.chk('1 Functional', 'Seller updates inventory (3 → 5)', 'quantity 5',
  pg_temp.e('qty=' || (select quantity from public.market_products where id = current_setting('t.p')::uuid)),
  (select quantity from public.market_products where id = current_setting('t.p')::uuid) = 5);

select pg_temp.act(current_setting('t.b'));
select pg_temp.run(format($$insert into public.market_cart (product_id, qty) values (%L, 2)$$, current_setting('t.p')));
select pg_temp.chk('1 Functional', 'Buyer adds a product to the cart', 'product appears in cart',
  pg_temp.e('in cart, qty ' || (select qty from public.market_cart where product_id = current_setting('t.p')::uuid)),
  exists (select 1 from public.market_cart where product_id = current_setting('t.p')::uuid and qty = 2));

-- ───────────── 5. NEGATIVE + 6. BOUNDARY (cart / order quantities) ─────────────
select pg_temp.chk('6 Boundary', 'Cart quantity = 0', 'rejected', pg_temp.err(format($$update public.market_cart set qty = 0 where product_id = %L$$, current_setting('t.p'))),
  pg_temp.err(format($$update public.market_cart set qty = 0 where product_id = %L$$, current_setting('t.p'))) is not null);
select pg_temp.chk('6 Boundary', 'Cart quantity = -1', 'rejected', pg_temp.err(format($$update public.market_cart set qty = -1 where product_id = %L$$, current_setting('t.p'))),
  pg_temp.err(format($$update public.market_cart set qty = -1 where product_id = %L$$, current_setting('t.p'))) is not null);
select pg_temp.chk('6 Boundary', 'Cart quantity = 1001 (above the 1000 limit)', 'rejected', pg_temp.err(format($$update public.market_cart set qty = 1001 where product_id = %L$$, current_setting('t.p'))),
  pg_temp.err(format($$update public.market_cart set qty = 1001 where product_id = %L$$, current_setting('t.p'))) is not null);
update public.market_cart set qty = 6 where product_id = current_setting('t.p')::uuid;
select pg_temp.chk('6 Boundary', 'Order quantity > available stock (6 > 5)', 'order refused, nothing sold',
  pg_temp.err($$select public.market_place_order('pickup')$$),
  pg_temp.err($$select public.market_place_order('pickup')$$) like 'Only 5 left%' and (select quantity from public.market_products where id = current_setting('t.p')::uuid) = 5);
select pg_temp.chk('5 Negative', 'Unknown shipping method', 'rejected', pg_temp.err($$select public.market_place_order('drone')$$),
  pg_temp.err($$select public.market_place_order('drone')$$) is not null);

-- quantity = maximum stock (5) is allowed
update public.market_cart set qty = 5 where product_id = current_setting('t.p')::uuid;
select pg_temp.chk('5 Negative', 'Shipment without delivery details', 'rejected: delivery details required',
  pg_temp.err($$select public.market_place_order('delivery', '')$$),
  pg_temp.err($$select public.market_place_order('delivery', '  ')$$) like '%delivery details%');
select pg_temp.run($$select public.market_place_order('delivery', 'Ann Lee 0912-345-678, 100 Zhongzheng Rd, Taipei')$$);
select pg_temp.chk('6 Boundary', 'Order quantity = maximum stock (5 of 5)', 'order placed, stock becomes 0',
  pg_temp.e('placed; stock now ' || (select quantity from public.market_products where id = current_setting('t.p')::uuid)),
  (select quantity from public.market_products where id = current_setting('t.p')::uuid) = 0);
select set_config('t.o', (select id::text from public.market_orders where buyer_id = current_setting('t.b')::uuid order by created_at desc limit 1), true);

-- ───────────── 2. INTEGRATION ─────────────
select pg_temp.chk('2 Integration', 'Buyer places order → database creates order', '1 order, subtotal 125,000 + home shipment 110, address saved',
  (select count(*) || ' order, subtotal ' || max(subtotal) || ', shipping ' || max(shipping_fee) || ', total ' || max(total) from public.market_orders where buyer_id = current_setting('t.b')::uuid),
  (select count(*) = 1 and max(subtotal) = 125000 and max(shipping_fee) = 110 and max(total) = 125110 and max(ship_to) like 'Ann Lee%' from public.market_orders where buyer_id = current_setting('t.b')::uuid));
select pg_temp.chk('2 Integration', 'Cart is emptied after the order', '0 items in cart',
  (select count(*)::text from public.market_cart), (select count(*) from public.market_cart) = 0);
select pg_temp.chk('5 Negative', 'Click "Place order" twice', 'second click refused, still only 1 order',
  pg_temp.err($$select public.market_place_order('pickup')$$) || ' / orders: ' || (select count(*) from public.market_orders where buyer_id = current_setting('t.b')::uuid),
  (select count(*) from public.market_orders where buyer_id = current_setting('t.b')::uuid) = 1);
select pg_temp.chk('6 Boundary', 'Buy a product with stock = 0', 'cannot be ordered',
  coalesce(pg_temp.err(format($$insert into public.market_cart (product_id, qty) values (%L, 1)$$, current_setting('t.p'))), '') || ' ' || coalesce(pg_temp.err($$select public.market_place_order('pickup')$$), 'ORDER PLACED'),
  (select count(*) from public.market_orders where buyer_id = current_setting('t.b')::uuid) = 1);
delete from public.market_cart;

select pg_temp.act(current_setting('t.s'));
select pg_temp.chk('2 Integration', 'Seller sees the buyer''s order', 'order visible to seller, status waiting for payment',
  (select status from public.market_orders where id = current_setting('t.o')::uuid),
  (select status from public.market_orders where id = current_setting('t.o')::uuid) = 'pending_payment');
select pg_temp.chk('2 Integration', 'Inventory changes after the order', 'stock 5 → 0',
  (select quantity::text from public.market_products where id = current_setting('t.p')::uuid),
  (select quantity from public.market_products where id = current_setting('t.p')::uuid) = 0);
select pg_temp.chk('10 Notification', 'Order confirmation → seller notified', 'notification "New order …"',
  (select message from public.market_notifications where order_id = current_setting('t.o')::uuid limit 1),
  exists (select 1 from public.market_notifications where order_id = current_setting('t.o')::uuid and message like 'New order%'));

-- ───────────── 3. END-TO-END (Confirm payment → Ship → Complete) ─────────────
select pg_temp.act(current_setting('t.b'));
select pg_temp.chk('4 Access control', 'Buyer tries to confirm payment', 'refused',
  pg_temp.err(format($$select public.market_advance_order(%L,'confirm_payment')$$, current_setting('t.o'))),
  pg_temp.err(format($$select public.market_advance_order(%L,'confirm_payment')$$, current_setting('t.o'))) is not null);
select pg_temp.act(current_setting('t.s'));
select pg_temp.chk('5 Negative', 'Seller ships before payment is confirmed', 'refused',
  pg_temp.err(format($$select public.market_advance_order(%L,'ship')$$, current_setting('t.o'))),
  pg_temp.err(format($$select public.market_advance_order(%L,'ship')$$, current_setting('t.o'))) is not null);
select pg_temp.run(format($$select public.market_advance_order(%L,'confirm_payment')$$, current_setting('t.o')));
select pg_temp.chk('3 End-to-end', 'Seller confirms payment', 'ready_to_ship',
  pg_temp.e((select status from public.market_orders where id = current_setting('t.o')::uuid)),
  (select status from public.market_orders where id = current_setting('t.o')::uuid) = 'ready_to_ship');
select pg_temp.run(format($$select public.market_advance_order(%L,'ship')$$, current_setting('t.o')));
select pg_temp.chk('3 End-to-end', 'Seller ships', 'shipped',
  pg_temp.e((select status from public.market_orders where id = current_setting('t.o')::uuid)),
  (select status from public.market_orders where id = current_setting('t.o')::uuid) = 'shipped');
select pg_temp.act(current_setting('t.b'));
select pg_temp.chk('10 Notification', 'Payment confirmation + shipping notification reach the buyer', '2 notifications',
  (select string_agg(left(message, 40) || '…', ' | ' order by id) from public.market_notifications where order_id = current_setting('t.o')::uuid),
  (select count(*) from public.market_notifications where order_id = current_setting('t.o')::uuid) = 2);
select pg_temp.run(format($$select public.market_advance_order(%L,'complete')$$, current_setting('t.o')));
select pg_temp.chk('3 End-to-end', 'Buyer confirms receipt → completed', 'completed',
  pg_temp.e((select status from public.market_orders where id = current_setting('t.o')::uuid)),
  (select status from public.market_orders where id = current_setting('t.o')::uuid) = 'completed');
select pg_temp.chk('5 Negative', 'Cancel a completed order', 'refused',
  pg_temp.err(format($$select public.market_advance_order(%L,'cancel')$$, current_setting('t.o'))),
  pg_temp.err(format($$select public.market_advance_order(%L,'cancel')$$, current_setting('t.o'))) is not null);
select pg_temp.chk('3 End-to-end', 'Completed order stays in buyer history', 'visible to buyer',
  (select status from public.market_orders where id = current_setting('t.o')::uuid),
  exists (select 1 from public.market_orders where id = current_setting('t.o')::uuid));
select pg_temp.chk('4 Access control', 'Buyer cannot delete or edit an order directly', 'refused',
  pg_temp.err(format($$delete from public.market_orders where id = %L$$, current_setting('t.o'))),
  pg_temp.err(format($$update public.market_orders set status = 'pending_payment' where id = %L$$, current_setting('t.o'))) is not null
  and pg_temp.err(format($$delete from public.market_orders where id = %L$$, current_setting('t.o'))) is not null);

-- cancel restores stock
select pg_temp.act(current_setting('t.b'));
insert into public.market_cart (product_id, qty) values (current_setting('t.mug')::uuid, 1);
select public.market_place_order('pickup');
select set_config('t.o2', (select id::text from public.market_orders where buyer_id = current_setting('t.b')::uuid and status = 'pending_payment' limit 1), true);
select pg_temp.run(format($$select public.market_advance_order(%L,'cancel')$$, current_setting('t.o2')));
select pg_temp.chk('2 Integration', 'Buyer cancels while waiting for payment → stock returns', 'cancelled, mug stock back to 1',
  pg_temp.e((select status from public.market_orders where id = current_setting('t.o2')::uuid) || '; stock ' ||
    (select quantity from public.market_products where id = current_setting('t.mug')::uuid)),
  (select quantity from public.market_products where id = current_setting('t.mug')::uuid) = 1);

-- ───────────── 4. ACCESS CONTROL ─────────────
select pg_temp.act(current_setting('t.b'));
select pg_temp.chk('4 Access control', 'Buyer edits another seller''s product', '0 rows changed',
  pg_temp.rows(format($$update public.market_products set price = 1 where id = %L$$, current_setting('t.mug')))::text || ' rows',
  pg_temp.rows(format($$update public.market_products set price = 1 where id = %L$$, current_setting('t.mug'))) = 0);
select pg_temp.chk('4 Access control', 'Buyer deletes another seller''s product', '0 rows deleted',
  pg_temp.rows(format($$delete from public.market_products where id = %L$$, current_setting('t.mug')))::text || ' rows',
  exists (select 1 from public.market_products where id = current_setting('t.mug')::uuid));
select pg_temp.chk('4 Access control', 'Buyer opens the admin member list', 'refused',
  pg_temp.err($$select * from public.market_admin_members()$$), pg_temp.err($$select * from public.market_admin_members()$$) is not null);
select pg_temp.chk('4 Access control', 'Buyer changes the platform fee', '0 rows changed',
  pg_temp.rows($$update public.market_settings set platform_fee = 0$$)::text || ' rows', pg_temp.rows($$update public.market_settings set platform_fee = 0$$) <= 0);
select pg_temp.chk('4 Access control', 'Buyer reads other people''s profiles', 'only own profile',
  (select count(*)::text from public.profiles) || ' profile(s) visible', (select count(*) from public.profiles) = 1);

select pg_temp.act(current_setting('t.c'));
select pg_temp.chk('4 Access control', 'Another buyer reads this buyer''s orders', '0 orders visible',
  (select count(*)::text from public.market_orders), (select count(*) from public.market_orders) = 0);
select pg_temp.chk('4 Access control', 'Another buyer reads this buyer''s notifications', '0 visible',
  (select count(*)::text from public.market_notifications), (select count(*) from public.market_notifications) = 0);

select pg_temp.act(current_setting('t.s'));
select pg_temp.chk('4 Access control', 'Seller fakes another seller as owner (seller_id)', 'refused',
  pg_temp.err(format($$insert into public.market_products (name, price, seller_id) values ('Fake', 1, %L)$$, current_setting('t.c'))),
  pg_temp.err(format($$insert into public.market_products (name, price, seller_id) values ('Fake', 1, %L)$$, current_setting('t.c'))) is not null);

select pg_temp.act('');
select pg_temp.chk('4 Access control', 'Visitor (not logged in) reads orders', 'refused',
  pg_temp.err($$select count(*) from public.market_orders$$), pg_temp.err($$select count(*) from public.market_orders$$) is not null);
select pg_temp.chk('4 Access control', 'Visitor creates a product', 'refused',
  pg_temp.err($$insert into public.market_products (name, price) values ('Visitor item', 1)$$),
  pg_temp.err($$insert into public.market_products (name, price) values ('Visitor item', 1)$$) is not null);
select pg_temp.chk('4 Access control', 'Visitor places an order', 'refused',
  pg_temp.err($$select public.market_place_order('pickup')$$), pg_temp.err($$select public.market_place_order('pickup')$$) is not null);
select pg_temp.chk('1 Functional', 'Visitor can browse listed products', 'listed products visible',
  (select count(*)::text from public.market_products where name in ('Test Laptop','Test Mug')) || ' test products visible',
  (select count(*) from public.market_products where name = 'Test Mug') = 1);

select pg_temp.act(current_setting('t.admin'));
select pg_temp.chk('4 Access control', 'Platform admin monitors all transactions', 'sees every order',
  (select count(*)::text from public.market_orders where buyer_email = 't.buyer@example.com') || ' test orders visible',
  current_setting('t.admin') = '' or (select count(*) from public.market_orders where buyer_email = 't.buyer@example.com') = 2);
select pg_temp.chk('4 Access control', 'Platform admin cannot edit an order (monitoring only)', 'refused',
  pg_temp.err(format($$update public.market_orders set total = 0 where id = %L$$, current_setting('t.o'))),
  pg_temp.err(format($$update public.market_orders set total = 0 where id = %L$$, current_setting('t.o'))) is not null);
select pg_temp.run(format($$select public.market_set_member_status(%L,'suspended')$$, current_setting('t.s')));
select pg_temp.chk('4 Access control', 'Platform admin suspends a seller', 'suspended, seller''s listings hidden',
  pg_temp.e('suspended; listed items left: ' || (select count(*) from public.market_products where seller_id = current_setting('t.s')::uuid and status = 'listed')),
  (select count(*) from public.market_products where seller_id = current_setting('t.s')::uuid and status = 'listed') = 0);
select pg_temp.act(current_setting('t.s'));
select pg_temp.chk('4 Access control', 'Suspended seller tries to list a product', 'refused',
  pg_temp.err($$insert into public.market_products (name, price) values ('Banned item', 10)$$),
  pg_temp.err($$insert into public.market_products (name, price) values ('Banned item', 10)$$) is not null);
select pg_temp.act(current_setting('t.admin'));
select public.market_set_member_status(current_setting('t.s')::uuid, 'active');

-- ───────────── 5/6. NEGATIVE + BOUNDARY (seller input) ─────────────
select pg_temp.act(current_setting('t.s'));
select pg_temp.chk('6 Boundary', 'Seller sets stock = -1', 'rejected', pg_temp.err(format($$update public.market_products set quantity = -1 where id = %L$$, current_setting('t.mug'))),
  pg_temp.err(format($$update public.market_products set quantity = -1 where id = %L$$, current_setting('t.mug'))) is not null);
select pg_temp.run(format($$update public.market_products set quantity = 0 where id = %L$$, current_setting('t.mug')));
select pg_temp.chk('6 Boundary', 'Seller sets stock = 0 (sold out)', 'allowed',
  pg_temp.e('saved; stock ' || (select quantity from public.market_products where id = current_setting('t.mug')::uuid)),
  (select quantity from public.market_products where id = current_setting('t.mug')::uuid) = 0);
select pg_temp.chk('6 Boundary', 'Seller sets price = -1', 'rejected', pg_temp.err(format($$update public.market_products set price = -1 where id = %L$$, current_setting('t.mug'))),
  pg_temp.err(format($$update public.market_products set price = -1 where id = %L$$, current_setting('t.mug'))) is not null);
select pg_temp.run(format($$update public.market_products set price = 0 where id = %L$$, current_setting('t.mug')));
select pg_temp.chk('6 Boundary', 'Seller sets price = 0 (free item)', 'allowed',
  pg_temp.e('saved; price ' || (select price from public.market_products where id = current_setting('t.mug')::uuid)),
  (select price from public.market_products where id = current_setting('t.mug')::uuid) = 0);
select pg_temp.chk('6 Boundary', 'Seller sets price = 10,000,001 (above maximum)', 'rejected', pg_temp.err(format($$update public.market_products set price = 10000001 where id = %L$$, current_setting('t.mug'))),
  pg_temp.err(format($$update public.market_products set price = 10000001 where id = %L$$, current_setting('t.mug'))) is not null);
select pg_temp.chk('5 Negative', 'Seller saves a product with an empty name', 'rejected', pg_temp.err($$insert into public.market_products (name, price) values ('  ', 10)$$),
  pg_temp.err($$insert into public.market_products (name, price) values ('  ', 10)$$) is not null);
insert into public.market_products (name, category, price, quantity) values ('Own item', 'Other', 10, 1);
select pg_temp.chk('5 Negative', 'Seller buys their own product', 'refused',
  coalesce(pg_temp.err($$insert into public.market_cart (product_id, qty) select id, 1 from public.market_products where name = 'Own item'$$), '') || pg_temp.err($$select public.market_place_order('pickup')$$),
  pg_temp.err($$select public.market_place_order('pickup')$$) is not null);
delete from public.market_cart;
select pg_temp.chk('5 Negative', 'Place an order with an empty cart', 'refused with a clear message',
  pg_temp.err($$select public.market_place_order('pickup')$$), pg_temp.err($$select public.market_place_order('pickup')$$) = 'Your cart is empty.');

-- ───────────── 9. SECURITY: email verification ─────────────
select pg_temp.act(current_setting('t.u'));
select pg_temp.chk('9 Security', 'Account with unconfirmed email lists a product', 'refused until email is verified',
  pg_temp.err($$insert into public.market_products (name, price) values ('Unverified item', 10)$$),
  pg_temp.err($$insert into public.market_products (name, price) values ('Unverified item', 10)$$) is not null);
select pg_temp.chk('9 Security', 'Account with unconfirmed email places an order', 'refused until email is verified',
  pg_temp.err($$select public.market_place_order('pickup')$$), pg_temp.err($$select public.market_place_order('pickup')$$) is not null);

reset role;
select n as "#", test_type as "Test type", test_case as "Test case", expected as "Expected", actual as "Actual", result as "Result"
from results order by n;
rollback;

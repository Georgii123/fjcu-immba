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


-- Test accounts: S = seller, B = buyer, U = unconfirmed
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at) values
 ('aaaaaaaa-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t.seller@example.com', now(),'{"full_name":"Test Seller","account_type":"market"}',now(),now()),
 ('aaaaaaaa-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t.buyer@example.com',  now(),'{"full_name":"Test Buyer","account_type":"market"}',now(),now());
select set_config('t.s', 'aaaaaaaa-0000-0000-0000-000000000001', true), set_config('t.b', 'aaaaaaaa-0000-0000-0000-000000000002', true);

-- New sign-up: ordinary member (not an admin request), cannot buy before the email is confirmed
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values ('aaaaaaaa-0000-0000-0000-000000000009','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t.new@example.com', null,'{"full_name":"New Student","account_type":"market"}',now(),now());
select pg_temp.chk('9 Security', 'Self-registration: new person gets role member + unverified', 'member / verified=false',
  (select role || ' / verified=' || email_verified from public.profiles where email = 't.new@example.com'),
  (select role = 'member' and not email_verified from public.profiles where email = 't.new@example.com'));
select pg_temp.act('aaaaaaaa-0000-0000-0000-000000000009');
select pg_temp.chk('9 Security', 'Unconfirmed email cannot place an order', 'refused', pg_temp.err($$select public.market_place_order('pickup','')$$),
  pg_temp.err($$select public.market_place_order('pickup','')$$) like 'Log in with a confirmed email%');
select pg_temp.act('');
update auth.users set email_confirmed_at = now() where email = 't.new@example.com';
select pg_temp.chk('9 Security', 'After email confirmation the account is a verified member', 'member / verified=true',
  (select role || ' / verified=' || email_verified from public.profiles where email = 't.new@example.com'),
  (select role = 'member' and email_verified from public.profiles where email = 't.new@example.com'));
select pg_temp.chk('1 Functional', 'Default prices', 'commission 4, store 65, home 110, islands 200',
  (select platform_fee||', '||cvs_fee||', '||delivery_fee||', '||island_fee from public.market_settings),
  (select platform_fee = 4 and cvs_fee = 65 and delivery_fee = 110 and island_fee = 200 from public.market_settings));

select pg_temp.act(current_setting('t.s'));
insert into public.market_products (name, category, price, quantity) values ('Ship test item', 'Other', 1000, 50);
select pg_temp.act(current_setting('t.b'));
select set_config('t.p', (select id::text from public.market_products where name = 'Ship test item'), true);
insert into public.market_cart (product_id, qty) values (current_setting('t.p')::uuid, 1);

select pg_temp.run($$select public.market_place_order('pickup','')$$);
insert into public.market_cart (product_id, qty) values (current_setting('t.p')::uuid, 1);
select pg_temp.run($$select public.market_place_order('cvs','Ann Lee 0912345678, 7-ELEVEN Taipei store 123456')$$);
insert into public.market_cart (product_id, qty) values (current_setting('t.p')::uuid, 1);
select pg_temp.run($$select public.market_place_order('delivery','Ann Lee 0912345678, 100 Zhongzheng Rd, Taipei')$$);
insert into public.market_cart (product_id, qty) values (current_setting('t.p')::uuid, 1);
select pg_temp.run($$select public.market_place_order('island','Ann Lee 0912345678, Magong, Penghu')$$);
insert into public.market_cart (product_id, qty) values (current_setting('t.p')::uuid, 1);
select pg_temp.run($$select public.market_place_order('island','x')$$);
select pg_temp.chk('5 Negative', 'Shipment with too short delivery details', 'rejected', pg_temp.e('NO ERROR'), pg_temp.e('NO ERROR') like '%delivery details%');
select pg_temp.run($$select public.market_place_order('island', repeat('a', 301))$$);
select pg_temp.chk('6 Boundary', 'Delivery details = 301 characters', 'rejected', pg_temp.e('NO ERROR'), pg_temp.e('NO ERROR') like '%too long%');
select pg_temp.run($$select public.market_place_order('pickup','')$$);

select pg_temp.chk('1 Functional', 'Receive in person: free, no address', 'shipping 0, total 1000, ship_to empty',
  (select shipping_fee||' / '||total||' / "'||ship_to||'"' from public.market_orders where shipping_method = 'pickup'),
  (select shipping_fee = 0 and total = 1000 and ship_to = '' from public.market_orders where shipping_method = 'pickup'));
select pg_temp.chk('1 Functional', 'Shipment: convenience store', 'shipping 65, total 1065',
  (select shipping_fee||' / '||total from public.market_orders where shipping_method = 'cvs'), (select shipping_fee = 65 and total = 1065 from public.market_orders where shipping_method = 'cvs'));
select pg_temp.chk('1 Functional', 'Shipment: home delivery, main island', 'shipping 110, total 1110',
  (select shipping_fee||' / '||total from public.market_orders where shipping_method = 'delivery'), (select shipping_fee = 110 and total = 1110 from public.market_orders where shipping_method = 'delivery'));
select pg_temp.chk('1 Functional', 'Shipment: offshore islands', 'shipping 200, total 1200',
  (select shipping_fee||' / '||total from public.market_orders where shipping_method = 'island'), (select shipping_fee = 200 and total = 1200 from public.market_orders where shipping_method = 'island'));
select pg_temp.chk('1 Functional', 'Owner commission is NT$4 on every order, whatever the delivery', '4 orders x 4',
  (select count(*)||' orders, commission '||sum(platform_fee) from public.market_orders), (select count(*) = 4 and sum(platform_fee) = 16 from public.market_orders));

-- complete one order, then the owner (admin) report numbers: commission only from completed orders
select pg_temp.act(current_setting('t.s'));
select set_config('t.o', (select id::text from public.market_orders where shipping_method = 'delivery'), true);
select pg_temp.run($$select public.market_advance_order(current_setting('t.o')::uuid, 'confirm_payment')$$);
select pg_temp.run($$select public.market_advance_order(current_setting('t.o')::uuid, 'ship')$$);
select pg_temp.act(current_setting('t.b'));
select pg_temp.run($$select public.market_advance_order(current_setting('t.o')::uuid, 'complete')$$);
select pg_temp.act(current_setting('t.b'));
select pg_temp.chk('3 End-to-end', 'Shipped order completes; commission counted on completed order only', '1 completed, commission 4',
  (select count(*)||' completed, commission '||sum(platform_fee) from public.market_orders where status = 'completed'),
  (select count(*) = 1 and sum(platform_fee) = 4 from public.market_orders where status = 'completed'));

select pg_temp.act('');
select pg_temp.chk('4 Access control', 'Visitor update of prices is blocked', 'refused or 0 rows',
  coalesce(pg_temp.err($$update public.market_settings set cvs_fee = 0$$), pg_temp.rows($$update public.market_settings set cvs_fee = 0$$)::text),
  pg_temp.err($$update public.market_settings set cvs_fee = 0$$) is not null or pg_temp.rows($$update public.market_settings set cvs_fee = 0$$) = 0);

reset role;
select test_type, test_case, expected, actual, result from results order by n;
rollback;

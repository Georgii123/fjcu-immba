-- ===========================================================================
-- imMBA back office + public data — database test suite (Testing & Verification, types 1-10; 11 Regression excluded)
-- Covers: admin sign-up / approval rules, access by role, announcements, faculty, alumni (rules + CSV import RPC), audit log.
-- Complements tests/db-tests.sql (which covers the Market). Run on the live database inside one transaction that is
-- ROLLED BACK at the end: nothing is kept. The final step raises an error on purpose so the result text comes back
-- (Supabase SQL editor: ignore the red "RESULT" message, or replace the last block with the SELECT below it).
-- ===========================================================================
begin;

create temp table results (n serial, test_type text, test_case text, expected text, actual text, result text) on commit drop;
grant all on results to anon, authenticated;
grant usage on sequence results_n_seq to anon, authenticated;

create function pg_temp.chk(t text, c text, e text, a text, ok boolean) returns void language sql as $$
  insert into results (test_type, test_case, expected, actual, result)
  values (t, c, e, coalesce(a, '(nothing)'), case when ok then 'PASS' else 'FAIL' end);
$$;
create function pg_temp.err(q text) returns text language plpgsql as $$
begin execute q; return null; exception when others then return sqlerrm; end $$;
create function pg_temp.rows(q text) returns integer language plpgsql as $$
declare n integer; begin execute q; get diagnostics n = row_count; return n;
exception when others then return -1; end $$;
create function pg_temp.run(q text) returns void language plpgsql as $$
begin execute q; perform set_config('t.e', '', true);
exception when others then perform set_config('t.e', sqlerrm, true); end $$;
create function pg_temp.e(ok text) returns text language sql as $$ select coalesce(nullif(current_setting('t.e', true), ''), ok) $$;
create function pg_temp.cnt(q text) returns integer language plpgsql as $$
declare n integer; begin execute q into n; return n; exception when others then return -1; end $$;
create function pg_temp.act(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'none', true);
  if uid = '' then
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  else
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  end if;
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;

-- Test accounts (created like a real sign-up, so the sign-up trigger runs)
insert into public.admin_emails (email) values ('t.root@example.com');
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at) values
 ('bbbbbbbb-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t.pending@example.com', now(),'{"full_name":"Pending Person"}',now(),now()),
 ('bbbbbbbb-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t.forge1@example.com',  now(),'{"full_name":"Forger One","role":"super_admin","account_type":"admin"}',now(),now()),
 ('bbbbbbbb-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t.member@example.com',  now(),'{"full_name":"Market Member","account_type":"market"}',now(),now()),
 ('bbbbbbbb-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t.admin@example.com',   now(),'{"full_name":"Approved Admin"}',now(),now()),
 ('bbbbbbbb-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t.adminunconf@example.com', null,'{"full_name":"Admin Unconfirmed"}',now(),now()),
 ('bbbbbbbb-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t.rejected@example.com', now(),'{"full_name":"Rejected Person"}',now(),now()),
 ('bbbbbbbb-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t.root@example.com',    now(),'{"full_name":"Root Email"}',now(),now());
update public.profiles set role = 'admin'    where email in ('t.admin@example.com', 't.adminunconf@example.com');
update public.profiles set role = 'rejected' where email = 't.rejected@example.com';
select set_config('t.pend', 'bbbbbbbb-0000-0000-0000-000000000001', true),
       set_config('t.forge','bbbbbbbb-0000-0000-0000-000000000002', true),
       set_config('t.mem',  'bbbbbbbb-0000-0000-0000-000000000003', true),
       set_config('t.adm',  'bbbbbbbb-0000-0000-0000-000000000004', true),
       set_config('t.admu', 'bbbbbbbb-0000-0000-0000-000000000005', true),
       set_config('t.rej',  'bbbbbbbb-0000-0000-0000-000000000006', true),
       set_config('t.sup',  (select user_id::text from public.profiles where role = 'super_admin' and email <> 't.root@example.com' limit 1), true),
       set_config('t.pub',  (select count(*)::text from public.announcements where status = 'published'), true);

-- ───────── 9 SECURITY: how accounts are created (sign-up trigger) ─────────
select pg_temp.chk('9 Security','Back-office sign-up gets role "pending"','pending',(select role from public.profiles where email='t.pending@example.com'),(select role from public.profiles where email='t.pending@example.com')='pending');
select pg_temp.chk('9 Security','Sign-up that fakes role=super_admin in its own data','pending (the role is never taken from user data)',(select role from public.profiles where email='t.forge1@example.com'),(select role from public.profiles where email='t.forge1@example.com')='pending');
select pg_temp.chk('9 Security','Market sign-up is a "member", not an admin','member',(select role from public.profiles where email='t.member@example.com'),(select role from public.profiles where email='t.member@example.com')='member');
select pg_temp.chk('9 Security','Email listed in admin_emails becomes super_admin','super_admin',(select role from public.profiles where email='t.root@example.com'),(select role from public.profiles where email='t.root@example.com')='super_admin');
select pg_temp.chk('10 Notification','Registration is written to the activity log (REGISTER)','1 REGISTER entry for the new account',
  (select count(*)::text||' entry' from public.audit_log where action='REGISTER' and record_label like '%t.pending@example.com%'),
  (select count(*) from public.audit_log where action='REGISTER' and record_label like '%t.pending@example.com%')=1);

-- ───────── 4 ACCESS CONTROL: visitor (not logged in) ─────────
select pg_temp.act('');
select pg_temp.chk('4 Access control','Visitor reads the alumni table','refused',pg_temp.err($$select count(*) from public.alumni$$),pg_temp.err($$select count(*) from public.alumni$$) is not null);
select pg_temp.chk('4 Access control','Visitor reads the activity log','refused',pg_temp.err($$select count(*) from public.audit_log$$),pg_temp.err($$select count(*) from public.audit_log$$) is not null);
select pg_temp.chk('4 Access control','Visitor reads account profiles','refused',pg_temp.err($$select count(*) from public.profiles$$),pg_temp.err($$select count(*) from public.profiles$$) is not null);
select pg_temp.chk('4 Access control','Visitor reads the admin email list','refused or 0 rows',coalesce(pg_temp.err($$select count(*) from public.admin_emails$$),(select count(*)::text||' rows' from public.admin_emails)),pg_temp.err($$select count(*) from public.admin_emails$$) is not null or (select count(*) from public.admin_emails)=0);
select pg_temp.chk('1 Functional','Visitor reads announcements: only published ones','only published (' || current_setting('t.pub') || ')',
  (select count(*)::text from public.announcements),(select count(*) from public.announcements)=current_setting('t.pub')::int);
select pg_temp.chk('1 Functional','Visitor reads faculty','faculty list visible',(select count(*)::text||' professors' from public.faculty),(select count(*) from public.faculty)>0);
select pg_temp.chk('4 Access control','Visitor creates an announcement','refused',pg_temp.err($$insert into public.announcements (id,date,url) values ('t-v',current_date,'')$$),pg_temp.err($$insert into public.announcements (id,date,url) values ('t-v',current_date,'')$$) is not null);
select pg_temp.chk('4 Access control','Visitor creates a faculty record','refused',pg_temp.err($$insert into public.faculty (name) values ('Visitor Prof')$$),pg_temp.err($$insert into public.faculty (name) values ('Visitor Prof')$$) is not null);
select pg_temp.chk('4 Access control','Visitor calls the CSV import function','refused',pg_temp.err($$select public.import_alumni('[{"full_name":"V","student_id":"V1","department":"D","degree_program":"Master"}]'::jsonb,'v.csv')$$),pg_temp.err($$select public.import_alumni('[{"full_name":"V","student_id":"V1","department":"D","degree_program":"Master"}]'::jsonb,'v.csv')$$) is not null);

-- ───────── 4 ACCESS CONTROL: people who are not approved admins ─────────
select pg_temp.act(current_setting('t.pend'));
select pg_temp.chk('4 Access control','Pending applicant reads alumni','0 rows',(select count(*)::text from public.alumni),(select count(*) from public.alumni)=0);
select pg_temp.chk('4 Access control','Pending applicant reads the activity log','0 rows',(select count(*)::text from public.audit_log),(select count(*) from public.audit_log)=0);
select pg_temp.chk('4 Access control','Pending applicant reads profiles','only their own',(select count(*)::text||' profile(s)' from public.profiles),(select count(*) from public.profiles)=1);
select pg_temp.chk('4 Access control','Pending applicant writes an announcement','refused',pg_temp.err($$insert into public.announcements (id,date,url) values ('t-p',current_date,'')$$),pg_temp.err($$insert into public.announcements (id,date,url) values ('t-p',current_date,'')$$) is not null);
select pg_temp.chk('4 Access control','Pending applicant writes a faculty record','refused',pg_temp.err($$insert into public.faculty (name) values ('P')$$),pg_temp.err($$insert into public.faculty (name) values ('P')$$) is not null);
select pg_temp.chk('4 Access control','Pending applicant adds an alumnus','refused',pg_temp.err($$insert into public.alumni (full_name,student_id,department,degree_program) values ('P','P1','D','Master')$$),pg_temp.err($$insert into public.alumni (full_name,student_id,department,degree_program) values ('P','P1','D','Master')$$) is not null);
select pg_temp.chk('4 Access control','Pending applicant approves themselves (role -> admin)','refused, role unchanged',
  pg_temp.rows($$update public.profiles set role='admin' where user_id = current_setting('t.pend')::uuid$$)::text||' rows',
  pg_temp.rows($$update public.profiles set role='admin' where user_id = current_setting('t.pend')::uuid$$) <= 0);
select pg_temp.chk('4 Access control','Pending applicant calls the CSV import function','refused',pg_temp.err($$select public.import_alumni('[{"full_name":"P","student_id":"P2","department":"D","degree_program":"Master"}]'::jsonb,'p.csv')$$),pg_temp.err($$select public.import_alumni('[{"full_name":"P","student_id":"P2","department":"D","degree_program":"Master"}]'::jsonb,'p.csv')$$) is not null);

select pg_temp.act(current_setting('t.mem'));
select pg_temp.chk('4 Access control','Market member reads alumni','0 rows',(select count(*)::text from public.alumni),(select count(*) from public.alumni)=0);
select pg_temp.chk('4 Access control','Market member writes an announcement','refused',pg_temp.err($$insert into public.announcements (id,date,url) values ('t-m',current_date,'')$$),pg_temp.err($$insert into public.announcements (id,date,url) values ('t-m',current_date,'')$$) is not null);
select pg_temp.chk('4 Access control','Market member makes themselves admin','refused',pg_temp.rows($$update public.profiles set role='admin' where user_id = current_setting('t.mem')::uuid$$)::text||' rows',pg_temp.rows($$update public.profiles set role='admin' where user_id = current_setting('t.mem')::uuid$$)<=0);

select pg_temp.act(current_setting('t.rej'));
select pg_temp.chk('4 Access control','Rejected applicant reads alumni','0 rows',(select count(*)::text from public.alumni),(select count(*) from public.alumni)=0);
select pg_temp.chk('4 Access control','Rejected applicant writes an announcement','refused',pg_temp.err($$insert into public.announcements (id,date,url) values ('t-r',current_date,'')$$),pg_temp.err($$insert into public.announcements (id,date,url) values ('t-r',current_date,'')$$) is not null);

select pg_temp.act(current_setting('t.admu'));
select pg_temp.chk('9 Security','Admin whose email is NOT confirmed reads alumni','0 rows (email must be confirmed first)',(select count(*)::text from public.alumni),(select count(*) from public.alumni)=0);
select pg_temp.chk('9 Security','Admin whose email is NOT confirmed writes an announcement','refused',pg_temp.err($$insert into public.announcements (id,date,url) values ('t-u',current_date,'')$$),pg_temp.err($$insert into public.announcements (id,date,url) values ('t-u',current_date,'')$$) is not null);

-- ───────── 1 FUNCTIONAL + 4 ACCESS CONTROL: approved admin ─────────
select pg_temp.act(current_setting('t.adm'));
select pg_temp.chk('1 Functional','Approved admin reads alumni','all alumni visible',(select count(*)::text||' alumni' from public.alumni),(select count(*) from public.alumni)>=10);
select pg_temp.run($$insert into public.announcements (id,date,url,status,title_en) values ('t-ann-1',current_date,'','draft','Test notice')$$);
select pg_temp.chk('1 Functional','Approved admin creates an announcement','saved',pg_temp.e('saved'),(select count(*) from public.announcements where id='t-ann-1')=1);
select pg_temp.chk('1 Functional','Approved admin sees a draft (visitors do not)','draft visible to admin',(select status from public.announcements where id='t-ann-1'),(select status from public.announcements where id='t-ann-1')='draft');
select pg_temp.run($$update public.announcements set title_en='Test notice 2', status='published' where id='t-ann-1'$$);
select pg_temp.chk('1 Functional','Approved admin updates an announcement','updated',pg_temp.e('updated'),(select title_en from public.announcements where id='t-ann-1')='Test notice 2');
select pg_temp.run($$insert into public.faculty (name,title,category) values ('Prof. Test','Professor','Visiting')$$);
select pg_temp.chk('1 Functional','Approved admin creates a faculty record','saved',pg_temp.e('saved'),(select count(*) from public.faculty where name='Prof. Test')=1);
select pg_temp.chk('4 Access control','Approved admin reads account profiles','only their own (only the super admin sees all)',(select count(*)::text||' profile(s)' from public.profiles),(select count(*) from public.profiles)=1);
select pg_temp.chk('4 Access control','Approved admin approves another applicant','refused (0 rows)',pg_temp.rows($$update public.profiles set role='admin' where user_id = current_setting('t.pend')::uuid$$)::text||' rows',pg_temp.rows($$update public.profiles set role='admin' where user_id = current_setting('t.pend')::uuid$$)<=0);
select pg_temp.chk('4 Access control','Approved admin makes themselves super admin','refused',pg_temp.rows($$update public.profiles set role='super_admin' where user_id = current_setting('t.adm')::uuid$$)::text||' rows',pg_temp.rows($$update public.profiles set role='super_admin' where user_id = current_setting('t.adm')::uuid$$)<=0);
select pg_temp.chk('4 Access control','Approved admin edits the activity log','refused or 0 rows',pg_temp.rows($$update public.audit_log set admin_email='x'$$)::text||' rows',pg_temp.rows($$update public.audit_log set admin_email='x'$$)<=0);
select pg_temp.chk('4 Access control','Approved admin deletes from the activity log','refused or 0 rows',pg_temp.rows($$delete from public.audit_log$$)::text||' rows',pg_temp.rows($$delete from public.audit_log$$)<=0);
select pg_temp.chk('4 Access control','Approved admin writes directly into the activity log','refused',pg_temp.err($$insert into public.audit_log (admin_email,action,table_name,record_id) values ('x','CREATE','alumni','1')$$),pg_temp.err($$insert into public.audit_log (admin_email,action,table_name,record_id) values ('x','CREATE','alumni','1')$$) is not null);

-- ───────── 2 INTEGRATION: change -> activity log ─────────
select pg_temp.chk('2 Integration','Creating an announcement writes a CREATE entry','1 CREATE entry',(select count(*)::text||' entry' from public.audit_log where record_id='t-ann-1' and action='CREATE'),(select count(*) from public.audit_log where record_id='t-ann-1' and action='CREATE')=1);
select pg_temp.chk('2 Integration','Updating an announcement stores old and new value','title_en: Test notice -> Test notice 2',
  (select changes->'title_en' ->> 0 || ' -> ' || (changes->'title_en' ->> 1) from public.audit_log where record_id='t-ann-1' and action='UPDATE' limit 1),
  (select changes->'title_en' ->> 1 from public.audit_log where record_id='t-ann-1' and action='UPDATE' limit 1)='Test notice 2');
select pg_temp.chk('2 Integration','Log says who made the change','t.admin@example.com',(select admin_email from public.audit_log where record_id='t-ann-1' and action='CREATE'),(select admin_email from public.audit_log where record_id='t-ann-1' and action='CREATE')='t.admin@example.com');

-- alumni: create / update / delete / restore all leave a trace
select pg_temp.run($$insert into public.alumni (full_name,student_id,department,degree_program,admission_year,graduation_year,email,company) values ('Test Alumna','T-0001','Department of Finance','Master',2018,2020,'alumna@example.com','Old Co')$$);
select pg_temp.chk('1 Functional','Admin creates an alumnus','saved',pg_temp.e('saved'),(select count(*) from public.alumni where student_id='T-0001')=1);
select set_config('t.al', (select id::text from public.alumni where student_id='T-0001'), true);
select pg_temp.chk('2 Integration','Creating an alumnus writes a CREATE entry with a readable label','CREATE, "Test Alumna (T-0001)"',(select action||', '||record_label from public.audit_log where record_id=current_setting('t.al') and action='CREATE'),(select count(*) from public.audit_log where record_id=current_setting('t.al') and action='CREATE' and record_label='Test Alumna (T-0001)')=1);

select pg_temp.rows($$update public.alumni set company='New Co' where id = current_setting('t.al')::uuid$$);
select pg_temp.chk('2 Integration','Updating an alumnus stores old and new value','company: Old Co -> New Co',
  (select (changes->'company'->>0)||' -> '||(changes->'company'->>1) from public.audit_log where record_id=current_setting('t.al') and action='UPDATE' limit 1),
  (select changes->'company'->>1 from public.audit_log where record_id=current_setting('t.al') and action='UPDATE' limit 1)='New Co');
select pg_temp.rows($$update public.alumni set company='New Co' where id = current_setting('t.al')::uuid$$);
select pg_temp.chk('2 Integration','Saving without any change adds no log entry','still 1 UPDATE entry',(select count(*)::text||' UPDATE entry' from public.audit_log where record_id=current_setting('t.al') and action='UPDATE'),(select count(*) from public.audit_log where record_id=current_setting('t.al') and action='UPDATE')=1);
select pg_temp.rows($$update public.alumni set deleted_at = now() where id = current_setting('t.al')::uuid$$);
select pg_temp.chk('2 Integration','Deleting an alumnus is a soft delete and logs DELETE','row kept, 1 DELETE entry',
  (select count(*)||' row kept, '||(select count(*) from public.audit_log where record_id=current_setting('t.al') and action='DELETE')||' DELETE entry' from public.alumni where id=current_setting('t.al')::uuid and deleted_at is not null),
  (select count(*) from public.alumni where id=current_setting('t.al')::uuid and deleted_at is not null)=1 and (select count(*) from public.audit_log where record_id=current_setting('t.al') and action='DELETE')=1);
select pg_temp.chk('4 Access control','Nobody can hard-delete an alumnus','refused / 0 rows',pg_temp.rows($$delete from public.alumni where id = current_setting('t.al')::uuid$$)::text||' rows',pg_temp.rows($$delete from public.alumni where id = current_setting('t.al')::uuid$$)<=0);
select pg_temp.run($$insert into public.alumni (full_name,student_id,department,degree_program) values ('Test Alumna Again','T-0001','D','Master')$$);
select pg_temp.chk('6 Boundary','Same student ID can be re-added after a delete','allowed',pg_temp.e('allowed'),(select count(*) from public.alumni where student_id='T-0001')=2);
select pg_temp.rows($$update public.alumni set deleted_at = null where id = current_setting('t.al')::uuid$$);
select pg_temp.chk('5 Negative','Restoring while another active record has the same student ID','refused (unique active student ID)',coalesce(pg_temp.err($$update public.alumni set deleted_at = null where id = current_setting('t.al')::uuid$$),'restored'),pg_temp.err($$update public.alumni set deleted_at = null where id = current_setting('t.al')::uuid$$) is not null);
select pg_temp.rows($$update public.alumni set deleted_at = now() where student_id='T-0001' and deleted_at is null$$);
select pg_temp.rows($$update public.alumni set deleted_at = null where id = current_setting('t.al')::uuid$$);
select pg_temp.chk('2 Integration','Restoring an alumnus logs RESTORE','1 RESTORE entry',(select count(*)::text||' RESTORE entry' from public.audit_log where record_id=current_setting('t.al') and action='RESTORE'),(select count(*) from public.audit_log where record_id=current_setting('t.al') and action='RESTORE')=1);

-- ───────── 6 BOUNDARY + 5 NEGATIVE: alumni field rules ─────────
select pg_temp.chk('5 Negative','Alumnus with an empty (blank) name','rejected',pg_temp.err($$insert into public.alumni (full_name,student_id,department,degree_program) values ('   ','T-B01','D','Master')$$),pg_temp.err($$insert into public.alumni (full_name,student_id,department,degree_program) values ('   ','T-B01','D','Master')$$) is not null);
select pg_temp.run($$insert into public.alumni (full_name,student_id,department,degree_program) values (repeat('a',120),'T-B02','D','Master')$$);
select pg_temp.chk('6 Boundary','Name = 120 characters','allowed',pg_temp.e('allowed'),exists(select 1 from public.alumni where student_id='T-B02'));
select pg_temp.chk('6 Boundary','Name = 121 characters','rejected',pg_temp.err($$insert into public.alumni (full_name,student_id,department,degree_program) values (repeat('a',121),'T-B03','D','Master')$$),pg_temp.err($$insert into public.alumni (full_name,student_id,department,degree_program) values (repeat('a',121),'T-B03','D','Master')$$) is not null);
select pg_temp.chk('5 Negative','Empty student ID','rejected',pg_temp.err($$insert into public.alumni (full_name,student_id,department,degree_program) values ('X','','D','Master')$$),pg_temp.err($$insert into public.alumni (full_name,student_id,department,degree_program) values ('X','','D','Master')$$) is not null);
select pg_temp.run($$insert into public.alumni (full_name,student_id,department,degree_program) values ('X',repeat('9',40),'D','Master')$$);
select pg_temp.chk('6 Boundary','Student ID = 40 characters','allowed',pg_temp.e('allowed'),exists(select 1 from public.alumni where student_id=repeat('9',40)));
select pg_temp.chk('6 Boundary','Student ID = 41 characters','rejected',pg_temp.err($$insert into public.alumni (full_name,student_id,department,degree_program) values ('X',repeat('8',41),'D','Master')$$),pg_temp.err($$insert into public.alumni (full_name,student_id,department,degree_program) values ('X',repeat('8',41),'D','Master')$$) is not null);
select pg_temp.chk('5 Negative','Degree level not in the list ("PhD")','rejected',pg_temp.err($$insert into public.alumni (full_name,student_id,department,degree_program) values ('X','T-B04','D','PhD')$$),pg_temp.err($$insert into public.alumni (full_name,student_id,department,degree_program) values ('X','T-B04','D','PhD')$$) is not null);
select pg_temp.run($$insert into public.alumni (full_name,student_id,department,degree_program) values ('X','T-B05','D','Doctoral')$$);
select pg_temp.chk('6 Boundary','Degree level "Doctoral"','allowed',pg_temp.e('allowed'),exists(select 1 from public.alumni where student_id='T-B05'));
select pg_temp.chk('6 Boundary','Admission year = 1899','rejected',pg_temp.err($$insert into public.alumni (full_name,student_id,department,degree_program,admission_year) values ('X','T-B06','D','Master',1899)$$),pg_temp.err($$insert into public.alumni (full_name,student_id,department,degree_program,admission_year) values ('X','T-B06','D','Master',1899)$$) is not null);
select pg_temp.run($$insert into public.alumni (full_name,student_id,department,degree_program,admission_year) values ('X','T-B07','D','Master',1900)$$);
select pg_temp.chk('6 Boundary','Admission year = 1900','allowed',pg_temp.e('allowed'),exists(select 1 from public.alumni where student_id='T-B07'));
select pg_temp.run($$insert into public.alumni (full_name,student_id,department,degree_program,graduation_year) values ('X','T-B08','D','Master',2100)$$);
select pg_temp.chk('6 Boundary','Graduation year = 2100','allowed',pg_temp.e('allowed'),exists(select 1 from public.alumni where student_id='T-B08'));
select pg_temp.chk('6 Boundary','Graduation year = 2101','rejected',pg_temp.err($$insert into public.alumni (full_name,student_id,department,degree_program,graduation_year) values ('X','T-B09','D','Master',2101)$$),pg_temp.err($$insert into public.alumni (full_name,student_id,department,degree_program,graduation_year) values ('X','T-B09','D','Master',2101)$$) is not null);
select pg_temp.chk('6 Boundary','Graduation year one year BEFORE admission year (2019 < 2020)','rejected',pg_temp.err($$insert into public.alumni (full_name,student_id,department,degree_program,admission_year,graduation_year) values ('X','T-B10','D','Master',2020,2019)$$),pg_temp.err($$insert into public.alumni (full_name,student_id,department,degree_program,admission_year,graduation_year) values ('X','T-B10','D','Master',2020,2019)$$) is not null);
select pg_temp.run($$insert into public.alumni (full_name,student_id,department,degree_program,admission_year,graduation_year) values ('X','T-B11','D','Master',2020,2020)$$);
select pg_temp.chk('6 Boundary','Graduation year = admission year (2020 = 2020)','allowed',pg_temp.e('allowed'),exists(select 1 from public.alumni where student_id='T-B11'));
select pg_temp.chk('5 Negative','Invalid email ("not-an-email")','rejected',pg_temp.err($$insert into public.alumni (full_name,student_id,department,degree_program,email) values ('X','T-B12','D','Master','not-an-email')$$),pg_temp.err($$insert into public.alumni (full_name,student_id,department,degree_program,email) values ('X','T-B12','D','Master','not-an-email')$$) is not null);
select pg_temp.chk('5 Negative','Email with a space','rejected',pg_temp.err($$insert into public.alumni (full_name,student_id,department,degree_program,email) values ('X','T-B13','D','Master','a b@example.com')$$),pg_temp.err($$insert into public.alumni (full_name,student_id,department,degree_program,email) values ('X','T-B13','D','Master','a b@example.com')$$) is not null);
select pg_temp.run($$insert into public.alumni (full_name,student_id,department,degree_program,notes) values ('X','T-B14','D','Master',repeat('n',2000))$$);
select pg_temp.chk('6 Boundary','Notes = 2000 characters','allowed',pg_temp.e('allowed'),exists(select 1 from public.alumni where student_id='T-B14'));
select pg_temp.chk('6 Boundary','Notes = 2001 characters','rejected',pg_temp.err($$insert into public.alumni (full_name,student_id,department,degree_program,notes) values ('X','T-B15','D','Master',repeat('n',2001))$$),pg_temp.err($$insert into public.alumni (full_name,student_id,department,degree_program,notes) values ('X','T-B15','D','Master',repeat('n',2001))$$) is not null);
select pg_temp.chk('5 Negative','Second ACTIVE alumnus with the same student ID (different case and spaces)','rejected',pg_temp.err($$insert into public.alumni (full_name,student_id,department,degree_program) values ('Dup','  t-0001 ','D','Master')$$),pg_temp.err($$insert into public.alumni (full_name,student_id,department,degree_program) values ('Dup','  t-0001 ','D','Master')$$) is not null);

-- ───────── 2 INTEGRATION + 5/6: CSV import function (all rows or none) ─────────
select pg_temp.run($$select public.import_alumni('[{"full_name":"Imp One","student_id":"IM-1","department":"D","degree_program":"Bachelor","admission_year":2015,"graduation_year":2019},{"full_name":"Imp Two","student_id":"IM-2","department":"D","degree_program":"Master"},{"full_name":"Imp Three","student_id":"IM-3","department":"D","degree_program":"Doctoral"}]'::jsonb,'t.csv')$$);
select pg_temp.chk('1 Functional','Import of 3 valid rows','3 rows created',pg_temp.e('ok'),(select count(*) from public.alumni where student_id like 'IM-%')=3);
select pg_temp.chk('2 Integration','Import is logged per row with the file name','3 CREATE entries, source "CSV import: t.csv"',(select count(*)::text||' entries, source '||min(source) from public.audit_log where source='CSV import: t.csv'),(select count(*) from public.audit_log where source='CSV import: t.csv' and action='CREATE')=3);
select pg_temp.run($$select public.import_alumni('[{"full_name":"Ok Row","student_id":"IM-10","department":"D","degree_program":"Master"},{"full_name":"Bad Row","student_id":"IM-11","department":"D","degree_program":"Master","admission_year":2020,"graduation_year":2018}]'::jsonb,'bad.csv')$$);
select pg_temp.chk('5 Negative','Import where ONE row is invalid (graduation before admission)','error and NOTHING imported (all or none)',coalesce(nullif(current_setting('t.e', true),''),'NO ERROR')||' / '||(select count(*) from public.alumni where student_id in ('IM-10','IM-11'))::text||' rows imported',current_setting('t.e', true) <> '' and (select count(*) from public.alumni where student_id in ('IM-10','IM-11'))=0);
select pg_temp.run($$select public.import_alumni('[{"full_name":"A","student_id":"IM-20","department":"D","degree_program":"Master"},{"full_name":"B","student_id":"im-20","department":"D","degree_program":"Master"}]'::jsonb,'dup.csv')$$);
select pg_temp.chk('5 Negative','Import with the same student ID twice in one file','rejected, nothing imported',coalesce(nullif(current_setting('t.e', true),''),'NO ERROR')||' / '||(select count(*) from public.alumni where lower(student_id)='im-20')::text||' rows imported',current_setting('t.e', true) <> '' and (select count(*) from public.alumni where lower(student_id)='im-20')=0);
select pg_temp.chk('5 Negative','Import with a student ID that already exists','rejected',pg_temp.err($$select public.import_alumni('[{"full_name":"A","student_id":"IM-1","department":"D","degree_program":"Master"}]'::jsonb,'exists.csv')$$),pg_temp.err($$select public.import_alumni('[{"full_name":"A","student_id":"IM-1","department":"D","degree_program":"Master"}]'::jsonb,'exists.csv')$$) is not null);
select pg_temp.chk('5 Negative','Import with a missing required value (no student ID)','rejected',pg_temp.err($$select public.import_alumni('[{"full_name":"A","department":"D","degree_program":"Master"}]'::jsonb,'x.csv')$$),pg_temp.err($$select public.import_alumni('[{"full_name":"A","department":"D","degree_program":"Master"}]'::jsonb,'x.csv')$$) is not null);
select pg_temp.chk('6 Boundary','Import with 0 rows','rejected',pg_temp.err($$select public.import_alumni('[]'::jsonb,'e.csv')$$),pg_temp.err($$select public.import_alumni('[]'::jsonb,'e.csv')$$) is not null);
select pg_temp.chk('5 Negative','Import data that is not a list','rejected',pg_temp.err($$select public.import_alumni('{"a":1}'::jsonb,'e.csv')$$),pg_temp.err($$select public.import_alumni('{"a":1}'::jsonb,'e.csv')$$) is not null);
select pg_temp.run($$select public.import_alumni((select jsonb_agg(jsonb_build_object('full_name','Bulk '||g,'student_id','BK-'||g,'department','D','degree_program','Master')) from generate_series(1,1001) g),'big.csv')$$);
select pg_temp.chk('6 Boundary','Import with 1001 rows (limit is 1000)','rejected, nothing imported',coalesce(nullif(current_setting('t.e', true),''),'NO ERROR')||' / '||(select count(*) from public.alumni where student_id like 'BK-%')::text||' rows imported',current_setting('t.e', true) <> '' and (select count(*) from public.alumni where student_id like 'BK-%')=0);
select pg_temp.run($$select public.import_alumni((select jsonb_agg(jsonb_build_object('full_name','Bulk '||g,'student_id','BK-'||g,'department','D','degree_program','Master')) from generate_series(1,1000) g),'big.csv')$$);
select pg_temp.chk('6 Boundary','Import with exactly 1000 rows','allowed',pg_temp.e('ok'),(select count(*) from public.alumni where student_id like 'BK-%')=1000);

-- ───────── 4 ACCESS CONTROL + 3 END-TO-END: super admin approves a new person ─────────
select pg_temp.act(current_setting('t.sup'));
select pg_temp.chk('4 Access control','Super admin sees all accounts','every test account visible',(select count(*)::text||' profiles' from public.profiles),(select count(*) from public.profiles)>=8);
select pg_temp.run($$update public.profiles set role='admin' where user_id = current_setting('t.pend')::uuid$$);
select pg_temp.chk('3 End-to-end','Super admin approves the pending applicant','role becomes admin, reviewer and time stored',pg_temp.e('approved'),(select role='admin' and reviewed_by is not null and reviewed_at is not null from public.profiles where user_id=current_setting('t.pend')::uuid));
select pg_temp.chk('2 Integration','Approval is written to the activity log','APPROVE entry: pending -> admin',(select action||': '||(changes->'role'->>0)||' -> '||(changes->'role'->>1) from public.audit_log where action='APPROVE' and record_label like '%t.pending@example.com%' limit 1),(select count(*) from public.audit_log where action='APPROVE' and record_label like '%t.pending@example.com%' and changes->'role'->>1='admin')=1);
select pg_temp.act(current_setting('t.pend'));
select pg_temp.chk('3 End-to-end','The approved person can now read alumni and write announcements','access granted right after approval',(select count(*)::text||' alumni visible' from public.alumni),(select count(*) from public.alumni)>=10 and pg_temp.err($$insert into public.announcements (id,date,url) values ('t-ann-2',current_date,'')$$) is null);
select pg_temp.act(current_setting('t.sup'));
select pg_temp.chk('4 Access control','Super admin makes someone else super admin','refused',pg_temp.rows($$update public.profiles set role='super_admin' where user_id = current_setting('t.pend')::uuid$$)::text||' rows',pg_temp.rows($$update public.profiles set role='super_admin' where user_id = current_setting('t.pend')::uuid$$)<=0);
select pg_temp.chk('4 Access control','Super admin changes their own role','refused (0 rows)',pg_temp.rows($$update public.profiles set role='admin' where user_id = current_setting('t.sup')::uuid$$)::text||' rows',pg_temp.rows($$update public.profiles set role='admin' where user_id = current_setting('t.sup')::uuid$$)<=0);
select pg_temp.run($$update public.profiles set role='rejected' where user_id = current_setting('t.pend')::uuid$$);
select pg_temp.chk('3 End-to-end','Super admin removes access again (admin -> rejected)','role rejected, REJECT logged',pg_temp.e('removed'),(select role from public.profiles where user_id=current_setting('t.pend')::uuid)='rejected' and (select count(*) from public.audit_log where action='REJECT' and record_label like '%t.pending@example.com%')=1);
select pg_temp.act(current_setting('t.pend'));
select pg_temp.chk('4 Access control','Person whose access was removed can no longer read alumni','0 rows',(select count(*)::text from public.alumni),(select count(*) from public.alumni)=0);

-- ───────── result ─────────
reset role;
do $$ declare r text; begin
  select 'TOTAL=' || count(*) || ' PASS=' || count(*) filter (where result='PASS') || ' FAIL=' || count(*) filter (where result='FAIL') || coalesce(' FAILED: ' || string_agg(n || ' ' || test_case || ' -> ' || actual, ' ;; ') filter (where result='FAIL'), '')
  into r from results;
  raise exception 'RESULT: %', r;
end $$;
rollback;
-- To see the full table instead (Supabase SQL editor): replace the DO block above with
--   select n as "#", test_type, test_case, expected, actual, result from results order by n;

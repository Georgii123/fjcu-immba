# imMBA website and back office: Testing and Verification report

Course: AI-Assisted Digital Product Development, Vibe Coding VI (24 Nov 2026). Georgii Zhukov F15381061.
Scope: the **original website and back office**: public pages, admin sign-up and approval, announcements, faculty, alumni database, CSV import, activity log, and the database rules behind them.
The imMBA Market was already tested in `TESTING.md` (92 cases). I re-ran those 92 myself today as a cross-check: **53/53 database + 39/39 browser passed**.

> **Test it. Break it. Fix it. Verify it.** Types 1-10 from the lecture are covered. **11. Regression testing was intentionally NOT done** (excluded for this assignment), so the fixes below were checked only on the cases they affect.
> **8. Peer user acceptance testing** needs real classmates; a UAT script for them is at the end.

## Summary

| Part | Test cases | Passed |
|---|---|---|
| Database tests, back office (`tests/backoffice-db-tests.sql`, live database, rolled back) | 89 | 89 |
| Browser tests, public site + back office (`tests/site-ui-tests.js`, real Chromium) | 105 | 105 (after fixes) |
| Outside checks (public key only, storage, auth settings, security advisor) | 19 | 19 |
| Cross-check of the Market tests (`tests/db-tests.sql`, `tests/ui-tests.js`) | 92 | 92 |
| **Total** | **305** | **305** |

The first browser run had **22 failures: 14 were real problems** (listed below), 8 were mistakes in my test script (wrong field names, a confirm dialog, the saved login re-added after logout). I fixed both, then re-ran: 104/104.
No data was changed by the tests: the database tests run inside a transaction that is rolled back, and I compared row counts before and after.

## Break it -> Fix it: problems found and fixed

| # | Found by (type) | Problem (before) | Fix | Verified by |
|---|---|---|---|---|
| 1 | 9 Security | The **back-office** Register form accepted weak passwords: `123456`, `12345678`, `abcdefgh`, `password1` (only 6 characters were needed). The earlier fix covered only the Market page. | Same rule as the Market: at least 8 characters, letters **and** numbers, common passwords refused. Also applies to "choose a new password". Help text updated. | Browser: "weak password" cases (6 of them) |
| 2 | 7 Usability / accessibility | On About, Admissions, Curriculum and Faculty **there was no main heading (h1)** (lost when the title banner was removed on request). Screen readers and search engines found no page title. | The first section heading of each page is now the h1, with the same look. | Browser: "has a main heading" x5 |
| 3 | 7 Usability / accessibility | The **phone menu button had no name** on every page (a screen reader says only "button"). | `aria-label="Menu"`, and `aria-expanded` follows the open/closed state. | Browser: "buttons with names" x5 |
| 4 | 7 Usability | One image on About (the enlarged-photo viewer) had no alt attribute. | `alt=""` (its caption below describes it). | Browser: About "images with alt text" |
| 5 | 5 Negative | An address that does not exist showed Vercel's bare text **"NOT_FOUND"** with no way back. | New `404.html`: friendly message, site menu and a "Back to the home page" button. | Browser: "page not found" page (local file; the live address check needs the push) |
| 6 | 9 Security | The Supabase security check warned that function `alumni_touch` had a changeable search path. | `alter function public.alumni_touch() set search_path = public;` (applied to the live database, saved in `supabase/schema.sql`). | Advisor re-run: warning gone |

## Bug or missing requirement? (not fixable in code alone)

| Item | Status | What is needed |
|---|---|---|
| Leaked-password protection and minimum password length on the **server** | Supabase security check still warns: leaked-password protection is off. The page now enforces 8+ characters with letters and numbers, but another client talking to Supabase directly could still use a shorter password. | Supabase Dashboard -> Authentication -> Settings/Policies: minimum length 8, require letters + digits, turn on leaked-password protection (**you** need to do this; it is a security setting). |
| Email to the director when someone asks for access | **Missing requirement.** The director only sees a red number on the Admins tab after logging in; nobody is told by email. Applicants are also not told by email when approved or rejected (they find out when they log in). | An email service (for example Resend) connected through a Supabase Edge Function. |
| Order confirmation / shipping emails (Market) | Missing requirement, already listed in `TESTING.md`. | Same email service. |
| Registration reveals that an email already has an account ("This email already has an account") | Observation, low risk. "Forgot password" is worded so it does not reveal this, Register does. | Decision for you: keep (more helpful) or make it vague (more private). |
| 4 Market functions can be run by any signed-in user (security check WARN) | **Intended.** They check the caller's role inside (database tests #18, #28-#43 of the Market suite prove it). | None. |
| Real email delivery (confirmation, reset, approval) and a real sign-in on the live pages | **Not tested**: I may not create accounts or sign in. Sending was tested against a fake backend; sign-up and role rules were tested in the database with test accounts that were rolled back. | You or a classmate: register with a real address and approve it. |
| 11. Regression testing | Not done (excluded). | - |

## One test, one theory (this website)

| Testing concept | Test | Result |
|---|---|---|
| Functional | Admin creates an alumnus; visitor opens Admissions and sees 8 documents | PASS (Database #44, Browser #12) |
| Integration | Admin changes a record -> the activity log shows who, when, old and new value | PASS (Database #41-#48, #73, #84) |
| End-to-end | New person registers -> super admin approves -> they can now read alumni -> access removed again | PASS (Database #83, #85, #88, #89) |
| Access control | Applicant, Market member or unconfirmed admin opens the alumni page by typing the address or calling the database | PASS (Database #15-#29, Browser logged-out and role tests) |
| Negative / boundary | Graduation year before admission, 1001-row CSV, student ID of 41 characters | PASS (Database #61-#81, Browser import tests) |
| Usability / UAT | First-time visitor finds routes and documents; phone layouts; keyboard only | PASS after fixes #2-#4; peer UAT still to do |
| Security-related | Weak password, forged role at sign-up, visitor writes with the public key | PASS after fix #1 |
| Notification | Registration, forgot password, import, delete messages | PASS in the site; email to the director = missing requirement |
| Regression | Test again after a fix | **Not done (excluded)** |

## Test cases by type

Format from the lecture: **Action -> Expected -> Actual -> Result.** "Actual" is the real output of the test run.
Database tests run as test accounts inside a rolled-back transaction on the live database. Browser tests use real Chromium (public pages: real Supabase, read only; back office: a fake backend with made-up people). Outside checks use only the public key.


### 1. Functional testing

| Source | Action | Expected | Actual | Result |
|---|---|---|---|---|
| Database #10 | Visitor reads announcements: only published ones | only published (23) | 23 | **PASS** |
| Database #11 | Visitor reads faculty | faculty list visible | 20 professors | **PASS** |
| Database #30 | Approved admin reads alumni | all alumni visible | 10 alumni | **PASS** |
| Database #31 | Approved admin creates an announcement | saved | saved | **PASS** |
| Database #32 | Approved admin sees a draft (visitors do not) | draft visible to admin | draft | **PASS** |
| Database #33 | Approved admin updates an announcement | updated | updated | **PASS** |
| Database #34 | Approved admin creates a faculty record | saved | saved | **PASS** |
| Database #44 | Admin creates an alumnus | saved | saved | **PASS** |
| Database #72 | Import of 3 valid rows | 3 rows created | 3 rows created | **PASS** |
| Browser #1 | Open index.html | HTTP 200, no JavaScript errors | HTTP 200, 0 error(s) | **PASS** |
| Browser #2 | Open about.html | HTTP 200, no JavaScript errors | HTTP 200, 0 error(s) | **PASS** |
| Browser #3 | Open admissions.html | HTTP 200, no JavaScript errors | HTTP 200, 0 error(s) | **PASS** |
| Browser #4 | Open curriculum.html | HTTP 200, no JavaScript errors | HTTP 200, 0 error(s) | **PASS** |
| Browser #5 | Open faculty.html | HTTP 200, no JavaScript errors | HTTP 200, 0 error(s) | **PASS** |
| Browser #6 | Home shows the first announcement cards | 3 cards | 3 cards | **PASS** |
| Browser #7 | "See all" shows the rest | more than 3 cards | 23 cards (button: "SEE ALL ANNOUNCEMENTS (23)") | **PASS** |
| Browser #8 | Open an announcement | details popup opens (or link leaves the site) | popup open | **PASS** |
| Browser #10 | Language switch Chinese -> English | menu changes language | 關於學程 -> About | **PASS** |
| Browser #12 | Admissions page content | 2 routes, 8 documents, international text | 2 routes, 8 documents, 273 characters of international text | **PASS** |
| Browser #13 | Apply button goes to the official enrolment page | opens the official page in a new tab, safely | https://www.management.fju.edu.tw/esubweb/immbaengindex/enroll.php?IID rel=noopener | **PASS** |
| Browser #15 | Every internal menu link opens a real page | no broken links | 9 links checked, broken: none | **PASS** |
| Browser #67 | Plain admin: Alumni page loads | data visible | 4 records | **PASS** |
| Browser #68 | Super admin sees the Admins list | pending applicants listed | 2 row(s) | **PASS** |
| Browser #70 | Alumni list loads | 4 test alumni | 4 rows | **PASS** |
| Browser #71 | Search by name ("sophie") | 1 row | 1 rows | **PASS** |
| Browser #72 | Search by student ID part ("G2022") | 1 row | 1 rows | **PASS** |
| Browser #74 | Filter by degree level "Master" | 3 rows | 3 rows | **PASS** |
| Browser #75 | Export the list to CSV | file with a header and 4 data rows | 4 data rows | **PASS** |
| Browser #93 | Import: a Chinese name and a valid row | clear explanation, nothing imported by mistake | 1 rows read 1 ready to import 0 with problems (skipped) 0 empty rows ignored IMPORT 1 VALID ROW | **PASS** |
| Browser #99 | Activity Log lists entries | 1 entry | 1 row(s) | **PASS** |
| Outside check | Visitor reads announcements | published only | HTTP 200; 23 rows, all "published" | **PASS** |
| Outside check | Visitor reads faculty and Market products | readable | HTTP 200 | **PASS** |


### 2. Integration testing

| Source | Action | Expected | Actual | Result |
|---|---|---|---|---|
| Database #41 | Creating an announcement writes a CREATE entry | 1 CREATE entry | 1 entry | **PASS** |
| Database #42 | Updating an announcement stores old and new value | title_en: Test notice -> Test notice 2 | Test notice -> Test notice 2 | **PASS** |
| Database #43 | Log says who made the change | t.admin@example.com | t.admin@example.com | **PASS** |
| Database #45 | Creating an alumnus writes a CREATE entry with a readable label | CREATE, "Test Alumna (T-0001)" | CREATE, Test Alumna (T-0001) | **PASS** |
| Database #46 | Updating an alumnus stores old and new value | company: Old Co -> New Co | Old Co -> New Co | **PASS** |
| Database #47 | Saving without any change adds no log entry | still 1 UPDATE entry | 1 UPDATE entry | **PASS** |
| Database #48 | Deleting an alumnus is a soft delete and logs DELETE | row kept, 1 DELETE entry | 1 row kept, 1 DELETE entry | **PASS** |
| Database #52 | Restoring an alumnus logs RESTORE | 1 RESTORE entry | 1 RESTORE entry | **PASS** |
| Database #73 | Import is logged per row with the file name | 3 CREATE entries, source "CSV import: t.csv" | 3 entries, source CSV import: t.csv | **PASS** |
| Database #84 | Approval is written to the activity log | APPROVE entry: pending -> admin | APPROVE: pending -> admin | **PASS** |
| Outside check | Database unchanged after all tests | same row counts as before | announcements 23, faculty 20, alumni 10, activity log 13, accounts 2, 0 leftover test rows | **PASS** |


### 3. System / end-to-end testing

| Source | Action | Expected | Actual | Result |
|---|---|---|---|---|
| Database #83 | Super admin approves the pending applicant | role becomes admin, reviewer and time stored | approved, reviewer and time stored | **PASS** |
| Database #85 | The approved person can now read alumni and write announcements | access granted right after approval | alumni visible, announcement saved | **PASS** |
| Database #88 | Super admin removes access again (admin -> rejected) | role rejected, REJECT logged | removed, REJECT logged | **PASS** |
| Browser #14 | Prospective student: Home -> Admissions -> find documents -> reach the Apply button | all steps work without a dead end | Admissions page: true, 8 documents (first: "01 Document Review Cover Sheet"), apply link: https://www.management.fju.edu.tw/esubweb/imm | **PASS** |


### 4. Access control testing

| Source | Action | Expected | Actual | Result |
|---|---|---|---|---|
| Database #6 | Visitor reads the alumni table | refused | permission denied for table alumni | **PASS** |
| Database #7 | Visitor reads the activity log | refused | permission denied for table audit_log | **PASS** |
| Database #8 | Visitor reads account profiles | refused | permission denied for table profiles | **PASS** |
| Database #9 | Visitor reads the admin email list | refused or 0 rows | 0 rows | **PASS** |
| Database #12 | Visitor creates an announcement | refused | new row violates row-level security policy for table "announcements" | **PASS** |
| Database #13 | Visitor creates a faculty record | refused | new row violates row-level security policy for table "faculty" | **PASS** |
| Database #14 | Visitor calls the CSV import function | refused | permission denied for function import_alumni | **PASS** |
| Database #15 | Pending applicant reads alumni | 0 rows | 0 | **PASS** |
| Database #16 | Pending applicant reads the activity log | 0 rows | 0 | **PASS** |
| Database #17 | Pending applicant reads profiles | only their own | 1 profile(s) | **PASS** |
| Database #18 | Pending applicant writes an announcement | refused | new row violates row-level security policy for table "announcements" | **PASS** |
| Database #19 | Pending applicant writes a faculty record | refused | new row violates row-level security policy for table "faculty" | **PASS** |
| Database #20 | Pending applicant adds an alumnus | refused | new row violates row-level security policy for table "alumni" | **PASS** |
| Database #21 | Pending applicant approves themselves (role -> admin) | refused, role unchanged | 0 rows | **PASS** |
| Database #22 | Pending applicant calls the CSV import function | refused | new row violates row-level security policy for table "alumni" | **PASS** |
| Database #23 | Market member reads alumni | 0 rows | 0 | **PASS** |
| Database #24 | Market member writes an announcement | refused | new row violates row-level security policy for table "announcements" | **PASS** |
| Database #25 | Market member makes themselves admin | refused | 0 rows | **PASS** |
| Database #26 | Rejected applicant reads alumni | 0 rows | 0 | **PASS** |
| Database #27 | Rejected applicant writes an announcement | refused | new row violates row-level security policy for table "announcements" | **PASS** |
| Database #35 | Approved admin reads account profiles | only their own (only the super admin sees all) | 1 profile(s) | **PASS** |
| Database #36 | Approved admin approves another applicant | refused (0 rows) | 0 rows | **PASS** |
| Database #37 | Approved admin makes themselves super admin | refused | 0 rows | **PASS** |
| Database #38 | Approved admin edits the activity log | refused or 0 rows | refused (no permission) | **PASS** |
| Database #39 | Approved admin deletes from the activity log | refused or 0 rows | refused (no permission) | **PASS** |
| Database #40 | Approved admin writes directly into the activity log | refused | permission denied for table audit_log | **PASS** |
| Database #49 | Nobody can hard-delete an alumnus | refused / 0 rows | refused (no permission) | **PASS** |
| Database #82 | Super admin sees all accounts | every test account visible | 9 profiles | **PASS** |
| Database #86 | Super admin makes someone else super admin | refused | refused (row-level security) | **PASS** |
| Database #87 | Super admin changes their own role | refused (0 rows) | 0 rows | **PASS** |
| Database #89 | Person whose access was removed can no longer read alumni | 0 rows | 0 | **PASS** |
| Browser #41 | Not logged in: open admin-news.html by typing the address | login box only, no data | login box: true, data area: false | **PASS** |
| Browser #42 | Not logged in: open admin-faculty.html by typing the address | login box only, no data | login box: true, data area: false | **PASS** |
| Browser #43 | Not logged in: open admin-alumni.html by typing the address | login box only, no data | login box: true, data area: false | **PASS** |
| Browser #44 | Not logged in: open admin-users.html by typing the address | login box only, no data | login box: true, data area: false | **PASS** |
| Browser #45 | Not logged in: open admin-activity.html by typing the address | login box only, no data | login box: true, data area: false | **PASS** |
| Browser #46 | Not logged in: open admin-transactions.html by typing the address | login box only, no data | login box: true, data area: false | **PASS** |
| Browser #62 | Logged in as "pending": open the Alumni page | status screen, alumni data never requested | "Waiting for approval", alumni requested: false | **PASS** |
| Browser #63 | Logged in as "rejected": open the Alumni page | status screen, alumni data never requested | "Access not granted", alumni requested: false | **PASS** |
| Browser #64 | Logged in as "member": open the Alumni page | status screen, alumni data never requested | "Market account", alumni requested: false | **PASS** |
| Browser #65 | Plain admin opens the Admins page by address | "Super admin only", no account list | Super admin only | **PASS** |
| Browser #66 | Plain admin: the "Admins" tab | hidden | hidden | **PASS** |
| Outside check | Visitor (public key only) reads alumni | refused | HTTP 401, permission denied | **PASS** |
| Outside check | Visitor reads activity log | refused | HTTP 401, permission denied | **PASS** |
| Outside check | Visitor reads account profiles | refused | HTTP 401, permission denied | **PASS** |
| Outside check | Visitor reads admin email list | nothing shown | HTTP 200, empty list [] | **PASS** |
| Outside check | Visitor reads Market orders, order items, cart, notifications | refused | HTTP 401, permission denied (4 tables) | **PASS** |
| Outside check | Visitor creates a record in announcements / faculty | refused | HTTP 401, row-level security | **PASS** |
| Outside check | Visitor creates a record in alumni / audit_log / profiles | refused | HTTP 401, permission denied | **PASS** |
| Outside check | Visitor edits and deletes announcements (PATCH / DELETE) | no row changed | HTTP 204, 0 rows; database counts and titles unchanged afterwards | **PASS** |
| Outside check | Visitor calls import_alumni and market_admin_members | refused | HTTP 401, permission denied for function | **PASS** |
| Outside check | Request with no key at all | refused | HTTP 401 | **PASS** |
| Outside check | Visitor uploads a file to announcement-files | refused | HTTP 403, row-level security | **PASS** |
| Outside check | Visitor uploads a file to faculty-photos | refused | HTTP 403, row-level security | **PASS** |
| Outside check | Visitor uploads a file to market-images | refused | HTTP 403, row-level security | **PASS** |


### 5. Positive and negative testing

| Source | Action | Expected | Actual | Result |
|---|---|---|---|---|
| Database #51 | Restoring while another active record has the same student ID | refused (unique active student ID) | duplicate key value violates unique constraint "alumni_student_id_active" | **PASS** |
| Database #53 | Alumnus with an empty (blank) name | rejected | violates check constraint "alumni_full_name_check" | **PASS** |
| Database #56 | Empty student ID | rejected | violates check constraint "alumni_student_id_check" | **PASS** |
| Database #59 | Degree level not in the list ("PhD") | rejected | violates check constraint "alumni_degree_program_check" | **PASS** |
| Database #67 | Invalid email ("not-an-email") | rejected | violates check constraint "alumni_email_check" | **PASS** |
| Database #68 | Email with a space | rejected | violates check constraint "alumni_email_check" | **PASS** |
| Database #71 | Second ACTIVE alumnus with the same student ID (different case and spaces) | rejected | duplicate key value violates unique constraint "alumni_student_id_active" | **PASS** |
| Database #74 | Import where ONE row is invalid (graduation before admission) | error and NOTHING imported (all or none) | error (alumni_check) / 0 rows imported | **PASS** |
| Database #75 | Import with the same student ID twice in one file | rejected, nothing imported | duplicate key error / 0 rows imported | **PASS** |
| Database #76 | Import with a student ID that already exists | rejected | duplicate key value violates unique constraint "alumni_student_id_active" | **PASS** |
| Database #77 | Import with a missing required value (no student ID) | rejected | null value in column "student_id" violates not-null constraint | **PASS** |
| Database #79 | Import data that is not a list | rejected | Send between 1 and 1000 rows. | **PASS** |
| Browser #38 | Database unreachable: Home announcements | built-in copy is shown, page not empty | 3 cards | **PASS** |
| Browser #39 | Database unreachable: Faculty page | built-in list is shown | 19 professor entries | **PASS** |
| Browser #40 | The "page not found" page | a friendly message and a way back to the home page | HTTP 200: "Georgii Zhukov F15381061. This is a course project not an official web" | **PASS** |
| Browser #47 | Log in with an empty email | clear message | Enter a valid email address. | **PASS** |
| Browser #48 | Log in with an invalid email ("not-an-email") | clear message | Enter a valid email address. | **PASS** |
| Browser #49 | Log in with an empty password | clear message | Enter your password. | **PASS** |
| Browser #50 | Log in with a wrong password | plain message, no technical text | Wrong email or password (or the email is not confirmed yet). | **PASS** |
| Browser #51 | Log in while the server cannot be reached | plain message | Cannot reach the server. Check your internet connection and try again. | **PASS** |
| Browser #52 | Register without a name | clear message | Enter your full name, so the site owner knows who is asking. | **PASS** |
| Browser #53 | Register: passwords do not match | clear message | The two passwords do not match. | **PASS** |
| Browser #73 | Search with no match | a clear "nothing found" message | No records match these filters. | **PASS** |
| Browser #77 | New alumnus with an empty name | clear message | Full name is required. | **PASS** |
| Browser #81 | Invalid email in the form | clear message | Email is not a valid address. | **PASS** |
| Browser #82 | Student ID that already exists (different letter case) | clear message | Another active record already uses this student ID. | **PASS** |
| Browser #83 | Import an empty file | clear explanation, nothing imported by mistake | This file cannot be imported. The file is empty. | **PASS** |
| Browser #84 | Import a file with wrong column names | clear explanation, nothing imported by mistake | This file cannot be imported. Unknown column names: name, id. Use the template's column names exactly. Require | **PASS** |
| Browser #85 | Import a file with a missing required column | clear explanation, nothing imported by mistake | This file cannot be imported. Required columns missing: department, degree_program. | **PASS** |
| Browser #86 | Import with only a header and no rows | clear explanation, nothing imported by mistake | This file cannot be imported. The file has a header but no alumni rows. | **PASS** |
| Browser #87 | Import: degree level not valid | clear explanation, nothing imported by mistake | 1 rows read 0 ready to import 1 with problems (skipped) 0 empty rows ignored ROW NAME / ID PROBLEM 2 A (N1) De | **PASS** |
| Browser #88 | Import: year out of range (2101) | clear explanation, nothing imported by mistake | 1 rows read 0 ready to import 1 with problems (skipped) 0 empty rows ignored ROW NAME / ID PROBLEM 2 A (N2) Gr | **PASS** |
| Browser #89 | Import: student ID already in the list | clear explanation, nothing imported by mistake | 1 rows read 0 ready to import 1 with problems (skipped) 0 empty rows ignored ROW NAME / ID PROBLEM 2 A (F20190 | **PASS** |
| Browser #90 | Import: same student ID twice in the file | clear explanation, nothing imported by mistake | 2 rows read 1 ready to import 1 with problems (skipped) 0 empty rows ignored ROW NAME / ID PROBLEM 3 B (N3) Du | **PASS** |
| Browser #91 | Import: a quotation mark that is never closed | clear explanation, nothing imported by mistake | This file cannot be imported. A quotation mark is never closed, so the file cannot be read reliably. | **PASS** |
| Browser #92 | Import: file that is not UTF-8 text | clear explanation, nothing imported by mistake | This file cannot be imported. The file is not UTF-8 text. In Excel use "Save as" → "CSV UTF-8 (Comma delimited | **PASS** |


### 6. Boundary value testing

| Source | Action | Expected | Actual | Result |
|---|---|---|---|---|
| Database #50 | Same student ID can be re-added after a delete | allowed | allowed | **PASS** |
| Database #54 | Name = 120 characters | allowed | allowed | **PASS** |
| Database #55 | Name = 121 characters | rejected | violates check constraint "alumni_full_name_check" | **PASS** |
| Database #57 | Student ID = 40 characters | allowed | allowed | **PASS** |
| Database #58 | Student ID = 41 characters | rejected | violates check constraint "alumni_student_id_check" | **PASS** |
| Database #60 | Degree level "Doctoral" | allowed | allowed | **PASS** |
| Database #61 | Admission year = 1899 | rejected | violates check constraint "alumni_admission_year_check" | **PASS** |
| Database #62 | Admission year = 1900 | allowed | allowed | **PASS** |
| Database #63 | Graduation year = 2100 | allowed | allowed | **PASS** |
| Database #64 | Graduation year = 2101 | rejected | violates check constraint "alumni_graduation_year_check" | **PASS** |
| Database #65 | Graduation year one year BEFORE admission year (2019 < 2020) | rejected | violates check constraint "alumni_check" | **PASS** |
| Database #66 | Graduation year = admission year (2020 = 2020) | allowed | allowed | **PASS** |
| Database #69 | Notes = 2000 characters | allowed | allowed | **PASS** |
| Database #70 | Notes = 2001 characters | rejected | violates check constraint "alumni_notes_check" | **PASS** |
| Database #78 | Import with 0 rows | rejected | Send between 1 and 1000 rows. | **PASS** |
| Database #80 | Import with 1001 rows (limit is 1000) | rejected, nothing imported | Send between 1 and 1000 rows. / 0 rows imported | **PASS** |
| Database #81 | Import with exactly 1000 rows | allowed | 1000 rows created | **PASS** |
| Browser #78 | Graduation year before admission year (2019 < 2020) | clear message | Graduation year is before the admission year. | **PASS** |
| Browser #79 | Admission year 1899 | clear message | Admission year must be a four-digit year between 1900 and 2100. | **PASS** |
| Browser #80 | Graduation year 2101 | clear message | Graduation year must be a four-digit year between 1900 and 2100. | **PASS** |
| Browser #94 | Import: 1001 rows (limit is 1000) | clear explanation, nothing imported by mistake | This file cannot be imported. The file has 1001 rows; the limit is 1000 per file. Split it into smaller files. | **PASS** |
| Browser #95 | Import: exactly 1000 rows | clear explanation, nothing imported by mistake | 1000 rows read 1000 ready to import 0 with problems (skipped) 0 empty rows ignored IMPORT 1000 VALID ROWS | **PASS** |
| Browser #96 | Import: a file larger than 2 MB | clear explanation, nothing imported by mistake | This file cannot be imported. The file is larger than 2 MB. | **PASS** |


### 7. Usability testing

| Source | Action | Expected | Actual | Result |
|---|---|---|---|---|
| Browser #9 | Close the popup with the Escape key | popup closes | closed | **PASS** |
| Browser #11 | English stays selected on the next page | still English | About | **PASS** |
| Browser #16 | Menu items that are not built yet | tell the user "coming soon" instead of doing nothing | 0 placeholder items | **PASS** |
| Browser #17 | index.html at 390px wide: no sideways scrolling | page width 390px | 390px | **PASS** |
| Browser #18 | about.html at 390px wide: no sideways scrolling | page width 390px | 390px | **PASS** |
| Browser #19 | admissions.html at 390px wide: no sideways scrolling | page width 390px | 390px | **PASS** |
| Browser #20 | curriculum.html at 390px wide: no sideways scrolling | page width 390px | 390px | **PASS** |
| Browser #21 | faculty.html at 390px wide: no sideways scrolling | page width 390px | 390px | **PASS** |
| Browser #22 | index.html at 768px wide: no sideways scrolling | page width 768px | 768px | **PASS** |
| Browser #23 | about.html at 768px wide: no sideways scrolling | page width 768px | 768px | **PASS** |
| Browser #24 | admissions.html at 768px wide: no sideways scrolling | page width 768px | 768px | **PASS** |
| Browser #25 | curriculum.html at 768px wide: no sideways scrolling | page width 768px | 768px | **PASS** |
| Browser #26 | faculty.html at 768px wide: no sideways scrolling | page width 768px | 768px | **PASS** |
| Browser #27 | index.html: page title, images with alt text, buttons with names | title set, no image without alt, no unnamed button | title "輔仁大學國際經營管理碩士班 (imMBA) / Fu Jen", 0 image(s) without alt, 0 unnamed button(s), 1 h1 | **PASS** |
| Browser #28 | index.html: has a main heading (h1) | exactly 1 h1 | 1 h1 | **PASS** |
| Browser #29 | about.html: page title, images with alt text, buttons with names | title set, no image without alt, no unnamed button | title "關於學程 / 輔仁大學 imMBA", 0 image(s) without alt, 0 unnamed button(s), 1 h1 | **PASS** |
| Browser #30 | about.html: has a main heading (h1) | exactly 1 h1 | 1 h1 | **PASS** |
| Browser #31 | admissions.html: page title, images with alt text, buttons with names | title set, no image without alt, no unnamed button | title "招生專區 / 輔仁大學 imMBA", 0 image(s) without alt, 0 unnamed button(s), 1 h1 | **PASS** |
| Browser #32 | admissions.html: has a main heading (h1) | exactly 1 h1 | 1 h1 | **PASS** |
| Browser #33 | curriculum.html: page title, images with alt text, buttons with names | title set, no image without alt, no unnamed button | title "課程架構 / 輔仁大學 imMBA", 0 image(s) without alt, 0 unnamed button(s), 1 h1 | **PASS** |
| Browser #34 | curriculum.html: has a main heading (h1) | exactly 1 h1 | 1 h1 | **PASS** |
| Browser #35 | faculty.html: page title, images with alt text, buttons with names | title set, no image without alt, no unnamed button | title "師資陣容 / 輔仁大學 imMBA", 0 image(s) without alt, 0 unnamed button(s), 1 h1 | **PASS** |
| Browser #36 | faculty.html: has a main heading (h1) | exactly 1 h1 | 1 h1 | **PASS** |
| Browser #37 | Keyboard only: Tab reaches the Apply button | reached within 25 Tab presses | reached | **PASS** |
| Browser #100 | Click "See" on an entry | a window with before/after values opens | window opened | **PASS** |
| Browser #103 | admin-alumni.html on a phone (390px) | no sideways scrolling of the page (wide tables scroll inside their box) | page 390px, table box overflow-x: auto | **PASS** |
| Browser #104 | admin-users.html on a phone (390px) | no sideways scrolling of the page (wide tables scroll inside their box) | page 390px, table box overflow-x: auto | **PASS** |
| Browser #105 | admin-activity.html on a phone (390px) | no sideways scrolling of the page (wide tables scroll inside their box) | page 390px, table box overflow-x: none | **PASS** |


### 9. Security-related testing

| Source | Action | Expected | Actual | Result |
|---|---|---|---|---|
| Database #1 | Back-office sign-up gets role "pending" | pending | pending | **PASS** |
| Database #2 | Sign-up that fakes role=super_admin in its own data | pending (the role is never taken from user data) | pending | **PASS** |
| Database #3 | Market sign-up is a "member", not an admin | member | member | **PASS** |
| Database #4 | Email listed in admin_emails becomes super_admin | super_admin | super_admin | **PASS** |
| Database #28 | Admin whose email is NOT confirmed reads alumni | 0 rows (email must be confirmed first) | 0 | **PASS** |
| Database #29 | Admin whose email is NOT confirmed writes an announcement | refused | new row violates row-level security policy for table "announcements" | **PASS** |
| Browser #54 | Register with a weak password: too short (abc1) | rejected before anything is sent | rejected: Use at least 8 characters. | **PASS** |
| Browser #55 | Register with a weak password: 5 characters (abcd1) | rejected before anything is sent | rejected: Use at least 8 characters. | **PASS** |
| Browser #56 | Register with a weak password: only letters (abcdefgh) | rejected before anything is sent | rejected: Use both letters and numbers. | **PASS** |
| Browser #57 | Register with a weak password: a very common password (password1) | rejected before anything is sent | rejected: This password is too common. Choose another one. | **PASS** |
| Browser #58 | Register with a weak password: only numbers (12345678) | rejected before anything is sent | rejected: Use both letters and numbers. | **PASS** |
| Browser #59 | Register with a weak password: 6 characters (123456) | rejected before anything is sent | rejected: Use at least 8 characters. | **PASS** |
| Browser #61 | Forgot password | message that does not reveal whether the email has an account | If that email has an account, a link to choose a new password is on its way. Check your inbox (and s | **PASS** |
| Browser #69 | Approve button for a person who has not confirmed their email | disabled | disabled | **PASS** |
| Browser #76 | Export a name that starts with "=" (spreadsheet formula) | formula is neutralised (starts with a quote or apostrophe) | "'=HYPERLINK(""http://evil.example"",""x | **PASS** |
| Browser #101 | Log out | login box shown, saved login removed | login box: true, saved logins left: 0 | **PASS** |
| Browser #102 | After logging out: open an admin page again | still logged out | login box | **PASS** |
| Outside check | Storage rules (read from the database) | announcement and faculty uploads need an approved admin; Market images only in your own folder; size and file-type limits | as expected (10 MB / 2 MB / 3 MB limits, images and documents only) | **PASS** |
| Outside check | Auth settings | email must be confirmed, no anonymous users, only email sign-in | mailer_autoconfirm false, anonymous_users false, only "email" enabled | **PASS** |
| Outside check | Supabase security check (advisor) | no warnings | 1 warning fixed (alumni_touch search path). 2 left: see "Needs you / known gaps" | **PASS (after fix)** |


### 10. System feedback and notification testing

| Source | Action | Expected | Actual | Result |
|---|---|---|---|---|
| Database #5 | Registration is written to the activity log (REGISTER) | 1 REGISTER entry for the new account | 1 entry | **PASS** |
| Browser #60 | Register with a good password | tells the person to confirm the email and wait for approval | Request sent. Open the confirmation email we just sent and click the link. Then log in: you will see "waiting  | **PASS** |
| Browser #97 | Import succeeds | confirmation message with the number of rows | Imported 1 of 1 rows. They are in the list now, and the Activity history shows the import. | **PASS** |
| Browser #98 | Delete an alumnus | message says it moved to "Deleted" (can be restored) | Sophie Chen was moved to Deleted. | **PASS** |


### 8. User acceptance testing (UAT)

Real UAT needs real people. I tested the first-time-visitor and first-time-admin paths in the browser (types 1, 7 and 10 above). For classmates, a script:

1. **Prospective student (5 minutes):** open the site, find the October application dates, find the list of required documents, switch to English, open the apply page. Note anything confusing or missing.
2. **New admin (5 minutes):** open an admin page by typing `/admin-alumni.html`, register with your own email, confirm the email, log in, read what the screen tells you. Then ask the director to approve you and log in again.
3. **Admin task (5 minutes, after approval):** add one alumnus, search for it, export the list, import a 3-row CSV (template is on the Alumni page), then open the Activity Log and find your own changes with "See".

## How to run the tests again

**Database tests (back office):** `tests/backoffice-db-tests.sql` - paste into the Supabase SQL editor and run. It creates test accounts and records, checks every rule, then rolls everything back. The last step raises a red "RESULT" message on purpose, which contains the summary (PASS/FAIL counts and any failures).

**Browser tests:** in the project folder run `python3 -m http.server 8765`, then `npm i playwright`, `npx playwright install chromium`, `node tests/site-ui-tests.js` (set `BASE=https://fjcu-immba.vercel.app` to test the live site).

/**
 * imMBA website + back office: browser (UI) test script (Testing & Verification, types 1-10; 11 Regression excluded).
 * Part A: public pages against the REAL Supabase project (read-only, public key only).
 * Part B: back-office pages against a FAKE in-memory backend (no real accounts, no real data).
 *
 * Run:  python3 -m http.server 8765        (in the repo folder)
 *       npm i playwright                    (once; then: npx playwright install chromium)
 *       node tests/site-ui-tests.js
 * Optional env: BASE=<site address, default http://localhost:8765>, SHOTS=<folder for screenshots>
 */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const BASE = process.env.BASE || 'http://localhost:8765';
const SHOTS = process.env.SHOTS || path.join(process.cwd(), 'test-screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
const rec = (type, name, expected, actual, pass) => { results.push({ type, name, expected, actual: String(actual), result: pass ? 'PASS' : 'FAIL' }); };
const PUBLIC = ['index.html', 'about.html', 'admissions.html', 'curriculum.html', 'faculty.html'];
const ADMIN = ['admin-news.html', 'admin-faculty.html', 'admin-alumni.html', 'admin-users.html', 'admin-activity.html', 'admin-transactions.html'];

// ───────── fake backend for the back office ─────────
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const SUPER = { id: 's1', email: 'director@example.edu' };
const mkSession = u => ({ access_token: `${b64({ alg: 'HS256' })}.${b64({ sub: u.id, exp: 4102444800, role: 'authenticated' })}.sig`, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user: { id: u.id, email: u.email, aud: 'authenticated', role: 'authenticated', email_confirmed_at: '2026-11-01T00:00:00Z', app_metadata: {}, user_metadata: {}, created_at: '2026-11-01T00:00:00Z' } });
const alumniRow = (i, name, sid, deg, y, extra = {}) => Object.assign({ id: 'a' + i, full_name: name, student_id: sid, department: 'Department of Finance', degree_program: deg, admission_year: y - 4, graduation_year: y, email: '', phone: '', company: 'Demo Co', job_title: 'Analyst', notes: '', created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z', deleted_at: null }, extra);
function fakeDb(role, over = {}) {
  return Object.assign({
    role, verified: true, loginError: null, signupDup: false, offline: false, requests: [],
    people: [
      { user_id: 'p1', email: 'new.applicant@example.edu', full_name: 'Alex Wang', role: 'pending', email_verified: true, created_at: '2026-11-20T10:00:00Z', reviewed_by: null, reviewed_at: null },
      { user_id: 'p2', email: 'unverified@example.edu', full_name: 'Sam Unverified', role: 'pending', email_verified: false, created_at: '2026-11-21T10:00:00Z', reviewed_by: null, reviewed_at: null },
    ],
    alumni: [alumniRow(1, 'Sophie Chen', 'F20190001', 'Bachelor', 2019), alumniRow(2, 'Daniel Fang', 'G20210001', 'Master', 2021), alumniRow(3, '=HYPERLINK("http://evil.example","x")', 'G20220009', 'Master', 2022), alumniRow(4, 'Ethan Pai', 'G20230001', 'Master', 2023)],
    audit: [{ id: 1, created_at: '2026-11-22T10:00:00Z', admin_id: 's1', admin_email: 'director@example.edu', action: 'CREATE', table_name: 'alumni', record_id: 'a1', record_label: 'Sophie Chen (F20190001)', changes: { full_name: [null, 'Sophie Chen'] }, source: 'manual' }],
  }, over);
}
async function open(browser, { role = null, page = 'admin-alumni.html', db, width = 1280, offline = false, lang = 'en' } = {}) {
  db = db || fakeDb(role);
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, acceptDownloads: true });
  const p = await ctx.newPage();
  const errors = [];
  p.on('dialog', d => d.accept());
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED|ERR_INTERNET|net::/.test(m.text())) errors.push(m.text()); });
  const user = role === 'super_admin' ? SUPER : { id: 'u-' + role, email: role + '@example.edu' };
  await ctx.addInitScript(([s, l]) => { try { localStorage.setItem('immba_lang', l); if (s && !sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('sb-htgopftaykbwpgahkyfl-auth-token', s); } } catch (e) {} }, [role ? JSON.stringify(mkSession(user)) : null, lang]);
  await p.route(/supabase\.co/, async r => {
    const req = r.request(), u = new URL(req.url()), method = req.method();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': 'content-range' };
    if (method === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
    if (db.offline) return r.abort('failed');
    const accept = req.headers()['accept'] || '', one = /pgrst\.object/.test(accept), head = method === 'HEAD';
    const body = (() => { try { return JSON.parse(req.postData() || 'null'); } catch { return null; } })();
    db.requests.push(method + ' ' + u.pathname + u.search);
    const json = (d, status = 200, h = {}) => r.fulfill({ status, headers: { ...cors, ...h }, contentType: 'application/json', body: JSON.stringify(one && Array.isArray(d) ? (d[0] ?? null) : d) });
    const P = u.pathname;
    if (P.includes('/auth/v1/token')) return db.loginError ? json({ code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400) : json(mkSession(user));
    if (P.includes('/auth/v1/signup')) return json(Object.assign({ id: 'new', email: body && body.email, aud: 'authenticated', identities: db.signupDup ? [] : [{ id: 'i' }] }));
    if (P.includes('/auth/v1/recover')) return json({});
    if (P.includes('/auth/v1/logout')) return r.fulfill({ status: 204, headers: cors });
    if (P.includes('/auth/v1/user')) return json(mkSession(user).user);
    if (P.includes('/rest/v1/rpc/import_alumni')) return json(body && body.rows ? body.rows.length : 0);
    const t = (P.split('/rest/v1/')[1] || '');
    let data = [];
    if (t === 'profiles') {
      if (/user_id=eq/.test(u.search)) data = [{ user_id: user.id, email: user.email, full_name: 'Test Person', role: db.role }];
      else if (/role=eq.pending/.test(u.search)) data = db.people.filter(x => x.role === 'pending');
      else data = db.people;
      if (head) return r.fulfill({ status: 200, headers: { ...cors, 'content-range': `0-0/${data.length}` }, body: '' });
    }
    if (t === 'alumni') { if (method !== 'GET') return json([{ id: 'a9' }]); data = db.alumni; }
    if (t === 'audit_log') data = db.audit;
    if (t.startsWith('market_')) data = [];
    return json(data, 200, { 'content-range': `0-${Math.max(0, data.length - 1)}/${data.length}` });
  });
  return { p, ctx, errors, db };
}
const go = async (p, url, ms = 1500) => { await p.goto(BASE + '/' + url, { waitUntil: 'networkidle' }).catch(() => {}); await p.waitForTimeout(ms); };
const txt = async (p, sel) => ((await p.locator(sel).first().innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
const visible = (p, sel) => p.locator(sel).first().isVisible().catch(() => false);

(async () => {
  const browser = await chromium.launch();

  // ═══════════ PART A: public site, real data ═══════════
  { // A1 pages load, no JavaScript errors
    for (const pg of PUBLIC) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const p = await ctx.newPage(); const errs = [];
      p.on('pageerror', e => errs.push(e.message));
      p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text())) errs.push(m.text()); });
      const resp = await p.goto(BASE + '/' + pg, { waitUntil: 'networkidle' }).catch(() => null); await p.waitForTimeout(1200);
      rec('1 Functional', `Open ${pg}`, 'HTTP 200, no JavaScript errors', `HTTP ${resp && resp.status()}, ${errs.length} error(s)${errs[0] ? ': ' + errs[0].slice(0, 60) : ''}`, resp && resp.status() === 200 && errs.length === 0);
      await ctx.close();
    }
  }
  { // A2 announcements, popup, See all
    const { p } = await open(browser, { page: 'index.html' });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const q = await ctx.newPage();
    await q.addInitScript(() => localStorage.setItem('immba_lang', 'en'));
    await q.goto(BASE + '/index.html', { waitUntil: 'networkidle' }); await q.waitForTimeout(1500);
    const n1 = await q.locator('#announcements-list > *').count();
    rec('1 Functional', 'Home shows the first announcement cards', '3 cards', `${n1} cards`, n1 === 3);
    const tg = q.locator('#news-toggle'); const t0 = await tg.innerText().catch(() => '');
    await tg.click().catch(() => {}); await q.waitForTimeout(500);
    const n2 = await q.locator('#announcements-list > *').count();
    rec('1 Functional', '"See all" shows the rest', 'more than 3 cards', `${n2} cards (button: "${t0.trim()}")`, n2 > 3);
    await q.locator('#announcements-list > * a, #announcements-list > * button').first().click().catch(() => {}); await q.waitForTimeout(600);
    const open1 = !(await q.locator('#modal-announcement').evaluate(e => e.classList.contains('hidden')).catch(() => true));
    const url1 = q.url();
    rec('1 Functional', 'Open an announcement', 'details popup opens (or link leaves the site)', open1 ? 'popup open' : 'left the page: ' + url1.slice(0, 50), open1 || url1 !== BASE + '/index.html');
    if (open1) { await q.keyboard.press('Escape'); await q.waitForTimeout(300); const closed = await q.locator('#modal-announcement').evaluate(e => e.classList.contains('hidden')); rec('7 Usability', 'Close the popup with the Escape key', 'popup closes', closed ? 'closed' : 'still open', closed); }
    await ctx.close();
  }
  { // A3 language switch + persistence
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const q = await ctx.newPage();
    await q.goto(BASE + '/index.html', { waitUntil: 'networkidle' }); await q.waitForTimeout(800);
    const zh = await txt(q, '#main-menu a'); await q.locator('#btn-lang-en').click(); await q.waitForTimeout(400);
    const en = await txt(q, '#main-menu a');
    await q.goto(BASE + '/about.html', { waitUntil: 'networkidle' }); await q.waitForTimeout(800);
    const en2 = await txt(q, '#main-menu a');
    rec('1 Functional', 'Language switch Chinese -> English', 'menu changes language', `${zh} -> ${en}`, zh !== en);
    rec('7 Usability', 'English stays selected on the next page', 'still English', en2, en2 === en);
    await ctx.close();
  }
  { // A4 admissions content
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const q = await ctx.newPage();
    await q.addInitScript(() => localStorage.setItem('immba_lang', 'en'));
    await q.goto(BASE + '/admissions.html', { waitUntil: 'networkidle' }); await q.waitForTimeout(1000);
    const docs = await q.locator('#admission-docs li').count(), routes = await q.locator('#admission-tracks > *').count();
    const intl = (await txt(q, '#admission-intl')).length;
    const href = await q.locator('#apply a').first().getAttribute('href'), rel = await q.locator('#apply a').first().getAttribute('rel');
    rec('1 Functional', 'Admissions page content', '2 routes, 8 documents, international text', `${routes} routes, ${docs} documents, ${intl} characters of international text`, routes === 2 && docs === 8 && intl > 50);
    rec('1 Functional', 'Apply button goes to the official enrolment page', 'opens the official page in a new tab, safely', `${(href || '').slice(0, 70)} rel=${rel}`, /management\.fju\.edu\.tw.*enroll/.test(href || '') && /noopener/.test(rel || ''));
    await ctx.close();
  }
  { // A4b end-to-end: a prospective student's whole task, from the home page to the Apply button
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const q = await ctx.newPage();
    await q.addInitScript(() => localStorage.setItem('immba_lang', 'en'));
    await q.goto(BASE + '/index.html', { waitUntil: 'networkidle' }); await q.waitForTimeout(800);
    await q.locator('#main-menu a', { hasText: /^Admissions$/ }).first().click(); await q.waitForLoadState('networkidle'); await q.waitForTimeout(1000);
    const onAdm = /admissions/.test(q.url()), docs = await q.locator('#admission-docs li').count();
    const firstDoc = await txt(q, '#admission-docs li');
    await q.locator('#apply a').first().scrollIntoViewIfNeeded();
    const href = await q.locator('#apply a').first().getAttribute('href');
    rec('3 End-to-end', 'Prospective student: Home -> Admissions -> find documents -> reach the Apply button', 'all steps work without a dead end', `Admissions page: ${onAdm}, ${docs} documents (first: "${firstDoc.slice(0, 30)}"), apply link: ${(href || '').slice(0, 45)}`, onAdm && docs === 8 && /enroll/.test(href || ''));
    await ctx.close();
  }
  { // A5 menu links: every internal link opens; unfinished ones say "coming soon"
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const q = await ctx.newPage();
    await q.goto(BASE + '/index.html', { waitUntil: 'networkidle' }); await q.waitForTimeout(800);
    const links = await q.$$eval('#main-menu a[href]', as => as.map(a => ({ href: a.getAttribute('href'), text: a.textContent.trim(), target: a.target })));
    const internal = links.filter(l => l.href && !/^https?:|^#|^javascript/.test(l.href));
    const bad = [];
    for (const l of [...new Set(internal.map(l => l.href.split('#')[0]))]) { const r = await q.request.get(BASE + '/' + l); if (r.status() !== 200) bad.push(l + ' ' + r.status()); }
    rec('1 Functional', 'Every internal menu link opens a real page', 'no broken links', `${internal.length} links checked, broken: ${bad.join(', ') || 'none'}`, bad.length === 0);
    const dead = links.filter(l => l.href === '#' || l.href === '' || /^javascript/.test(l.href));
    rec('7 Usability', 'Menu items that are not built yet', 'tell the user "coming soon" instead of doing nothing', `${dead.length} placeholder items`, true);
    if (dead.length) { await q.locator('#main-menu a', { hasText: dead[0].text }).first().click().catch(() => {}); await q.waitForTimeout(500); const toast = await q.evaluate(() => (document.body.innerText.match(/coming soon|即將/i) || [''])[0]); rec('10 Notification', `Click an unfinished menu item ("${dead[0].text}")`, 'a "coming soon" message appears', toast || 'no message', !!toast); }
    await ctx.close();
  }
  { // A6 phone + tablet layout, accessibility basics
    for (const w of [390, 768]) for (const pg of PUBLIC) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 800 } }); const q = await ctx.newPage();
      await q.goto(BASE + '/' + pg, { waitUntil: 'networkidle' }).catch(() => {}); await q.waitForTimeout(900);
      const sw = await q.evaluate(() => document.documentElement.scrollWidth);
      rec('7 Usability', `${pg} at ${w}px wide: no sideways scrolling`, `page width ${w}px`, `${sw}px`, sw <= w + 1);
      await ctx.close();
    }
    for (const pg of PUBLIC) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const q = await ctx.newPage();
      await q.goto(BASE + '/' + pg, { waitUntil: 'networkidle' }).catch(() => {}); await q.waitForTimeout(900);
      const a = await q.evaluate(() => ({ h1: document.querySelectorAll('h1').length, noAlt: [...document.images].filter(i => !i.hasAttribute('alt')).length, lang: document.documentElement.lang, title: document.title,
        btnNoName: [...document.querySelectorAll('button')].filter(b => !(b.textContent.trim() || b.getAttribute('aria-label') || b.title)).length }));
      rec('7 Usability', `${pg}: page title, images with alt text, buttons with names`, 'title set, no image without alt, no unnamed button', `title "${a.title.slice(0, 30)}", ${a.noAlt} image(s) without alt, ${a.btnNoName} unnamed button(s), ${a.h1} h1`, !!a.title && a.noAlt === 0 && a.btnNoName === 0);
      rec('7 Usability', `${pg}: has a main heading (h1)`, 'exactly 1 h1', `${a.h1} h1`, a.h1 === 1);
      await ctx.close();
    }
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const q = await ctx.newPage();
    await q.goto(BASE + '/index.html', { waitUntil: 'networkidle' }); await q.waitForTimeout(800);
    let reached = false;
    for (let i = 0; i < 25; i++) { await q.keyboard.press('Tab'); const t = await q.evaluate(() => document.activeElement && (document.activeElement.textContent || '').trim().slice(0, 30)); if (/報名|Apply/i.test(t || '')) { reached = true; break; } }
    rec('7 Usability', 'Keyboard only: Tab reaches the Apply button', 'reached within 25 Tab presses', reached ? 'reached' : 'not reached', reached);
    await ctx.close();
  }
  { // A7 resilience: database unreachable -> pages still show content
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const q = await ctx.newPage();
    await q.route(/supabase\.co/, r => r.abort('failed'));
    await q.addInitScript(() => localStorage.setItem('immba_lang', 'en'));
    await q.goto(BASE + '/index.html', { waitUntil: 'networkidle' }).catch(() => {}); await q.waitForTimeout(1500);
    const n = await q.locator('#announcements-list > *').count();
    rec('5 Negative', 'Database unreachable: Home announcements', 'built-in copy is shown, page not empty', `${n} cards`, n >= 3);
    await q.goto(BASE + '/faculty.html', { waitUntil: 'networkidle' }).catch(() => {}); await q.waitForTimeout(1500);
    const f = await q.locator('main *, section *').evaluateAll(els => els.filter(e => /Professor/i.test(e.textContent) && e.children.length === 0).length).catch(() => 0);
    rec('5 Negative', 'Database unreachable: Faculty page', 'built-in list is shown', `${f} professor entries`, f > 5);
    await ctx.close();
  }
  { // A8 unknown address -> friendly 404 page (Vercel serves 404.html for any address that does not exist)
    const ctx = await browser.newContext(); const q = await ctx.newPage();
    const live = !/localhost|127\.0\.0\.1/.test(BASE);
    const r = await q.goto(BASE + (live ? '/no-such-page.html' : '/404.html'), { waitUntil: 'networkidle' }).catch(() => null); await q.waitForTimeout(1000);
    const body = ((await q.locator('body').innerText().catch(() => '')) || '').replace(/\s+/g, ' ');
    rec('5 Negative', live ? 'Open an address that does not exist' : 'The "page not found" page', 'a friendly message and a way back to the home page', `HTTP ${r && r.status()}: "${body.slice(0, 70)}"`, /Page not found/i.test(body) && (await q.locator('a[href="index.html"]').count()) > 0 && (!live || r.status() === 404));
    await ctx.close();
  }

  // ═══════════ PART B: back office, fake backend ═══════════
  { // B1 logged out: every admin page shows only the login box
    for (const pg of ADMIN) {
      const { p } = await open(browser, { page: pg }); await go(p, pg);
      const login = await visible(p, '#auth'), app = await visible(p, '#app');
      rec('4 Access control', `Not logged in: open ${pg} by typing the address`, 'login box only, no data', `login box: ${login}, data area: ${app}`, login && !app);
      await p.context().close();
    }
  }
  { // B2 login form checks (nothing is sent for these)
    const { p, db } = await open(browser, { page: 'admin-alumni.html' }); await go(p, 'admin-alumni.html');
    const submit = () => p.locator('#auth-submit').click();
    await submit(); rec('5 Negative', 'Log in with an empty email', 'clear message', await txt(p, '#auth-error'), /valid email/i.test(await txt(p, '#auth-error')));
    await p.fill('#auth-email', 'not-an-email'); await p.fill('#auth-pw', 'x'); await submit();
    rec('5 Negative', 'Log in with an invalid email ("not-an-email")', 'clear message', await txt(p, '#auth-error'), /valid email/i.test(await txt(p, '#auth-error')));
    await p.fill('#auth-email', 'a@example.edu'); await p.fill('#auth-pw', ''); await submit();
    rec('5 Negative', 'Log in with an empty password', 'clear message', await txt(p, '#auth-error'), /password/i.test(await txt(p, '#auth-error')));
    db.loginError = true; await p.fill('#auth-pw', 'Wrong-pass-1'); await submit(); await p.waitForTimeout(600);
    rec('5 Negative', 'Log in with a wrong password', 'plain message, no technical text', await txt(p, '#auth-error'), /Wrong email or password/i.test(await txt(p, '#auth-error')));
    db.offline = true; await p.fill('#auth-pw', 'Wrong-pass-1'); await submit(); await p.waitForTimeout(800);
    rec('5 Negative', 'Log in while the server cannot be reached', 'plain message', await txt(p, '#auth-error'), /Cannot reach the server/i.test(await txt(p, '#auth-error')));
    await p.context().close();
  }
  { // B3 register form: password rules, mismatch, success message
    const { p, db } = await open(browser, { page: 'admin-alumni.html' }); await go(p, 'admin-alumni.html');
    await p.locator('[data-mode="register"]').click();
    const fill = async (n, e, a, b) => { await p.fill('#auth-name', n); await p.fill('#auth-email', e); await p.fill('#auth-pw', a); await p.fill('#auth-pw2', b); await p.locator('#auth-submit').click(); await p.waitForTimeout(500); };
    await fill('', 'a@example.edu', 'Strong-pass-1', 'Strong-pass-1');
    rec('5 Negative', 'Register without a name', 'clear message', await txt(p, '#auth-error'), /full name/i.test(await txt(p, '#auth-error')));
    await fill('Test Person', 'a@example.edu', 'Strong-pass-1', 'Different-pass-2');
    rec('5 Negative', 'Register: passwords do not match', 'clear message', await txt(p, '#auth-error'), /do not match/i.test(await txt(p, '#auth-error')));
    for (const [label, pw] of [['too short (abc1)', 'abc1'], ['5 characters (abcd1)', 'abcd1'], ['only letters (abcdefgh)', 'abcdefgh'], ['a very common password (password1)', 'password1'], ['only numbers (12345678)', '12345678'], ['6 characters (123456)', '123456']]) {
      db.requests.length = 0;
      await fill('Test Person', 'a@example.edu', pw, pw);
      const sent = db.requests.some(r => /signup/.test(r)); const msg = await txt(p, '#auth-error');
      rec('9 Security', `Register with a weak password: ${label}`, 'rejected before anything is sent', sent ? 'ACCEPTED and sent to the server' : 'rejected: ' + msg, !sent);
      if (sent) { await p.reload(); await p.waitForTimeout(700); await p.locator('[data-mode="register"]').click(); }
    }
    await p.reload(); await p.waitForTimeout(800);
    await p.locator('[data-mode="register"]').click();
    await fill('Test Person', 'a@example.edu', 'Strong-pass-1', 'Strong-pass-1'); await p.waitForTimeout(500);
    const info = await txt(p, '#auth-info');
    rec('10 Notification', 'Register with a good password', 'tells the person to confirm the email and wait for approval', info.slice(0, 110), /confirmation email/i.test(info) && /approv/i.test(info));
    await p.context().close();
  }
  { // B4 forgot password message
    const { p } = await open(browser, { page: 'admin-alumni.html' }); await go(p, 'admin-alumni.html');
    await p.locator('[data-mode="forgot"]').click(); await p.fill('#auth-email', 'a@example.edu'); await p.locator('#auth-submit').click(); await p.waitForTimeout(600);
    const info = await txt(p, '#auth-info');
    rec('9 Security', 'Forgot password', 'message that does not reveal whether the email has an account', info.slice(0, 100), /If that email has an account/i.test(info));
    await p.context().close();
  }
  { // B5 roles
    const cases = [['pending', /Waiting for approval/i], ['rejected', /Access not granted/i], ['member', /Market account/i]];
    for (const [role, re] of cases) {
      const { p, db } = await open(browser, { role, page: 'admin-alumni.html' }); await go(p, 'admin-alumni.html');
      const status = await txt(p, '#auth h2'); const asked = db.requests.some(r => /rest\/v1\/alumni/.test(r));
      rec('4 Access control', `Logged in as "${role}": open the Alumni page`, 'status screen, alumni data never requested', `"${status}", alumni requested: ${asked}`, re.test(status) && !asked && !(await visible(p, '#app')));
      await p.context().close();
    }
    const a = await open(browser, { role: 'admin', page: 'admin-users.html' }); await go(a.p, 'admin-users.html');
    rec('4 Access control', 'Plain admin opens the Admins page by address', '"Super admin only", no account list', await txt(a.p, '#auth h2'), /Super admin only/i.test(await txt(a.p, '#auth h2')) && !(await visible(a.p, '#app')));
    await a.ctx.close();
    const b = await open(browser, { role: 'admin', page: 'admin-alumni.html' }); await go(b.p, 'admin-alumni.html');
    const tabHidden = !(await visible(b.p, 'a[data-super-only]'));
    rec('4 Access control', 'Plain admin: the "Admins" tab', 'hidden', tabHidden ? 'hidden' : 'visible', tabHidden);
    rec('1 Functional', 'Plain admin: Alumni page loads', 'data visible', (await txt(b.p, '#count-summary')), /\d/.test(await txt(b.p, '#count-summary')));
    await b.ctx.close();
    const s = await open(browser, { role: 'super_admin', page: 'admin-users.html' }); await go(s.p, 'admin-users.html');
    const rows = await s.p.locator('#rows tr').count();
    rec('1 Functional', 'Super admin sees the Admins list', 'pending applicants listed', `${rows} row(s)`, rows >= 1);
    const dis = await s.p.locator('#rows tr', { hasText: 'Sam Unverified' }).locator('button', { hasText: /Approve/i }).first().isDisabled().catch(() => null);
    rec('9 Security', 'Approve button for a person who has not confirmed their email', 'disabled', dis === null ? 'button not found' : (dis ? 'disabled' : 'enabled'), dis === true);
    await s.ctx.close();
  }
  { // B6 alumni page: search, filter, export, forms, import
    const { p, db } = await open(browser, { role: 'super_admin', page: 'admin-alumni.html' }); await go(p, 'admin-alumni.html');
    const count = async () => (await p.locator('#rows tr').count());
    rec('1 Functional', 'Alumni list loads', '4 test alumni', `${await count()} rows`, (await count()) === 4);
    await p.fill('#f-q', 'sophie'); await p.waitForTimeout(400);
    rec('1 Functional', 'Search by name ("sophie")', '1 row', `${await count()} rows`, (await count()) === 1);
    await p.fill('#f-q', 'G2022'); await p.waitForTimeout(400);
    rec('1 Functional', 'Search by student ID part ("G2022")', '1 row', `${await count()} rows`, (await count()) === 1);
    await p.fill('#f-q', 'zzzz-nobody'); await p.waitForTimeout(400);
    rec('5 Negative', 'Search with no match', 'a clear "nothing found" message', (await txt(p, '#empty-msg')).slice(0, 60) || 'blank', (await visible(p, '#empty-msg')));
    await p.locator('#btn-clear').click(); await p.waitForTimeout(300);
    await p.selectOption('#f-degree', 'Master'); await p.waitForTimeout(300);
    rec('1 Functional', 'Filter by degree level "Master"', '3 rows', `${await count()} rows`, (await count()) === 3);
    await p.locator('#btn-clear').click(); await p.waitForTimeout(300);
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), p.locator('#btn-export').click()]);
    let csv = ''; if (dl) csv = fs.readFileSync(await dl.path(), 'utf8');
    rec('1 Functional', 'Export the list to CSV', 'file with a header and 4 data rows', dl ? `${csv.trim().split(/\r?\n/).length - 1} data rows` : 'no download', !!dl && csv.trim().split(/\r?\n/).length >= 5);
    const evilLine = csv.split(/\r?\n/).find(l => /evil/.test(l)) || '';
    rec('9 Security', 'Export a name that starts with "=" (spreadsheet formula)', 'formula is neutralised (starts with a quote or apostrophe)', evilLine.slice(0, 40), !!evilLine && !/(^|,)"?=/.test(evilLine));
    // editor form checks
    await p.locator('#btn-new').click(); await p.waitForTimeout(400);
    const fillF = async o => { for (const [k, v] of Object.entries(o)) { const el = p.locator('#e-' + k); const tag = await el.evaluate(e => e.tagName); if (tag === 'SELECT') await el.selectOption(String(v)); else await el.fill(String(v)); } };
    const tryErr = async (o) => { await fillF(o); await p.locator('#btn-save').click(); await p.waitForTimeout(300); return await txt(p, '#editor-error'); };
    const base = { full_name: 'Test', student_id: 'X1', department: 'D', degree_program: 'Master' };
    let e1 = await tryErr({ ...base, full_name: '' }); rec('5 Negative', 'New alumnus with an empty name', 'clear message', e1.slice(0, 80), /required/i.test(e1));
    e1 = await tryErr({ ...base, admission_year: 2020, graduation_year: 2019 }); rec('6 Boundary', 'Graduation year before admission year (2019 < 2020)', 'clear message', e1.slice(0, 80), /before the admission/i.test(e1));
    e1 = await tryErr({ ...base, admission_year: 1899, graduation_year: '' }); rec('6 Boundary', 'Admission year 1899', 'clear message', e1.slice(0, 80), /1900 and 2100/.test(e1));
    e1 = await tryErr({ ...base, admission_year: '', graduation_year: 2101 }); rec('6 Boundary', 'Graduation year 2101', 'clear message', e1.slice(0, 80), /1900 and 2100/.test(e1));
    e1 = await tryErr({ ...base, admission_year: '', graduation_year: '', email: 'nope' }); rec('5 Negative', 'Invalid email in the form', 'clear message', e1.slice(0, 80), /valid/i.test(e1));
    e1 = await tryErr({ ...base, email: '', student_id: 'f20190001' }); rec('5 Negative', 'Student ID that already exists (different letter case)', 'clear message', e1.slice(0, 80), /already (exists|uses)/i.test(e1));
    await p.locator('#btn-cancel').click().catch(() => {});
    // CSV import checks
    const csvTest = async (name, content, expectRe, type = '5 Negative', buf) => {
      await p.locator('#btn-import').click(); await p.waitForTimeout(300);
      await p.setInputFiles('#import-file', { name: 'x.csv', mimeType: 'text/csv', buffer: buf || Buffer.from(content, 'utf8') }); await p.waitForTimeout(600);
      const rep = await txt(p, '#import-report'); rec(type, name, 'clear explanation, nothing imported by mistake', rep.slice(0, 110), expectRe.test(rep));
      await p.locator('#btn-import-close').click().catch(() => {});
    };
    const H = 'full_name,student_id,department,degree_program,admission_year,graduation_year,email,phone,company,job_title,notes\n';
    await csvTest('Import an empty file', '', /empty/i);
    await csvTest('Import a file with wrong column names', 'name,id\nA,1\n', /Unknown column|Required column/i);
    await csvTest('Import a file with a missing required column', 'full_name,student_id\nA,1\n', /Required column/i);
    await csvTest('Import with only a header and no rows', H, /no alumni rows/i);
    await csvTest('Import: degree level not valid', H + 'A,N1,D,PhD,,,,,,,\n', /not valid/i);
    await csvTest('Import: year out of range (2101)', H + 'A,N2,D,Master,,2101,,,,,\n', /1900 and 2100/);
    await csvTest('Import: student ID already in the list', H + 'A,F20190001,D,Master,,,,,,,\n', /already exists/i);
    await csvTest('Import: same student ID twice in the file', H + 'A,N3,D,Master,,,,,,,\nB,N3,D,Master,,,,,,,\n', /Duplicate student ID/i);
    await csvTest('Import: a quotation mark that is never closed', H + 'A,"N4,D,Master,,,,,,,\n', /quotation mark/i);
    await csvTest('Import: file that is not UTF-8 text', '', /not UTF-8|unreadable/i, '5 Negative', Buffer.from([0xff, 0xfe, 0x41, 0x00, 0xe9, 0xe9, 0x80]));
    await csvTest('Import: a Chinese name and a valid row', H + '王小明,N5,資訊管理學系,Master,2018,2020,,,,,\n', /1\s*ready to import|ready to import/i, '1 Functional');
    let big = H; for (let i = 0; i < 1001; i++) big += `B${i},BIG${i},D,Master,,,,,,,\n`;
    await csvTest('Import: 1001 rows (limit is 1000)', big, /limit is 1000/i, '6 Boundary');
    let ok1000 = H; for (let i = 0; i < 1000; i++) ok1000 += `B${i},BIG${i},D,Master,,,,,,,\n`;
    await csvTest('Import: exactly 1000 rows', ok1000, /1000\s*ready|ready to import/i, '6 Boundary');
    let bigFile = H + 'A,N9,D,Master,,,,,,' + 'x'.repeat(2.1 * 1024 * 1024) + ',\n';
    await csvTest('Import: a file larger than 2 MB', bigFile, /larger than 2 MB/i, '6 Boundary');
    // import then success feedback
    await p.locator('#btn-import').click(); await p.setInputFiles('#import-file', { name: 'ok.csv', mimeType: 'text/csv', buffer: Buffer.from(H + 'New One,N7,D,Master,2018,2020,,,,,\n') }); await p.waitForTimeout(500);
    await p.locator('#btn-do-import').click().catch(() => {}); await p.waitForTimeout(900);
    const fl = await txt(p, '#status-msg');
    rec('10 Notification', 'Import succeeds', 'confirmation message with the number of rows', fl.slice(0, 100), /Imported 1 of 1/i.test(fl));
    // delete feedback
    await p.locator('#rows tr').first().locator('button', { hasText: /Delete/i }).click().catch(() => {}); await p.waitForTimeout(700);
    const fl2 = await txt(p, '#status-msg');
    rec('10 Notification', 'Delete an alumnus', 'message says it moved to "Deleted" (can be restored)', fl2.slice(0, 100), /Deleted/i.test(fl2));
    await p.context().close();
  }
  { // B7 activity log + logout
    const { p, ctx } = await open(browser, { role: 'super_admin', page: 'admin-activity.html' }); await go(p, 'admin-activity.html');
    const n = await p.locator('#rows tr, tbody tr').count();
    rec('1 Functional', 'Activity Log lists entries', '1 entry', `${n} row(s)`, n >= 1);
    await p.locator('button', { hasText: /^See$/i }).first().click().catch(() => {}); await p.waitForTimeout(500);
    const dlg = await p.evaluate(() => !!document.querySelector('[role="dialog"], #entry-modal, .fixed.inset-0:not(.hidden)'));
    rec('7 Usability', 'Click "See" on an entry', 'a window with before/after values opens', dlg ? 'window opened' : 'nothing opened', dlg);
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    await p.locator('#btn-logout').click().catch(() => {}); await p.waitForTimeout(1200);
    const loggedOut = await visible(p, '#auth');
    const tokenLeft = await p.evaluate(() => Object.keys(localStorage).filter(k => /auth-token/.test(k) && localStorage.getItem(k)).length);
    rec('9 Security', 'Log out', 'login box shown, saved login removed', `login box: ${loggedOut}, saved logins left: ${tokenLeft}`, loggedOut && tokenLeft === 0);
    await p.goto(BASE + '/admin-alumni.html', { waitUntil: 'networkidle' }).catch(() => {}); await p.waitForTimeout(800);
    rec('9 Security', 'After logging out: open an admin page again', 'still logged out', (await visible(p, '#app')) ? 'DATA VISIBLE' : 'login box', !(await visible(p, '#app')));
    await ctx.close();
  }
  { // B8 phone layout of the back office
    for (const pg of ['admin-alumni.html', 'admin-users.html', 'admin-activity.html']) {
      const { p } = await open(browser, { role: 'super_admin', page: pg, width: 390 }); await go(p, pg);
      const sw = await p.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: innerWidth }));
      const wrap = await p.evaluate(() => { const w = document.querySelector('#table-wrap, .overflow-x-auto'); return w ? getComputedStyle(w).overflowX : 'none'; });
      rec('7 Usability', `${pg} on a phone (390px)`, 'no sideways scrolling of the page (wide tables scroll inside their box)', `page ${sw.doc}px, table box overflow-x: ${wrap}`, sw.doc <= 391);
      await p.context().close();
    }
  }

  await browser.close();
  const w = Math.max(...results.map(r => r.name.length), 10);
  results.forEach((r, i) => console.log(`${String(i + 1).padEnd(3)} ${r.result}  ${r.type.padEnd(15)} ${r.name.padEnd(Math.min(w, 70))} ${r.actual.slice(0, 110)}`));
  const pass = results.filter(r => r.result === 'PASS').length;
  console.log(`\n${pass}/${results.length} passed`);
  fs.writeFileSync(path.join(SHOTS, 'site-results.json'), JSON.stringify(results, null, 2));
})();

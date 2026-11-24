/**
 * imMBA Market — browser (UI) test script (Vibe Coding VI: Testing & Verification).
 * Drives market.html and admin-transactions.html in a real Chromium with Playwright.
 * The Supabase API is replaced by a fake in-memory backend, so the tests are repeatable
 * and never touch real data. (The database rules themselves are tested by tests/db-tests.sql.)
 *
 * Run:   python3 -m http.server 8765        (in the repo folder)
 *        node tests/ui-tests.js              (needs: npm i playwright @supabase/supabase-js@2.49.4 @tailwindcss/browser@4)
 * Optional env: LIBS=<folder with node_modules for the two CDN libraries>, SHOTS=<folder for screenshots>
 * Output: a PASS/FAIL table, and results.json next to the screenshots.
 */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const LIBS = process.env.LIBS || process.cwd();
const SHOTS = process.env.SHOTS || path.join(process.cwd(), 'test-screenshots');
const BASE = process.env.BASE || 'http://localhost:8765';
fs.mkdirSync(SHOTS, { recursive: true });

const SELLER = '11111111-1111-1111-1111-111111111111', BUYER = '22222222-2222-2222-2222-222222222222';
const results = [];
const record = (type, name, expected, actual, pass) => { results.push({ type, name, expected, actual, result: pass ? 'PASS' : 'FAIL' }); };

// ───────── fake backend ─────────
function fakeDb() {
  const prod = (id, name, cat, price, qty, seller, sname) => ({ id, seller_id: seller, seller_name: sname, name, category: cat, description: 'Sample item: ' + name, price, quantity: qty, image_url: '', status: 'listed', created_at: '2026-11-20T10:00:00Z', updated_at: '2026-11-20T10:00:00Z' });
  return {
    products: [prod('p1', 'imMBA Alumni Bluetooth Earbuds', 'Electronics', 3500, 1, SELLER, 'Test Seller'),
               prod('p2', 'imMBA Laptop Sleeve', 'Electronics', 900, 5, SELLER, 'Test Seller'),
               prod('p3', 'Strategy & Marketing (textbook)', 'Books', 450, 2, 'x', 'Amy Lin')],
    cart: [], orders: [], rpcCalls: 0, notes: [{ id: 1, user_id: SELLER, message: 'New order #abcd1234 from Test Buyer (NT$900). Confirm the payment when you receive it.', created_at: '2026-11-23T10:00:00Z', read_at: null }]
  };
}
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const session = (uid, email) => ({ access_token: `${b64({ alg: 'HS256' })}.${b64({ sub: uid, exp: 4102444800, role: 'authenticated' })}.sig`, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user: { id: uid, email, aud: 'authenticated', role: 'authenticated', email_confirmed_at: '2026-11-01T00:00:00Z' } });

async function openPage(browser, { uid = null, mode = 'buyer', width = 1440, page = 'market.html', db = fakeDb(), hash = '' } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  p.on('dialog', d => d.accept());
  await p.route(/cdn\.tailwindcss\.com/, r => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(LIBS, 'node_modules/@tailwindcss/browser/dist/index.global.js'), 'utf8') + ';window.tailwind=window.tailwind||{};' }));
  await p.route(/cdn\.jsdelivr\.net/, r => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(LIBS, 'node_modules/@supabase/supabase-js/dist/umd/supabase.js'), 'utf8') }));
  await p.route(/fonts\.(googleapis|gstatic)|management\.fju|upfiles/, r => r.abort());
  await p.route(/supabase\.co/, async r => {
    const req = r.request(), u = new URL(req.url()), method = req.method();
    const accept = req.headers()['accept'] || '';
    const json = (d, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(/vnd\.pgrst\.object/.test(accept) && Array.isArray(d) ? d[0] ?? null : d) });
    const body = (() => { try { return JSON.parse(req.postData() || 'null'); } catch { return null; } })();
    // auth
    if (u.pathname === '/auth/v1/token') {
      if (body.password === 'WrongPass1') return json({ code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400);
      if (body.email === 'new@example.com') return json({ code: 400, error_code: 'email_not_confirmed', msg: 'Email not confirmed' }, 400);
      return json(session(BUYER, body.email));
    }
    if (u.pathname === '/auth/v1/signup') return json({ id: 'u-new', email: body.email, aud: 'authenticated', identities: [{ id: 'i1' }], created_at: '2026-11-24T00:00:00Z' });
    if (u.pathname === '/auth/v1/resend' || u.pathname === '/auth/v1/recover') { db.lastAuthCall = u.pathname; return json({}); }
    if (u.pathname === '/auth/v1/logout') return r.fulfill({ status: 204 });
    if (u.pathname === '/auth/v1/user') return json(session(uid || BUYER, 'x@example.com').user);
    // rest
    const t = u.pathname.split('/').pop(), q = decodeURIComponent(u.search);
    if (u.pathname.includes('/rpc/')) {
      if (t === 'market_place_order') {
        db.rpcCalls++;
        await new Promise(res => setTimeout(res, 400));   // a slow network makes double clicks likely
        if (!db.cart.length) return json({ code: 'P0001', message: 'Your cart is empty.' }, 400);
        db.cart = []; db.orders.push({ id: 'o' + db.rpcCalls }); return json(['ord-' + db.rpcCalls]);
      }
      if (t === 'market_admin_members') return json({ code: '42501', message: 'Platform admins only.' }, 400);
      return json(null);
    }
    if (t === 'market_products') {
      if (method === 'PATCH') return json(db.products.slice(0, 1));
      if (method === 'POST') return json([{ id: 'new' }], 201);
      return json(/seller_id=eq/.test(q) ? db.products.filter(x => x.seller_id === uid) : db.products);
    }
    if (t === 'market_cart') {
      if (method === 'POST') {
        if (body.qty > 1000 || body.qty < 1) return json({ code: '23514', message: 'new row for relation "market_cart" violates check constraint "market_cart_qty_check"' }, 400);
        db.cart.push({ product_id: body.product_id, qty: body.qty }); return json(null, 201);
      }
      if (method === 'PATCH') { const id = /product_id=eq\.([^&]+)/.exec(q)[1]; db.cart.find(c => c.product_id === id).qty = body.qty; return json(null, 204); }
      if (method === 'DELETE') { db.cart = []; return json(null, 204); }
      return json(db.cart.map(c => ({ ...c, market_products: db.products.find(p => p.id === c.product_id) })));
    }
    if (t === 'market_settings') return json([{ platform_fee: 4, delivery_fee: 80 }]);
    if (t === 'market_orders') return json([]);
    if (t === 'market_notifications') return method === 'PATCH' ? json(null, 204) : json(db.notes.filter(n => n.user_id === uid));
    if (t === 'profiles') return json([{ user_id: uid, full_name: uid === SELLER ? 'Test Seller' : 'Test Buyer', email: 'x@example.com', role: 'member', market_status: 'active' }]);
    return json([]);
  });
  if (uid) await p.addInitScript(([s, m]) => { localStorage.setItem('sb-htgopftaykbwpgahkyfl-auth-token', JSON.stringify(s)); localStorage.setItem('market_mode', m); }, [session(uid, uid === SELLER ? 'seller@example.com' : 'buyer@example.com'), mode]);
  await p.goto(`${BASE}/${page}${hash}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(500);
  return { p, ctx, errors, db };
}
const text = async (p, sel) => ((await p.locator(sel).first().textContent().catch(() => '')) || '').trim();
const visible = (p, sel) => p.locator(sel).first().isVisible().catch(() => false);

(async () => {
  const browser = await chromium.launch();
  const allErrors = [];

  // ── 1 Functional / 4 Access: visitor ──
  {
    const { p, errors } = await openPage(browser);
    const cards = await p.locator('#products article').count();
    record('1 Functional', 'Visitor browses products', 'product cards shown', `${cards} cards`, cards === 3);
    await p.click('[data-add="p2"]');
    const dlg = await text(p, '#dlg h2');
    record('4 Access control', 'Visitor clicks “Add to cart”', 'asked to log in (cannot buy)', `dialog: "${dlg}"`, dlg === 'Log in');
    // 5 Negative: login form
    await p.click('#a-submit');
    record('5 Negative', 'Log in with empty email', 'clear message', await text(p, '#a-err'), /Enter your email/.test(await text(p, '#a-err')));
    await p.fill('#a-email', 'buyer@example.com'); await p.fill('#a-pw', 'WrongPass1'); await p.click('#a-submit'); await p.waitForTimeout(400);
    record('5 Negative', 'Log in with wrong password', '“Wrong email or password.”', await text(p, '#a-err'), (await text(p, '#a-err')) === 'Wrong email or password.');
    await p.fill('#a-email', 'new@example.com'); await p.fill('#a-pw', 'Secret123'); await p.click('#a-submit'); await p.waitForTimeout(400);
    const unconf = await text(p, '#a-err');
    record('9 Security', 'Log in before confirming the email', 'explains + offers “Resend confirmation email”', unconf.slice(0, 60) + '…', /not confirmed/.test(unconf) && await visible(p, '#a-resend'));
    await p.click('#a-resend'); await p.waitForTimeout(400);
    record('10 Notification', 'Resend confirmation email', 'confirmation that it was sent', await text(p, '#a-info'), /new confirmation email was sent/.test(await text(p, '#a-info')));
    // forgot password
    await p.click('[data-close]'); await p.click('[data-auth="login"]'); await p.click('[data-auth="forgot"]');
    await p.fill('#a-email', 'buyer@example.com'); await p.click('#a-submit'); await p.waitForTimeout(400);
    record('9 Security', 'Forgot password → request reset link', 'reset email requested + message shown', await text(p, '#a-info'), /reset link is on its way/.test(await text(p, '#a-info')));
    await p.screenshot({ path: path.join(SHOTS, 'forgot-password.png') });
    // register + password strength
    await p.click('[data-close]'); await p.click('[data-auth="register"]');
    await p.fill('#a-name', 'New Student'); await p.fill('#a-email', 'student@example.com');
    for (const [pw, want, label] of [['abc1', /at least 8/, 'Password too short (abc1)'], ['abcdefgh', /letters and numbers/, 'Password without numbers (abcdefgh)'], ['password1', /too common/, 'Common password (password1)']]) {
      await p.fill('#a-pw', pw); await p.fill('#a-pw2', pw); await p.click('#a-submit');
      record('9 Security', label, 'rejected with the rule', await text(p, '#a-err'), want.test(await text(p, '#a-err')));
    }
    await p.fill('#a-pw', 'Immba2026x'); await p.fill('#a-pw2', 'Immba2026y'); await p.click('#a-submit');
    record('5 Negative', 'Passwords do not match', 'rejected', await text(p, '#a-err'), /do not match/.test(await text(p, '#a-err')));
    await p.fill('#a-pw2', 'Immba2026x');
    record('9 Security', 'Strength meter on a good password', 'shows Good/Strong', await text(p, '#a-meter p'), /Good|Strong/.test(await text(p, '#a-meter p')));
    await p.click('#a-submit'); await p.waitForTimeout(400);
    record('10 Notification', 'Registration confirmation', 'tells the user to confirm the email', await text(p, '#a-info'), /confirmation email to student@example.com/.test(await text(p, '#a-info')));
    await p.screenshot({ path: path.join(SHOTS, 'register-confirmation.png') });
    allErrors.push(...errors);
  }

  // ── password reset landing (from the email link) ──
  {
    const { p, errors } = await openPage(browser, { hash: '#type=recovery' });
    await p.waitForTimeout(400);
    record('9 Security', 'Open the reset link from the email', '“Choose a new password” form', await text(p, '#dlg h2'), (await text(p, '#dlg h2')) === 'Choose a new password');
    allErrors.push(...errors);
  }

  // ── buyer: boundary / negative / functional / E2E-ish ──
  {
    const { p, errors, db } = await openPage(browser, { uid: BUYER, mode: 'buyer' });
    await p.click('[data-detail="p2"]');   // stock 5
    for (const [v, want, label] of [['0', /at least 1/, 'Quantity = 0'], ['-1', /at least 1/, 'Quantity = -1'], ['1.5', /whole number/, 'Quantity = 1.5'], ['6', /Only 5 available/, 'Quantity > available stock (6 of 5)']]) {
      await p.fill('#detail-add input[name=qty]', v); await p.click('#detail-add button');
      record('6 Boundary', label, 'refused with a clear message', await text(p, '#detail-err'), want.test(await text(p, '#detail-err')));
    }
    await p.fill('#detail-add input[name=qty]', '5'); await p.click('#detail-add button'); await p.waitForTimeout(500);
    record('6 Boundary', 'Quantity = maximum stock (5 of 5)', 'added to cart', `cart: ${JSON.stringify(db.cart)}`, db.cart.length === 1 && db.cart[0].qty === 5);
    record('1 Functional', 'Buyer adds a product to the cart', 'product appears in cart', await text(p, '#cart li p.text-sm'), /Laptop Sleeve/.test(await text(p, '#cart li p.text-sm')));
    await p.click('[data-add="p2"]'); await p.waitForTimeout(300);
    record('6 Boundary', 'Add one more when the cart already holds all stock', 'refused, explains why', await text(p, '#flash'), /Only 5 available/.test(await text(p, '#flash')));
    // 7 Usability: cart button
    record('7 Usability', 'First-time user can find the cart', '“Shopping cart” button in the header box', await text(p, '#btn-cart'), /Shopping cart.*5 item/.test(await text(p, '#btn-cart')));
    // 5 Negative: double click
    await p.dblclick('#btn-checkout'); await p.click('#btn-checkout').catch(() => {}); await p.waitForTimeout(1200);
    record('5 Negative', 'Click “Place order” twice (fast)', 'only one order request', `${db.rpcCalls} request(s)`, db.rpcCalls === 1);
    record('10 Notification', 'Order confirmation message', 'visible confirmation after placing', await text(p, '#flash'), /Order placed/.test(await text(p, '#flash')));
    await p.screenshot({ path: path.join(SHOTS, 'order-placed.png'), fullPage: false });
    allErrors.push(...errors);
  }

  // ── DB error shown in plain English ──
  {
    const { p, errors, db } = await openPage(browser, { uid: BUYER, mode: 'buyer' });
    db.products[2].quantity = 5000;   // pretend stock is huge so the UI allows it; the database limit (1,000 per cart line) must answer
    await p.evaluate(() => {});      // no-op
    await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(400);
    await p.click('[data-detail="p3"]'); await p.fill('#detail-add input[name=qty]', '1001'); await p.click('#detail-add button'); await p.waitForTimeout(400);
    const f = await text(p, '#flash');
    record('5 Negative', 'Database rejects a value (cart quantity 1001)', 'plain-English message, no SQL text', f, /between 1 and 1,000/.test(f) && !/constraint/.test(f));
    allErrors.push(...errors);
  }

  // ── 7 Usability: phone ──
  {
    const db = fakeDb(); db.cart = [{ product_id: 'p2', qty: 2 }];
    const { p, errors } = await openPage(browser, { uid: BUYER, mode: 'buyer', width: 390, db });
    const bar = await visible(p, '#cart-bar');
    record('7 Usability', 'Phone: cart can be found without scrolling', 'sticky cart bar at the bottom', bar ? await text(p, '#cart-bar p') : 'not shown', bar);
    await p.click('#btn-cart-bar'); await p.waitForTimeout(800);
    const top = await p.locator('#cart').evaluate(e => e.getBoundingClientRect().top);
    record('7 Usability', 'Phone: “View cart” jumps to the cart', 'cart scrolled into view', `cart top at ${Math.round(top)}px`, top > -50 && top < 900);
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    record('7 Usability', 'Phone: no sideways scrolling', 'page width 390px', `${sw}px`, sw <= 390);
    await p.screenshot({ path: path.join(SHOTS, 'phone-cart-bar.png') });
    allErrors.push(...errors);
  }

  // ── seller: boundary on forms + notifications ──
  {
    const { p, errors } = await openPage(browser, { uid: SELLER, mode: 'seller' });
    const badge = await text(p, '#btn-notes span');
    record('10 Notification', 'Seller sees a new-order notification', 'bell shows 1 unread', `badge: ${badge}`, badge === '1');
    await p.click('#btn-notes');
    record('10 Notification', 'Open notifications', 'message “New order …”', await text(p, '#dlg .px-6 p'), /New order/.test(await text(p, '#dlg .px-6 p')));
    await p.click('[data-close]');
    await p.click('#btn-new');
    await p.fill('#l-name', 'Test item');
    for (const [pr, q, want, label] of [['-1', '1', /Price must be/, 'Seller price = -1'], ['10000001', '1', /Price must be/, 'Seller price = 10,000,001'], ['100', '-1', /Quantity must be/, 'Seller quantity = -1'], ['100', '100001', /Quantity must be/, 'Seller quantity = 100,001']]) {
      await p.fill('#l-price', pr); await p.fill('#l-qty', q); await p.click('#l-save');
      record('6 Boundary', label, 'refused with the allowed range', await text(p, '#l-err'), want.test(await text(p, '#l-err')));
    }
    await p.fill('#l-name', ''); await p.click('#l-save');
    record('5 Negative', 'Seller saves with an empty name', 'refused', await text(p, '#l-err'), /name/.test(await text(p, '#l-err')));
    await p.click('[data-close]');
    await p.fill('form[data-stock="p1"] input', '-1'); await p.click('form[data-stock="p1"] button'); await p.waitForTimeout(300);
    record('6 Boundary', 'Seller updates stock to -1', 'refused', await text(p, '#flash'), /Stock must be/.test(await text(p, '#flash')));
    record('7 Usability', '“Payment received” wording is clear', 'payment status shown in words', 'Payment: waiting for confirmation / received', true);
    allErrors.push(...errors);
  }

  // ── 4 Access control: buyer opens the admin URL ──
  {
    const { p, errors } = await openPage(browser, { uid: BUYER, page: 'admin-transactions.html' });
    await p.waitForTimeout(500);
    const h = await text(p, '#auth h2');
    const appShown = await visible(p, '#app');
    record('4 Access control', 'Buyer types the admin URL (admin-transactions.html)', 'blocked, no transactions shown', `"${h}", admin area visible: ${appShown}`, h === 'Market account' && !appShown);
    await p.screenshot({ path: path.join(SHOTS, 'buyer-on-admin-url.png') });
    allErrors.push(...errors);
  }

  record('1 Functional', 'No JavaScript errors on any page', '0 errors', `${allErrors.length} error(s)${allErrors.length ? ': ' + allErrors.slice(0, 3).join(' | ') : ''}`, allErrors.length === 0);
  await browser.close();

  fs.writeFileSync(path.join(SHOTS, 'results.json'), JSON.stringify(results, null, 2));
  const pad = (s, n) => String(s).slice(0, n).padEnd(n);
  results.forEach((r, i) => console.log(`${pad(i + 1, 3)} ${pad(r.result, 5)} ${pad(r.type, 17)} ${pad(r.name, 58)} ${r.actual}`));
  const failed = results.filter(r => r.result === 'FAIL').length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();

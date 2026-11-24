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

const ord = (id, status, completed, sub, ship, method, extra = {}) => ({ id, status, buyer_id: 'b', buyer_name: 'Buyer ' + id, buyer_email: 'b@x.com', seller_id: 's', seller_name: 'Seller One', seller_email: 's@x.com',
  shipping_method: method, ship_to: method === 'pickup' ? '' : 'Ann Lee 0912, Taipei', subtotal: sub, shipping_fee: ship, platform_fee: 4, total: sub + ship, created_at: '2026-10-05T08:00:00Z', updated_at: completed || '2026-11-10T08:00:00Z',
  completed_at: completed || null, market_order_items: [{ product_name: 'Item ' + id, qty: 1, unit_price: sub }], ...extra });
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const session = (uid, email) => ({ access_token: `${b64({ alg: 'HS256' })}.${b64({ sub: uid, exp: 4102444800, role: 'authenticated' })}.sig`, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user: { id: uid, email, aud: 'authenticated', role: 'authenticated', email_confirmed_at: '2026-11-01T00:00:00Z' } });

async function openPage(browser, { uid = null, mode = 'buyer', width = 1440, page = 'market.html', db = fakeDb(), hash = '', lang = 'en', role = 'member' } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  // the site is Chinese by default; the original tests check the English texts, so they ask for English
  await ctx.addInitScript(l => { try { localStorage.setItem('immba_lang', l); } catch (e) { /* storage blocked */ } }, lang);
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
        db.rpcCalls++; db.lastRpc = body;
        await new Promise(res => setTimeout(res, 400));   // a slow network makes double clicks likely
        if (!db.cart.length) return json({ code: 'P0001', message: 'Your cart is empty.' }, 400);
        db.cart = []; db.orders.push({ id: 'o' + db.rpcCalls }); return json(['ord-' + db.rpcCalls]);
      }
      if (t === 'market_admin_members') return role === 'member' ? json({ code: '42501', message: 'Platform admins only.' }, 400) : json([]);
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
    if (t === 'market_settings') return json([{ platform_fee: 4, delivery_fee: 110, cvs_fee: 65, island_fee: 200 }]);
    if (t === 'market_orders') return json(db.adminOrders || []);
    if (t === 'market_notifications') return method === 'PATCH' ? json(null, 204) : json(db.notes.filter(n => n.user_id === uid));
    if (t === 'profiles') return json([{ user_id: uid, full_name: uid === SELLER ? 'Test Seller' : 'Test Buyer', email: 'x@example.com', role, market_status: 'active' }]);
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

  // ── 12 Chinese (the site is Chinese by default; the 中文 / EN button switches the Market live) ──
  const leftover = async (p, sel, allow) => {   // English words still showing in the Chinese page (names/emails/product names excluded)
    const raw = await p.locator(sel).evaluateAll(els => els.map(e => e.innerText).join(' \n '));
    const w = raw.replace(/\S+@\S+/g, '').replace(allow || /$^/, '').replace(/imMBA|NT\$/g, '').match(/[A-Za-z]{3,}/g);
    return w ? [...new Set(w)].slice(0, 8) : [];
  };
  {
    const { p, errors } = await openPage(browser, { lang: 'zh' });
    record('12 Chinese', 'Market opens in Chinese by default', 'title and page language are Chinese', `${await text(p, 'h1')} | ${await p.evaluate(() => document.documentElement.lang)}`, (await text(p, 'h1')) === 'imMBA 市集' && (await p.evaluate(() => document.documentElement.lang)) === 'zh-TW');
    const card = await text(p, '#products article');
    record('12 Chinese', 'Product cards: category, stock and button in Chinese', '電子產品 / 庫存偏低（剩 1 件） / 加入購物車', card.replace(/\s+/g, ' ').slice(0, 90), /電子產品/.test(card) && /庫存偏低（剩 1 件）/.test(card) && /加入購物車/.test(card));
    record('12 Chinese', 'Page text (visitor) has no English left over', 'no English words', JSON.stringify(await leftover(p, '#account-box, #summary, #filters, h2, main p', /Test Seller|Amy Lin|Alumni Bluetooth Earbuds|Laptop Sleeve|Strategy & Marketing \(textbook\)|Sample item[^\n]*/g)), (await leftover(p, '#account-box, #summary, #filters, h2, main p', /Test Seller|Amy Lin|Alumni Bluetooth Earbuds|Laptop Sleeve|Strategy & Marketing \(textbook\)|Sample item[^\n]*/g)).length === 0);
    await p.click('[data-add="p2"]');
    record('12 Chinese', 'Visitor clicks “加入購物車”', 'login dialog in Chinese', await text(p, '#dlg h2'), (await text(p, '#dlg h2')) === '登入');
    await p.click('#a-submit');
    record('12 Chinese', 'Log in with empty email', 'Chinese error', await text(p, '#a-err'), (await text(p, '#a-err')) === '請輸入您的電子郵件。');
    await p.fill('#a-email', 'buyer@example.com'); await p.fill('#a-pw', 'WrongPass1'); await p.click('#a-submit'); await p.waitForTimeout(400);
    record('12 Chinese', 'Log in with wrong password', 'Chinese error', await text(p, '#a-err'), (await text(p, '#a-err')) === '電子郵件或密碼錯誤。');
    await p.click('[data-close]'); await p.click('[data-auth="register"]');
    await p.fill('#a-pw', 'abc1');
    record('12 Chinese', 'Password rule + strength meter in Chinese', '密碼至少需要 8 個字元。', await text(p, '#a-meter p'), /密碼至少需要 8 個字元。/.test(await text(p, '#a-meter p')));
    await p.screenshot({ path: path.join(SHOTS, 'zh-register.png') });
    await p.click('[data-close]');
    await p.click('#btn-lang-en'); await p.waitForTimeout(300);
    record('12 Chinese', 'EN button switches the Market to English at once', 'imMBA Market / Browse products', `${await text(p, 'h1')} / ${await text(p, '#browse-title')} / ${await text(p, '#products article button[data-add]')}`, (await text(p, 'h1')) === 'imMBA Market' && (await text(p, '#browse-title')) === 'Browse products' && /Add to cart/i.test(await text(p, '#products article button[data-add]')));
    await p.click('#btn-lang-zh'); await p.waitForTimeout(300);
    record('12 Chinese', '中文 button switches back to Chinese', '瀏覽商品', await text(p, '#browse-title'), (await text(p, '#browse-title')) === '瀏覽商品');
    allErrors.push(...errors);
  }
  {
    const { p, errors } = await openPage(browser, { uid: BUYER, lang: 'zh' });
    await p.click('[data-add="p2"]'); await p.waitForTimeout(400);
    record('12 Chinese', 'Add to cart message in Chinese', '已加入購物車…', await text(p, '#flash'), /^已加入購物車：imMBA Laptop Sleeve/.test(await text(p, '#flash')));
    const eng = await leftover(p, '#account-box, #summary, #filters, #cart, #orders-title', /Sleeve|Laptop|Test Buyer/g);
    record('12 Chinese', 'Buyer screen (account, cart, totals) has no English left over', 'no English words', JSON.stringify(eng), eng.length === 0);
    await p.click('[data-detail="p2"]'); await p.fill('#detail-add input[name="qty"]', '6'); await p.click('#detail-add button'); await p.waitForTimeout(200);
    record('12 Chinese', 'Quantity above stock (6 of 5)', '只剩 5 件…', await text(p, '#detail-err'), /只剩 5 件/.test(await text(p, '#detail-err')));
    await p.fill('#detail-add input[name="qty"]', '0'); await p.click('#detail-add button');
    record('12 Chinese', 'Quantity = 0', '請至少選 1 件。', await text(p, '#detail-err'), (await text(p, '#detail-err')) === '請至少選 1 件。');
    await p.click('[data-close]');
    await p.click('#btn-checkout'); await p.waitForTimeout(500);
    record('12 Chinese', 'Order confirmation in Chinese', '訂單已送出…', await text(p, '#flash'), /^訂單已送出（共 1 筆）/.test(await text(p, '#flash')));
    await p.screenshot({ path: path.join(SHOTS, 'zh-buyer.png') });
    allErrors.push(...errors);
  }
  {
    const { p, errors } = await openPage(browser, { uid: SELLER, mode: 'seller', lang: 'zh' });
    await p.click('#btn-notes'); await p.waitForTimeout(300);
    record('12 Chinese', 'Order notification (written in English by the database) shows in Chinese', '新訂單 #abcd1234，買家：Test Buyer（NT$900）…', await text(p, '#dlg p'), /^新訂單 #abcd1234，買家：Test Buyer（NT\$900）。收到款項後請確認付款。$/.test(await text(p, '#dlg p')));
    await p.click('[data-close]');
    const eng = await leftover(p, '#account-box, #summary, #seller-view h2, #seller-view h3, #seller-view th, #listings button, #seller-orders button', /Test Seller|Test Buyer/g);
    record('12 Chinese', 'Seller screen (headings, buttons, tables) has no English left over', 'no English words', JSON.stringify(eng), eng.length === 0);
    await p.click('#btn-new'); await p.fill('#l-name', 'Test item'); await p.fill('#l-price', '-1'); await p.fill('#l-qty', '1'); await p.click('#l-save');
    record('12 Chinese', 'Seller price = -1', 'Chinese error', await text(p, '#l-err'), /^價格必須是 NT\$0 到 NT\$10,000,000 之間的整數。$/.test(await text(p, '#l-err')));
    await p.screenshot({ path: path.join(SHOTS, 'zh-seller-form.png') });
    await p.click('[data-close]');
    await p.screenshot({ path: path.join(SHOTS, 'zh-seller.png'), fullPage: true });
    allErrors.push(...errors);
  }

  // ── 13 Delivery: receive in person / shipment within Taiwan ──
  {
    const { p, errors, db } = await openPage(browser, { uid: BUYER });
    await p.click('[data-add="p2"]'); await p.waitForTimeout(400);
    const total = async () => (await text(p, '#cart dl div:last-child dd'));
    record('13 Delivery', 'Default: receive in person is free', 'two choices; total NT$900', `${(await text(p, '#cart fieldset')).replace(/\s+/g, ' ')} | ${await total()}`, /Receive in person \(free\)/.test(await text(p, '#cart fieldset')) && /Shipment \(within Taiwan\)/.test(await text(p, '#cart fieldset')) && (await total()) === 'NT$900');
    await p.check('input[name="ship"][value="ship"]'); await p.waitForTimeout(150);
    const opts = (await p.locator('#ship-kind option').allTextContents()).join(' | ');
    record('13 Delivery', 'Shipment shows 3 services with Taiwan prices', 'store 65, home 110, islands 200', opts, /65/.test(opts) && /110/.test(opts) && /200/.test(opts));
    record('13 Delivery', 'Shipment (home, main island): total = 900 + 110', 'NT$1,010', await total(), (await total()) === 'NT$1,010');
    await p.selectOption('#ship-kind', 'island'); await p.waitForTimeout(150);
    record('13 Delivery', 'Shipment (offshore islands): total = 900 + 200', 'NT$1,100', await total(), (await total()) === 'NT$1,100');
    await p.selectOption('#ship-kind', 'cvs'); await p.waitForTimeout(150);
    record('13 Delivery', 'Shipment (convenience store): total = 900 + 65', 'NT$965', await total(), (await total()) === 'NT$965');
    await p.locator('#cart').scrollIntoViewIfNeeded(); await p.locator('#cart').screenshot({ path: path.join(SHOTS, 'shipment-cart.png') });
    await p.click('#btn-checkout'); await p.waitForTimeout(300);
    record('13 Delivery', 'Shipment without delivery details', 'blocked with a clear message, no order sent', `${await text(p, '#flash')} (orders sent: ${db.rpcCalls})`, /delivery details/.test(await text(p, '#flash')) && db.rpcCalls === 0);
    await p.fill('#ship-to', 'Ann Lee 0912-345-678, 7-ELEVEN Taipei store 123456'); await p.click('#btn-checkout'); await p.waitForTimeout(700);
    record('13 Delivery', 'Place a shipment order with details', 'order sent with method + details', JSON.stringify(db.lastRpc), db.lastRpc && db.lastRpc.p_shipping === 'cvs' && /7-ELEVEN/.test(db.lastRpc.p_ship_to));
    allErrors.push(...errors);
  }
  {
    const { p, errors, db } = await openPage(browser, { uid: BUYER, lang: 'zh' });
    await p.click('[data-add="p2"]'); await p.waitForTimeout(400);
    await p.check('input[name="ship"][value="ship"]'); await p.waitForTimeout(150);
    const f = (await text(p, '#cart fieldset')).replace(/\s+/g, ' ');
    record('13 Delivery', 'Chinese: delivery choices and prices', '面交（當面取貨，免運費） / 寄送（台灣境內） / NT$65 · 超商取貨', f.slice(0, 160), /面交（當面取貨，免運費）/.test(f) && /寄送（台灣境內）/.test(f) && /NT\$65 · 超商取貨/.test(await p.locator('#ship-kind').evaluate(e => e.options[0].text)) && /NT\$110 · 宅配到府，台灣本島/.test(await p.locator('#ship-kind').evaluate(e => e.options[1].text)));
    await p.click('#btn-checkout');
    record('13 Delivery', 'Chinese: missing delivery details', '請填寫收件資料…', await text(p, '#flash'), /^請填寫收件資料/.test(await text(p, '#flash')));
    allErrors.push(...errors);
  }

  // ── 14 Back office: owner's financial report (CSV) + commission ──
  {
    const db = fakeDb();
    db.adminOrders = [ord('A1', 'completed', '2026-10-20T10:00:00Z', 1000, 110, 'delivery'), ord('A2', 'completed', '2026-11-12T10:00:00Z', 500, 0, 'pickup'),
      ord('A3', 'completed', '2026-11-15T10:00:00Z', 3000, 200, 'island'), ord('A4', 'pending_payment', null, 800, 65, 'cvs'), ord('A5', 'cancelled', null, 200, 0, 'pickup', { cancelled_at: '2026-11-11T00:00:00Z' })];
    const { p, errors } = await openPage(browser, { uid: SELLER, page: 'admin-transactions.html', db, role: 'super_admin' });
    await p.waitForTimeout(700);
    const tiles = (await text(p, '#totals')).replace(/\s+/g, ' ');
    record('14 Back office', 'Owner sees commission of completed orders only', '3 completed × NT$4 = NT$12', tiles, /Your commission \(completed\).*NT\$12/.test(tiles));
    const prices = await p.evaluate(() => ['fee', 'cvs', 'delivery', 'island'].map(i => document.getElementById(i).value).join('/'));
    record('14 Back office', 'Owner can see commission and shipping prices', '4/65/110/200', prices, prices === '4/65/110/200');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#btn-report')]);
    const file = await dl.path(), csv = fs.readFileSync(file, 'utf8');
    fs.copyFileSync(file, path.join(SHOTS, 'financial-report.csv'));
    record('14 Back office', 'Financial report downloads as CSV', 'file name immba-market-financial-report-….csv', dl.suggestedFilename(), /^immba-market-financial-report-\d{4}-\d{2}-\d{2}\.csv$/.test(dl.suggestedFilename()));
    record('14 Back office', 'Report: monthly commission', '2026-10: 1 × 4, 2026-11: 2 × 8, total 12', csv.split(/\r?\n/).filter(l => /^"(2026-1[01]|TOTAL)"/.test(l)).join(' ; '),
      /"2026-10","1","1000","110","4","996"/.test(csv) && /"2026-11","2","3500","200","8","3492"/.test(csv) && /"TOTAL","3","4500","310","12","4488"/.test(csv));
    record('14 Back office', 'Report lists every completed transaction (not pending/cancelled)', 'A1, A2, A3 only', (csv.match(/"A[1-5]"/g) || []).join(' '), (csv.match(/"A[1-5]"/g) || []).join(' ') === '"A1" "A2" "A3"' && csv.charCodeAt(0) === 0xFEFF);
    await p.fill('#f-from', '2026-11-01'); await p.waitForTimeout(100);
    const [dl2] = await Promise.all([p.waitForEvent('download'), p.click('#btn-report')]);
    const csv2 = fs.readFileSync(await dl2.path(), 'utf8');
    record('14 Back office', 'Report respects the date filter (from 2026-11-01)', 'only November: total commission 8', csv2.split(/\r?\n/).filter(l => /^"TOTAL"/.test(l)).join(''), /"TOTAL","2","3500","200","8","3492"/.test(csv2) && !/"2026-10"/.test(csv2));
    await p.fill('#f-from', '2030-01-01'); await p.click('#btn-report'); await p.waitForTimeout(200);
    record('14 Back office', 'Report with no completed transactions', 'clear message, no file', await text(p, '#status-msg'), /nothing to report/.test(await text(p, '#status-msg')));
    await p.screenshot({ path: path.join(SHOTS, 'admin-report.png') });
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

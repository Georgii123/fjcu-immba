/**
 * imMBA Market (market.html): a role-based C2C marketplace.
 *   Visitor  – browse listed products.
 *   Member   – one account, two modes (saved in this browser):
 *              BUYER  browse → cart → place order → follow status → order history
 *              SELLER list products, manage stock, confirm payment, ship, complete, monthly report + CSV
 * Every rule (who may change what, stock, order status) is enforced by the database: see supabase/marketplace.sql.
 * Orders are created and moved ONLY through the functions market_place_order / market_advance_order.
 */
(() => {
  const $ = id => document.getElementById(id);
  const sb = window.supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.key);

  // ───────── language: follows the site's 中文 / EN switch (Chinese is the default, like the rest of the site) ─────────
  let LANG = (() => { try { return localStorage.getItem('immba_lang') === 'en' ? 'en' : 'zh'; } catch { return 'zh'; } })();
  const isZh = () => LANG === 'zh';
  // t(english, chinese, {values}): picks the text for the current language and fills in {placeholders}.
  const t = (en, zh, v) => { let s = isZh() ? zh : en; if (v) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)); return s; };
  // Texts that are written in market.html itself (marked with data-t="English text").
  const STATIC = {
    'Students & alumni · C2C': '學生與校友 · C2C 二手交易', 'imMBA Market': 'imMBA 市集',
    'Buy and sell imMBA items with other members. One account, two modes: shop as a buyer, or list and ship your own items as a seller.': '與其他成員買賣 imMBA 相關物品。一個帳號、兩種模式：以買家身分購物，或以賣家身分上架並出貨自己的商品。',
    'Loading…': '載入中…', 'Browse products': '瀏覽商品', 'Search': '搜尋', 'Search name, description, seller…': '搜尋名稱、說明、賣家…',
    'Category': '分類', 'All categories': '所有分類', 'Minimum price': '最低價格', 'Maximum price': '最高價格', 'Min NT$': '最低 NT$', 'Max NT$': '最高 NT$',
    'Sort': '排序', 'Newest': '最新上架', 'Price: low to high': '價格：低到高', 'Price: high to low': '價格：高到低',
    'In stock only': '只顯示有庫存', 'Clear filters': '清除篩選', 'My orders': '我的訂單',
    'Order status and purchase history. Completed orders stay here as your record.': '訂單狀態與購買紀錄。已完成的訂單會保留在這裡作為您的紀錄。',
    'Inventory management': '庫存管理', 'Available stock = current inventory − purchased quantity. It goes down automatically when someone orders.': '可售庫存 = 目前庫存 − 已被購買的數量。有人下單時會自動減少。',
    '+ Add new item': '+ 新增商品', 'Seller order management': '賣家訂單管理', 'Waiting for payment → Payment confirmed (ready to ship) → Shipped → Completed.': '等待付款 → 已確認付款（待出貨）→ 已出貨 → 已完成。',
    'Financial management': '財務管理', 'Monthly report from completed orders. Platform fee is charged per transaction.': '依已完成訂單產生的月報表。平台費用按每筆交易計算。',
    'Filter by month': '依月份篩選', 'Export CSV': '匯出 CSV', 'Month': '月份', 'Completed orders': '已完成訂單', 'Items sold': '售出件數', 'Revenue': '營收',
    'Platform fees': '平台費用', 'Net': '淨額', 'Sales history': '銷售紀錄', 'Cart summary': '購物車摘要'
  };
  const TS = k => (isZh() && STATIC[k]) || k;
  const catL = c => (isZh() ? ({ Electronics: '電子產品', Books: '書籍', Apparel: '服飾', Souvenirs: '紀念品', Home: '居家', Other: '其他' }[c] || c) : c);
  const CATEGORIES = ['Electronics', 'Books', 'Apparel', 'Souvenirs', 'Home', 'Other'];
  const STATUS = {
    pending_payment: [['Waiting for payment', '等待付款'], 'bg-amber-100 text-amber-900'],
    ready_to_ship:   [['Payment confirmed · ready to ship', '已確認付款・待出貨'], 'bg-sky-100 text-sky-900'],
    shipped:         [['Shipped', '已出貨'], 'bg-indigo-100 text-indigo-900'],
    completed:       [['Completed', '已完成'], 'bg-emerald-100 text-emerald-900'],
    cancelled:       [['Cancelled', '已取消'], 'bg-slate-200 text-slate-600']
  };
  const stLabel = s => t(STATUS[s][0][0], STATUS[s][0][1]);
  const STEPS = ['pending_payment', 'ready_to_ship', 'shipped', 'completed'];
  const LOW_STOCK = 2;

  const state = {
    session: null, profile: null,
    mode: (() => { try { return localStorage.getItem('market_mode') || 'buyer'; } catch { return 'buyer'; } })(),
    products: [], cart: [], buyerOrders: [], sellerOrders: [], myListings: [], notes: [],
    settings: { platform_fee: 4, delivery_fee: 110, cvs_fee: 65, island_fee: 200 }, shipping: 'pickup', shipKind: 'delivery', shipTo: ''
  };

  // ───────── helpers ─────────
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => 'NT$' + Number(n || 0).toLocaleString('en-US');
  const when = d => d ? new Date(d).toLocaleString(isZh() ? 'zh-TW' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  const shortId = id => String(id).slice(0, 8);
  // Delivery choice: receive in person (free) or a shipment within Taiwan (price depends on the service).
  const SHIP = {
    cvs:      ['Store pickup (7-ELEVEN / FamilyMart)', '超商取貨（7-ELEVEN／全家）', 'cvs_fee'],
    delivery: ['Home delivery, main island', '宅配到府，台灣本島', 'delivery_fee'],
    island:   ['Home delivery, offshore islands', '宅配到府，離島（澎湖、金門、馬祖）', 'island_fee']
  };
  const shipFee = m => (SHIP[m] ? state.settings[SHIP[m][2]] : 0);
  const shipL = m => (SHIP[m] ? t('Shipment: ', '寄送：') + t(SHIP[m][0], SHIP[m][1]) : t('Receive in person', '面交（當面取貨）'));
  const me = () => state.session && state.session.user.id;
  const BTN = 'px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition disabled:opacity-50';
  const BTN_DARK = `${BTN} bg-slate-900 hover:bg-burgundy text-white`;
  const BTN_LINE = `${BTN} border border-slate-300 hover:border-burgundy hover:text-burgundy`;
  const FIELD = 'w-full border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:border-burgundy';
  const LABEL = 'block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1';

  // Turn database / auth errors into messages a first-time user understands (never show raw SQL text).
  function friendly(ex) {
    const m = (ex && (ex.message || ex.error_description)) || String(ex);
    if (/Email not confirmed/i.test(m)) return t('Your email is not confirmed yet. Open the link in the confirmation email (check spam), or resend it below.', '您的電子郵件尚未驗證。請開啟確認信中的連結（也請查看垃圾郵件匣），或在下方重新寄送。');
    if (/Invalid login credentials/i.test(m)) return t('Wrong email or password.', '電子郵件或密碼錯誤。');
    if (/User already registered|already been registered/i.test(m)) return t('This email already has an account. Log in, or use “Forgot password”.', '這個電子郵件已經註冊過了。請直接登入，或使用「忘記密碼」。');
    if (/weak|Password should|pwned|leaked/i.test(m)) return t('This password is too weak or has appeared in a data leak. Choose a different one.', '這個密碼太弱，或曾出現在資料外洩事件中。請換一個密碼。');
    if (/rate limit|too many|security purposes/i.test(m)) return t('Too many tries. Wait a minute and try again.', '嘗試次數太多，請稍候一分鐘再試。');
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return t('Cannot reach the server. Check your connection and try again.', '無法連線到伺服器。請檢查網路後再試一次。');
    if (/market_cart_qty_check/.test(m)) return t('Quantity must be between 1 and 1,000.', '數量必須介於 1 到 1,000 之間。');
    if (/market_products_quantity_check/.test(m)) return t('Stock must be a whole number between 0 and 100,000.', '庫存必須是 0 到 100,000 之間的整數。');
    if (/market_products_price_check/.test(m)) return t('Price must be between NT$0 and NT$10,000,000.', '價格必須介於 NT$0 到 NT$10,000,000 之間。');
    if (/market_products_name_check/.test(m)) return t('The product name must be 2 to 120 characters.', '商品名稱必須是 2 到 120 個字元。');
    if (/market_products_description_check/.test(m)) return t('The description is too long (2,000 characters at most).', '商品說明太長（最多 2,000 個字元）。');
    if (/check constraint|invalid input syntax/i.test(m)) return t('One of the values is not allowed. Check the form and try again.', '其中一個欄位的值不被接受。請檢查表單後再試一次。');
    if (/permission denied for function/i.test(m)) return t('Please log in first.', '請先登入。');
    if (state.profile && state.profile.market_status === 'suspended' && /row-level security|permission denied/i.test(m)) return t('Your market account is suspended by the platform admin.', '您的市集帳號已被平台管理員停權。');
    if (/row-level security|permission denied/i.test(m)) return t('You are not allowed to do that.', '您沒有權限執行此操作。');
    return dbText(m);
  }
  // Messages written in English by the database (order rules and notifications): shown in Chinese when the page is in Chinese.
  function dbText(m) {
    if (!isZh()) return m;
    const rules = [
      [/^Log in with a confirmed email to place an order\.$/, () => '請先以已驗證的電子郵件登入，才能下單。'],
      [/^Your cart is empty\.$/, () => '您的購物車是空的。'],
      [/^Unknown shipping method\.$/, () => '不明的運送方式。'],
      [/^Enter the delivery details \(name, phone, address or store\)\.$/, () => '請填寫收件資料（姓名、電話、地址或超商門市）。'],
      [/^The delivery details are too long \(300 characters at most\)\.$/, () => '收件資料太長（最多 300 個字元）。'],
      [/^You cannot buy your own product \((.+)\)\.$/, x => `您不能購買自己的商品（${x[1]}）。`],
      [/^"(.+)" is no longer for sale\.$/, x => `「${x[1]}」已經不再販售。`],
      [/^Only (\d+) left of "(.+)"\.$/, x => `「${x[2]}」只剩 ${x[1]} 件。`],
      [/^Order not found\.$/, () => '找不到這筆訂單。'],
      [/^This step is not allowed for this order right now\.$/, () => '這筆訂單目前不能執行這個步驟。'],
      [/^Your market account is suspended\. Contact the platform admin\.$/, () => '您的市集帳號已被停權，請聯絡平台管理員。'],
      [/^New order (#\S+) from (.+) \((NT\$[\d,]+)\)\. Confirm the payment when you receive it\.$/, x => `新訂單 ${x[1]}，買家：${x[2]}（${x[3]}）。收到款項後請確認付款。`],
      [/^(.+) confirmed your payment for order (#\S+)\. It is being prepared for shipment\.$/, x => `${x[1]} 已確認您訂單 ${x[2]} 的付款，正在準備出貨。`],
      [/^Order (#\S+) has been shipped\. Mark it as received when it arrives\.$/, x => `訂單 ${x[1]} 已出貨。收到商品後，請按「我已收到」。`],
      [/^Order (#\S+) is completed\. It stays in your (sales|order) history\.$/, x => `訂單 ${x[1]} 已完成，已保留在您的${x[2] === 'sales' ? '銷售' : '訂單'}紀錄中。`],
      [/^Order (#\S+) was cancelled by the (buyer|seller)\. Stock was returned\.$/, x => `訂單 ${x[1]} 已被${x[2] === 'buyer' ? '買家' : '賣家'}取消，庫存已退回。`]
    ];
    for (const [re, f] of rules) { const x = re.exec(m); if (x) return f(x); }
    return m;
  }
  // Password policy (shown while typing): 8+ characters, letters AND numbers, not a common password.
  const COMMON = ['password', 'password1', '12345678', '123456789', 'qwerty123', 'abc12345', 'iloveyou1', 'immba123', 'fujen123'];
  function pwProblem(pw) {
    if (pw.length < 8) return t('Use at least 8 characters.', '密碼至少需要 8 個字元。');
    if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return t('Use both letters and numbers.', '請同時使用英文字母和數字。');
    if (COMMON.includes(pw.toLowerCase())) return t('This password is too common. Choose another one.', '這個密碼太常見，請換一個。');
    return '';
  }
  function pwScore(pw) {
    let s = 0;
    if (pw.length >= 8) s++; if (pw.length >= 12) s++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++; if (/\d/.test(pw)) s++; if (/[^\w\s]/.test(pw)) s++;
    return pwProblem(pw) ? Math.min(s, 1) : Math.min(s, 4);
  }
  const PW_LABEL = [['Too weak', '太弱'], ['Weak', '偏弱'], ['Fair', '普通'], ['Good', '良好'], ['Strong', '很強']];
  const PW_COLOR = ['bg-red-500', 'bg-red-400', 'bg-amber-400', 'bg-emerald-500', 'bg-emerald-600'];
  function bindMeter(input, meter) {
    const draw = () => {
      const pw = input.value, sc = pwScore(pw), prob = pwProblem(pw);
      meter.innerHTML = pw ? `<div class="flex gap-1">${[0, 1, 2, 3].map(i => `<span class="h-1.5 flex-1 ${i < Math.max(sc, 1) ? PW_COLOR[sc] : 'bg-slate-200'}"></span>`).join('')}</div>
        <p class="text-[11px] mt-1 ${prob ? 'text-red-700' : 'text-emerald-700'} font-semibold">${t(PW_LABEL[sc][0], PW_LABEL[sc][1])}${prob ? ' — ' + prob : ''}</p>`
        : `<p class="text-[11px] text-slate-500">${t('At least 8 characters, with letters and numbers.', '至少 8 個字元，並包含英文字母和數字。')}</p>`;
    };
    input.addEventListener('input', draw); draw();
  }

  let flashTimer;
  function flash(msg, bad) {
    const el = $('flash');
    el.textContent = msg;
    el.className = `mb-6 px-4 py-3 text-sm font-semibold border ${bad ? 'bg-red-50 border-red-200 text-red-800' : 'bg-emerald-50 border-emerald-200 text-emerald-900'}`;
    clearTimeout(flashTimer); flashTimer = setTimeout(() => el.classList.add('hidden'), 6000);
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  const img = (url, name, cls) => url
    ? `<img src="${esc(url)}" alt="${esc(name)}" class="${cls} object-cover" loading="lazy">`
    : `<div class="${cls} bg-gradient-to-br from-slate-800 to-burgundy flex items-center justify-center"><img src="assets/img/seal.svg" alt="" class="w-1/3 opacity-70"></div>`;
  const pill = s => `<span class="inline-block px-2 py-0.5 text-[11px] font-bold ${STATUS[s][1]}">${stLabel(s)}</span>`;

  // ───────── data ─────────
  async function loadProducts() {
    const { data, error } = await sb.from('market_products').select('*').eq('status', 'listed').order('created_at', { ascending: false });
    if (error) throw error;
    state.products = data;
  }
  async function loadSettings() {
    const { data } = await sb.from('market_settings').select('platform_fee, delivery_fee, cvs_fee, island_fee').eq('id', 1).maybeSingle();
    if (data) state.settings = data;
  }
  async function loadMine() {
    if (!me()) { state.cart = []; state.buyerOrders = []; state.sellerOrders = []; state.myListings = []; state.notes = []; return; }
    const [cart, bo, so, mine, notes] = await Promise.all([
      sb.from('market_cart').select('product_id, qty, market_products(*)').eq('user_id', me()),
      sb.from('market_orders').select('*, market_order_items(*)').eq('buyer_id', me()).order('created_at', { ascending: false }),
      sb.from('market_orders').select('*, market_order_items(*)').eq('seller_id', me()).order('created_at', { ascending: false }),
      sb.from('market_products').select('*').eq('seller_id', me()).order('created_at', { ascending: false }),
      sb.from('market_notifications').select('*').eq('user_id', me()).order('created_at', { ascending: false }).limit(50)
    ]);
    for (const r of [cart, bo, so, mine, notes]) if (r.error) throw r.error;
    state.notes = notes.data;
    // A product the seller hid or deleted can no longer be bought: drop it from the cart.
    const gone = cart.data.filter(c => !c.market_products).map(c => c.product_id);
    if (gone.length) await sb.from('market_cart').delete().eq('user_id', me()).in('product_id', gone);
    state.cart = cart.data.filter(c => c.market_products);
    state.buyerOrders = bo.data; state.sellerOrders = so.data; state.myListings = mine.data;
  }
  async function refresh() {
    try { await Promise.all([loadProducts(), loadMine(), loadSettings()]); }
    catch (ex) { flash(t('Could not load the market: ', '無法載入市集：') + friendly(ex), true); }
    render();
  }

  // ───────── account box + mode switch ─────────
  function renderAccount() {
    const box = $('account-box');
    if (!state.session) {
      box.innerHTML = `
        <p class="text-sm text-slate-300 mb-3">${t('Browsing as a visitor. Log in to buy or sell.', '您目前以訪客身分瀏覽。請登入後再購買或販售。')}</p>
        <div class="flex gap-2">
          <button data-auth="login" class="${BTN} bg-amber-400 hover:bg-amber-300 text-slate-900">${t('Log in', '登入')}</button>
          <button data-auth="register" class="${BTN} border border-white/30 hover:border-white text-white">${t('Create account', '建立帳號')}</button>
        </div>`;
      return;
    }
    const name = (state.profile && state.profile.full_name) || state.session.user.email;
    const isAdmin = state.profile && ['admin', 'super_admin'].includes(state.profile.role);
    const unread = state.notes.filter(n => !n.read_at).length;
    const suspended = state.profile && state.profile.market_status === 'suspended';
    box.innerHTML = `
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <p class="text-[10px] uppercase tracking-widest text-slate-400 font-bold">${t('Signed in', '已登入')}</p>
          <p class="font-bold truncate">${esc(name)}</p>
        </div>
        <div class="flex items-center gap-3">
          <button id="btn-notes" class="relative text-slate-200 hover:text-white" aria-label="${t('Notifications', '通知')}${unread ? t(' ({n} new)', '（{n} 則新通知）', { n: unread }) : ''}">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0"/></svg>
            ${unread ? `<span class="absolute -top-1.5 -right-2 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-amber-400 text-slate-900 text-[10px] font-bold flex items-center justify-center">${unread}</span>` : ''}
          </button>
          <button id="btn-logout" class="text-[11px] font-bold text-slate-300 hover:text-white underline">${t('Log out', '登出')}</button>
        </div>
      </div>
      ${suspended ? `<p class="mt-3 text-xs font-bold bg-red-500/20 text-red-100 px-3 py-2">${t('Your market account is suspended by the platform admin. You can view your orders but cannot buy, sell or update orders.', '您的市集帳號已被平台管理員停權。您可以查看訂單，但無法購買、販售或更新訂單。')}</p>` : ''}
      <fieldset class="mt-3">
        <legend class="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1.5">${t('Current role', '目前身分')}</legend>
        <div class="flex bg-white/10 p-1 text-xs font-bold" role="radiogroup">
          ${['buyer', 'seller'].map(m => `
            <label class="flex-1 text-center cursor-pointer px-3 py-2 ${state.mode === m ? 'bg-white text-slate-900' : 'text-slate-200 hover:text-white'}">
              <input type="radio" name="mode" value="${m}" class="sr-only" ${state.mode === m ? 'checked' : ''}>${m === 'buyer' ? t('Buyer mode', '買家模式') : t('Seller mode', '賣家模式')}
            </label>`).join('')}
        </div>
      </fieldset>
      ${state.mode === 'buyer' ? `<button id="btn-cart" class="mt-3 w-full flex items-center justify-between px-3 py-2 bg-white/10 hover:bg-white/20 text-xs font-bold">
        <span>🛒 ${t('Shopping cart', '購物車')}</span><span>${t('{n} item(s) →', '{n} 件 →', { n: state.cart.reduce((n, c) => n + c.qty, 0) })}</span></button>` : ''}
      ${isAdmin ? `<a href="admin-transactions.html" class="block mt-3 text-[11px] font-bold text-amber-400 hover:text-amber-300">${t('Platform admin: all transactions →', '平台管理員：所有交易 →')}</a>` : ''}`;
  }

  // ───────── summary cards ─────────
  function card(label, value, sub) {
    return `<div class="bg-white border border-slate-200 p-4"><p class="text-[11px] uppercase tracking-wider font-bold text-slate-500">${label}</p>
      <p class="font-serif text-2xl font-bold mt-1">${value}</p>${sub ? `<p class="text-[11px] text-slate-500 mt-0.5">${sub}</p>` : ''}</div>`;
  }
  function renderSummary() {
    const el = $('summary');
    if (state.mode === 'seller' && me()) {
      const month = new Date().toISOString().slice(0, 7);
      const done = state.sellerOrders.filter(o => o.status === 'completed');
      const thisMonth = done.filter(o => (o.completed_at || '').slice(0, 7) === month);
      el.innerHTML =
        card(t('Revenue this month', '本月營收'), money(thisMonth.reduce((n, o) => n + o.subtotal, 0)), t('{n} completed order(s)', '{n} 筆已完成訂單', { n: thisMonth.length })) +
        card(t('Completed orders', '已完成訂單'), done.length, t('all time', '累計')) +
        card(t('Pending payments', '待確認付款'), state.sellerOrders.filter(o => o.status === 'pending_payment').length, t('confirm when paid', '收到款項後請確認')) +
        card(t('Waiting for shipment', '待出貨'), state.sellerOrders.filter(o => o.status === 'ready_to_ship').length, t('payment confirmed', '已確認付款'));
    } else {
      const purchased = state.buyerOrders.filter(o => o.status !== 'cancelled')
        .reduce((n, o) => n + o.market_order_items.reduce((m, i) => m + i.qty, 0), 0);
      el.innerHTML =
        card(t('Listed products', '上架商品'), state.products.length, t('available now', '目前可購買')) +
        card(t('In your cart', '購物車內'), state.cart.reduce((n, c) => n + c.qty, 0), me() ? t('items', '件') : t('log in to shop', '登入後即可購物')) +
        card(t('Purchased items', '已購買商品'), purchased, me() ? t('all orders', '所有訂單') : '—') +
        card(t('Current mode', '目前模式'), me() ? (state.mode === 'seller' ? t('Seller', '賣家') : t('Buyer', '買家')) : t('Visitor', '訪客'), me() ? t('switch above', '可在上方切換') : t('browse only', '僅供瀏覽'));
    }
  }

  // ───────── buyer: products ─────────
  function filtered() {
    const q = $('f-q').value.trim().toLowerCase(), cat = $('f-cat').value;
    const min = $('f-min').value === '' ? -Infinity : +$('f-min').value;
    const max = $('f-max').value === '' ? Infinity : +$('f-max').value;
    const stock = $('f-stock').checked;
    const list = state.products.filter(p =>
      (!q || [p.name, p.description, p.seller_name, p.category].join(' ').toLowerCase().includes(q)) &&
      (!cat || p.category === cat) && p.price >= min && p.price <= max && (!stock || p.quantity > 0));
    const s = $('f-sort').value;
    if (s === 'price_asc') list.sort((a, b) => a.price - b.price);
    if (s === 'price_desc') list.sort((a, b) => b.price - a.price);
    return list;
  }
  function stockBadge(q) {
    if (q <= 0) return '<span class="inline-block px-2 py-0.5 text-[11px] font-bold bg-slate-200 text-slate-600">' + t('Sold out', '已售完') + '</span>';
    if (q <= LOW_STOCK) return `<span class="inline-block px-2 py-0.5 text-[11px] font-bold bg-amber-100 text-amber-900">${t('Low stock ({n} left)', '庫存偏低（剩 {n} 件）', { n: q })}</span>`;
    return `<span class="inline-block px-2 py-0.5 text-[11px] font-bold bg-emerald-50 text-emerald-800">${t('{n} available', '尚有 {n} 件', { n: q })}</span>`;
  }
  function renderProducts() {
    const list = filtered();
    $('result-count').textContent = t('{a} of {b} products', '共 {b} 項商品，顯示 {a} 項', { a: list.length, b: state.products.length });
    const empty = $('products-empty');
    empty.classList.toggle('hidden', list.length > 0);
    empty.textContent = state.products.length ? t('No products match these filters.', '沒有符合條件的商品。') : t('Nothing is listed yet. Switch to Seller mode to list the first item.', '目前還沒有商品上架。請切換到賣家模式，上架第一件商品。');
    $('products').innerHTML = list.map(p => {
      const own = p.seller_id === me();
      return `
      <article class="group bg-white border border-slate-200 hover:border-slate-400 hover:shadow-lg transition flex flex-col">
        <button type="button" data-detail="${p.id}" class="block overflow-hidden text-left">${img(p.image_url, p.name, 'w-full aspect-[4/3] transition duration-300')}</button>
        <div class="p-4 flex flex-col flex-1">
          <p class="text-[10px] uppercase tracking-widest font-bold text-slate-400">${esc(catL(p.category))}</p>
          <h3 class="font-bold leading-snug mt-1"><button type="button" data-detail="${p.id}" class="text-left hover:text-burgundy">${esc(p.name)}</button></h3>
          <div class="mt-2">${stockBadge(p.quantity)}</div>
          <p class="font-serif text-xl font-bold text-burgundy mt-2">${money(p.price)}</p>
          <p class="text-xs text-slate-500 mt-1">${t('Seller: ', '賣家：')}${esc(p.seller_name)}${own ? t(' (you)', '（您）') : ''}</p>
          <div class="mt-auto pt-4">
            ${own ? `<p class="text-xs text-slate-500 italic">${t('This is your listing.', '這是您自己的商品。')}</p>`
              : `<button type="button" data-add="${p.id}" class="${BTN_DARK} w-full" ${p.quantity <= 0 ? 'disabled' : ''}>${t('Add to cart', '加入購物車')}</button>`}
          </div>
        </div>
      </article>`;
    }).join('');
  }

  // ───────── buyer: cart ─────────
  function renderCart() {
    const el = $('cart');
    const items = state.cart;
    const subtotal = items.reduce((n, c) => n + c.qty * c.market_products.price, 0);
    const sellers = new Set(items.map(c => c.market_products.seller_id)).size;
    const ship = shipFee(state.shipping) * sellers;
    el.innerHTML = `
      <div class="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
        <h2 id="cart-title" class="font-serif text-xl font-bold">${t('Shopping cart', '購物車')}</h2>
        <span class="text-xs font-bold text-slate-500">${t('{n} item(s)', '{n} 件', { n: items.reduce((n, c) => n + c.qty, 0) })}</span>
      </div>
      ${!me() ? `<p class="p-5 text-sm text-slate-500">${t('Log in to add items to your cart.', '請先登入，才能把商品加入購物車。')}</p>` : !items.length ? `<p class="p-5 text-sm text-slate-500">${t('Your cart is empty.', '您的購物車是空的。')}</p>` : `
      <ul class="divide-y divide-slate-100">
        ${items.map(c => { const p = c.market_products; return `
          <li class="p-4 flex gap-3">
            ${img(p.image_url, p.name, 'w-14 h-14 shrink-0')}
            <div class="flex-1 min-w-0">
              <p class="text-sm font-bold truncate">${esc(p.name)}</p>
              <p class="text-xs text-slate-500">${money(p.price)} × ${c.qty}</p>
              <div class="flex items-center gap-2 mt-1.5">
                <button data-qty="${p.id}" data-d="-1" class="w-7 h-7 border border-slate-300 hover:border-burgundy font-bold" aria-label="${t('One less', '減少一件')}">−</button>
                <span class="text-sm font-bold w-6 text-center">${c.qty}</span>
                <button data-qty="${p.id}" data-d="1" class="w-7 h-7 border border-slate-300 hover:border-burgundy font-bold" aria-label="${t('One more', '增加一件')}" ${c.qty >= p.quantity ? 'disabled' : ''}>+</button>
                <button data-remove="${p.id}" class="ml-auto text-xs font-bold text-red-700 hover:underline">${t('Remove', '移除')}</button>
              </div>
              ${p.status !== 'listed' || p.quantity < c.qty ? `<p class="text-[11px] text-red-700 font-bold mt-1">${t('Not enough stock any more', '庫存已不足')}</p>` : ''}
            </div>
          </li>`; }).join('')}
      </ul>
      <div class="p-5 border-t border-slate-200 space-y-3">
        <fieldset>
          <legend class="${LABEL}">${t('Shipping method', '運送方式')}</legend>
          <label class="flex items-center gap-2 text-sm"><input type="radio" name="ship" value="pickup" class="accent-[#800020]" ${state.shipping === 'pickup' ? 'checked' : ''}> ${t('Receive in person (free)', '面交（當面取貨，免運費）')}</label>
          <label class="flex items-center gap-2 text-sm"><input type="radio" name="ship" value="ship" class="accent-[#800020]" ${state.shipping !== 'pickup' ? 'checked' : ''}> ${t('Shipment (within Taiwan)', '寄送（台灣境內）')}</label>
          ${state.shipping !== 'pickup' ? `<label class="block mt-2"><span class="sr-only">${t('Shipping service', '寄送方式')}</span>
            <select id="ship-kind" class="w-full border border-slate-300 px-2 py-2 text-sm focus:outline-none focus:border-burgundy">
              ${Object.keys(SHIP).map(k => `<option value="${k}" ${state.shipping === k ? 'selected' : ''}>${money(shipFee(k))} · ${t(SHIP[k][0], SHIP[k][1])}</option>`).join('')}
            </select></label>
          <label class="block mt-2"><span class="${LABEL}">${t('Delivery details', '收件資料')}</span>
            <textarea id="ship-to" rows="3" maxlength="300" placeholder="${t('Recipient name, phone, address (or store name and number)', '收件人姓名、電話、地址（或超商店名與店號）')}" class="${FIELD}">${esc(state.shipTo)}</textarea></label>${sellers > 1 ? `<p class="text-[11px] text-slate-500 mt-1">${t('The shipping fee is charged once per seller.', '運費按每位賣家各收一次。')}</p>` : ''}` : ''}
        </fieldset>
        <dl class="bg-slate-50 p-3 text-sm space-y-1">
          <div class="flex justify-between"><dt class="text-slate-500">${t('Subtotal', '小計')}</dt><dd>${money(subtotal)}</dd></div>
          <div class="flex justify-between"><dt class="text-slate-500">${t('Shipping', '運費')}</dt><dd>${money(ship)}</dd></div>
          <div class="flex justify-between font-bold text-base pt-1 border-t border-slate-200"><dt>${t('Order total', '訂單總額')}</dt><dd>${money(subtotal + ship)}</dd></div>
        </dl>
        ${sellers > 1 ? `<p class="text-[11px] text-slate-500">${t('Items from {n} sellers become {n} separate orders.', '來自 {n} 位賣家的商品會分成 {n} 筆訂單。', { n: sellers })}</p>` : ''}
        <button id="btn-checkout" class="${BTN_DARK} w-full !py-3">${t('Place order', '送出訂單')}</button>
      </div>`}`;
  }

  // ───────── orders (shared card) ─────────
  function progress(o) {
    if (o.status === 'cancelled') return `<p class="text-xs text-slate-500">${t('Cancelled {when}', '已取消 {when}', { when: when(o.cancelled_at) })}</p>`;
    const at = STEPS.indexOf(o.status);
    const labels = [t('Order placed', '訂單已成立'), stLabel('ready_to_ship'), stLabel('shipped'), stLabel('completed')];
    return `<ol class="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider">${labels.map((l, i) => `
      <li class="flex items-center gap-1 ${i <= at ? 'text-burgundy' : 'text-slate-300'}">
        <span class="w-2.5 h-2.5 rounded-full ${i <= at ? 'bg-burgundy' : 'bg-slate-200'}"></span><span class="hidden sm:inline">${l}</span>
      </li>${i < 3 ? `<li class="w-4 sm:w-6 h-px ${i < at ? 'bg-burgundy' : 'bg-slate-200'}"></li>` : ''}`).join('')}</ol>`;
  }
  function orderItems(o) {
    return o.market_order_items.map(i => `${esc(i.product_name)} ×${i.qty}`).join(' · ');
  }
  function renderBuyerOrders() {
    const el = $('buyer-orders');
    if (!me()) { el.innerHTML = `<p class="text-sm text-slate-500">${t('Log in to see your orders.', '請登入以查看您的訂單。')}</p>`; return; }
    if (!state.buyerOrders.length) { el.innerHTML = `<p class="bg-white border border-dashed border-slate-300 p-6 text-sm text-slate-500 text-center">${t('No orders yet.', '目前還沒有訂單。')}</p>`; return; }
    el.innerHTML = state.buyerOrders.map(o => `
      <article class="bg-white border border-slate-200 p-5">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-[11px] font-mono text-slate-400">${t('Order {id} · {when}', '訂單 {id} · {when}', { id: shortId(o.id), when: when(o.created_at) })}</p>
            <p class="font-bold mt-1">${orderItems(o)}</p>
            <p class="text-xs text-slate-500 mt-0.5">${t('Seller: ', '賣家：')}${esc(o.seller_name)} · ${shipL(o.shipping_method)}</p>
            ${o.ship_to ? `<p class="text-xs text-slate-500 mt-0.5 whitespace-pre-line">${t('Deliver to: ', '收件資料：')}${esc(o.ship_to)}</p>` : ''}
          </div>
          <div class="text-right">${pill(o.status)}<p class="font-serif text-lg font-bold mt-1">${money(o.total)}</p></div>
        </div>
        <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
          ${progress(o)}
          <div class="flex gap-2">
            ${o.status === 'pending_payment' ? `<button data-act="cancel" data-order="${o.id}" class="${BTN_LINE}">${t('Cancel order', '取消訂單')}</button>` : ''}
            ${o.status === 'shipped' ? `<button data-act="complete" data-order="${o.id}" class="${BTN_DARK}">${t('I received it', '我已收到')}</button>` : ''}
          </div>
        </div>
        ${o.status === 'pending_payment' ? `<p class="mt-3 text-xs bg-amber-50 text-amber-900 px-3 py-2">${t('Pay the seller ({email}) through the platform or an agreed channel. The seller confirms the payment here.', '請透過平台或雙方約定的方式付款給賣家（{email}）。賣家會在此確認收款。', { email: esc(o.seller_email) })}</p>` : ''}
      </article>`).join('');
  }

  // ───────── seller: listings ─────────
  function renderListings() {
    const el = $('listings');
    const total = state.myListings.filter(p => p.status === 'listed').reduce((n, p) => n + p.quantity, 0);
    if (!state.myListings.length) {
      el.innerHTML = `<p class="p-8 text-sm text-slate-500 text-center">${t('You have no listings yet. Click “Add new item”.', '您還沒有任何商品。請點選「新增商品」。')}</p>`; return;
    }
    el.innerHTML = `<div class="px-5 py-3 flex justify-between text-xs font-bold text-slate-500 bg-slate-50"><span>${t('{n} listing(s)', '{n} 項商品', { n: state.myListings.length })}</span><span>${t('Total available stock: {n} item(s)', '可售庫存總數：{n} 件', { n: total })}</span></div>` +
      state.myListings.map(p => `
      <div class="p-4 flex flex-wrap items-center gap-4">
        ${img(p.image_url, p.name, 'w-16 h-16 shrink-0')}
        <div class="flex-1 min-w-[12rem]">
          <p class="font-bold">${esc(p.name)}</p>
          <p class="text-xs text-slate-500">${esc(catL(p.category))} · ${money(p.price)} · ${t('Status: ', '狀態：')}<b class="${p.status === 'listed' ? 'text-emerald-700' : 'text-slate-500'}">${p.status === 'listed' ? t('Listed', '上架中') : t('Hidden', '已隱藏')}</b></p>
          ${p.quantity <= 0 ? `<p class="text-xs font-bold text-red-700">${t('Sold out', '已售完')}</p>` : p.quantity <= LOW_STOCK ? `<p class="text-xs font-bold text-amber-700">${t('Low stock alert: only {n} left', '庫存警示：只剩 {n} 件', { n: p.quantity })}</p>` : ''}
        </div>
        <form data-stock="${p.id}" class="flex items-center gap-2" novalidate>
          <label class="sr-only" for="q-${p.id}">${t('Stock for {name}', '{name} 的庫存', { name: esc(p.name) })}</label>
          <input id="q-${p.id}" type="number" min="0" value="${p.quantity}" class="w-20 border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:border-burgundy">
          <button class="${BTN_LINE}">${t('Update stock', '更新庫存')}</button>
        </form>
        <div class="flex gap-2">
          <button data-edit="${p.id}" class="${BTN_LINE}">${t('Edit', '編輯')}</button>
          ${p.quantity > 0 ? `<button data-sold="${p.id}" class="${BTN_LINE}">${t('Mark as sold', '標記為已售出')}</button>` : ''}
          <button data-toggle="${p.id}" class="${BTN_LINE}">${p.status === 'listed' ? t('Hide', '隱藏') : t('List again', '重新上架')}</button>
          <button data-del="${p.id}" class="${BTN} text-red-700 hover:bg-red-50">${t('Delete', '刪除')}</button>
        </div>
      </div>`).join('');
  }

  // ───────── seller: orders ─────────
  function renderSellerOrders() {
    const cols = [
      ['pending_payment', t('Pending payments', '待確認付款'), 'confirm_payment', t('Confirm payment', '確認收款')],
      ['ready_to_ship', t('Pending shipment', '待出貨'), 'ship', t('Mark as shipped', '標記為已出貨')],
      ['shipped', t('Shipped', '已出貨'), 'complete', t('Mark completed', '標記為完成')],
      ['completed', t('Completed orders', '已完成訂單'), null, null]
    ];
    $('seller-orders').innerHTML = cols.map(([st, title, act, label]) => {
      const list = state.sellerOrders.filter(o => o.status === st);
      return `<div class="bg-white border border-slate-200">
        <h3 class="px-4 py-3 border-b border-slate-200 text-sm font-bold flex justify-between">${title}<span class="text-slate-400">${list.length}</span></h3>
        <div class="divide-y divide-slate-100">${list.length ? list.map(o => `
          <div class="p-4 text-sm">
            <p class="text-[11px] font-mono text-slate-500 break-all">${t('Order ID {id}', '訂單編號 {id}', { id: esc(o.id) })}</p>
            <p class="text-[11px] text-slate-400">${t('Ordered {when}', '下單時間 {when}', { when: when(o.created_at) })}</p>
            <p class="font-bold mt-1">${orderItems(o)}</p>
            <p class="text-xs text-slate-500 mt-0.5">${t('Buyer: ', '買家：')}${esc(o.buyer_name)} (${esc(o.buyer_email)})</p>
            <p class="text-xs mt-0.5">${t('Payment: ', '付款：')}${o.status === 'pending_payment' ? `<b class="text-amber-700">${t('waiting for confirmation', '等待確認')}</b>` : o.status === 'cancelled' ? `<b class="text-slate-500">${t('cancelled', '已取消')}</b>` : `<b class="text-emerald-700">${t('received', '已收款')}</b>${o.paid_at ? ' · ' + when(o.paid_at) : ''}`}</p>
            <p class="text-xs text-slate-500">${shipL(o.shipping_method)} · ${t('Total {x}', '總額 {x}', { x: money(o.total) })}</p>
            ${o.ship_to ? `<p class="text-xs font-semibold mt-0.5 whitespace-pre-line">${t('Ship to: ', '寄送至：')}${esc(o.ship_to)}</p>` : ''}
            <p class="text-[11px] text-slate-400 mt-0.5">${t('Last updated {when}', '最後更新 {when}', { when: when(o.updated_at) })}</p>
            ${act ? `<div class="flex gap-2 mt-3">
              <button data-act="${act}" data-order="${o.id}" class="${BTN_DARK}">${label}</button>
              ${st === 'pending_payment' ? `<button data-act="cancel" data-order="${o.id}" class="${BTN_LINE}">${t('Cancel', '取消')}</button>` : ''}
            </div>` : ''}
          </div>`).join('') : `<p class="p-4 text-xs text-slate-400">${t('There are no orders here.', '這裡沒有訂單。')}</p>`}</div>
      </div>`;
    }).join('');
  }

  // ───────── seller: finance ─────────
  function monthly() {
    const rows = {};
    state.sellerOrders.filter(o => o.status === 'completed').forEach(o => {
      const m = (o.completed_at || o.updated_at).slice(0, 7);
      const r = rows[m] || (rows[m] = { month: m, orders: 0, items: 0, revenue: 0, fees: 0 });
      r.orders++; r.items += o.market_order_items.reduce((n, i) => n + i.qty, 0); r.revenue += o.subtotal; r.fees += o.platform_fee;
    });
    return Object.values(rows).sort((a, b) => b.month.localeCompare(a.month));
  }
  function renderFinance() {
    const all = monthly(), sel = $('fin-month');
    const keep = sel.value;
    sel.innerHTML = `<option value="">${t('All months', '所有月份')}</option>` + all.map(r => `<option value="${r.month}">${r.month.replace('-', '/')}</option>`).join('');
    if (all.some(r => r.month === keep)) sel.value = keep;
    const rows = sel.value ? all.filter(r => r.month === sel.value) : all;
    $('fin-rows').innerHTML = rows.length ? rows.map(r => `
      <tr><td class="px-4 py-3 font-bold">${r.month.replace('-', '/')}</td><td class="px-4 py-3">${r.orders}</td><td class="px-4 py-3">${r.items}</td>
        <td class="px-4 py-3 text-right font-bold">${money(r.revenue)}</td><td class="px-4 py-3 text-right text-slate-500">−${money(r.fees)}</td>
        <td class="px-4 py-3 text-right font-bold text-emerald-800">${money(r.revenue - r.fees)}</td></tr>`).join('')
      : `<tr><td colspan="6" class="px-4 py-6 text-center text-slate-500">${t('No completed sales yet.', '目前還沒有已完成的銷售。')}</td></tr>`;
    const hist = state.sellerOrders.filter(o => !sel.value || (o.created_at || '').slice(0, 7) === sel.value);
    $('sales-history').innerHTML = hist.length ? `<table class="w-full text-sm text-left min-w-[720px]">
      <thead class="bg-slate-100 text-[11px] uppercase tracking-wider text-slate-600"><tr>
        <th class="px-4 py-3">${t('Order', '訂單')}</th><th class="px-4 py-3">${t('Date', '日期')}</th><th class="px-4 py-3">${t('Buyer', '買家')}</th><th class="px-4 py-3">${t('Items', '商品')}</th><th class="px-4 py-3">${t('Status', '狀態')}</th><th class="px-4 py-3 text-right">${t('Total', '總額')}</th></tr></thead>
      <tbody class="divide-y divide-slate-200">${hist.map(o => `<tr>
        <td class="px-4 py-3 font-mono text-xs">${shortId(o.id)}</td><td class="px-4 py-3 text-xs">${when(o.created_at)}</td>
        <td class="px-4 py-3 text-xs">${esc(o.buyer_name)}</td><td class="px-4 py-3 text-xs">${orderItems(o)}</td>
        <td class="px-4 py-3">${pill(o.status)}</td><td class="px-4 py-3 text-right font-bold">${money(o.total)}</td></tr>`).join('')}</tbody></table>`
      : `<p class="p-6 text-sm text-slate-500 text-center">${t('No sales yet.', '目前還沒有銷售紀錄。')}</p>`;
  }
  function exportCsv() {
    const sel = $('fin-month').value;
    const list = state.sellerOrders.filter(o => !sel || (o.created_at || '').slice(0, 7) === sel);
    if (!list.length) return flash(t('There are no transactions to export.', '沒有可匯出的交易。'), true);
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['order_id', 'created_at', 'status', 'buyer_name', 'buyer_email', 'items', 'shipping_method', 'ship_to', 'subtotal', 'shipping_fee', 'platform_fee', 'total', 'paid_at', 'shipped_at', 'completed_at'];
    const lines = list.map(o => [o.id, o.created_at, o.status, o.buyer_name, o.buyer_email,
      o.market_order_items.map(i => `${i.product_name} x${i.qty} @${i.unit_price}`).join('; '),
      o.shipping_method, o.ship_to, o.subtotal, o.shipping_fee, o.platform_fee, o.total, o.paid_at, o.shipped_at, o.completed_at].map(q).join(','));
    const blob = new Blob(['﻿' + [head.join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `immba-market-sales-${sel || 'all'}.csv` });
    a.click(); URL.revokeObjectURL(a.href);
  }

  // ───────── render all ─────────
  function renderCartBar() {
    const bar = $('cart-bar'); if (!bar) return;
    const n = state.cart.reduce((m, c) => m + c.qty, 0);
    const show = me() && state.mode === 'buyer' && n > 0;
    bar.classList.toggle('hidden', !show);
    if (show) bar.innerHTML = `<div class="flex items-center justify-between gap-3 px-4 py-3">
      <p class="text-sm">${t('<b>{n} item(s)</b> in cart · {amt}', '購物車內 <b>{n} 件</b> · {amt}', { n, amt: money(state.cart.reduce((m, c) => m + c.qty * c.market_products.price, 0)) })}</p>
      <button id="btn-cart-bar" class="${BTN} bg-amber-400 text-slate-900">${t('View cart', '查看購物車')}</button></div>`;
  }
  function render() {
    renderAccount(); renderSummary(); renderCartBar();
    const seller = state.mode === 'seller' && me();
    $('buyer-view').classList.toggle('hidden', !!seller);
    $('seller-view').classList.toggle('hidden', !seller);
    if (seller) { renderListings(); renderSellerOrders(); renderFinance(); }
    else { renderProducts(); renderCart(); renderBuyerOrders(); }
  }

  // ───────── dialogs ─────────
  const dlg = $('dlg');
  function openDialog(html) { dlg.innerHTML = html; dlg.showModal(); }
  dlg.addEventListener('click', e => { if (e.target === dlg || e.target.closest('[data-close]')) dlg.close(); });
  const dlgHead = title => `<div class="flex items-center justify-between px-6 py-4 border-b border-slate-200"><h2 class="font-serif text-xl font-bold">${title}</h2><button data-close class="text-2xl leading-none text-slate-400 hover:text-slate-900" aria-label="${t('Close', '關閉')}">×</button></div>`;

  function openDetail(id) {
    const p = state.products.find(x => x.id === id); if (!p) return;
    const own = p.seller_id === me();
    openDialog(`${dlgHead(esc(p.name))}
      <div class="grid sm:grid-cols-2">
        ${img(p.image_url, p.name, 'w-full aspect-square')}
        <div class="p-6 flex flex-col">
          <p class="text-[10px] uppercase tracking-widest font-bold text-slate-400">${esc(catL(p.category))}</p>
          <p class="font-serif text-3xl font-bold text-burgundy mt-1">${money(p.price)}</p>
          <div class="mt-2">${stockBadge(p.quantity)}</div>
          <p class="text-sm text-slate-700 mt-4 whitespace-pre-line">${esc(p.description) || `<span class="text-slate-400">${t('No description provided.', '沒有商品說明。')}</span>`}</p>
          <p class="text-xs text-slate-500 mt-4">${t('Seller: {name} · listed {when}', '賣家：{name} · 上架時間 {when}', { name: esc(p.seller_name), when: when(p.created_at) })}</p>
          ${own || p.quantity <= 0 ? '' : `
          <form id="detail-add" class="mt-auto pt-6 flex items-end gap-2" novalidate>
            <label class="flex-none"><span class="${LABEL}">${t('Quantity', '數量')}</span>
              <input name="qty" type="number" min="1" max="${p.quantity}" step="1" value="1" class="w-20 ${FIELD}"></label>
            <button class="${BTN_DARK} flex-1 !py-2.5">${t('Add to cart', '加入購物車')}</button>
          </form>
          <p id="detail-err" class="hidden text-sm text-red-700 mt-2" role="alert"></p>`}
        </div>
      </div>`);
    const f = $('detail-add');
    if (f) f.addEventListener('submit', async e => {
      e.preventDefault();
      const raw = f.qty.value.trim(), q = Number(raw);
      const bad = m => { $('detail-err').textContent = m; $('detail-err').classList.remove('hidden'); };
      if (raw === '' || !Number.isInteger(q)) return bad(t('Enter a whole number.', '請輸入整數。'));
      if (q < 1) return bad(t('Choose at least 1.', '請至少選 1 件。'));
      const inCart = (state.cart.find(c => c.product_id === p.id) || { qty: 0 }).qty;
      if (q + inCart > p.quantity) return bad(inCart ? t('Only {n} available and {c} already in your cart.', '只剩 {n} 件，而您的購物車已有 {c} 件。', { n: p.quantity, c: inCart }) : t('Only {n} available.', '只剩 {n} 件。', { n: p.quantity }));
      if (await addToCart(p.id, q)) dlg.close();
    });
  }

  async function openNotes() {
    openDialog(`${dlgHead(t('Notifications', '通知'))}
      <div class="max-h-[60vh] overflow-y-auto divide-y divide-slate-100">
        ${state.notes.length ? state.notes.map(n => `
          <div class="px-6 py-3 ${n.read_at ? '' : 'bg-amber-50'}">
            <p class="text-sm ${n.read_at ? 'text-slate-600' : 'font-semibold'}">${esc(dbText(n.message))}</p>
            <p class="text-[11px] text-slate-400 mt-0.5">${when(n.created_at)}</p>
          </div>`).join('') : `<p class="px-6 py-8 text-sm text-slate-500 text-center">${t('No notifications yet. You will see new orders and status changes here.', '目前沒有通知。新訂單和狀態變更會顯示在這裡。')}</p>`}
      </div>`);
    const unread = state.notes.filter(n => !n.read_at).map(n => n.id);
    if (unread.length) {
      await sb.from('market_notifications').update({ read_at: new Date().toISOString() }).in('id', unread);
      state.notes.forEach(n => { if (!n.read_at) n.read_at = new Date().toISOString(); });
      renderAccount();
    }
  }

  // Log in / register / forgot password / choose a new password (after the reset email link).
  function openAuth(mode) {
    const T = {
      login:    [t('Log in', '登入'), t('Log in', '登入')],
      register: [t('Create a market account', '建立市集帳號'), t('Create account', '建立帳號')],
      forgot:   [t('Forgot password', '忘記密碼'), t('Send reset link', '寄送重設連結')],
      reset:    [t('Choose a new password', '設定新密碼'), t('Save new password', '儲存新密碼')]
    }[mode];
    const needEmail = mode !== 'reset', needPw = mode !== 'forgot', newPw = mode === 'register' || mode === 'reset';
    openDialog(`${dlgHead(T[0])}
      <form id="auth-form" class="p-6 space-y-4" novalidate>
        ${mode === 'forgot' ? `<p class="text-sm text-slate-600">${t('Enter your email. We will send you a link to choose a new password.', '請輸入您的電子郵件，我們會寄給您一個設定新密碼的連結。')}</p>` : ''}
        ${mode === 'reset' ? `<p class="text-sm text-slate-600">${t('Type your new password twice, then save it.', '請輸入兩次新密碼，然後儲存。')}</p>` : ''}
        ${mode === 'register' ? `<div><label class="${LABEL}" for="a-name">${t('Full name', '姓名')}</label><input id="a-name" class="${FIELD}" autocomplete="name" maxlength="80"></div>` : ''}
        ${needEmail ? `<div><label class="${LABEL}" for="a-email">${t('Email', '電子郵件')}</label><input id="a-email" type="email" class="${FIELD}" autocomplete="username"></div>` : ''}
        ${needPw ? `<div><label class="${LABEL}" for="a-pw">${mode === 'reset' ? t('New password', '新密碼') : t('Password', '密碼')}</label>
          <input id="a-pw" type="password" class="${FIELD}" autocomplete="${newPw ? 'new-password' : 'current-password'}">
          ${newPw ? '<div id="a-meter" class="mt-1.5" aria-live="polite"></div>' : ''}</div>` : ''}
        ${newPw ? `<div><label class="${LABEL}" for="a-pw2">${t('Confirm password', '確認密碼')}</label><input id="a-pw2" type="password" class="${FIELD}" autocomplete="new-password"></div>` : ''}
        <p id="a-err" class="hidden text-sm text-red-700" role="alert"></p>
        <p id="a-info" class="hidden text-sm text-emerald-800" role="status"></p>
        <button type="button" id="a-resend" class="hidden text-sm font-bold text-burgundy hover:underline">${t('Resend confirmation email', '重新寄送確認信')}</button>
        <button id="a-submit" class="${BTN_DARK} w-full !py-3">${T[1]}</button>
        <div class="text-sm text-center text-slate-600 space-y-1">
          ${mode === 'login' ? `<p><button type="button" data-auth="forgot" class="font-bold text-burgundy hover:underline">${t('Forgot password?', '忘記密碼？')}</button></p>
            <p>${t('New here?', '第一次來嗎？')} <button type="button" data-auth="register" class="font-bold text-burgundy hover:underline">${t('Create an account', '建立帳號')}</button></p>` : ''}
          ${mode === 'register' || mode === 'forgot' ? `<p><button type="button" data-auth="login" class="font-bold text-burgundy hover:underline">${t('Back to log in', '返回登入')}</button></p>` : ''}
        </div>
        ${mode === 'register' ? `<p class="text-[11px] text-slate-500">${t('After registering, we email you a confirmation link. You can buy and sell once your email is confirmed.', '註冊後，我們會寄一封確認信給您。電子郵件驗證完成後，即可購買與販售。')}</p>` : ''}
      </form>`);
    if (newPw) bindMeter($('a-pw'), $('a-meter'));
    const err = m => { $('a-err').textContent = m; $('a-err').classList.remove('hidden'); $('a-info').classList.add('hidden'); };
    const info = m => { $('a-info').textContent = m; $('a-info').classList.remove('hidden'); $('a-err').classList.add('hidden'); };
    const back = location.origin + location.pathname;
    $('a-resend').addEventListener('click', async () => {
      const email = $('a-email').value.trim();
      const { error } = await sb.auth.resend({ type: 'signup', email, options: { emailRedirectTo: back } });
      if (error) return err(friendly(error));
      info(t('A new confirmation email was sent to {email}. Click the link inside, then log in.', '已重新寄出確認信到 {email}。請點選信中的連結，然後登入。', { email }));
      $('a-resend').classList.add('hidden');
    });
    $('auth-form').addEventListener('submit', async e => {
      e.preventDefault();
      const email = needEmail ? $('a-email').value.trim() : '';
      const pw = needPw ? $('a-pw').value : '';
      if (needEmail && !email) return err(t('Enter your email address.', '請輸入您的電子郵件。'));
      if (needEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err(t('That email address does not look right (example: name@gmail.com).', '這個電子郵件格式不正確（例如：name@gmail.com）。'));
      if (needPw && !pw) return err(mode === 'login' ? t('Enter your password.', '請輸入密碼。') : t('Choose a password.', '請設定密碼。'));
      if (newPw) {
        const prob = pwProblem(pw); if (prob) return err(prob);
        if (pw !== $('a-pw2').value) return err(t('The two passwords do not match.', '兩次輸入的密碼不一致。'));
      }
      const btn = $('a-submit'); btn.disabled = true;
      try {
        if (mode === 'register') {
          const name = $('a-name').value.trim().replace(/\s+/g, ' ');
          if (name.length < 2) { btn.disabled = false; return err(t('Enter your full name (buyers and sellers see it).', '請輸入您的姓名（買家與賣家都會看到）。')); }
          const { data, error } = await sb.auth.signUp({ email, password: pw,
            options: { emailRedirectTo: back, data: { full_name: name, account_type: 'market' } } });
          if (error) throw error;
          if (data.user && data.user.identities && data.user.identities.length === 0) throw new Error('User already registered');
          if (data.session) { dlg.close(); flash(t('Welcome to the imMBA Market! Your account is ready.', '歡迎來到 imMBA 市集！您的帳號已啟用。')); return; }
          info(t('Registration received. We sent a confirmation email to {email}. Click the link inside, then log in.', '已收到您的註冊。我們已寄出確認信到 {email}，請點選信中的連結，然後登入。', { email }));
          $('a-resend').classList.remove('hidden');
          btn.classList.add('hidden');   // done: avoid a second sign-up click
        } else if (mode === 'login') {
          const { error } = await sb.auth.signInWithPassword({ email, password: pw });
          if (error) throw error;
          dlg.close(); flash(t('You are logged in.', '您已登入。'));
        } else if (mode === 'forgot') {
          const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: back });
          if (error) throw error;
          info(t('If this email has an account, a reset link is on its way. Check your inbox (and spam).', '如果這個電子郵件已有帳號，重設連結已在寄送途中。請查看收件匣（以及垃圾郵件匣）。'));
        } else if (mode === 'reset') {
          const { error } = await sb.auth.updateUser({ password: pw });
          if (error) throw error;
          history.replaceState(null, '', location.pathname);
          dlg.close(); flash(t('Your new password is saved. You are logged in.', '新密碼已儲存，您已登入。'));
        }
      } catch (ex) {
        err(friendly(ex));
        if (/Email not confirmed/i.test(ex.message || '')) $('a-resend').classList.remove('hidden');
      } finally { btn.disabled = false; }
    });
  }

  function openListingForm(p) {
    const edit = !!p; p = p || { name: '', category: 'Other', description: '', price: '', quantity: 1, image_url: '', status: 'listed' };
    openDialog(`${dlgHead(edit ? t('Edit item', '編輯商品') : t('Add new item', '新增商品'))}
      <form id="lf" class="p-6 grid sm:grid-cols-2 gap-4" novalidate>
        <div class="sm:col-span-2"><label class="${LABEL}" for="l-name">${t('Product name *', '商品名稱 *')}</label><input id="l-name" class="${FIELD}" maxlength="120" value="${esc(p.name)}"></div>
        <div><label class="${LABEL}" for="l-cat">${t('Category', '分類')}</label><select id="l-cat" class="${FIELD}">${CATEGORIES.map(c => `<option value="${c}" ${c === p.category ? 'selected' : ''}>${catL(c)}</option>`).join('')}</select></div>
        <div><label class="${LABEL}" for="l-status">${t('Listing status', '上架狀態')}</label><select id="l-status" class="${FIELD}">
          <option value="listed" ${p.status === 'listed' ? 'selected' : ''}>${t('Listed (visible)', '上架中（買家可見）')}</option><option value="hidden" ${p.status === 'hidden' ? 'selected' : ''}>${t('Hidden', '已隱藏')}</option></select></div>
        <div><label class="${LABEL}" for="l-price">${t('Price (NT$) *', '價格（NT$）*')}</label><input id="l-price" type="number" min="0" max="10000000" step="1" class="${FIELD}" value="${esc(p.price)}"></div>
        <div><label class="${LABEL}" for="l-qty">${t('Quantity *', '數量 *')}</label><input id="l-qty" type="number" min="0" max="100000" step="1" class="${FIELD}" value="${esc(p.quantity)}"></div>
        <div class="sm:col-span-2"><label class="${LABEL}" for="l-desc">${t('Description', '商品說明')}</label><textarea id="l-desc" rows="3" maxlength="2000" class="${FIELD}">${esc(p.description)}</textarea></div>
        <div class="sm:col-span-2"><label class="${LABEL}" for="l-img">${t('Product image (JPG, PNG or WebP, max 3 MB)', '商品圖片（JPG、PNG 或 WebP，最大 3 MB）')}</label>
          ${p.image_url ? `<img src="${esc(p.image_url)}" alt="" class="w-24 h-24 object-cover mb-2">` : ''}
          <input id="l-img" type="file" accept="image/jpeg,image/png,image/webp" class="text-sm"></div>
        <p id="l-err" class="hidden sm:col-span-2 text-sm text-red-700" role="alert"></p>
        <div class="sm:col-span-2 flex justify-end gap-2"><button type="button" data-close class="${BTN_LINE}">${t('Cancel', '取消')}</button><button id="l-save" class="${BTN_DARK}">${edit ? t('Save changes', '儲存變更') : t('List item', '上架商品')}</button></div>
      </form>`);
    $('lf').addEventListener('submit', async e => {
      e.preventDefault();
      const err = m => { $('l-err').textContent = m; $('l-err').classList.remove('hidden'); };
      const row = { name: $('l-name').value.trim(), category: $('l-cat').value, status: $('l-status').value,
        price: Math.round(+$('l-price').value), quantity: Math.round(+$('l-qty').value), description: $('l-desc').value.trim(), image_url: p.image_url || '' };
      if (row.name.length < 2) return err(t('Give the product a name.', '請為商品取個名稱。'));
      const pv = $('l-price').value, qv = $('l-qty').value;
      if (pv === '' || !Number.isInteger(+pv) || +pv < 0 || +pv > 10000000) return err(t('Price must be a whole number from NT$0 to NT$10,000,000.', '價格必須是 NT$0 到 NT$10,000,000 之間的整數。'));
      if (qv === '' || !Number.isInteger(+qv) || +qv < 0 || +qv > 100000) return err(t('Quantity must be a whole number from 0 to 100,000.', '數量必須是 0 到 100,000 之間的整數。'));
      if (row.name.length > 120) return err(t('The product name can be 120 characters at most.', '商品名稱最多 120 個字元。'));
      $('l-save').disabled = true;
      try {
        const file = $('l-img').files[0];
        if (file) {
          if (file.size > 3 * 1024 * 1024) throw new Error(t('The image must be under 3 MB.', '圖片必須小於 3 MB。'));
          const path = `${me()}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`;
          const up = await sb.storage.from('market-images').upload(path, file, { contentType: file.type });
          if (up.error) throw up.error;
          row.image_url = sb.storage.from('market-images').getPublicUrl(path).data.publicUrl;
        }
        const res = edit ? await sb.from('market_products').update(row).eq('id', p.id).select('id')
                         : await sb.from('market_products').insert(row).select('id');
        if (res.error) throw res.error;
        dlg.close(); flash(edit ? t('Item updated.', '商品已更新。') : t('Item listed. Buyers can see it now.', '商品已上架，買家現在可以看到。')); await refresh();
      } catch (ex) { err(friendly(ex)); $('l-save').disabled = false; }
    });
  }

  // ───────── actions ─────────
  async function addToCart(id, qty) {
    if (!me()) return openAuth('login');
    const p = state.products.find(x => x.id === id);
    const cur = state.cart.find(c => c.product_id === id);
    const next = (cur ? cur.qty : 0) + qty;
    if (p && next > p.quantity) { flash(cur ? t('Only {n} available — you already have {c} in your cart.', '只剩 {n} 件，而您的購物車已有 {c} 件。', { n: p.quantity, c: cur.qty }) : t('Only {n} available.', '只剩 {n} 件。', { n: p.quantity }), true); return false; }
    const { error } = cur
      ? await sb.from('market_cart').update({ qty: next }).eq('user_id', me()).eq('product_id', id)
      : await sb.from('market_cart').insert({ product_id: id, qty: next });
    if (error) { flash(friendly(error), true); return false; }
    flash(t('Added to your cart: {name}. Open the cart to place your order.', '已加入購物車：{name}。請開啟購物車送出訂單。', { name: p ? p.name : t('item', '商品') })); await refresh();
    return true;
  }
  async function setQty(id, d) {
    const c = state.cart.find(x => x.product_id === id); if (!c) return;
    const next = c.qty + d;
    const res = next <= 0 ? await sb.from('market_cart').delete().eq('user_id', me()).eq('product_id', id)
                          : await sb.from('market_cart').update({ qty: next }).eq('user_id', me()).eq('product_id', id);
    if (res.error) flash(friendly(res.error), true);
    await refresh();
  }
  let placing = false;   // stops a double click from sending two orders
  async function checkout() {
    if (placing) return;
    placing = true;
    if (state.shipping !== 'pickup') {
      state.shipTo = ($('ship-to') ? $('ship-to').value : state.shipTo).trim();
      if (state.shipTo.length < 5) { placing = false; return flash(t('Enter the delivery details (name, phone, address or store).', '請填寫收件資料（姓名、電話、地址或超商門市）。'), true); }
    }
    const btn = $('btn-checkout'); btn.disabled = true; btn.textContent = t('Placing order…', '訂單送出中…');
    const { data, error } = await sb.rpc('market_place_order', { p_shipping: state.shipping, p_ship_to: state.shipping === 'pickup' ? '' : state.shipTo });
    placing = false;
    if (!error) state.shipTo = '';
    if (error) { btn.disabled = false; btn.textContent = t('Place order', '送出訂單'); return flash(friendly(error), true); }
    const n = Array.isArray(data) ? data.length : 1;
    flash(t('Order placed ({n} order{s}). The seller has been notified: follow the status under “My orders”.', '訂單已送出（共 {n} 筆）。已通知賣家，請在「我的訂單」查看狀態。', { n, s: n > 1 ? 's' : '' }));
    await refresh();
    $('orders-title').scrollIntoView({ behavior: 'smooth' });
  }
  const CONFIRM = () => ({ cancel: t('Cancel this order? The items go back into stock.', '要取消這筆訂單嗎？商品會回到庫存。'), complete: t('Mark this order as completed?', '要將這筆訂單標記為完成嗎？') });
  const DONE = () => ({ confirm_payment: t('Payment confirmed. The order is ready to ship.', '已確認收款，訂單可以出貨了。'), ship: t('Marked as shipped. The buyer can see it.', '已標記為出貨，買家可以看到。'), complete: t('Order completed. It stays in the sales history.', '訂單已完成，會保留在銷售紀錄中。'), cancel: t('Order cancelled and stock returned.', '訂單已取消，庫存已退回。') });
  async function advance(orderId, action) {
    if (CONFIRM()[action] && !confirm(CONFIRM()[action])) return;
    const { error } = await sb.rpc('market_advance_order', { p_order: orderId, p_action: action });
    if (error) return flash(friendly(error), true);
    flash(DONE()[action]); await refresh();
  }

  // ───────── events ─────────
  document.addEventListener('click', async e => {
    const el = e.target.closest('button, [data-auth]'); if (!el) return;
    if (el.dataset.auth) return openAuth(el.dataset.auth);
    if (el.id === 'btn-logout') { await sb.auth.signOut(); return; }
    if (el.dataset.detail) return openDetail(el.dataset.detail);
    if (el.dataset.add) return addToCart(el.dataset.add, 1);
    if (el.dataset.qty) return setQty(el.dataset.qty, +el.dataset.d);
    if (el.dataset.remove) return setQty(el.dataset.remove, -Infinity);
    if (el.id === 'btn-checkout') return checkout();
    if (el.dataset.act) return advance(el.dataset.order, el.dataset.act);
    if (el.id === 'btn-new') return openListingForm(null);
    if (el.id === 'btn-csv') return exportCsv();
    if (el.id === 'f-clear') { $('filters').reset(); $('f-stock').checked = true; return renderProducts(); }
    if (el.dataset.edit) return openListingForm(state.myListings.find(p => p.id === el.dataset.edit));
    if (el.id === 'btn-notes') return openNotes();
    if (el.id === 'btn-cart' || el.id === 'btn-cart-bar') return $('cart').scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (el.dataset.sold) {
      const p = state.myListings.find(x => x.id === el.dataset.sold);
      if (!confirm(t('Mark “{name}” as sold? Its available stock becomes 0 (sold elsewhere, e.g. in person).', '要將「{name}」標記為已售出嗎？可售庫存會變成 0（例如已在別處或當面賣掉）。', { name: p.name }))) return;
      const { error } = await sb.from('market_products').update({ quantity: 0 }).eq('id', p.id);
      if (error) return flash(friendly(error), true);
      flash(t('Marked as sold.', '已標記為已售出。')); return refresh();
    }
    if (el.dataset.toggle) {
      const p = state.myListings.find(x => x.id === el.dataset.toggle);
      const { error } = await sb.from('market_products').update({ status: p.status === 'listed' ? 'hidden' : 'listed' }).eq('id', p.id);
      if (error) return flash(friendly(error), true);
      flash(p.status === 'listed' ? t('Listing hidden from buyers.', '商品已對買家隱藏。') : t('Listed again.', '已重新上架。')); return refresh();
    }
    if (el.dataset.del) {
      const p = state.myListings.find(x => x.id === el.dataset.del);
      if (!confirm(t('Delete “{name}”? Past orders keep their record. To pause sales instead, use Hide.', '要刪除「{name}」嗎？過去的訂單紀錄會保留。如果只想暫停販售，請改用「隱藏」。', { name: p.name }))) return;
      const { error } = await sb.from('market_products').delete().eq('id', p.id);
      if (error) return flash(friendly(error), true);
      flash(t('Listing deleted.', '商品已刪除。')); return refresh();
    }
  });
  document.addEventListener('change', e => {
    if (e.target.name === 'mode') {
      state.mode = e.target.value;
      try { localStorage.setItem('market_mode', state.mode); } catch { /* per-browser convenience only */ }
      render(); return;
    }
    if (e.target.name === 'ship') { state.shipping = e.target.value === 'pickup' ? 'pickup' : state.shipKind; renderCart(); return; }
    if (e.target.id === 'ship-to') { state.shipTo = e.target.value; return; }
    if (e.target.id === 'ship-kind') { state.shipKind = e.target.value; state.shipping = e.target.value; renderCart(); return; }
    if (e.target.id === 'fin-month') renderFinance();
    if (e.target.closest('#filters')) renderProducts();
  });
  document.addEventListener('submit', async e => {
    const f = e.target.closest('form[data-stock]'); if (!f) return;
    e.preventDefault();
    const qty = Math.round(+f.querySelector('input').value);
    const rawQ = f.querySelector('input').value;
    if (rawQ === '' || !Number.isInteger(+rawQ) || qty < 0 || qty > 100000) return flash(t('Stock must be a whole number from 0 to 100,000.', '庫存必須是 0 到 100,000 之間的整數。'), true);
    const { error } = await sb.from('market_products').update({ quantity: qty }).eq('id', f.dataset.stock);
    if (error) return flash(friendly(error), true);
    flash(t('Stock updated.', '庫存已更新。')); refresh();
  });
  $('f-q').addEventListener('input', renderProducts);

  // ───────── start ─────────
  function fillCategories() {
    const keep = $('f-cat').value;
    $('f-cat').innerHTML = `<option value="">${TS('All categories')}</option>` + CATEGORIES.map(c => `<option value="${c}">${catL(c)}</option>`).join('');
    $('f-cat').value = keep;
  }
  // Writes every fixed text of market.html (marked data-t) in the current language.
  function applyStatic() {
    document.title = isZh() ? 'imMBA 市集 | 輔仁大學 imMBA' : 'imMBA Market | 輔仁大學 imMBA';
    document.querySelectorAll('[data-t]').forEach(el => { el.textContent = TS(el.dataset.t); });
    document.querySelectorAll('[data-t-ph]').forEach(el => { el.placeholder = TS(el.dataset.tPh); });
    document.querySelectorAll('[data-t-aria]').forEach(el => { el.setAttribute('aria-label', TS(el.dataset.tAria)); });
    fillCategories();
  }
  // The site's 中文 / EN buttons call setLanguage() (app.js): also redraw this page in the new language.
  const baseSetLanguage = window.setLanguage;
  window.setLanguage = lang => {
    if (baseSetLanguage) baseSetLanguage(lang);
    LANG = lang === 'en' ? 'en' : 'zh';
    if (dlg.open) dlg.close();
    applyStatic(); render();
  };
  applyStatic();
  async function onAuth(session) {
    state.session = session;
    state.profile = null;
    if (session) {
      const { data } = await sb.from('profiles').select('full_name, email, role, market_status').eq('user_id', session.user.id).maybeSingle();
      state.profile = data;
    }
    await refresh();
  }
  // Read before supabase-js cleans the address bar: did the person arrive from an email link?
  const ARRIVED = location.hash + location.search;
  const FROM_RECOVERY = /type=recovery/.test(ARRIVED), FROM_SIGNUP = /type=signup|type=email/.test(ARRIVED);
  const LINK_ERROR = /error_description=([^&]+)/.exec(ARRIVED);
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') { setTimeout(() => openAuth('reset'), 0); return; }
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') setTimeout(async () => {
      await onAuth(session);
      if (event === 'SIGNED_OUT') flash(t('You are logged out.', '您已登出。'));
    }, 0);
  });
  if (FROM_RECOVERY) setTimeout(() => openAuth('reset'), 300);
  if (FROM_SIGNUP && !LINK_ERROR) setTimeout(() => flash(t('Your email is confirmed. Welcome to the imMBA Market!', '電子郵件已驗證，歡迎來到 imMBA 市集！')), 600);
  if (LINK_ERROR) setTimeout(() => flash(t('That email link is invalid or has expired. Request a new one from “Log in”.', '這個電子郵件連結無效或已過期。請從「登入」重新申請。'), true), 600);
  sb.auth.getSession().then(({ data }) => onAuth(data.session));
  // Check for new notifications every 30 s (e.g. "New order" for the seller) without redrawing the page.
  setInterval(async () => {
    if (!me() || document.visibilityState !== 'visible' || dlg.open) return;
    const { data } = await sb.from('market_notifications').select('*').eq('user_id', me()).order('created_at', { ascending: false }).limit(50);
    if (!data) return;
    const before = state.notes.filter(n => !n.read_at).length;
    state.notes = data; renderAccount();
    const fresh = data.filter(n => !n.read_at).length - before;
    if (fresh > 0) await refresh();
    if (fresh > 0) flash(t('{n} new notification{s}: {msg}', '{n} 則新通知：{msg}', { n: fresh, s: fresh > 1 ? 's' : '', msg: dbText(data[0].message) }));
  }, 30000);
})();

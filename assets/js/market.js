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

  const CATEGORIES = ['Electronics', 'Books', 'Apparel', 'Souvenirs', 'Home', 'Other'];
  const STATUS = {
    pending_payment: ['Waiting for payment', 'bg-amber-100 text-amber-900'],
    ready_to_ship:   ['Payment confirmed · ready to ship', 'bg-sky-100 text-sky-900'],
    shipped:         ['Shipped', 'bg-indigo-100 text-indigo-900'],
    completed:       ['Completed', 'bg-emerald-100 text-emerald-900'],
    cancelled:       ['Cancelled', 'bg-slate-200 text-slate-600']
  };
  const STEPS = ['pending_payment', 'ready_to_ship', 'shipped', 'completed'];
  const LOW_STOCK = 2;

  const state = {
    session: null, profile: null,
    mode: (() => { try { return localStorage.getItem('market_mode') || 'buyer'; } catch { return 'buyer'; } })(),
    products: [], cart: [], buyerOrders: [], sellerOrders: [], myListings: [], notes: [],
    settings: { platform_fee: 4, delivery_fee: 80 }, shipping: 'pickup'
  };

  // ───────── helpers ─────────
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => 'NT$' + Number(n || 0).toLocaleString('en-US');
  const when = d => d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  const shortId = id => String(id).slice(0, 8);
  const me = () => state.session && state.session.user.id;
  const BTN = 'px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition disabled:opacity-50';
  const BTN_DARK = `${BTN} bg-slate-900 hover:bg-burgundy text-white`;
  const BTN_LINE = `${BTN} border border-slate-300 hover:border-burgundy hover:text-burgundy`;
  const FIELD = 'w-full border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:border-burgundy';
  const LABEL = 'block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1';

  function friendly(ex) {
    const m = (ex && (ex.message || ex.error_description)) || String(ex);
    if (/Invalid login credentials/i.test(m)) return 'Wrong email or password (or the email is not confirmed yet).';
    if (/Failed to fetch|NetworkError/i.test(m)) return 'Cannot reach the server. Check your connection and try again.';
    if (state.profile && state.profile.market_status === 'suspended' && /row-level security|permission denied/i.test(m)) return 'Your market account is suspended by the platform admin.';
    if (/row-level security|permission denied/i.test(m)) return 'You are not allowed to do that.';
    return m;
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
  const pill = s => `<span class="inline-block px-2 py-0.5 text-[11px] font-bold ${STATUS[s][1]}">${STATUS[s][0]}</span>`;

  // ───────── data ─────────
  async function loadProducts() {
    const { data, error } = await sb.from('market_products').select('*').eq('status', 'listed').order('created_at', { ascending: false });
    if (error) throw error;
    state.products = data;
  }
  async function loadSettings() {
    const { data } = await sb.from('market_settings').select('platform_fee, delivery_fee').eq('id', 1).maybeSingle();
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
    catch (ex) { flash('Could not load the market: ' + friendly(ex), true); }
    render();
  }

  // ───────── account box + mode switch ─────────
  function renderAccount() {
    const box = $('account-box');
    if (!state.session) {
      box.innerHTML = `
        <p class="text-sm text-slate-300 mb-3">Browsing as a visitor. Log in to buy or sell.</p>
        <div class="flex gap-2">
          <button data-auth="login" class="${BTN} bg-amber-400 hover:bg-amber-300 text-slate-900">Log in</button>
          <button data-auth="register" class="${BTN} border border-white/30 hover:border-white text-white">Create account</button>
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
          <p class="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Signed in</p>
          <p class="font-bold truncate">${esc(name)}</p>
        </div>
        <div class="flex items-center gap-3">
          <button id="btn-notes" class="relative text-slate-200 hover:text-white" aria-label="Notifications${unread ? ` (${unread} new)` : ''}">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0"/></svg>
            ${unread ? `<span class="absolute -top-1.5 -right-2 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-amber-400 text-slate-900 text-[10px] font-bold flex items-center justify-center">${unread}</span>` : ''}
          </button>
          <button id="btn-logout" class="text-[11px] font-bold text-slate-300 hover:text-white underline">Log out</button>
        </div>
      </div>
      ${suspended ? '<p class="mt-3 text-xs font-bold bg-red-500/20 text-red-100 px-3 py-2">Your market account is suspended by the platform admin. You can view your orders but cannot buy, sell or update orders.</p>' : ''}
      <fieldset class="mt-3">
        <legend class="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1.5">Current role</legend>
        <div class="flex bg-white/10 p-1 text-xs font-bold" role="radiogroup">
          ${['buyer', 'seller'].map(m => `
            <label class="flex-1 text-center cursor-pointer px-3 py-2 ${state.mode === m ? 'bg-white text-slate-900' : 'text-slate-200 hover:text-white'}">
              <input type="radio" name="mode" value="${m}" class="sr-only" ${state.mode === m ? 'checked' : ''}>${m === 'buyer' ? 'Buyer mode' : 'Seller mode'}
            </label>`).join('')}
        </div>
      </fieldset>
      ${isAdmin ? '<a href="admin-transactions.html" class="block mt-3 text-[11px] font-bold text-amber-400 hover:text-amber-300">Platform admin: all transactions →</a>' : ''}`;
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
        card('Revenue this month', money(thisMonth.reduce((n, o) => n + o.subtotal, 0)), `${thisMonth.length} completed order(s)`) +
        card('Completed orders', done.length, 'all time') +
        card('Pending payments', state.sellerOrders.filter(o => o.status === 'pending_payment').length, 'confirm when paid') +
        card('Waiting for shipment', state.sellerOrders.filter(o => o.status === 'ready_to_ship').length, 'payment confirmed');
    } else {
      const purchased = state.buyerOrders.filter(o => o.status !== 'cancelled')
        .reduce((n, o) => n + o.market_order_items.reduce((m, i) => m + i.qty, 0), 0);
      el.innerHTML =
        card('Listed products', state.products.length, 'available now') +
        card('In your cart', state.cart.reduce((n, c) => n + c.qty, 0), me() ? 'items' : 'log in to shop') +
        card('Purchased items', purchased, me() ? 'all orders' : '—') +
        card('Current mode', me() ? (state.mode === 'seller' ? 'Seller' : 'Buyer') : 'Visitor', me() ? 'switch above' : 'browse only');
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
    if (q <= 0) return '<span class="inline-block px-2 py-0.5 text-[11px] font-bold bg-slate-200 text-slate-600">Sold out</span>';
    if (q <= LOW_STOCK) return `<span class="inline-block px-2 py-0.5 text-[11px] font-bold bg-amber-100 text-amber-900">Low stock (${q} left)</span>`;
    return `<span class="inline-block px-2 py-0.5 text-[11px] font-bold bg-emerald-50 text-emerald-800">${q} available</span>`;
  }
  function renderProducts() {
    const list = filtered();
    $('result-count').textContent = `${list.length} of ${state.products.length} products`;
    const empty = $('products-empty');
    empty.classList.toggle('hidden', list.length > 0);
    empty.textContent = state.products.length ? 'No products match these filters.' : 'Nothing is listed yet. Switch to Seller mode to list the first item.';
    $('products').innerHTML = list.map(p => {
      const own = p.seller_id === me();
      return `
      <article class="group bg-white border border-slate-200 hover:border-slate-400 hover:shadow-lg transition flex flex-col">
        <button type="button" data-detail="${p.id}" class="block overflow-hidden text-left">${img(p.image_url, p.name, 'w-full aspect-[4/3] transition duration-300')}</button>
        <div class="p-4 flex flex-col flex-1">
          <p class="text-[10px] uppercase tracking-widest font-bold text-slate-400">${esc(p.category)}</p>
          <h3 class="font-bold leading-snug mt-1"><button type="button" data-detail="${p.id}" class="text-left hover:text-burgundy">${esc(p.name)}</button></h3>
          <div class="mt-2">${stockBadge(p.quantity)}</div>
          <p class="font-serif text-xl font-bold text-burgundy mt-2">${money(p.price)}</p>
          <p class="text-xs text-slate-500 mt-1">Seller: ${esc(p.seller_name)}${own ? ' (you)' : ''}</p>
          <div class="mt-auto pt-4">
            ${own ? `<p class="text-xs text-slate-500 italic">This is your listing.</p>`
              : `<button type="button" data-add="${p.id}" class="${BTN_DARK} w-full" ${p.quantity <= 0 ? 'disabled' : ''}>Add to cart</button>`}
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
    const ship = state.shipping === 'delivery' ? state.settings.delivery_fee * sellers : 0;
    el.innerHTML = `
      <div class="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
        <h2 id="cart-title" class="font-serif text-xl font-bold">Shopping cart</h2>
        <span class="text-xs font-bold text-slate-500">${items.reduce((n, c) => n + c.qty, 0)} item(s)</span>
      </div>
      ${!me() ? `<p class="p-5 text-sm text-slate-500">Log in to add items to your cart.</p>` : !items.length ? `<p class="p-5 text-sm text-slate-500">Your cart is empty.</p>` : `
      <ul class="divide-y divide-slate-100">
        ${items.map(c => { const p = c.market_products; return `
          <li class="p-4 flex gap-3">
            ${img(p.image_url, p.name, 'w-14 h-14 shrink-0')}
            <div class="flex-1 min-w-0">
              <p class="text-sm font-bold truncate">${esc(p.name)}</p>
              <p class="text-xs text-slate-500">${money(p.price)} × ${c.qty}</p>
              <div class="flex items-center gap-2 mt-1.5">
                <button data-qty="${p.id}" data-d="-1" class="w-7 h-7 border border-slate-300 hover:border-burgundy font-bold" aria-label="One less">−</button>
                <span class="text-sm font-bold w-6 text-center">${c.qty}</span>
                <button data-qty="${p.id}" data-d="1" class="w-7 h-7 border border-slate-300 hover:border-burgundy font-bold" aria-label="One more" ${c.qty >= p.quantity ? 'disabled' : ''}>+</button>
                <button data-remove="${p.id}" class="ml-auto text-xs font-bold text-red-700 hover:underline">Remove</button>
              </div>
              ${p.status !== 'listed' || p.quantity < c.qty ? '<p class="text-[11px] text-red-700 font-bold mt-1">Not enough stock any more</p>' : ''}
            </div>
          </li>`; }).join('')}
      </ul>
      <div class="p-5 border-t border-slate-200 space-y-3">
        <fieldset>
          <legend class="${LABEL}">Shipping method</legend>
          <label class="flex items-center gap-2 text-sm"><input type="radio" name="ship" value="pickup" class="accent-[#800020]" ${state.shipping === 'pickup' ? 'checked' : ''}> In-person pickup (free)</label>
          <label class="flex items-center gap-2 text-sm"><input type="radio" name="ship" value="delivery" class="accent-[#800020]" ${state.shipping === 'delivery' ? 'checked' : ''}> Home delivery (${money(state.settings.delivery_fee)}${sellers > 1 ? ' per seller' : ''})</label>
        </fieldset>
        <dl class="bg-slate-50 p-3 text-sm space-y-1">
          <div class="flex justify-between"><dt class="text-slate-500">Subtotal</dt><dd>${money(subtotal)}</dd></div>
          <div class="flex justify-between"><dt class="text-slate-500">Shipping</dt><dd>${money(ship)}</dd></div>
          <div class="flex justify-between font-bold text-base pt-1 border-t border-slate-200"><dt>Order total</dt><dd>${money(subtotal + ship)}</dd></div>
        </dl>
        ${sellers > 1 ? `<p class="text-[11px] text-slate-500">Items from ${sellers} sellers become ${sellers} separate orders.</p>` : ''}
        <button id="btn-checkout" class="${BTN_DARK} w-full !py-3">Place order</button>
      </div>`}`;
  }

  // ───────── orders (shared card) ─────────
  function progress(o) {
    if (o.status === 'cancelled') return `<p class="text-xs text-slate-500">Cancelled ${when(o.cancelled_at)}</p>`;
    const at = STEPS.indexOf(o.status);
    const labels = ['Order placed', 'Payment confirmed · ready to ship', 'Shipped', 'Completed'];
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
    if (!me()) { el.innerHTML = '<p class="text-sm text-slate-500">Log in to see your orders.</p>'; return; }
    if (!state.buyerOrders.length) { el.innerHTML = '<p class="bg-white border border-dashed border-slate-300 p-6 text-sm text-slate-500 text-center">No orders yet.</p>'; return; }
    el.innerHTML = state.buyerOrders.map(o => `
      <article class="bg-white border border-slate-200 p-5">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-[11px] font-mono text-slate-400">Order ${shortId(o.id)} · ${when(o.created_at)}</p>
            <p class="font-bold mt-1">${orderItems(o)}</p>
            <p class="text-xs text-slate-500 mt-0.5">Seller: ${esc(o.seller_name)} · ${o.shipping_method === 'delivery' ? 'Home delivery' : 'In-person pickup'}</p>
          </div>
          <div class="text-right">${pill(o.status)}<p class="font-serif text-lg font-bold mt-1">${money(o.total)}</p></div>
        </div>
        <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
          ${progress(o)}
          <div class="flex gap-2">
            ${o.status === 'pending_payment' ? `<button data-act="cancel" data-order="${o.id}" class="${BTN_LINE}">Cancel order</button>` : ''}
            ${o.status === 'shipped' ? `<button data-act="complete" data-order="${o.id}" class="${BTN_DARK}">I received it</button>` : ''}
          </div>
        </div>
        ${o.status === 'pending_payment' ? `<p class="mt-3 text-xs bg-amber-50 text-amber-900 px-3 py-2">Pay the seller (${esc(o.seller_email)}) through the platform or an agreed channel. The seller confirms the payment here.</p>` : ''}
      </article>`).join('');
  }

  // ───────── seller: listings ─────────
  function renderListings() {
    const el = $('listings');
    const total = state.myListings.filter(p => p.status === 'listed').reduce((n, p) => n + p.quantity, 0);
    if (!state.myListings.length) {
      el.innerHTML = `<p class="p-8 text-sm text-slate-500 text-center">You have no listings yet. Click “Add new item”.</p>`; return;
    }
    el.innerHTML = `<div class="px-5 py-3 flex justify-between text-xs font-bold text-slate-500 bg-slate-50"><span>${state.myListings.length} listing(s)</span><span>Total available stock: ${total} item(s)</span></div>` +
      state.myListings.map(p => `
      <div class="p-4 flex flex-wrap items-center gap-4">
        ${img(p.image_url, p.name, 'w-16 h-16 shrink-0')}
        <div class="flex-1 min-w-[12rem]">
          <p class="font-bold">${esc(p.name)}</p>
          <p class="text-xs text-slate-500">${esc(p.category)} · ${money(p.price)} · Status: <b class="${p.status === 'listed' ? 'text-emerald-700' : 'text-slate-500'}">${p.status === 'listed' ? 'Listed' : 'Hidden'}</b></p>
          ${p.quantity <= 0 ? '<p class="text-xs font-bold text-red-700">Sold out</p>' : p.quantity <= LOW_STOCK ? `<p class="text-xs font-bold text-amber-700">Low stock alert: only ${p.quantity} left</p>` : ''}
        </div>
        <form data-stock="${p.id}" class="flex items-center gap-2">
          <label class="sr-only" for="q-${p.id}">Stock for ${esc(p.name)}</label>
          <input id="q-${p.id}" type="number" min="0" value="${p.quantity}" class="w-20 border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:border-burgundy">
          <button class="${BTN_LINE}">Update stock</button>
        </form>
        <div class="flex gap-2">
          <button data-edit="${p.id}" class="${BTN_LINE}">Edit</button>
          ${p.quantity > 0 ? `<button data-sold="${p.id}" class="${BTN_LINE}">Mark as sold</button>` : ''}
          <button data-toggle="${p.id}" class="${BTN_LINE}">${p.status === 'listed' ? 'Hide' : 'List again'}</button>
          <button data-del="${p.id}" class="${BTN} text-red-700 hover:bg-red-50">Delete</button>
        </div>
      </div>`).join('');
  }

  // ───────── seller: orders ─────────
  function renderSellerOrders() {
    const cols = [
      ['pending_payment', 'Pending payments', 'confirm_payment', 'Confirm payment'],
      ['ready_to_ship', 'Pending shipment', 'ship', 'Mark as shipped'],
      ['shipped', 'Shipped', 'complete', 'Mark completed'],
      ['completed', 'Completed orders', null, null]
    ];
    $('seller-orders').innerHTML = cols.map(([st, title, act, label]) => {
      const list = state.sellerOrders.filter(o => o.status === st);
      return `<div class="bg-white border border-slate-200">
        <h3 class="px-4 py-3 border-b border-slate-200 text-sm font-bold flex justify-between">${title}<span class="text-slate-400">${list.length}</span></h3>
        <div class="divide-y divide-slate-100">${list.length ? list.map(o => `
          <div class="p-4 text-sm">
            <p class="text-[11px] font-mono text-slate-500 break-all">Order ID ${esc(o.id)}</p>
            <p class="text-[11px] text-slate-400">Ordered ${when(o.created_at)}</p>
            <p class="font-bold mt-1">${orderItems(o)}</p>
            <p class="text-xs text-slate-500 mt-0.5">Buyer: ${esc(o.buyer_name)} (${esc(o.buyer_email)})</p>
            <p class="text-xs mt-0.5">Payment: ${o.status === 'pending_payment' ? '<b class="text-amber-700">waiting for confirmation</b>' : o.status === 'cancelled' ? '<b class="text-slate-500">cancelled</b>' : `<b class="text-emerald-700">received</b>${o.paid_at ? ' · ' + when(o.paid_at) : ''}`}</p>
            <p class="text-xs text-slate-500">${o.shipping_method === 'delivery' ? 'Home delivery' : 'In-person pickup'} · Total ${money(o.total)}</p>
            <p class="text-[11px] text-slate-400 mt-0.5">Last updated ${when(o.updated_at)}</p>
            ${act ? `<div class="flex gap-2 mt-3">
              <button data-act="${act}" data-order="${o.id}" class="${BTN_DARK}">${label}</button>
              ${st === 'pending_payment' ? `<button data-act="cancel" data-order="${o.id}" class="${BTN_LINE}">Cancel</button>` : ''}
            </div>` : ''}
          </div>`).join('') : '<p class="p-4 text-xs text-slate-400">There are no orders here.</p>'}</div>
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
    sel.innerHTML = '<option value="">All months</option>' + all.map(r => `<option value="${r.month}">${r.month.replace('-', '/')}</option>`).join('');
    if (all.some(r => r.month === keep)) sel.value = keep;
    const rows = sel.value ? all.filter(r => r.month === sel.value) : all;
    $('fin-rows').innerHTML = rows.length ? rows.map(r => `
      <tr><td class="px-4 py-3 font-bold">${r.month.replace('-', '/')}</td><td class="px-4 py-3">${r.orders}</td><td class="px-4 py-3">${r.items}</td>
        <td class="px-4 py-3 text-right font-bold">${money(r.revenue)}</td><td class="px-4 py-3 text-right text-slate-500">−${money(r.fees)}</td>
        <td class="px-4 py-3 text-right font-bold text-emerald-800">${money(r.revenue - r.fees)}</td></tr>`).join('')
      : '<tr><td colspan="6" class="px-4 py-6 text-center text-slate-500">No completed sales yet.</td></tr>';
    const hist = state.sellerOrders.filter(o => !sel.value || (o.created_at || '').slice(0, 7) === sel.value);
    $('sales-history').innerHTML = hist.length ? `<table class="w-full text-sm text-left min-w-[720px]">
      <thead class="bg-slate-100 text-[11px] uppercase tracking-wider text-slate-600"><tr>
        <th class="px-4 py-3">Order</th><th class="px-4 py-3">Date</th><th class="px-4 py-3">Buyer</th><th class="px-4 py-3">Items</th><th class="px-4 py-3">Status</th><th class="px-4 py-3 text-right">Total</th></tr></thead>
      <tbody class="divide-y divide-slate-200">${hist.map(o => `<tr>
        <td class="px-4 py-3 font-mono text-xs">${shortId(o.id)}</td><td class="px-4 py-3 text-xs">${when(o.created_at)}</td>
        <td class="px-4 py-3 text-xs">${esc(o.buyer_name)}</td><td class="px-4 py-3 text-xs">${orderItems(o)}</td>
        <td class="px-4 py-3">${pill(o.status)}</td><td class="px-4 py-3 text-right font-bold">${money(o.total)}</td></tr>`).join('')}</tbody></table>`
      : '<p class="p-6 text-sm text-slate-500 text-center">No sales yet.</p>';
  }
  function exportCsv() {
    const sel = $('fin-month').value;
    const list = state.sellerOrders.filter(o => !sel || (o.created_at || '').slice(0, 7) === sel);
    if (!list.length) return flash('There are no transactions to export.', true);
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['order_id', 'created_at', 'status', 'buyer_name', 'buyer_email', 'items', 'shipping_method', 'subtotal', 'shipping_fee', 'platform_fee', 'total', 'paid_at', 'shipped_at', 'completed_at'];
    const lines = list.map(o => [o.id, o.created_at, o.status, o.buyer_name, o.buyer_email,
      o.market_order_items.map(i => `${i.product_name} x${i.qty} @${i.unit_price}`).join('; '),
      o.shipping_method, o.subtotal, o.shipping_fee, o.platform_fee, o.total, o.paid_at, o.shipped_at, o.completed_at].map(q).join(','));
    const blob = new Blob(['﻿' + [head.join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `immba-market-sales-${sel || 'all'}.csv` });
    a.click(); URL.revokeObjectURL(a.href);
  }

  // ───────── render all ─────────
  function render() {
    renderAccount(); renderSummary();
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
  const dlgHead = t => `<div class="flex items-center justify-between px-6 py-4 border-b border-slate-200"><h2 class="font-serif text-xl font-bold">${t}</h2><button data-close class="text-2xl leading-none text-slate-400 hover:text-slate-900" aria-label="Close">×</button></div>`;

  function openDetail(id) {
    const p = state.products.find(x => x.id === id); if (!p) return;
    const own = p.seller_id === me();
    openDialog(`${dlgHead(esc(p.name))}
      <div class="grid sm:grid-cols-2">
        ${img(p.image_url, p.name, 'w-full aspect-square')}
        <div class="p-6 flex flex-col">
          <p class="text-[10px] uppercase tracking-widest font-bold text-slate-400">${esc(p.category)}</p>
          <p class="font-serif text-3xl font-bold text-burgundy mt-1">${money(p.price)}</p>
          <div class="mt-2">${stockBadge(p.quantity)}</div>
          <p class="text-sm text-slate-700 mt-4 whitespace-pre-line">${esc(p.description) || '<span class="text-slate-400">No description provided.</span>'}</p>
          <p class="text-xs text-slate-500 mt-4">Seller: ${esc(p.seller_name)} · listed ${when(p.created_at)}</p>
          ${own || p.quantity <= 0 ? '' : `
          <form id="detail-add" class="mt-auto pt-6 flex items-end gap-2">
            <label class="flex-none"><span class="${LABEL}">Quantity</span>
              <input name="qty" type="number" min="1" max="${p.quantity}" value="1" class="w-20 ${FIELD}"></label>
            <button class="${BTN_DARK} flex-1 !py-2.5">Add to cart</button>
          </form>`}
        </div>
      </div>`);
    const f = $('detail-add');
    if (f) f.addEventListener('submit', async e => { e.preventDefault(); await addToCart(p.id, Math.max(1, +f.qty.value || 1)); dlg.close(); });
  }

  async function openNotes() {
    openDialog(`${dlgHead('Notifications')}
      <div class="max-h-[60vh] overflow-y-auto divide-y divide-slate-100">
        ${state.notes.length ? state.notes.map(n => `
          <div class="px-6 py-3 ${n.read_at ? '' : 'bg-amber-50'}">
            <p class="text-sm ${n.read_at ? 'text-slate-600' : 'font-semibold'}">${esc(n.message)}</p>
            <p class="text-[11px] text-slate-400 mt-0.5">${when(n.created_at)}</p>
          </div>`).join('') : '<p class="px-6 py-8 text-sm text-slate-500 text-center">No notifications yet. You will see new orders and status changes here.</p>'}
      </div>`);
    const unread = state.notes.filter(n => !n.read_at).map(n => n.id);
    if (unread.length) {
      await sb.from('market_notifications').update({ read_at: new Date().toISOString() }).in('id', unread);
      state.notes.forEach(n => { if (!n.read_at) n.read_at = new Date().toISOString(); });
      renderAccount();
    }
  }

  function openAuth(mode) {
    const reg = mode === 'register';
    openDialog(`${dlgHead(reg ? 'Create a market account' : 'Log in')}
      <form id="auth-form" class="p-6 space-y-4" novalidate>
        ${reg ? `<div><label class="${LABEL}" for="a-name">Full name</label><input id="a-name" class="${FIELD}" autocomplete="name" maxlength="80"></div>` : ''}
        <div><label class="${LABEL}" for="a-email">Email</label><input id="a-email" type="email" class="${FIELD}" autocomplete="username"></div>
        <div><label class="${LABEL}" for="a-pw">Password</label><input id="a-pw" type="password" class="${FIELD}" autocomplete="${reg ? 'new-password' : 'current-password'}"></div>
        <p id="a-err" class="hidden text-sm text-red-700" role="alert"></p>
        <p id="a-info" class="hidden text-sm text-emerald-800" role="status"></p>
        <button class="${BTN_DARK} w-full !py-3">${reg ? 'Create account' : 'Log in'}</button>
        <p class="text-sm text-center text-slate-600">${reg ? 'Already have an account?' : 'New here?'}
          <button type="button" data-auth="${reg ? 'login' : 'register'}" class="font-bold text-burgundy hover:underline">${reg ? 'Log in' : 'Create an account'}</button></p>
        ${reg ? '<p class="text-[11px] text-slate-500">After registering, confirm your email from the link we send you. Then you can buy and sell.</p>' : ''}
      </form>`);
    $('auth-form').addEventListener('submit', async e => {
      e.preventDefault();
      const err = m => { $('a-err').textContent = m; $('a-err').classList.remove('hidden'); };
      const email = $('a-email').value.trim(), pw = $('a-pw').value;
      if (!/^\S+@\S+\.\S+$/.test(email)) return err('Enter a valid email address.');
      if (pw.length < 6) return err('The password needs at least 6 characters.');
      try {
        if (reg) {
          const name = $('a-name').value.trim();
          if (name.length < 2) return err('Enter your full name (buyers and sellers see it).');
          const { data, error } = await sb.auth.signUp({ email, password: pw,
            options: { emailRedirectTo: location.origin + location.pathname, data: { full_name: name, account_type: 'market' } } });
          if (error) throw error;
          if (data.session) { dlg.close(); return; }
          $('a-info').textContent = 'Account created. Open the confirmation email and click the link, then log in.';
          $('a-info').classList.remove('hidden'); $('a-err').classList.add('hidden');
        } else {
          const { error } = await sb.auth.signInWithPassword({ email, password: pw });
          if (error) throw error;
          dlg.close();
        }
      } catch (ex) { err(friendly(ex)); }
    });
  }

  function openListingForm(p) {
    const edit = !!p; p = p || { name: '', category: 'Other', description: '', price: '', quantity: 1, image_url: '', status: 'listed' };
    openDialog(`${dlgHead(edit ? 'Edit item' : 'Add new item')}
      <form id="lf" class="p-6 grid sm:grid-cols-2 gap-4" novalidate>
        <div class="sm:col-span-2"><label class="${LABEL}" for="l-name">Product name *</label><input id="l-name" class="${FIELD}" maxlength="120" value="${esc(p.name)}"></div>
        <div><label class="${LABEL}" for="l-cat">Category</label><select id="l-cat" class="${FIELD}">${CATEGORIES.map(c => `<option ${c === p.category ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
        <div><label class="${LABEL}" for="l-status">Listing status</label><select id="l-status" class="${FIELD}">
          <option value="listed" ${p.status === 'listed' ? 'selected' : ''}>Listed (visible)</option><option value="hidden" ${p.status === 'hidden' ? 'selected' : ''}>Hidden</option></select></div>
        <div><label class="${LABEL}" for="l-price">Price (NT$) *</label><input id="l-price" type="number" min="0" class="${FIELD}" value="${esc(p.price)}"></div>
        <div><label class="${LABEL}" for="l-qty">Quantity *</label><input id="l-qty" type="number" min="0" class="${FIELD}" value="${esc(p.quantity)}"></div>
        <div class="sm:col-span-2"><label class="${LABEL}" for="l-desc">Description</label><textarea id="l-desc" rows="3" maxlength="2000" class="${FIELD}">${esc(p.description)}</textarea></div>
        <div class="sm:col-span-2"><label class="${LABEL}" for="l-img">Product image (JPG, PNG or WebP, max 3 MB)</label>
          ${p.image_url ? `<img src="${esc(p.image_url)}" alt="" class="w-24 h-24 object-cover mb-2">` : ''}
          <input id="l-img" type="file" accept="image/jpeg,image/png,image/webp" class="text-sm"></div>
        <p id="l-err" class="hidden sm:col-span-2 text-sm text-red-700" role="alert"></p>
        <div class="sm:col-span-2 flex justify-end gap-2"><button type="button" data-close class="${BTN_LINE}">Cancel</button><button id="l-save" class="${BTN_DARK}">${edit ? 'Save changes' : 'List item'}</button></div>
      </form>`);
    $('lf').addEventListener('submit', async e => {
      e.preventDefault();
      const err = m => { $('l-err').textContent = m; $('l-err').classList.remove('hidden'); };
      const row = { name: $('l-name').value.trim(), category: $('l-cat').value, status: $('l-status').value,
        price: Math.round(+$('l-price').value), quantity: Math.round(+$('l-qty').value), description: $('l-desc').value.trim(), image_url: p.image_url || '' };
      if (row.name.length < 2) return err('Give the product a name.');
      if (!($('l-price').value !== '' && row.price >= 0)) return err('Enter a price of 0 or more.');
      if (!($('l-qty').value !== '' && row.quantity >= 0)) return err('Enter a quantity of 0 or more.');
      $('l-save').disabled = true;
      try {
        const file = $('l-img').files[0];
        if (file) {
          if (file.size > 3 * 1024 * 1024) throw new Error('The image must be under 3 MB.');
          const path = `${me()}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`;
          const up = await sb.storage.from('market-images').upload(path, file, { contentType: file.type });
          if (up.error) throw up.error;
          row.image_url = sb.storage.from('market-images').getPublicUrl(path).data.publicUrl;
        }
        const res = edit ? await sb.from('market_products').update(row).eq('id', p.id).select('id')
                         : await sb.from('market_products').insert(row).select('id');
        if (res.error) throw res.error;
        dlg.close(); flash(edit ? 'Item updated.' : 'Item listed. Buyers can see it now.'); await refresh();
      } catch (ex) { err(friendly(ex)); $('l-save').disabled = false; }
    });
  }

  // ───────── actions ─────────
  async function addToCart(id, qty) {
    if (!me()) return openAuth('login');
    const p = state.products.find(x => x.id === id);
    const cur = state.cart.find(c => c.product_id === id);
    const next = Math.min((cur ? cur.qty : 0) + qty, p ? p.quantity : qty);
    const { error } = cur
      ? await sb.from('market_cart').update({ qty: next }).eq('user_id', me()).eq('product_id', id)
      : await sb.from('market_cart').insert({ product_id: id, qty: next });
    if (error) return flash(friendly(error), true);
    flash(`Added to your cart: ${p ? p.name : 'item'}.`); await refresh();
  }
  async function setQty(id, d) {
    const c = state.cart.find(x => x.product_id === id); if (!c) return;
    const next = c.qty + d;
    const res = next <= 0 ? await sb.from('market_cart').delete().eq('user_id', me()).eq('product_id', id)
                          : await sb.from('market_cart').update({ qty: next }).eq('user_id', me()).eq('product_id', id);
    if (res.error) flash(friendly(res.error), true);
    await refresh();
  }
  async function checkout() {
    const btn = $('btn-checkout'); btn.disabled = true;
    const { data, error } = await sb.rpc('market_place_order', { p_shipping: state.shipping });
    if (error) { btn.disabled = false; return flash(friendly(error), true); }
    const n = Array.isArray(data) ? data.length : 1;
    flash(`Order placed (${n} order${n > 1 ? 's' : ''}). The seller has been notified: follow the status under “My orders”.`);
    await refresh();
    $('orders-title').scrollIntoView({ behavior: 'smooth' });
  }
  const CONFIRM = { cancel: 'Cancel this order? The items go back into stock.', complete: 'Mark this order as completed?' };
  const DONE = { confirm_payment: 'Payment confirmed. The order is ready to ship.', ship: 'Marked as shipped. The buyer can see it.', complete: 'Order completed. It stays in the sales history.', cancel: 'Order cancelled and stock returned.' };
  async function advance(orderId, action) {
    if (CONFIRM[action] && !confirm(CONFIRM[action])) return;
    const { error } = await sb.rpc('market_advance_order', { p_order: orderId, p_action: action });
    if (error) return flash(friendly(error), true);
    flash(DONE[action]); await refresh();
  }

  // ───────── events ─────────
  document.addEventListener('click', async e => {
    const t = e.target.closest('button, [data-auth]'); if (!t) return;
    if (t.dataset.auth) return openAuth(t.dataset.auth);
    if (t.id === 'btn-logout') { await sb.auth.signOut(); return; }
    if (t.dataset.detail) return openDetail(t.dataset.detail);
    if (t.dataset.add) return addToCart(t.dataset.add, 1);
    if (t.dataset.qty) return setQty(t.dataset.qty, +t.dataset.d);
    if (t.dataset.remove) return setQty(t.dataset.remove, -Infinity);
    if (t.id === 'btn-checkout') return checkout();
    if (t.dataset.act) return advance(t.dataset.order, t.dataset.act);
    if (t.id === 'btn-new') return openListingForm(null);
    if (t.id === 'btn-csv') return exportCsv();
    if (t.id === 'f-clear') { $('filters').reset(); $('f-stock').checked = true; return renderProducts(); }
    if (t.dataset.edit) return openListingForm(state.myListings.find(p => p.id === t.dataset.edit));
    if (t.id === 'btn-notes') return openNotes();
    if (t.dataset.sold) {
      const p = state.myListings.find(x => x.id === t.dataset.sold);
      if (!confirm(`Mark “${p.name}” as sold? Its available stock becomes 0 (sold elsewhere, e.g. in person).`)) return;
      const { error } = await sb.from('market_products').update({ quantity: 0 }).eq('id', p.id);
      if (error) return flash(friendly(error), true);
      flash('Marked as sold.'); return refresh();
    }
    if (t.dataset.toggle) {
      const p = state.myListings.find(x => x.id === t.dataset.toggle);
      const { error } = await sb.from('market_products').update({ status: p.status === 'listed' ? 'hidden' : 'listed' }).eq('id', p.id);
      if (error) return flash(friendly(error), true);
      flash(p.status === 'listed' ? 'Listing hidden from buyers.' : 'Listed again.'); return refresh();
    }
    if (t.dataset.del) {
      const p = state.myListings.find(x => x.id === t.dataset.del);
      if (!confirm(`Delete “${p.name}”? Past orders keep their record. To pause sales instead, use Hide.`)) return;
      const { error } = await sb.from('market_products').delete().eq('id', p.id);
      if (error) return flash(friendly(error), true);
      flash('Listing deleted.'); return refresh();
    }
  });
  document.addEventListener('change', e => {
    if (e.target.name === 'mode') {
      state.mode = e.target.value;
      try { localStorage.setItem('market_mode', state.mode); } catch { /* per-browser convenience only */ }
      render(); return;
    }
    if (e.target.name === 'ship') { state.shipping = e.target.value; renderCart(); return; }
    if (e.target.id === 'fin-month') renderFinance();
    if (e.target.closest('#filters')) renderProducts();
  });
  document.addEventListener('submit', async e => {
    const f = e.target.closest('form[data-stock]'); if (!f) return;
    e.preventDefault();
    const qty = Math.round(+f.querySelector('input').value);
    if (!(qty >= 0)) return flash('Stock must be 0 or more.', true);
    const { error } = await sb.from('market_products').update({ quantity: qty }).eq('id', f.dataset.stock);
    if (error) return flash(friendly(error), true);
    flash('Stock updated.'); refresh();
  });
  $('f-q').addEventListener('input', renderProducts);

  // ───────── start ─────────
  $('f-cat').insertAdjacentHTML('beforeend', CATEGORIES.map(c => `<option>${c}</option>`).join(''));
  async function onAuth(session) {
    state.session = session;
    state.profile = null;
    if (session) {
      const { data } = await sb.from('profiles').select('full_name, email, role, market_status').eq('user_id', session.user.id).maybeSingle();
      state.profile = data;
    }
    await refresh();
  }
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') setTimeout(() => onAuth(session), 0);
  });
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
    if (fresh > 0) flash(`${fresh} new notification${fresh > 1 ? 's' : ''}: ${data[0].message}`);
  }, 30000);
})();

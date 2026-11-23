/**
 * Market transactions (admin-transactions.html): the platform admin's view of every imMBA Market order.
 * Read-only monitoring: search by order ID / buyer / seller, filter by status and date, flag stuck orders,
 * totals (count, amount, platform fees) and CSV export. Only the super admin may change the platform fee.
 * The database allows admins to READ orders only (supabase/marketplace.sql), so this page cannot alter them.
 */
(() => {
  const $ = id => document.getElementById(id);
  const cfg = window.SUPABASE_CONFIG;
  let sb = null, orders = [], settings = null, members = [], listings = [], meId = null, view = 'tx';

  const STATUS = {
    pending_payment: ['Waiting for payment', 'bg-amber-100 text-amber-900'],
    ready_to_ship:   ['Ready to ship', 'bg-sky-100 text-sky-900'],
    shipped:         ['Shipped', 'bg-indigo-100 text-indigo-900'],
    completed:       ['Completed', 'bg-emerald-100 text-emerald-900'],
    cancelled:       ['Cancelled', 'bg-slate-200 text-slate-600']
  };
  const STUCK_DAYS = 7;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => 'NT$' + Number(n || 0).toLocaleString('en-US');
  const when = d => d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  const stuck = o => !['completed', 'cancelled'].includes(o.status) && Date.now() - new Date(o.updated_at) > STUCK_DAYS * 864e5;

  function flash(msg, bad) {
    const el = $('status-msg');
    el.textContent = msg;
    el.className = `mb-4 text-sm font-semibold ${bad ? 'text-red-700' : 'text-green-800'}`;
  }
  const errText = e => (e && e.message) || String(e);

  async function load() {
    const [o, s] = await Promise.all([
      sb.from('market_orders').select('*, market_order_items(*)').order('created_at', { ascending: false }),
      sb.from('market_settings').select('*').eq('id', 1).maybeSingle()
    ]);
    if (o.error) throw o.error;
    orders = o.data; settings = s.data;
    const [m, l] = await Promise.all([
      sb.rpc('market_admin_members'),
      sb.from('market_products').select('*').order('updated_at', { ascending: false })
    ]);
    if (m.error) throw m.error;
    if (l.error) throw l.error;
    members = m.data || []; listings = l.data || [];
    if (settings) { $('fee').value = settings.platform_fee; $('delivery').value = settings.delivery_fee; }
  }

  function filtered() {
    const q = $('f-q').value.trim().toLowerCase(), st = $('f-status').value, from = $('f-from').value, to = $('f-to').value;
    return orders.filter(o =>
      (!q || [o.id, o.buyer_name, o.buyer_email, o.seller_name, o.seller_email].join(' ').toLowerCase().includes(q)) &&
      (!st || (st === 'attention' ? stuck(o) : o.status === st)) &&
      (!from || o.created_at.slice(0, 10) >= from) && (!to || o.created_at.slice(0, 10) <= to));
  }

  function render() {
    const live = orders.filter(o => o.status !== 'cancelled');
    const tile = (l, v, sub) => `<div class="bg-white border border-slate-200 p-4"><p class="text-[11px] uppercase tracking-wider font-bold text-slate-500">${l}</p><p class="font-serif text-2xl font-bold mt-1">${v}</p><p class="text-[11px] text-slate-500">${sub}</p></div>`;
    $('totals').innerHTML =
      tile('Number of transactions', orders.length, `${live.length} not cancelled`) +
      tile('Total transaction amount', money(live.reduce((n, o) => n + o.total, 0)), 'excluding cancelled orders') +
      tile('Total platform fees', money(live.reduce((n, o) => n + o.platform_fee, 0)), `currently ${money(settings ? settings.platform_fee : 0)} per transaction`) +
      tile('Needs attention', orders.filter(stuck).length, `open, no change for ${STUCK_DAYS}+ days`);

    const list = filtered();
    $('count').textContent = `${list.length} of ${orders.length} transactions`;
    $('empty-msg').classList.toggle('hidden', list.length > 0);
    $('empty-msg').textContent = orders.length ? 'No transactions match these filters.' : 'No marketplace transactions yet.';
    $('rows').innerHTML = list.map(o => `
      <tr class="align-top ${stuck(o) ? 'bg-amber-50/60' : ''}">
        <td class="px-4 py-3"><p class="font-mono text-xs font-bold">${esc(o.id)}</p>
          <p class="text-[11px] text-slate-500">Placed ${when(o.created_at)}</p><p class="text-[11px] text-slate-500">Updated ${when(o.updated_at)}</p></td>
        <td class="px-4 py-3 text-xs"><p class="font-bold">${esc(o.buyer_name)}</p><p class="text-slate-500">${esc(o.buyer_email)}</p></td>
        <td class="px-4 py-3 text-xs"><p class="font-bold">${esc(o.seller_name)}</p><p class="text-slate-500">${esc(o.seller_email)}</p></td>
        <td class="px-4 py-3 text-xs">${o.market_order_items.map(i => `${esc(i.product_name)} ×${i.qty}`).join('<br>')}
          <p class="text-slate-400 mt-1">${o.shipping_method === 'delivery' ? 'Home delivery' : 'Pickup'}</p></td>
        <td class="px-4 py-3"><span class="inline-block px-2 py-0.5 text-[11px] font-bold ${STATUS[o.status][1]}">${STATUS[o.status][0]}</span>
          ${stuck(o) ? '<p class="text-[11px] font-bold text-amber-800 mt-1">Needs attention</p>' : ''}</td>
        <td class="px-4 py-3 text-right text-xs"><p class="font-bold text-sm">${money(o.total)}</p><p class="text-slate-500">Subtotal ${money(o.subtotal)}</p><p class="text-slate-500">Shipping ${money(o.shipping_fee)}</p></td>
        <td class="px-4 py-3 text-right font-bold">${money(o.platform_fee)}</td>
      </tr>`).join('');
  }

  function renderMembers() {
    const q = $('m-q').value.trim().toLowerCase();
    const list = members.filter(m => !q || `${m.full_name} ${m.email}`.toLowerCase().includes(q));
    $('m-rows').innerHTML = list.length ? list.map(m => {
      const susp = m.market_status === 'suspended';
      return `<tr class="${susp ? 'bg-red-50/60' : ''}">
        <td class="px-4 py-3"><p class="font-bold">${esc(m.full_name || '—')}</p><p class="text-xs text-slate-500">${esc(m.email)}</p></td>
        <td class="px-4 py-3 text-xs">${when(m.joined)}</td>
        <td class="px-4 py-3 text-xs">${m.active_listings} listed / ${m.listings}</td>
        <td class="px-4 py-3">${m.orders_bought}</td><td class="px-4 py-3">${m.orders_sold}</td>
        <td class="px-4 py-3 text-right font-bold">${money(m.sales_amount)}</td>
        <td class="px-4 py-3"><span class="inline-block px-2 py-0.5 text-[11px] font-bold ${susp ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-900'}">${susp ? 'Suspended' : 'Active'}</span></td>
        <td class="px-4 py-3 text-right">${m.user_id === meId ? '<span class="text-xs text-slate-400">This is you</span>'
          : `<button data-member="${m.user_id}" data-to="${susp ? 'active' : 'suspended'}" class="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider ${susp ? 'bg-slate-900 hover:bg-burgundy text-white' : 'border border-red-300 text-red-700 hover:bg-red-50'}">${susp ? 'Reactivate' : 'Suspend'}</button>`}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="8" class="px-4 py-6 text-center text-slate-500">No members found.</td></tr>';
  }

  function renderListings() {
    const q = $('l-q').value.trim().toLowerCase(), st = $('l-status').value;
    const list = listings.filter(p => (!q || `${p.name} ${p.seller_name}`.toLowerCase().includes(q)) &&
      (!st || (st === 'soldout' ? p.quantity <= 0 : p.status === st)));
    $('l-rows').innerHTML = list.length ? list.map(p => `<tr>
        <td class="px-4 py-3 font-bold">${esc(p.name)}</td><td class="px-4 py-3 text-xs">${esc(p.seller_name)}</td>
        <td class="px-4 py-3 text-xs">${esc(p.category)}</td><td class="px-4 py-3 text-right">${money(p.price)}</td>
        <td class="px-4 py-3 text-right ${p.quantity <= 0 ? 'text-red-700 font-bold' : ''}">${p.quantity <= 0 ? 'Sold out' : p.quantity}</td>
        <td class="px-4 py-3 text-xs font-bold ${p.status === 'listed' ? 'text-emerald-700' : 'text-slate-500'}">${p.status === 'listed' ? 'Listed' : 'Hidden'}</td>
        <td class="px-4 py-3 text-xs">${when(p.updated_at)}</td></tr>`).join('')
      : '<tr><td colspan="7" class="px-4 py-6 text-center text-slate-500">No listings found.</td></tr>';
  }

  function showView(v) {
    view = v;
    ['tx', 'members', 'listings'].forEach(k => $('view-' + k).classList.toggle('hidden', k !== v));
    document.querySelectorAll('#views [data-view]').forEach(b => {
      const on = b.dataset.view === v;
      b.setAttribute('aria-selected', String(on));
      b.className = `px-4 py-2 border ${on ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 hover:border-slate-900'}`;
    });
    if (v === 'members') renderMembers();
    if (v === 'listings') renderListings();
  }

  function exportCsv() {
    const list = filtered();
    if (!list.length) return flash('Nothing to export with these filters.', true);
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['order_id', 'created_at', 'updated_at', 'status', 'buyer_name', 'buyer_email', 'seller_name', 'seller_email', 'items', 'shipping_method', 'subtotal', 'shipping_fee', 'platform_fee', 'total'];
    const lines = list.map(o => [o.id, o.created_at, o.updated_at, o.status, o.buyer_name, o.buyer_email, o.seller_name, o.seller_email,
      o.market_order_items.map(i => `${i.product_name} x${i.qty} @${i.unit_price}`).join('; '), o.shipping_method, o.subtotal, o.shipping_fee, o.platform_fee, o.total].map(q).join(','));
    const blob = new Blob(['﻿' + [head.join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `immba-market-transactions-${new Date().toISOString().slice(0, 10)}.csv` });
    a.click(); URL.revokeObjectURL(a.href);
  }

  async function enterApp(session) {
    meId = session.user.id;
    $('auth').classList.add('hidden');
    $('app').classList.remove('hidden');
    $('btn-logout').classList.remove('hidden');
    const em = $('user-email');
    em.textContent = session.user.email || '';
    em.classList.toggle('hidden', !em.textContent);
    try { await load(); } catch (e) { flash(errText(e), true); orders = []; }
    render(); showView(view);
  }

  function initPage() {
    const box = $('auth');
    const problem = msg => { box.classList.remove('hidden'); box.innerHTML = `<p class="text-sm text-red-700" role="alert">${msg}</p>`; };
    if (!cfg || !cfg.url || !cfg.key) return problem('Supabase is not configured (assets/js/supabase-config.js).');
    if (!window.supabase || !window.supabase.createClient) return problem('Could not load the Supabase library. Check your internet connection and reload.');
    sb = window.supabase.createClient(cfg.url, cfg.key);

    $('btn-logout').addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });
    $('filters').addEventListener('input', render);
    $('filters').addEventListener('change', render);
    $('btn-csv').addEventListener('click', exportCsv);
    $('views').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (b) showView(b.dataset.view); });
    $('m-q').addEventListener('input', renderMembers);
    $('l-q').addEventListener('input', renderListings);
    $('l-status').addEventListener('change', renderListings);
    $('m-rows').addEventListener('click', async e => {
      const b = e.target.closest('button[data-member]'); if (!b) return;
      const m = members.find(x => x.user_id === b.dataset.member);
      const to = b.dataset.to;
      if (!confirm(to === 'suspended' ? `Suspend ${m.email}? They cannot buy, sell or update orders, and their listings are hidden.` : `Reactivate ${m.email}? They can buy and sell again (they re-list hidden items themselves).`)) return;
      b.disabled = true;
      const { error } = await sb.rpc('market_set_member_status', { p_user: m.user_id, p_status: to });
      if (error) { b.disabled = false; return flash(errText(error), true); }
      flash(to === 'suspended' ? `${m.email} is suspended.` : `${m.email} is active again.`);
      await load(); render(); showView('members');
    });
    $('fee-form').addEventListener('submit', async e => {
      e.preventDefault();
      const fee = Math.round(+$('fee').value), delivery = Math.round(+$('delivery').value);
      if (!(fee >= 0) || !(delivery >= 0)) return flash('Fees must be 0 or more.', true);
      const { data, error } = await sb.from('market_settings').update({ platform_fee: fee, delivery_fee: delivery }).eq('id', 1).select('*');
      if (error || !data.length) return flash(error ? errText(error) : 'Only the super admin can change the fees.', true);
      settings = data[0]; flash('Fees saved. New orders use them.'); render();
    });

    AdminAuth.init({ sb, area: 'marketplace transactions', onSession: enterApp });
  }

  initPage();
})();

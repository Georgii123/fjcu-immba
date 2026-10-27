/**
 * Activity Log: one place to see everything that was changed in the back office, by whom and when.
 * Reads the Supabase table `audit_log`, which the database fills in by itself (triggers) for alumni, announcements,
 * faculty and admin accounts. This page only reads: nobody can add, edit or delete log entries.
 */
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cfg = window.SUPABASE_CONFIG;
  const PAGE = 100, FETCH = 1000;

  const AREA = { alumni: 'Alumni', announcements: 'Announcements', faculty: 'Faculty', profiles: 'Admin accounts' };
  const FIELD = {
    alumni: { full_name: 'Full name', student_id: 'Student ID', department: 'Department / Program', degree_program: 'Degree level', admission_year: 'Admission year',
      graduation_year: 'Graduation year', email: 'Email', phone: 'Phone', company: 'Current company', job_title: 'Current position', notes: 'Additional information' },
    announcements: { date: 'Date', pinned: 'Pinned', order: 'Order', status: 'Status', url: 'Link', title_zh: 'Chinese title', title_en: 'English title',
      content_zh: 'Chinese content', content_en: 'English content', image_url: 'Attached file' },
    faculty: { name: 'Name', title: 'Title', education: 'Education', research_fields: 'Research fields', email: 'Email', phone: 'Phone', website: 'Website',
      image_url: 'Photo', category: 'Category' },
    profiles: { role: 'Role' }
  };
  const ACTION_STYLE = {
    CREATE: 'bg-green-100 text-green-900', UPDATE: 'bg-blue-100 text-blue-900', DELETE: 'bg-red-100 text-red-900', RESTORE: 'bg-amber-100 text-amber-900',
    REGISTER: 'bg-slate-200 text-slate-900', APPROVE: 'bg-green-200 text-green-950', REJECT: 'bg-red-200 text-red-950'
  };

  let sb = null, entries = [], limit = PAGE;

  function flash(msg) {
    const el = $('status-msg');
    el.textContent = msg; el.className = 'mb-4 text-sm font-semibold text-red-700';
  }

  const when = iso => iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';

  // A value shown in a sentence: short, readable, and never raw HTML
  function val(v) {
    if (v == null || v === '') return '(empty)';
    if (v === true) return 'yes';
    if (v === false) return 'no';
    const s = String(v);
    return s.length > 100 ? s.slice(0, 100) + '…' : s;
  }

  function describe(h) {
    const labels = FIELD[h.table_name] || {};
    const ch = h.changes || {};
    const keys = Object.keys(ch).filter(k => labels[k]);
    const old = keys.map(k => ch[k][0]);
    if (h.action === 'REGISTER') return 'Asked for back-office access';
    if (h.action === 'APPROVE') return 'Approved as admin';
    if (h.action === 'REJECT') return (ch.role && ch.role[0] === 'admin') ? 'Back-office access removed' : 'Request rejected';
    if (h.action === 'RESTORE') return 'Restored from Deleted';
    if (h.action === 'DELETE') {
      if (!keys.length) return 'Moved to Deleted';
      return 'Deleted. It contained: ' + keys.map((k, i) => `${labels[k]} = ${val(old[i])}`).join('; ');
    }
    if (h.action === 'CREATE') return keys.length ? 'New record: ' + keys.map(k => `${labels[k]} = ${val(ch[k][1])}`).join('; ') : 'New record';
    return keys.map(k => `${labels[k]}: ${val(ch[k][0])} → ${val(ch[k][1])}`).join('; ');
  }

  async function load() {
    const { data, error } = await sb.from('audit_log').select('*')
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(FETCH);
    if (error) throw error;
    entries = data || [];
    const cur = $('a-admin').value;
    const admins = [...new Set(entries.map(e => e.admin_email))].sort();
    $('a-admin').innerHTML = '<option value="">All admins</option>' + admins.map(a => `<option value="${esc(a)}">${esc(a)}</option>`).join('');
    $('a-admin').value = admins.includes(cur) ? cur : '';
  }

  function filtered() {
    const area = $('a-area').value, action = $('a-action').value, admin = $('a-admin').value;
    const q = $('a-q').value.trim().toLowerCase();
    const from = $('a-from').value ? new Date($('a-from').value + 'T00:00:00') : null;
    const to = $('a-to').value ? new Date($('a-to').value + 'T23:59:59.999') : null;
    return entries.filter(e => {
      if (area && e.table_name !== area) return false;
      if (action && e.action !== action) return false;
      if (admin && e.admin_email !== admin) return false;
      if (q && !(e.record_label || '').toLowerCase().includes(q)) return false;
      const t = new Date(e.created_at);
      if (from && t < from) return false;
      if (to && t > to) return false;
      return true;
    });
  }

  function render() {
    const list = filtered(), shown = list.slice(0, limit);
    $('a-rows').innerHTML = shown.map(h => `<tr>
      <td class="px-4 py-3 align-top whitespace-nowrap text-slate-700">${esc(when(h.created_at))}</td>
      <td class="px-4 py-3 align-top min-w-[12rem] break-words">${esc(h.admin_email)}</td>
      <td class="px-4 py-3 align-top whitespace-nowrap">${esc(AREA[h.table_name] || h.table_name)}</td>
      <td class="px-4 py-3 align-top"><span class="inline-block px-2 py-1 text-[11px] font-bold tracking-wider ${ACTION_STYLE[h.action] || ''}">${esc(h.action)}</span></td>
      <td class="px-4 py-3 align-top">${esc(h.record_label)}</td>
      <td class="px-4 py-3 align-top text-slate-700 min-w-[20rem]">${esc(describe(h))}${h.source && h.source !== 'manual' ? `<div class="text-xs text-slate-500 mt-0.5">${esc(h.source)}</div>` : ''}</td></tr>`).join('');
    $('a-count').textContent = list.length === entries.length
      ? `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}${entries.length >= FETCH ? ' (the latest ' + FETCH + ')' : ''}`
      : `${list.length} of ${entries.length} entries match`;
    $('a-empty').classList.toggle('hidden', list.length > 0);
    $('a-empty').textContent = entries.length ? 'No entries match these filters.' : 'Nothing has been logged yet.';
    $('a-more').classList.toggle('hidden', list.length <= limit);
  }

  async function reload() {
    try { await load(); $('status-msg').className = 'hidden'; } catch (e) { flash((e && e.message) || String(e)); entries = []; }
    render();
  }

  function bind() {
    const refilter = () => { limit = PAGE; render(); };
    ['a-area', 'a-action', 'a-admin', 'a-from', 'a-to'].forEach(id => $(id).addEventListener('change', refilter));
    $('a-q').addEventListener('input', refilter);
    $('a-clear').addEventListener('click', () => { ['a-area', 'a-action', 'a-admin', 'a-q', 'a-from', 'a-to'].forEach(id => { $(id).value = ''; }); refilter(); });
    $('a-refresh').addEventListener('click', reload);
    $('a-more').addEventListener('click', () => { limit += PAGE; render(); });
    $('btn-logout').addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });
  }

  async function enterApp(session) {
    $('auth').classList.add('hidden');
    $('app').classList.remove('hidden');
    $('btn-logout').classList.remove('hidden');
    const em = $('user-email');
    em.textContent = (session && session.user && session.user.email) || '';
    em.classList.toggle('hidden', !em.textContent);
    await reload();
  }

  function initPage() {
    const box = $('auth');
    const problem = msg => { box.classList.remove('hidden'); box.innerHTML = `<p class="text-sm text-red-700" role="alert">${msg}</p>`; };
    if (!cfg || !cfg.url || !cfg.key) return problem('Supabase is not configured (assets/js/supabase-config.js).');
    if (!window.supabase || !window.supabase.createClient) return problem('Could not load the Supabase library. Check your internet connection and reload.');
    sb = window.supabase.createClient(cfg.url, cfg.key);
    bind();
    AdminAuth.init({ sb, area: 'the activity log', onSession: enterApp });
  }

  initPage();
})();

/**
 * AdminRequests (super admin only): review the people who registered for the back office.
 * Data lives in the Supabase table `profiles` (one row per account, role = pending / admin / rejected / super_admin).
 * The database lets only the super admin change a role, and never their own, so this page cannot be abused
 * by anyone else even if they open it.
 */
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cfg = window.SUPABASE_CONFIG;

  const TABS = [
    { key: 'pending', label: 'Pending' },
    { key: 'admin', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
    { key: 'all', label: 'All' }
  ];
  const BADGE = {
    pending:     ['Pending', 'bg-amber-100 text-amber-900'],
    admin:       ['Admin', 'bg-green-100 text-green-900'],
    super_admin: ['Super admin', 'bg-slate-900 text-white'],
    rejected:    ['Rejected', 'bg-red-100 text-red-900']
  };

  let sb = null, me = null;
  let people = [];
  let tab = 'pending';
  let busy = false;

  function flash(msg, isError) {
    const el = $('status-msg');
    el.textContent = msg;
    el.className = 'mb-4 text-sm font-semibold ' + (isError ? 'text-red-700' : 'text-green-700');
    clearTimeout(flash._t);
    flash._t = setTimeout(() => el.classList.add('hidden'), isError ? 9000 : 5000);
  }

  function errText(e) {
    const msg = (e && (e.message || e.error_description)) || String(e);
    if (/Failed to fetch|NetworkError/i.test(msg)) return 'Cannot reach the server. Check your internet connection and try again.';
    return msg;
  }

  const when = iso => iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';

  // ---------------------------------------------------------------- data
  async function load() {
    const { data, error } = await sb.from('profiles')
      .select('user_id, email, full_name, role, email_verified, created_at, reviewed_by, reviewed_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    people = data || [];
  }

  async function setRole(person, role) {
    if (busy) return;
    busy = true; render();
    try {
      const { data, error } = await sb.from('profiles').update({ role }).eq('user_id', person.user_id).select('user_id');
      if (error) throw error;
      // Row-level security reports "not allowed" as zero changed rows, not as an error
      if (!data || data.length !== 1) throw new Error('The change was not saved. Only the super admin may do this.');
      await load();
      const who = person.full_name || person.email;
      flash(role === 'admin' ? `${who} is now an admin.` : `${who} was ${person.role === 'admin' ? 'removed from' : 'rejected for'} the back office.`);
    } catch (e) { flash(errText(e), true); }
    busy = false; render();
  }

  // ---------------------------------------------------------------- display
  function counts() {
    const c = { pending: 0, admin: 0, rejected: 0, all: people.length };
    people.forEach(p => { if (p.role === 'pending') c.pending++; else if (p.role === 'rejected') c.rejected++; else c.admin++; });
    return c;
  }

  function shown() {
    if (tab === 'all') return people;
    if (tab === 'admin') return people.filter(p => p.role === 'admin' || p.role === 'super_admin');
    return people.filter(p => p.role === tab);
  }

  function actionButtons(p) {
    const base = 'px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition disabled:opacity-40 disabled:cursor-not-allowed';
    const dis = busy ? ' disabled' : '';
    if (p.role === 'super_admin') return '<span class="text-xs text-slate-400">' + (p.user_id === me ? 'This is you' : '') + '</span>';
    const approve = p.email_verified
      ? `<button type="button" data-act="approve" data-id="${esc(p.user_id)}" class="${base} bg-green-700 hover:bg-green-800 text-white"${dis}>Approve</button>`
      : `<button type="button" class="${base} bg-green-700 text-white" disabled title="This person has not confirmed their email yet">Approve</button>`;
    const reject = `<button type="button" data-act="reject" data-id="${esc(p.user_id)}" class="${base} border border-slate-300 hover:border-red-700 hover:text-red-700"${dis}>Reject</button>`;
    const remove = `<button type="button" data-act="reject" data-id="${esc(p.user_id)}" class="${base} border border-slate-300 hover:border-red-700 hover:text-red-700"${dis}>Remove access</button>`;
    if (p.role === 'pending') return `<div class="flex flex-wrap justify-end gap-2">${approve}${reject}</div>`;
    if (p.role === 'admin') return `<div class="flex justify-end">${remove}</div>`;
    return `<div class="flex justify-end">${approve}</div>`;   // rejected: may be approved later
  }

  function render() {
    const c = counts();
    $('tabs').innerHTML = TABS.map(t => `<button type="button" role="tab" aria-selected="${t.key === tab}" data-tab="${t.key}"
      class="px-4 py-2 border transition ${t.key === tab ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-300 hover:border-burgundy hover:text-burgundy'}">${t.label} <span class="font-normal opacity-80">(${c[t.key]})</span></button>`).join('');

    const list = shown();
    $('rows').innerHTML = list.map(p => {
      const b = BADGE[p.role] || [p.role, 'bg-slate-100 text-slate-800'];
      const review = p.reviewed_at ? `${esc(p.reviewed_by || '')}<div class="text-xs text-slate-500">${esc(when(p.reviewed_at))}</div>` : '<span class="text-slate-400">&mdash;</span>';
      return `<tr>
        <td class="px-4 py-3 align-top">
          <div class="font-bold">${esc(p.full_name) || '<span class="text-slate-400 font-normal">(no name given)</span>'}</div>
          <div class="text-slate-600 break-all">${esc(p.email)}</div>
          <div class="text-xs mt-0.5 ${p.email_verified ? 'text-green-700' : 'text-amber-700'}">${p.email_verified ? 'Email confirmed' : 'Email not confirmed yet'}</div>
        </td>
        <td class="px-4 py-3 align-top whitespace-nowrap text-slate-700">${esc(when(p.created_at))}</td>
        <td class="px-4 py-3 align-top"><span class="inline-block px-2 py-1 text-[11px] font-bold uppercase tracking-wider ${b[1]}">${b[0]}</span></td>
        <td class="px-4 py-3 align-top text-slate-700">${review}</td>
        <td class="px-4 py-3 align-top text-right">${actionButtons(p)}</td>
      </tr>`;
    }).join('');

    const empty = $('empty-msg');
    empty.classList.toggle('hidden', list.length > 0);
    empty.textContent = tab === 'pending' ? 'No requests are waiting for approval.' : 'Nobody here yet.';
  }

  // ---------------------------------------------------------------- start
  async function enterApp(session) {
    me = session.user.id;
    $('auth').classList.add('hidden');
    $('app').classList.remove('hidden');
    $('btn-logout').classList.remove('hidden');
    const em = $('user-email');
    em.textContent = session.user.email || '';
    em.classList.toggle('hidden', !em.textContent);
    try { await load(); } catch (e) { flash(errText(e), true); people = []; }
    render();
  }

  function initPage() {
    const box = $('auth');
    const problem = msg => { box.classList.remove('hidden'); box.innerHTML = `<p class="text-sm text-red-700" role="alert">${msg}</p>`; };
    if (!cfg || !cfg.url || !cfg.key) return problem('Supabase is not configured (assets/js/supabase-config.js).');
    if (!window.supabase || !window.supabase.createClient) return problem('Could not load the Supabase library. Check your internet connection and reload.');
    sb = window.supabase.createClient(cfg.url, cfg.key);

    $('btn-logout').addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });
    $('tabs').addEventListener('click', e => {
      const b = e.target.closest('button[data-tab]');
      if (b) { tab = b.dataset.tab; render(); }
    });
    $('rows').addEventListener('click', e => {
      const b = e.target.closest('button[data-act]');
      if (!b || busy) return;
      const p = people.find(x => x.user_id === b.dataset.id);
      if (!p) return;
      const who = p.full_name ? `${p.full_name} (${p.email})` : p.email;
      if (b.dataset.act === 'approve') {
        if (confirm(`Approve ${who} as an administrator?\n\nThey will be able to add, edit and delete announcements and faculty.`)) setRole(p, 'admin');
      } else {
        const verb = p.role === 'admin' ? 'Remove back-office access for' : 'Reject';
        if (confirm(`${verb} ${who}?`)) setRole(p, 'rejected');
      }
    });

    AdminAuth.init({ sb, area: 'administrator requests', onSession: enterApp, requireSuper: true });
  }

  initPage();
})();

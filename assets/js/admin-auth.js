/**
 * AdminAuth: the login box shared by AdminNews and AdminFaculty.
 * Modes: log in, register, forgot password, and "choose a new password" (after the reset email link).
 * Anyone may register, but a new account is 'pending' (table public.profiles, see supabase/schema.sql) and can do
 * nothing until the super admin approves it on AdminRequests. After every login this file checks that role:
 * only 'admin' / 'super_admin' reach the page; pending and rejected people see a status message instead.
 * The database enforces the same rule (row-level security), so this screen is a convenience, not the lock.
 *
 *   AdminAuth.init({ sb, area: 'announcements', onSession(session, profile), requireSuper: false })
 * The page needs <section id="auth"> (this file fills it in). Elements marked data-super-only are shown to the super admin.
 */
// Read before supabase-js tidies the address bar: did the person arrive from a reset-password email?
const ARRIVED_FOR_RECOVERY = /type=recovery/.test(location.hash + location.search);

const AdminAuth = (() => {
  const $ = id => document.getElementById(id);
  let sb = null, onSession = null, area = '', mode = 'login', recovering = false, requireSuper = false;

  const FIELD = 'w-full border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:border-burgundy';
  const LABEL = 'block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1';
  const LINK = 'font-bold text-burgundy hover:underline';

  // Eye button inside a password box: click to show the password, click again to hide it
  const EYE = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const EYE_OFF = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 19c-7 0-11-7-11-7a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 7 11 7a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
  const pwInput = (id, autocomplete) => `<div class="relative">
            <input id="${id}" type="password" class="${FIELD} pr-11" autocomplete="${autocomplete}">
            <button type="button" data-eye="${id}" class="absolute inset-y-0 right-0 w-11 flex items-center justify-center text-slate-500 hover:text-burgundy focus:outline-none focus-visible:text-burgundy" aria-label="Show password" aria-pressed="false">${EYE}</button>
          </div>`;
  function setEye(btn, show) {
    const input = $(btn.dataset.eye);
    input.type = show ? 'text' : 'password';
    btn.innerHTML = show ? EYE_OFF : EYE;
    btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    btn.setAttribute('aria-pressed', String(show));
  }

  const TEXT = {
    login:    { title: 'Admin login',            help: () => `Sign in with your admin email and password to manage ${area}.`, submit: 'Log in' },
    register: { title: 'Register',               help: () => 'Ask for back-office access. Confirm your email, then wait for the site owner to approve your request. Choose a password of at least 6 characters.', submit: 'Create account' },
    forgot:   { title: 'Forgot password',  help: () => 'Enter your email and we will send you a link to choose a new password.', submit: 'Send reset link' },
    reset:    { title: 'Choose a new password',  help: () => 'Type the new password twice, then save it.', submit: 'Save new password' }
  };

  function render() {
    $('auth').innerHTML = `
      <h2 id="auth-title" class="font-serif text-2xl font-bold mb-2"></h2>
      <p id="auth-help" class="text-sm text-slate-600 mb-6"></p>
      <form id="auth-form" class="space-y-4" novalidate>
        <div id="wrap-name" class="hidden"><label for="auth-name" class="${LABEL}">Full name</label>
          <input id="auth-name" type="text" class="${FIELD}" autocomplete="name" maxlength="80"></div>
        <div id="wrap-email"><label for="auth-email" class="${LABEL}">Email</label>
          <input id="auth-email" type="email" class="${FIELD}" autocomplete="username"></div>
        <div id="wrap-pw"><label for="auth-pw" id="auth-pw-label" class="${LABEL}">Password</label>
          ${pwInput('auth-pw', 'current-password')}</div>
        <div id="wrap-pw2" class="hidden"><label for="auth-pw2" class="${LABEL}">Confirm password</label>
          ${pwInput('auth-pw2', 'new-password')}</div>
        <p id="auth-error" class="text-sm text-red-700 hidden" role="alert"></p>
        <p id="auth-info" class="text-sm text-green-800 hidden" role="status"></p>
        <button type="submit" id="auth-submit" class="w-full py-3 bg-slate-900 hover:bg-burgundy text-white text-xs font-bold uppercase tracking-widest transition"></button>
      </form>
      <p class="text-sm text-slate-600 mt-5 flex flex-wrap justify-center gap-x-8 gap-y-2" id="auth-links"></p>
      <p class="text-[11px] text-slate-500 mt-6 leading-relaxed">
        Only approved people can use the back office. A new account stays "pending" until the site owner approves it.
      </p>`;
    $('auth-form').addEventListener('submit', onSubmit);
    $('auth-form').addEventListener('click', e => {
      const b = e.target.closest('button[data-eye]');
      if (b) setEye(b, $(b.dataset.eye).type === 'password');
    });
    $('auth-links').addEventListener('click', e => {
      const b = e.target.closest('button[data-mode]');
      if (b) setMode(b.dataset.mode);
    });
  }

  function setMode(next, keepMessages) {
    mode = next;
    const t = TEXT[next];
    $('auth-title').textContent = t.title;
    $('auth-help').textContent = t.help();
    $('auth-submit').textContent = t.submit;
    $('wrap-name').classList.toggle('hidden', next !== 'register');
    $('wrap-email').classList.toggle('hidden', next === 'reset');
    $('wrap-pw').classList.toggle('hidden', next === 'forgot');
    $('wrap-pw2').classList.toggle('hidden', next !== 'register' && next !== 'reset');
    $('auth-pw-label').textContent = next === 'reset' ? 'New password' : 'Password';
    $('auth-pw').setAttribute('autocomplete', next === 'login' ? 'current-password' : 'new-password');
    const btn = (m, label) => `<button type="button" data-mode="${m}" class="${LINK}">${label}</button>`;
    $('auth-links').innerHTML =
      next === 'login' ? btn('register', 'Register') + btn('forgot', 'Forgot password')
      : next === 'reset' ? ''
      : btn('login', 'Back to log in');
    if (!keepMessages) { $('auth-error').classList.add('hidden'); $('auth-info').classList.add('hidden'); }
    $('auth-pw').value = ''; $('auth-pw2').value = '';
    document.querySelectorAll('#auth-form button[data-eye]').forEach(b => setEye(b, false));
  }

  const showError = msg => { $('auth-error').textContent = msg; $('auth-error').classList.remove('hidden'); $('auth-info').classList.add('hidden'); };
  const showInfo = msg => { $('auth-info').textContent = msg; $('auth-info').classList.remove('hidden'); $('auth-error').classList.add('hidden'); };

  function friendly(ex) {
    const msg = (ex && (ex.message || ex.error_description)) || String(ex);
    if (/Invalid login credentials/i.test(msg)) return 'Wrong email or password (or the email is not confirmed yet).';
    if (/rate limit|too many/i.test(msg)) return 'Too many tries. Wait a few minutes and try again.';
    if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'Cannot reach the server. Check your internet connection and try again.';
    if (/same password|different from the old/i.test(msg)) return 'Choose a password you have not used before.';
    if (/Password should be|at least/i.test(msg)) return 'The password is too short. Use at least 6 characters.';
    return msg;
  }

  async function onSubmit(e) {
    e.preventDefault();
    $('auth-error').classList.add('hidden'); $('auth-info').classList.add('hidden');
    const email = $('auth-email').value.trim();
    const pw = $('auth-pw').value, pw2 = $('auth-pw2').value;
    const name = $('auth-name').value.trim().replace(/\s+/g, ' ');
    const needEmail = mode !== 'reset';
    if (mode === 'register' && name.length < 2) return showError('Enter your full name, so the site owner knows who is asking.');
    if (needEmail && !/^\S+@\S+\.\S+$/.test(email)) return showError('Enter a valid email address.');
    if (mode !== 'forgot' && !pw) return showError(mode === 'login' ? 'Enter your password.' : 'Choose a password.');
    if ((mode === 'register' || mode === 'reset') && pw.length < 6) return showError('Use at least 6 characters.');
    if ((mode === 'register' || mode === 'reset') && pw !== pw2) return showError('The two passwords do not match.');

    const btn = $('auth-submit'); btn.disabled = true;
    const back = location.origin + location.pathname;      // where email links should bring the person
    try {
      if (mode === 'login') {
        const { data, error } = await sb.auth.signInWithPassword({ email, password: pw });
        if (error) throw error;
        await enter(data.session);
      } else if (mode === 'register') {
        const { data, error } = await sb.auth.signUp({ email, password: pw, options: { emailRedirectTo: back, data: { full_name: name } } });
        if (error) throw error;
        if (data && data.session) return enter(data.session);
        if (data && data.user && data.user.identities && data.user.identities.length === 0) {
          setMode('login'); return showInfo('This email already has an account. Log in, or use "Forgot password".');
        }
        setMode('login');
        showInfo('Request sent. Open the confirmation email we just sent and click the link. Then log in: you will see "waiting for approval" until the site owner approves you.');
      } else if (mode === 'forgot') {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: back });
        if (error) throw error;
        setMode('login');
        showInfo('If that email has an account, a link to choose a new password is on its way. Check your inbox (and spam).');
      } else if (mode === 'reset') {
        const { data, error } = await sb.auth.updateUser({ password: pw });
        if (error) throw error;
        recovering = false;
        history.replaceState(null, '', location.pathname);
        const { data: s } = await sb.auth.getSession();
        await enter(s && s.session);
      }
    } catch (ex) {
      showError(friendly(ex));
    } finally { btn.disabled = false; }
  }

  // A status screen for people who are signed in but may not use the back office (yet).
  function showStatus(title, text, backLink) {
    const box = $('auth');
    box.classList.remove('hidden');
    box.innerHTML = `
      <h2 class="font-serif text-2xl font-bold mb-2">${title}</h2>
      <p class="text-sm text-slate-600 mb-6">${text}</p>
      <div class="flex flex-wrap gap-3">
        ${backLink ? `<a href="${backLink[0]}" class="px-4 py-2.5 border border-slate-300 hover:border-burgundy hover:text-burgundy text-xs font-bold uppercase tracking-wider transition">${backLink[1]}</a>` : ''}
        <button type="button" id="auth-signout" class="px-4 py-2.5 bg-slate-900 hover:bg-burgundy text-white text-xs font-bold uppercase tracking-wider transition">Log out</button>
      </div>`;
    $('auth-signout').addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });
  }

  // After a successful login: look up the person's role and decide what they may open.
  async function enter(session) {
    if (!session) return $('auth').classList.remove('hidden');
    let profile = null;
    try {
      const { data, error } = await sb.from('profiles').select('user_id, email, full_name, role').eq('user_id', session.user.id).maybeSingle();
      if (error) throw error;
      profile = data;
    } catch (ex) {
      return showStatus('Could not check your access', friendly(ex));
    }
    const role = profile ? profile.role : 'pending';
    if (role === 'rejected') {
      return showStatus('Access not granted', 'Your request for back-office access was not approved. If you think this is a mistake, contact the site owner.');
    }
    if (role !== 'admin' && role !== 'super_admin') {
      return showStatus('Waiting for approval', 'Your email is confirmed and your request has been received. The site owner must approve it before you can use the back office. Try again later.');
    }
    if (requireSuper && role !== 'super_admin') {
      return showStatus('Super admin only', 'This page is only for the super admin. You can still use the other back-office pages.', ['admin-news.html', 'Go to AdminNews']);
    }
    if (role === 'super_admin') {
      document.querySelectorAll('[data-super-only]').forEach(el => el.classList.remove('hidden'));
      countPending();
    }
    await onSession(session, profile);
  }

  // Super admin only: show how many requests are waiting, next to the "Admin requests" link.
  async function countPending() {
    try {
      const { count, error } = await sb.from('profiles').select('user_id', { count: 'exact', head: true }).eq('role', 'pending');
      if (error || !count) return;
      document.querySelectorAll('[data-pending-badge]').forEach(el => { el.textContent = count; el.classList.remove('hidden'); });
    } catch (e) { /* the badge is only a hint */ }
  }

  async function init(opts) {
    sb = opts.sb; onSession = opts.onSession; area = opts.area || 'the website'; requireSuper = !!opts.requireSuper;
    render();
    setMode('login');

    // The reset-password email brings the person back here already signed in "for recovery":
    // show the new-password form instead of opening the back office.
    sb.auth.onAuthStateChange(event => {
      if (event === 'PASSWORD_RECOVERY') {
        recovering = true;
        $('auth').classList.remove('hidden');
        setMode('reset');
      }
    });

    const { data } = await sb.auth.getSession();
    if (recovering || ARRIVED_FOR_RECOVERY) {
      $('auth').classList.remove('hidden');
      if (mode !== 'reset') setMode('reset');
      return;
    }
    if (data && data.session) return enter(data.session);
    $('auth').classList.remove('hidden');
  }

  return { init, setMode, showError, showInfo };
})();

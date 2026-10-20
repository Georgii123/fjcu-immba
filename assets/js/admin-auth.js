/**
 * AdminAuth: the login box shared by AdminNews and AdminFaculty.
 * Modes: log in, register, forgot password, and "choose a new password" (after the reset email link).
 * Registration only works for emails on the admin list: Supabase checks that on its server (see supabase/schema.sql),
 * so nothing here can be bypassed. Even a registered account can only change data if its email is on that list.
 *
 *   AdminAuth.init({ sb, area: 'announcements', onSession(session) })
 * The page needs <section id="auth"> (this file fills it in).
 */
// Read before supabase-js tidies the address bar: did the person arrive from a reset-password email?
const ARRIVED_FOR_RECOVERY = /type=recovery/.test(location.hash + location.search);

const AdminAuth = (() => {
  const $ = id => document.getElementById(id);
  let sb = null, onSession = null, area = '', mode = 'login', recovering = false;

  const FIELD = 'w-full border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:border-burgundy';
  const LABEL = 'block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1';
  const LINK = 'font-bold text-burgundy hover:underline';

  const TEXT = {
    login:    { title: 'Admin login',            help: () => `Sign in with your admin email and password to manage ${area}.`, submit: 'Log in' },
    register: { title: 'Register',               help: () => 'Only approved emails can register. Choose a password (at least 6 characters). You will get an email to confirm the address.', submit: 'Create account' },
    forgot:   { title: 'Forgot your password?',  help: () => 'Enter your email and we will send you a link to choose a new password.', submit: 'Send reset link' },
    reset:    { title: 'Choose a new password',  help: () => 'Type the new password twice, then save it.', submit: 'Save new password' }
  };

  function render() {
    $('auth').innerHTML = `
      <h2 id="auth-title" class="font-serif text-2xl font-bold mb-2"></h2>
      <p id="auth-help" class="text-sm text-slate-600 mb-6"></p>
      <form id="auth-form" class="space-y-4" novalidate>
        <div id="wrap-email"><label for="auth-email" class="${LABEL}">Email</label>
          <input id="auth-email" type="email" class="${FIELD}" autocomplete="username"></div>
        <div id="wrap-pw"><label for="auth-pw" id="auth-pw-label" class="${LABEL}">Password</label>
          <input id="auth-pw" type="password" class="${FIELD}" autocomplete="current-password"></div>
        <div id="wrap-pw2" class="hidden"><label for="auth-pw2" class="${LABEL}">Confirm password</label>
          <input id="auth-pw2" type="password" class="${FIELD}" autocomplete="new-password"></div>
        <p id="auth-error" class="text-sm text-red-700 hidden" role="alert"></p>
        <p id="auth-info" class="text-sm text-green-800 hidden" role="status"></p>
        <button type="submit" id="auth-submit" class="w-full py-3 bg-slate-900 hover:bg-burgundy text-white text-xs font-bold uppercase tracking-widest transition"></button>
      </form>
      <p class="text-sm text-slate-600 mt-5 flex flex-wrap gap-x-5 gap-y-2" id="auth-links"></p>
      <p class="text-[11px] text-slate-500 mt-6 leading-relaxed">
        Only authorised people can use the back office. New accounts are accepted only for approved emails.
      </p>`;
    $('auth-form').addEventListener('submit', onSubmit);
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
    $('wrap-email').classList.toggle('hidden', next === 'reset');
    $('wrap-pw').classList.toggle('hidden', next === 'forgot');
    $('wrap-pw2').classList.toggle('hidden', next !== 'register' && next !== 'reset');
    $('auth-pw-label').textContent = next === 'reset' ? 'New password' : 'Password';
    $('auth-pw').setAttribute('autocomplete', next === 'login' ? 'current-password' : 'new-password');
    const btn = (m, label) => `<button type="button" data-mode="${m}" class="${LINK}">${label}</button>`;
    $('auth-links').innerHTML =
      next === 'login' ? btn('forgot', 'Forgot password?') + btn('register', 'Register')
      : next === 'reset' ? ''
      : btn('login', 'Back to log in');
    if (!keepMessages) { $('auth-error').classList.add('hidden'); $('auth-info').classList.add('hidden'); }
    $('auth-pw').value = ''; $('auth-pw2').value = '';
  }

  const showError = msg => { $('auth-error').textContent = msg; $('auth-error').classList.remove('hidden'); $('auth-info').classList.add('hidden'); };
  const showInfo = msg => { $('auth-info').textContent = msg; $('auth-info').classList.remove('hidden'); $('auth-error').classList.add('hidden'); };

  function friendly(ex) {
    const msg = (ex && (ex.message || ex.error_description)) || String(ex);
    if (/Invalid login credentials/i.test(msg)) return 'Wrong email or password (or the email is not confirmed yet).';
    if (/not authori[sz]ed|not on the approved|hook|Database error saving new user/i.test(msg)) return 'This email is not on the approved list. Ask the site owner to add it, then try again.';
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
    const needEmail = mode !== 'reset';
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
        await onSession(data.session);
      } else if (mode === 'register') {
        const { data, error } = await sb.auth.signUp({ email, password: pw, options: { emailRedirectTo: back } });
        if (error) throw error;
        if (data && data.session) return onSession(data.session);
        if (data && data.user && data.user.identities && data.user.identities.length === 0) {
          setMode('login'); return showInfo('This email already has an account. Log in, or use "Forgot password?".');
        }
        setMode('login');
        showInfo('Account created. Open the confirmation email we just sent, click the link, then come back here and log in.');
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
        await onSession(s && s.session);
      }
    } catch (ex) {
      showError(friendly(ex));
    } finally { btn.disabled = false; }
  }

  async function init(opts) {
    sb = opts.sb; onSession = opts.onSession; area = opts.area || 'the website';
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
    if (data && data.session) return onSession(data.session);
    $('auth').classList.remove('hidden');
  }

  return { init, setMode, showError, showInfo };
})();

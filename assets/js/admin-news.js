/**
 * AdminNews back-office: create, read/preview, update and delete bilingual announcements.
 * Data is read and written through NewsStore (assets/js/news-store.js).
 */
(() => {
  const PW_KEY = 'immba_admin_pw_v1';
  const SESSION_KEY = 'immba_admin_session';

  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------------------------------------------------------------- password gate
  async function sha256(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function store(kind, key, val) {
    try {
      const s = kind === 'local' ? localStorage : sessionStorage;
      if (val === undefined) return s.getItem(key);
      if (val === null) s.removeItem(key); else s.setItem(key, val);
    } catch (e) { /* storage blocked */ }
    return null;
  }

  function showError(el, msg) { el.textContent = msg; el.classList.remove('hidden'); }

  function initAuth() {
    const hasPw = !!store('local', PW_KEY);
    if (hasPw && store('session', SESSION_KEY) === '1') return showApp();

    $('auth').classList.remove('hidden');
    $('auth-title').textContent = hasPw ? 'Admin login' : 'Create an admin password';
    $('auth-help').textContent = hasPw
      ? 'Enter the password to manage announcements.'
      : 'First time here. Choose a password (at least 6 characters). You will use it to open this page.';
    $('auth-submit').textContent = hasPw ? 'Log in' : 'Save password and continue';
    $('auth-confirm-wrap').classList.toggle('hidden', hasPw);
    $('auth-pw').setAttribute('autocomplete', hasPw ? 'current-password' : 'new-password');

    $('auth-form').addEventListener('submit', async e => {
      e.preventDefault();
      const err = $('auth-error'); err.classList.add('hidden');
      const pw = $('auth-pw').value;
      if (!window.crypto || !crypto.subtle) return showError(err, 'This browser cannot secure a password here. Open the site over https.');
      if (hasPw) {
        if ((await sha256(pw)) !== store('local', PW_KEY)) return showError(err, 'Wrong password.');
      } else {
        if (pw.length < 6) return showError(err, 'Use at least 6 characters.');
        if (pw !== $('auth-pw2').value) return showError(err, 'The two passwords do not match.');
        store('local', PW_KEY, await sha256(pw));
      }
      store('session', SESSION_KEY, '1');
      $('auth').classList.add('hidden');
      showApp();
    });
  }

  function showApp() {
    $('app').classList.remove('hidden');
    $('btn-logout').classList.remove('hidden');
    refresh();
  }

  $('btn-logout').addEventListener('click', () => { store('session', SESSION_KEY, null); location.reload(); });

  // ---------------------------------------------------------------- data helpers
  let records = [];
  let editingId = null;           // null = creating a new record
  let confirmAction = null;

  function load() { records = NewsStore.all().sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0)); }

  function persist(list) {
    if (!NewsStore.save(list)) { flash('Could not save: browser storage is blocked or full.', true); return false; }
    return true;
  }

  function flash(msg, isError) {
    const el = $('status-msg');
    el.textContent = msg;
    el.className = 'mb-4 text-sm font-semibold ' + (isError ? 'text-red-700' : 'text-green-700');
    clearTimeout(flash._t);
    flash._t = setTimeout(() => el.classList.add('hidden'), 5000);
  }

  // Compare the two language versions of one record.
  function syncReport(r) {
    const issues = [];
    if (!r.title_zh.trim()) issues.push('Chinese title is empty');
    if (!r.title_en.trim()) issues.push('English title is empty');
    if (!r.content_zh.trim()) issues.push('Chinese content is empty');
    if (!r.content_en.trim()) issues.push('English content is empty');
    if (!/^https?:\/\//i.test(r.url || '')) issues.push('Link URL is missing or not a web address');
    if (r.auto_zh) issues.push('Chinese text is machine-translated and not reviewed yet');
    if (r.auto_en) issues.push('English text is machine-translated and not reviewed yet');
    const zl = r.content_zh.trim().length, el = r.content_en.trim().length;
    if (zl && el && (el < zl * 0.8 || el > zl * 8)) issues.push('The two contents differ a lot in length: check that both say the same thing');
    return { ok: issues.length === 0, issues };
  }

  // ---------------------------------------------------------------- list (Read)
  function refresh() {
    load();
    const rows = $('news-rows');
    $('empty-msg').classList.toggle('hidden', records.length > 0);
    const pub = records.filter(r => r.status === 'published').length;
    $('count-summary').textContent = `${records.length} total, ${pub} published, ${records.length - pub} draft.`;

    rows.innerHTML = records.map(r => {
      const sync = syncReport(r);
      return `
      <tr class="align-top hover:bg-slate-50">
        <td class="px-3 py-3 font-mono text-xs">${esc(r.order)}</td>
        <td class="px-3 py-3 font-mono text-xs whitespace-nowrap">${esc(r.date)}</td>
        <td class="px-3 py-3">
          <span class="inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${r.status === 'published' ? 'bg-green-100 text-green-800' : 'bg-slate-200 text-slate-700'}">${r.status === 'published' ? 'Published' : 'Draft'}</span>
          ${r.pinned ? '<span class="inline-block mt-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-burgundy text-white">Pinned</span>' : ''}
        </td>
        <td class="px-3 py-3 text-xs" lang="zh-TW">${esc(r.title_zh)}</td>
        <td class="px-3 py-3 text-xs">${esc(r.title_en)}</td>
        <td class="px-3 py-3">
          <span class="inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${sync.ok ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}" title="${esc(sync.issues.join('; ') || 'Both versions are complete')}">${sync.ok ? 'In sync' : 'Review'}</span>
        </td>
        <td class="px-3 py-3 whitespace-nowrap text-xs font-bold">
          <button type="button" data-act="preview" data-id="${esc(r.id)}" class="px-2 py-1 border border-slate-300 hover:border-slate-900 transition">Preview</button>
          <button type="button" data-act="edit" data-id="${esc(r.id)}" class="px-2 py-1 border border-slate-300 hover:border-burgundy hover:text-burgundy transition">Edit</button>
          <button type="button" data-act="delete" data-id="${esc(r.id)}" class="px-2 py-1 border border-slate-300 text-red-700 hover:bg-red-700 hover:text-white hover:border-red-700 transition">Delete</button>
        </td>
      </tr>`;
    }).join('');
  }

  $('news-rows').addEventListener('click', e => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const rec = records.find(r => r.id === btn.dataset.id);
    if (!rec) return;
    if (btn.dataset.act === 'edit') openEditor(rec);
    if (btn.dataset.act === 'preview') openPreview(rec, false);
    if (btn.dataset.act === 'delete') askDelete(rec);
  });

  // ---------------------------------------------------------------- editor (Create / Update)
  function setAutoBadges(zh, en) {
    $('auto-zh').classList.toggle('hidden', !zh);
    $('auto-en').classList.toggle('hidden', !en);
    $('auto-zh').dataset.on = zh ? '1' : '';
    $('auto-en').dataset.on = en ? '1' : '';
  }

  function openEditor(rec) {
    editingId = rec ? rec.id : null;
    const minOrder = records.length ? Math.min(...records.map(r => Number(r.order) || 0)) : 1;
    const r = rec || {
      id: '', date: new Date().toISOString().slice(0, 10), pinned: false, order: minOrder - 1, status: 'published', url: '',
      title_zh: '', title_en: '', content_zh: '', content_en: '', auto_zh: false, auto_en: false
    };
    $('editor-mode').textContent = rec ? 'Edit announcement' : 'New announcement';
    $('editor-title').textContent = rec ? (r.title_en || r.title_zh || 'Announcement') : 'Add the Chinese and English versions together';
    $('f-id').value = r.id;
    $('f-date').value = r.date;
    $('f-url').value = r.url;
    $('f-order').value = r.order;
    $('f-status').value = r.status;
    $('f-pinned').checked = !!r.pinned;
    $('f-title-zh').value = r.title_zh;
    $('f-title-en').value = r.title_en;
    $('f-content-zh').value = r.content_zh;
    $('f-content-en').value = r.content_en;
    setAutoBadges(r.auto_zh, r.auto_en);
    $('editor-error').classList.add('hidden');
    $('editor').classList.remove('hidden');
    $('editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('f-title-zh').focus({ preventScroll: true });
  }

  function closeEditor() { $('editor').classList.add('hidden'); editingId = null; }

  // Typing in a language by hand means a person has reviewed it.
  [['f-title-zh', 'zh'], ['f-content-zh', 'zh'], ['f-title-en', 'en'], ['f-content-en', 'en']].forEach(([id, lang]) => {
    $(id).addEventListener('input', () => {
      if (lang === 'zh') setAutoBadges(false, $('auto-en').dataset.on === '1');
      else setAutoBadges($('auto-zh').dataset.on === '1', false);
    });
  });

  function readForm(status) {
    return {
      id: $('f-id').value || ('n' + Date.now()),
      date: $('f-date').value,
      url: $('f-url').value.trim(),
      order: Number($('f-order').value) || 0,
      status: status || $('f-status').value,
      pinned: $('f-pinned').checked,
      title_zh: $('f-title-zh').value.trim(),
      title_en: $('f-title-en').value.trim(),
      content_zh: $('f-content-zh').value.trim(),
      content_en: $('f-content-en').value.trim(),
      auto_zh: $('auto-zh').dataset.on === '1',
      auto_en: $('auto-en').dataset.on === '1'
    };
  }

  // ---------------------------------------------------------------- translation (default auto, editable)
  function chunk(text, max) {
    const parts = text.split(/(?<=[。！？.!?])\s*/).filter(Boolean);
    const out = []; let cur = '';
    for (const p of parts) {
      if ((cur + p).length > max && cur) { out.push(cur); cur = p; } else cur += (cur && /[A-Za-z0-9]$/.test(cur) ? ' ' : '') + p;
    }
    if (cur) out.push(cur);
    return out.flatMap(c => c.length > max ? c.match(new RegExp('[\\s\\S]{1,' + max + '}', 'g')) : [c]);
  }

  async function translate(text, from, to) {
    if (!text.trim()) return '';
    const pair = from + '|' + to;
    const out = [];
    for (const part of chunk(text.trim(), 400)) {
      const res = await fetch('https://api.mymemory.translated.net/get?q=' + encodeURIComponent(part) + '&langpair=' + encodeURIComponent(pair));
      if (!res.ok) throw new Error('Translation service error ' + res.status);
      const data = await res.json();
      const t = data && data.responseData && data.responseData.translatedText;
      if (!t || Number(data.responseStatus) !== 200 || /MYMEMORY WARNING|INVALID/i.test(t)) throw new Error('Translation service is unavailable right now');
      out.push(t);
    }
    return out.join(to === 'en' ? ' ' : '');
  }

  async function runTranslate(dir, onlyMissing) {
    const err = $('editor-error'); err.classList.add('hidden');
    const zhToEn = dir === 'zh-en';
    const from = zhToEn ? 'zh' : 'en', to = zhToEn ? 'en' : 'zh';
    const srcT = $(`f-title-${from}`).value, srcC = $(`f-content-${from}`).value;
    if (!srcT.trim() && !srcC.trim()) { showError(err, `Write the ${zhToEn ? 'Chinese' : 'English'} title or content first.`); return false; }
    const btn = $(zhToEn ? 'btn-tr-zh-en' : 'btn-tr-en-zh');
    const old = btn.innerHTML; btn.disabled = true; btn.textContent = 'Translating...';
    try {
      const pair = zhToEn ? 'zh-TW' : 'en', target = zhToEn ? 'en' : 'zh-TW';
      const needT = !(onlyMissing && $(`f-title-${to}`).value.trim());
      const needC = !(onlyMissing && $(`f-content-${to}`).value.trim());
      const [t, c] = await Promise.all([needT ? translate(srcT, pair, target) : '', needC ? translate(srcC, pair, target) : '']);
      if (t) $(`f-title-${to}`).value = t;
      if (c) $(`f-content-${to}`).value = c;
      if (t || c) setAutoBadges(to === 'zh' ? true : $('auto-zh').dataset.on === '1', to === 'en' ? true : $('auto-en').dataset.on === '1');
      flash('Translated. Please read the result and edit it if needed.');
      return true;
    } catch (e) {
      showError(err, (e && e.message ? e.message : 'Translation failed') + '. You can type the translation by hand instead.');
      return false;
    } finally { btn.disabled = false; btn.innerHTML = old; }
  }

  $('btn-tr-zh-en').addEventListener('click', () => runTranslate('zh-en', false));
  $('btn-tr-en-zh').addEventListener('click', () => runTranslate('en-zh', false));

  // Create: "add the Chinese and English versions together". If one side is missing
  // (or only half filled), translate the missing fields from the other side.
  async function ensureBothLanguages() {
    const zhT = $('f-title-zh').value.trim(), zhC = $('f-content-zh').value.trim();
    const enT = $('f-title-en').value.trim(), enC = $('f-content-en').value.trim();
    if (zhT && zhC && enT && enC) return true;
    const zhFull = zhT && zhC, enFull = enT && enC;
    if (zhFull) return runTranslate('zh-en', true);
    if (enFull) return runTranslate('en-zh', true);
    if ((zhT || zhC) && !(enT || enC)) return runTranslate('zh-en', true);
    if ((enT || enC) && !(zhT || zhC)) return runTranslate('en-zh', true);
    return true;   // both sides partly filled: validation will say what is missing
  }

  function validate(r) {
    if (!r.date) return 'Choose a date.';
    if (!/^https?:\/\/\S+$/i.test(r.url)) return 'Enter a full link URL that starts with http:// or https://';
    if (!r.title_zh || !r.title_en) return 'Both the Chinese and the English title are required.';
    if (!r.content_zh || !r.content_en) return 'Both the Chinese and the English content are required.';
    return '';
  }

  async function prepare(status) {
    const err = $('editor-error'); err.classList.add('hidden');
    if (!(await ensureBothLanguages())) return null;
    const r = readForm(status);
    const msg = validate(r);
    if (msg) { showError(err, msg); return null; }
    return r;
  }

  function saveRecord(r) {
    const list = NewsStore.all();
    const i = list.findIndex(x => x.id === r.id);
    // one record, both languages: replaced as a whole
    if (i >= 0) list[i] = r; else list.push(r);
    if (!persist(list)) return false;
    closeEditor();
    refresh();
    return true;
  }

  $('btn-save-draft').addEventListener('click', async () => {
    const r = await prepare('draft');
    if (r && saveRecord(r)) flash('Saved as draft. It is hidden from the website.');
  });

  $('btn-preview').addEventListener('click', async () => {
    const r = await prepare();
    if (r) openPreview(r, false);
  });

  $('btn-publish').addEventListener('click', async () => {
    const r = await prepare('published');
    if (r) openPreview(r, true);
  });

  $('btn-cancel').addEventListener('click', closeEditor);
  $('btn-editor-close').addEventListener('click', closeEditor);
  $('btn-new').addEventListener('click', () => openEditor(null));

  // ---------------------------------------------------------------- preview (both languages)
  let previewRecord = null;

  function fmtDate(iso, lang) {
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d)) return iso;
    return lang === 'zh' ? iso.replace(/-/g, '/') : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function previewCard(r, lang) {
    const zh = lang === 'zh';
    return `
      <div>
        <div class="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-2">${zh ? '中文版本' : 'English version'}</div>
        <article class="relative flex flex-col bg-white border border-slate-200 p-6">
          <div class="flex items-center justify-between mb-3">
            <time class="text-xs font-mono text-slate-500">${esc(fmtDate(r.date, lang))}</time>
            ${r.pinned ? `<span class="px-2 py-0.5 bg-burgundy text-white text-[10px] font-bold uppercase tracking-widest">${zh ? '置頂' : 'Pinned'}</span>` : ''}
          </div>
          <h4 class="font-serif text-base font-bold text-slate-900 leading-snug mb-3" ${zh ? 'lang="zh-TW"' : ''}>${esc(zh ? r.title_zh : r.title_en)}</h4>
          <p class="text-xs text-slate-600 leading-relaxed mb-5 whitespace-pre-line" ${zh ? 'lang="zh-TW"' : ''}>${esc(zh ? r.content_zh : r.content_en)}</p>
          <a href="${esc(r.url)}" target="_blank" rel="noopener" class="inline-flex items-center text-xs font-bold text-burgundy uppercase tracking-wider hover:underline">${zh ? '查看詳情' : 'View Details'} &nearr;</a>
        </article>
      </div>`;
  }

  function openPreview(r, forPublish) {
    previewRecord = r;
    const sync = syncReport(r);
    $('preview-title').textContent = forPublish ? 'Preview before publishing' : 'Preview';
    $('preview-sync').innerHTML = sync.ok
      ? '<p class="px-3 py-2 bg-green-50 text-green-800 border border-green-200 font-semibold">Both versions are complete and look synchronized.</p>'
      : `<div class="px-3 py-2 bg-amber-50 text-amber-900 border border-amber-200"><p class="font-semibold mb-1">Please check before publishing:</p><ul class="list-disc pl-5 text-xs space-y-0.5">${sync.issues.map(i => `<li>${esc(i)}</li>`).join('')}</ul></div>`;
    $('preview-cards').innerHTML = previewCard(r, 'zh') + previewCard(r, 'en');
    $('btn-preview-confirm').classList.toggle('hidden', !forPublish);
    $('modal-preview').classList.remove('hidden');
    $('btn-preview-close').focus();
  }

  function closePreview() { $('modal-preview').classList.add('hidden'); previewRecord = null; }
  $('btn-preview-close').addEventListener('click', closePreview);
  $('btn-preview-x').addEventListener('click', closePreview);
  $('modal-preview').addEventListener('click', e => { if (e.target === $('modal-preview')) closePreview(); });

  $('btn-preview-confirm').addEventListener('click', () => {
    if (!previewRecord) return;
    const r = previewRecord;
    // Publishing means a person has now seen both versions.
    r.auto_zh = false; r.auto_en = false;
    r.status = 'published';
    closePreview();
    if (saveRecord(r)) flash('Published. It now appears on the website.');
  });

  // ---------------------------------------------------------------- delete (one action removes both languages)
  function askDelete(rec) {
    $('confirm-title').textContent = 'Delete this announcement?';
    $('confirm-text').textContent = `"${rec.title_en || rec.title_zh}" will be removed in both Chinese and English. This cannot be undone.`;
    $('btn-confirm-yes').textContent = 'Delete';
    confirmAction = () => {
      const list = NewsStore.all().filter(r => r.id !== rec.id);
      if (persist(list)) { refresh(); flash('Deleted (both language versions).'); }
    };
    $('modal-confirm').classList.remove('hidden');
    $('btn-confirm-no').focus();
  }

  $('btn-reset').addEventListener('click', () => {
    $('confirm-title').textContent = 'Restore the original data?';
    $('confirm-text').textContent = 'All announcements will go back to the original list collected from the college website. Your changes in this browser will be lost.';
    $('btn-confirm-yes').textContent = 'Restore';
    confirmAction = () => { NewsStore.reset(); closeEditor(); refresh(); flash('Original announcements restored.'); };
    $('modal-confirm').classList.remove('hidden');
    $('btn-confirm-no').focus();
  });

  $('btn-confirm-no').addEventListener('click', () => { $('modal-confirm').classList.add('hidden'); confirmAction = null; });
  $('btn-confirm-yes').addEventListener('click', () => {
    $('modal-confirm').classList.add('hidden');
    const fn = confirmAction; confirmAction = null;
    if (fn) fn();
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!$('modal-confirm').classList.contains('hidden')) $('btn-confirm-no').click();
    else if (!$('modal-preview').classList.contains('hidden')) closePreview();
  });

  initAuth();
})();

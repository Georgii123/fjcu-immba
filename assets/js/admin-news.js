/**
 * AdminNews back-office: create, read/preview, update and delete bilingual announcements.
 * Data lives in the Supabase table `announcements`; signing in uses Supabase Auth.
 * Only the admin email listed in the database may change anything (row-level security).
 */
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cfg = window.SUPABASE_CONFIG;

  let sb = null;                  // Supabase client
  let records = [];
  let editingId = null;           // null = creating a new record
  let confirmAction = null;

  function showError(el, msg) { el.textContent = msg; el.classList.remove('hidden'); }

  function flash(msg, isError) {
    const el = $('status-msg');
    el.textContent = msg;
    el.className = 'mb-4 text-sm font-semibold ' + (isError ? 'text-red-700' : 'text-green-700');
    clearTimeout(flash._t);
    flash._t = setTimeout(() => el.classList.add('hidden'), isError ? 9000 : 5000);
  }

  function errText(e) {
    const msg = (e && (e.message || e.error_description)) || String(e);
    if ((e && e.code === '42501') || /row-level security|permission denied|not allowed/i.test(msg)) {
      return 'Not allowed: only the admin account can change announcements. Check that you signed in with the admin email.';
    }
    if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'Cannot reach the database. Check your internet connection and try again.';
    return msg;
  }

  // ---------------------------------------------------------------- database (Supabase)
  const toRow = r => ({
    id: r.id, date: r.date, pinned: !!r.pinned, order: Number(r.order) || 0, status: r.status, url: r.url, image_url: r.image_url || '',
    title_zh: r.title_zh, title_en: r.title_en, content_zh: r.content_zh, content_en: r.content_en,
    auto_zh: !!r.auto_zh, auto_en: !!r.auto_en, updated_at: new Date().toISOString()
  });

  const Api = {
    async list() {
      const { data, error } = await sb.from('announcements').select('*').order('order', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    // one record = both languages, written (or replaced) as a whole
    async save(rows) {
      const list = Array.isArray(rows) ? rows : [rows];
      const { data, error } = await sb.from('announcements').upsert(list.map(toRow)).select();
      if (error) throw error;
      if (!data || data.length !== list.length) throw new Error('Not allowed: the database did not accept the change.');
    },
    // deleting the row removes the Chinese and the English version together
    async remove(id) {
      const { data, error } = await sb.from('announcements').delete().eq('id', id).select();
      if (error) throw error;
      if (!data || !data.length) throw new Error('Not allowed: the database did not delete the announcement.');
    }
  };

  // ---------------------------------------------------------------- login (Supabase Auth, see admin-auth.js)
  async function initAuth() {
    const box = $('auth');
    const problem = msg => { box.classList.remove('hidden'); box.innerHTML = `<p class="text-sm text-red-700" role="alert">${msg}</p>`; };
    if (!cfg || !cfg.url || !cfg.key) return problem('Supabase is not configured (assets/js/supabase-config.js).');
    if (!window.supabase || !window.supabase.createClient) return problem('Could not load the Supabase library. Check your internet connection and reload.');
    sb = window.supabase.createClient(cfg.url, cfg.key);
    AdminAuth.init({ sb, area: 'announcements', onSession: enterApp });
  }

  async function enterApp(session) {
    $('auth').classList.add('hidden');
    $('app').classList.remove('hidden');
    $('btn-logout').classList.remove('hidden');
    const who = $('user-email');
    who.textContent = (session && session.user && session.user.email) || '';
    who.classList.toggle('hidden', !who.textContent);
    await refresh();
  }

  $('btn-logout').addEventListener('click', async () => {
    try { if (sb) await sb.auth.signOut(); } catch (e) { /* ignore */ }
    location.reload();
  });

  // Compare the two language versions of one record.
  function syncReport(r) {
    const issues = [];
    if (!r.title_zh.trim()) issues.push('Chinese title is empty');
    if (!r.title_en.trim()) issues.push('English title is empty');
    if (!r.content_zh.trim()) issues.push('Chinese content is empty');
    if (!r.content_en.trim()) issues.push('English content is empty');
    if (r.url && !/^https?:\/\//i.test(r.url)) issues.push('Link URL is not a web address');
    if (r.auto_zh) issues.push('Chinese text is machine-translated and not reviewed yet');
    if (r.auto_en) issues.push('English text is machine-translated and not reviewed yet');
    const zl = r.content_zh.trim().length, el = r.content_en.trim().length;
    if (zl && el && (el < zl * 0.8 || el > zl * 8)) issues.push('The two contents differ a lot in length: check that both say the same thing');
    return { ok: issues.length === 0, issues };
  }

  // ---------------------------------------------------------------- list (Read)
  async function refresh() {
    try { records = await Api.list(); }
    catch (e) { flash(errText(e), true); records = []; }
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
  // Fields that were filled by the translator and not edited by a person yet
  const autoFields = new Set();
  const FIELDS = { zh: ['f-title-zh', 'f-content-zh'], en: ['f-title-en', 'f-content-en'] };

  function refreshBadges() {
    ['zh', 'en'].forEach(l => {
      const on = FIELDS[l].some(id => autoFields.has(id));
      $('auto-' + l).classList.toggle('hidden', !on);
      $('auto-' + l).dataset.on = on ? '1' : '';
    });
  }

  function setAutoBadges(zh, en) {   // used when opening a record: flag a whole language
    autoFields.clear();
    if (zh) FIELDS.zh.forEach(id => autoFields.add(id));
    if (en) FIELDS.en.forEach(id => autoFields.add(id));
    refreshBadges();
  }

  function markAuto(id) { autoFields.add(id); refreshBadges(); }

  function openEditor(rec) {
    editingId = rec ? rec.id : null;
    const minOrder = records.length ? Math.min(...records.map(r => Number(r.order) || 0)) : 1;
    const r = rec || {
      id: '', date: new Date().toISOString().slice(0, 10), pinned: false, order: minOrder - 1, status: 'published', url: '', image_url: '',
      title_zh: '', title_en: '', content_zh: '', content_en: '', auto_zh: false, auto_en: false
    };
    $('editor-mode').textContent = rec ? 'Edit announcement' : 'New announcement';
    $('editor-title').textContent = rec ? (r.title_en || r.title_zh || 'Announcement') : 'Add the Chinese and English versions together';
    $('f-id').value = r.id;
    $('f-date').value = r.date;
    $('f-url').value = r.url;
    $('f-image').value = r.image_url || '';
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

  // Typing in a field by hand means a person has reviewed that field.
  [...FIELDS.zh, ...FIELDS.en].forEach(id => {
    $(id).addEventListener('input', () => { autoFields.delete(id); refreshBadges(); });
  });

  function readForm(status) {
    return {
      id: $('f-id').value || ('n' + Date.now()),
      date: $('f-date').value,
      url: $('f-url').value.trim(),
      image_url: $('f-image').value.trim(),
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
      if (t) { $(`f-title-${to}`).value = t; markAuto(`f-title-${to}`); }
      if (c) { $(`f-content-${to}`).value = c; markAuto(`f-content-${to}`); }
      flash('Translated. Please read the result and edit it if needed.');
      return true;
    } catch (e) {
      showError(err, (e && e.message ? e.message : 'Translation failed') + '. You can type the translation by hand instead.');
      return false;
    } finally { btn.disabled = false; btn.innerHTML = old; }
  }

  $('btn-tr-zh-en').addEventListener('click', () => runTranslate('zh-en', false));
  $('btn-tr-en-zh').addEventListener('click', () => runTranslate('en-zh', false));

  // Default = automatic: when you finish typing in one language and the same field in the
  // other language is still empty, it is translated for you (you can edit it afterwards).
  const AUTO_PAIRS = [
    ['f-title-zh', 'f-title-en', 'zh-TW', 'en', 'en'],
    ['f-content-zh', 'f-content-en', 'zh-TW', 'en', 'en'],
    ['f-title-en', 'f-title-zh', 'en', 'zh-TW', 'zh'],
    ['f-content-en', 'f-content-zh', 'en', 'zh-TW', 'zh']
  ];
  AUTO_PAIRS.forEach(([src, dst, from, to, lang]) => {
    $(src).addEventListener('change', async () => {
      const text = $(src).value.trim();
      if (!text || $(dst).value.trim() || $(dst).dataset.busy) return;
      $(dst).dataset.busy = '1';
      $(dst).placeholder = 'Translating...';
      try {
        const out = await translate(text, from, to);
        if (out && !$(dst).value.trim()) {
          $(dst).value = out;
          markAuto(dst);
        }
      } catch (e) { /* the manual buttons and Preview will report the problem */ }
      finally { delete $(dst).dataset.busy; $(dst).placeholder = ''; }
    });
  });

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
    if (r.url && !/^https?:\/\/\S+$/i.test(r.url)) return 'The link URL must start with http:// or https:// (or leave it empty to open the announcement inside the website).';
    if (r.image_url && !/^(https?:\/\/|assets\/)\S+$/i.test(r.image_url)) return 'The image address must start with https:// or assets/';
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

  async function saveRecord(r) {
    try {
      await Api.save(r);
    } catch (e) { flash(errText(e), true); showError($('editor-error'), errText(e)); return false; }
    closeEditor();
    await refresh();
    return true;
  }

  $('btn-save-draft').addEventListener('click', async () => {
    const r = await prepare('draft');
    if (r && await saveRecord(r)) flash('Saved as draft. It is hidden from the website.');
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
          ${r.image_url ? `<img src="${esc(r.image_url)}" alt="" class="w-full border border-slate-200 mb-5">` : ''}
          ${r.url
            ? `<a href="${esc(r.url)}" target="_blank" rel="noopener" class="inline-flex items-center text-xs font-bold text-burgundy uppercase tracking-wider hover:underline">${zh ? '查看詳情' : 'View Details'} &nearr;</a>`
            : `<span class="inline-flex items-center text-xs font-bold text-burgundy uppercase tracking-wider">${zh ? '查看詳情（在本站開啟）' : 'View Details (opens on this site)'}</span>`}
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

  $('btn-preview-confirm').addEventListener('click', async () => {
    if (!previewRecord) return;
    const r = previewRecord;
    // Publishing means a person has now seen both versions.
    r.auto_zh = false; r.auto_en = false;
    r.status = 'published';
    closePreview();
    if (await saveRecord(r)) flash('Published. It now appears on the website.');
  });

  // ---------------------------------------------------------------- delete (one action removes both languages)
  function askDelete(rec) {
    $('confirm-title').textContent = 'Delete this announcement?';
    $('confirm-text').textContent = `"${rec.title_en || rec.title_zh}" will be removed in both Chinese and English. This cannot be undone.`;
    $('btn-confirm-yes').textContent = 'Delete';
    confirmAction = async () => {
      try { await Api.remove(rec.id); await refresh(); flash('Deleted (both language versions).'); }
      catch (e) { flash(errText(e), true); }
    };
    $('modal-confirm').classList.remove('hidden');
    $('btn-confirm-no').focus();
  }

  $('btn-reset').addEventListener('click', () => {
    $('confirm-title').textContent = 'Load the original announcements?';
    $('confirm-text').textContent = `The ${NEWS_SEED.length} original announcements collected from the college website will be written to the database again. If you edited any of them, those edits are replaced. Announcements you added yourself stay.`;
    $('btn-confirm-yes').textContent = 'Load';
    confirmAction = async () => {
      try { await Api.save(NEWS_SEED); closeEditor(); await refresh(); flash('Original announcements loaded.'); }
      catch (e) { flash(errText(e), true); }
    };
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

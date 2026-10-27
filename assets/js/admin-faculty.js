/**
 * AdminFaculty back-office: create, read, update, delete and reorder faculty members.
 * Data lives in the Supabase table `faculty`; photos live in the Supabase Storage bucket `faculty-photos`.
 * Signing in uses Supabase Auth (the same account as AdminNews). Only the admin email may change anything.
 */
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cfg = window.SUPABASE_CONFIG;
  const BUCKET = 'faculty-photos';
  const PUBLIC_PREFIX = '/storage/v1/object/public/' + BUCKET + '/';
  const MAX_PHOTO = 2 * 1024 * 1024;
  const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  const CATEGORIES = [
    { key: 'Full-time', label: 'Full-time Faculty' },
    { key: 'Visiting', label: 'Visiting Faculty' },
    { key: 'Adjunct', label: 'Adjunct Faculty' }
  ];

  let sb = null;
  let people = [];            // all rows, sorted by category then sort_order
  let editingId = null;       // null = creating a new person
  let pendingFile = null;     // photo chosen but not uploaded yet
  let confirmAction = null;
  let busy = false;

  // ---------------------------------------------------------------- small helpers
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
    if ((e && (e.code === '42501' || e.statusCode === '403')) || /row-level security|permission denied|not allowed|Unauthorized/i.test(msg)) {
      return 'Not allowed: only the admin account can change the faculty list. Check that you signed in with the admin email.';
    }
    if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'Cannot reach the database. Check your internet connection and try again.';
    return msg;
  }

  const catIndex = c => { const i = CATEGORIES.findIndex(x => x.key === c); return i < 0 ? 99 : i; };
  const sortPeople = list => list.slice().sort((a, b) =>
    catIndex(a.category) - catIndex(b.category) || (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0));

  // ---------------------------------------------------------------- database (Supabase)
  const Api = {
    async list() {
      const { data, error } = await sb.from('faculty').select('*').order('sort_order', { ascending: true });
      if (error) throw error;
      return sortPeople(data || []);
    },
    async insert(row) {
      const { data, error } = await sb.from('faculty').insert(row).select();
      if (error) throw error;
      if (!data || !data.length) throw new Error('Not allowed: the database did not accept the new faculty member.');
      return data[0];
    },
    async update(id, row) {
      const { data, error } = await sb.from('faculty').update(row).eq('id', id).select();
      if (error) throw error;
      if (!data || !data.length) throw new Error('Not allowed: the database did not accept the change.');
      return data[0];
    },
    async remove(id) {
      const { data, error } = await sb.from('faculty').delete().eq('id', id).select();
      if (error) throw error;
      if (!data || !data.length) throw new Error('Not allowed: the database did not delete the faculty member.');
    },
    // Upload a photo (File or Blob) and return its public address
    async uploadPhoto(blob, mime) {
      const ext = TYPES[mime];
      if (!ext) throw new Error('Use a JPG, PNG or WebP photo.');
      if (blob.size > MAX_PHOTO) throw new Error('The photo is larger than 2 MB. Choose a smaller one.');
      const path = (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2)) + '.' + ext;
      const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: mime, cacheControl: '31536000', upsert: false });
      if (error) throw error;
      return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    },
    // Delete a photo from storage, but only if it lives in our bucket. Never fatal.
    async removePhoto(url) {
      try {
        const i = (url || '').indexOf(PUBLIC_PREFIX);
        if (i < 0) return;
        await sb.storage.from(BUCKET).remove([decodeURIComponent(url.slice(i + PUBLIC_PREFIX.length))]);
      } catch (e) { /* a leftover file is harmless */ }
    }
  };

  // ---------------------------------------------------------------- login (Supabase Auth, see admin-auth.js)
  async function initAuth() {
    const box = $('auth');
    const problem = msg => { box.classList.remove('hidden'); box.innerHTML = `<p class="text-sm text-red-700" role="alert">${msg}</p>`; };
    if (!cfg || !cfg.url || !cfg.key) return problem('Supabase is not configured (assets/js/supabase-config.js).');
    if (!window.supabase || !window.supabase.createClient) return problem('Could not load the Supabase library. Check your internet connection and reload.');
    sb = window.supabase.createClient(cfg.url, cfg.key);
    $('btn-logout').addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });
    AdminAuth.init({ sb, area: 'the faculty list', onSession: enterApp });
  }

  async function enterApp(session) {
    $('auth').classList.add('hidden');
    $('app').classList.remove('hidden');
    $('btn-logout').classList.remove('hidden');
    const em = $('user-email');
    em.textContent = (session && session.user && session.user.email) || '';
    em.classList.remove('hidden');
    await refresh();
  }

  // ---------------------------------------------------------------- list
  async function refresh() {
    try { people = await Api.list(); }
    catch (e) { flash(errText(e), true); people = []; }
    renderList();
  }

  function renderList() {
    if ($('count-summary')) $('count-summary').textContent = people.length ? `(${people.length} in total)` : '';
    $('empty-msg').classList.toggle('hidden', people.length > 0);
    const box = $('faculty-groups');
    box.innerHTML = CATEGORIES.map(cat => {
      const rows = people.filter(p => p.category === cat.key);
      if (!rows.length) return '';
      return `
        <div data-cat="${cat.key}">
          <h3 class="flex items-center gap-3 text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
            <span>${cat.label}</span><span class="font-mono text-slate-400">${rows.length}</span><span class="flex-1 border-t border-slate-300"></span>
          </h3>
          <ul class="space-y-2">${rows.map((p, i) => rowHtml(p, i, rows.length)).join('')}</ul>
        </div>`;
    }).join('');
  }

  function rowHtml(p, i, n) {
    const photo = p.image_url
      ? `<img src="${esc(p.image_url)}" alt="" loading="lazy" class="w-14 h-14 object-cover object-top bg-slate-100 shrink-0" onerror="this.style.visibility='hidden'">`
      : '<div class="w-14 h-14 bg-slate-100 shrink-0"></div>';
    const arrow = (dir, label, disabled) =>
      `<button type="button" data-act="${dir}" data-id="${esc(p.id)}" ${disabled ? 'disabled' : ''} aria-label="${label}" class="w-8 h-8 border border-slate-300 text-slate-600 hover:border-burgundy hover:text-burgundy disabled:opacity-30 disabled:hover:border-slate-300 disabled:hover:text-slate-600 transition">${dir === 'up' ? '&uarr;' : '&darr;'}</button>`;
    return `
      <li draggable="true" data-id="${esc(p.id)}" class="faculty-row flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-2 bg-white border border-slate-200 px-3 py-2.5 hover:border-burgundy transition">
        <span class="drag-handle cursor-grab select-none text-slate-400 text-lg px-1" title="Drag to reorder" aria-hidden="true">&#x2807;</span>
        ${photo}
        <div class="min-w-[9rem] flex-1">
          <div class="font-bold text-sm truncate">${esc(p.name)}</div>
          <div class="text-xs text-slate-500 truncate">${esc(p.title)}</div>
        </div>
        <div class="flex gap-1">${arrow('up', 'Move up', i === 0)}${arrow('down', 'Move down', i === n - 1)}</div>
        <button type="button" data-act="edit" data-id="${esc(p.id)}" class="px-3 py-1.5 border border-slate-300 hover:border-slate-900 text-xs font-bold transition">Edit</button>
        <button type="button" data-act="delete" data-id="${esc(p.id)}" class="px-3 py-1.5 border border-red-300 text-red-700 hover:bg-red-50 text-xs font-bold transition">Delete</button>
      </li>`;
  }

  // ---------------------------------------------------------------- reorder
  // Renumber everyone 1..n in the order shown, and save only the rows whose number changed.
  async function persistOrder(newList) {
    const changes = [];
    newList.forEach((p, i) => { if (Number(p.sort_order) !== i + 1) changes.push({ id: p.id, sort_order: i + 1 }); });
    const before = people;
    people = newList.map((p, i) => ({ ...p, sort_order: i + 1 }));
    renderList();
    if (!changes.length) return;
    try {
      await Promise.all(changes.map(c => Api.update(c.id, { sort_order: c.sort_order })));
      flash('Order saved. The website shows it now.');
    } catch (e) {
      people = before; renderList();
      flash(errText(e), true);
    }
  }

  function moveWithinCategory(id, targetId, placeAfter) {
    const p = people.find(x => x.id === id), t = people.find(x => x.id === targetId);
    if (!p || !t || p.category !== t.category || p.id === t.id) return;
    const rest = people.filter(x => x.id !== id);
    const at = rest.findIndex(x => x.id === targetId) + (placeAfter ? 1 : 0);
    rest.splice(at, 0, p);
    persistOrder(sortByCategoryKeepOrder(rest));
  }

  function nudge(id, dir) {
    const p = people.find(x => x.id === id);
    if (!p) return;
    const group = people.filter(x => x.category === p.category);
    const i = group.findIndex(x => x.id === id);
    const other = group[i + dir];
    if (other) moveWithinCategory(id, other.id, dir > 0);
  }

  // keep categories in their fixed order, and each group in its current order
  const sortByCategoryKeepOrder = list =>
    CATEGORIES.flatMap(c => list.filter(p => p.category === c.key)).concat(list.filter(p => catIndex(p.category) === 99));

  let dragId = null;
  function initDnD() {
    const box = $('faculty-groups');
    box.addEventListener('dragstart', e => {
      const li = e.target.closest && e.target.closest('.faculty-row');
      if (!li) return;
      dragId = li.dataset.id;
      li.classList.add('opacity-40');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', dragId); } catch (x) { /* some browsers */ }
    });
    box.addEventListener('dragend', () => {
      dragId = null;
      box.querySelectorAll('.faculty-row').forEach(r => r.classList.remove('opacity-40', 'border-t-4', 'border-b-4', 'border-t-burgundy', 'border-b-burgundy'));
    });
    box.addEventListener('dragover', e => {
      const li = e.target.closest && e.target.closest('.faculty-row');
      if (!li || !dragId || li.dataset.id === dragId) return;
      const a = people.find(x => x.id === dragId), b = people.find(x => x.id === li.dataset.id);
      if (!a || !b || a.category !== b.category) return;
      e.preventDefault();
      const after = e.clientY > li.getBoundingClientRect().top + li.offsetHeight / 2;
      box.querySelectorAll('.faculty-row').forEach(r => r.classList.remove('border-t-4', 'border-b-4', 'border-t-burgundy', 'border-b-burgundy'));
      li.classList.add(after ? 'border-b-4' : 'border-t-4', after ? 'border-b-burgundy' : 'border-t-burgundy');
    });
    box.addEventListener('drop', e => {
      const li = e.target.closest && e.target.closest('.faculty-row');
      if (!li || !dragId) return;
      e.preventDefault();
      const after = e.clientY > li.getBoundingClientRect().top + li.offsetHeight / 2;
      const id = dragId;
      dragId = null;
      moveWithinCategory(id, li.dataset.id, after);
    });
  }

  // ---------------------------------------------------------------- editor (create / update)
  function setPhotoPreview(src) {
    const img = $('photo-preview');
    if (src) { img.src = src; img.classList.remove('hidden'); $('photo-empty').classList.add('hidden'); }
    else { img.removeAttribute('src'); img.classList.add('hidden'); $('photo-empty').classList.remove('hidden'); }
  }

  function openEditor(id) {
    editingId = id || null;
    pendingFile = null;
    $('f-photo').value = '';
    const p = id ? people.find(x => x.id === id) : null;
    $('editor-mode').textContent = p ? 'Edit faculty member' : 'New faculty member';
    $('editor-title').textContent = p ? p.name : 'Add a faculty member';
    $('f-id').value = p ? p.id : '';
    $('f-name').value = p ? p.name : '';
    $('f-category').value = p ? p.category : 'Full-time';
    $('f-title').value = p ? p.title : '';
    $('f-education').value = p ? p.education : '';
    $('f-research').value = p ? p.research_fields : '';
    $('f-email').value = p ? p.email : '';
    $('f-phone').value = p ? p.phone : '';
    $('f-website').value = p ? p.website : '';
    $('f-image-url').value = p ? p.image_url : '';
    setPhotoPreview(p ? p.image_url : '');
    $('editor-error').classList.add('hidden');
    $('editor').classList.remove('hidden');
    $('editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('f-name').focus({ preventScroll: true });
  }

  function closeEditor() { $('editor').classList.add('hidden'); editingId = null; pendingFile = null; }

  function onPhotoChosen() {
    const f = $('f-photo').files[0];
    const err = $('editor-error');
    err.classList.add('hidden');
    pendingFile = null;
    if (!f) return;
    if (!TYPES[f.type]) { $('f-photo').value = ''; return showError(err, 'Use a JPG, PNG or WebP photo.'); }
    if (f.size > MAX_PHOTO) { $('f-photo').value = ''; return showError(err, 'That photo is larger than 2 MB. Choose a smaller one.'); }
    pendingFile = f;
    setPhotoPreview(URL.createObjectURL(f));
  }

  async function onSave(e) {
    e.preventDefault();
    if (busy) return;
    const err = $('editor-error');
    err.classList.add('hidden');
    const val = id => $(id).value.trim();
    const name = val('f-name');
    if (!name) return showError(err, 'Enter the name.');
    if (val('f-email') && !/^\S+@\S+\.\S+$/.test(val('f-email'))) return showError(err, 'The email address does not look right.');
    if (val('f-website') && !/^https?:\/\//i.test(val('f-website'))) return showError(err, 'The website must start with http:// or https://');

    const old = editingId ? people.find(x => x.id === editingId) : null;
    const row = {
      name, title: val('f-title'), education: val('f-education'),
      research_fields: val('f-research').split(',').map(s => s.trim()).filter(Boolean).join(', '),
      email: val('f-email'), phone: val('f-phone'), website: val('f-website'),
      image_url: val('f-image-url'), category: $('f-category').value
    };

    busy = true; $('btn-save').disabled = true; $('btn-save').textContent = 'Saving…';
    try {
      if (pendingFile) row.image_url = await Api.uploadPhoto(pendingFile, pendingFile.type);
      if (old) {
        // moving to another category puts the person at the end of that group
        if (old.category !== row.category) row.sort_order = Math.max(0, ...people.map(p => Number(p.sort_order) || 0)) + 1;
        await Api.update(old.id, row);
        if (pendingFile && old.image_url && old.image_url !== row.image_url) Api.removePhoto(old.image_url);
      } else {
        row.sort_order = Math.max(0, ...people.map(p => Number(p.sort_order) || 0)) + 1;
        await Api.insert(row);
      }
      closeEditor();
      await refresh();
      flash(old ? `Saved changes to ${name}.` : `Added ${name}.`);
    } catch (ex) {
      showError(err, errText(ex));
    } finally { busy = false; $('btn-save').disabled = false; $('btn-save').textContent = 'Save'; }
  }

  // ---------------------------------------------------------------- confirm modal + delete
  function askConfirm(title, text, yesLabel, action) {
    $('confirm-title').textContent = title;
    $('confirm-text').textContent = text;
    $('btn-confirm-yes').textContent = yesLabel;
    confirmAction = action;
    $('modal-confirm').classList.remove('hidden');
    $('btn-confirm-no').focus();
  }
  function closeConfirm() { $('modal-confirm').classList.add('hidden'); confirmAction = null; }

  function askDelete(id) {
    const p = people.find(x => x.id === id);
    if (!p) return;
    askConfirm('Delete this faculty member?', `${p.name} will be removed from the database and from the website. This cannot be undone.`, 'Delete', async () => {
      try {
        await Api.remove(p.id);
        Api.removePhoto(p.image_url);
        // close the gap in the numbering
        await refresh();
        flash(`Deleted ${p.name}.`);
      } catch (e) { flash(errText(e), true); }
    });
  }

  // ---------------------------------------------------------------- copy the original 19 into the database
  async function loadOriginals() {
    if (busy) return;
    const have = new Set(people.map(p => p.name.trim().toLowerCase()));
    const todo = FACULTY_SEED.filter(f => !have.has(f.name.trim().toLowerCase()));
    if (!todo.length) return flash('All the original faculty are already in the database.');
    busy = true;
    const btn = $('btn-load-originals'); btn.disabled = true;
    let base = Math.max(0, ...people.map(p => Number(p.sort_order) || 0));
    let done = 0;
    try {
      for (const f of todo) {
        btn.textContent = `Loading ${done + 1} of ${todo.length}…`;
        const res = await fetch(f.image_url);
        if (!res.ok) throw new Error(`Could not read the photo of ${f.name}.`);
        const blob = await res.blob();
        const url = await Api.uploadPhoto(blob, blob.type);
        const { id, ...row } = f;            // the database makes its own id
        await Api.insert({ ...row, image_url: url, sort_order: base + f.sort_order });
        done++;
      }
      flash(`Loaded ${done} faculty members with their photos.`);
    } catch (e) {
      flash(`Stopped after ${done} of ${todo.length}: ${errText(e)}`, true);
    } finally {
      busy = false; btn.disabled = false; btn.textContent = 'Load original faculty';
      await refresh();
    }
  }

  // ---------------------------------------------------------------- wiring
  document.addEventListener('DOMContentLoaded', () => {
    $('btn-new').addEventListener('click', () => openEditor(null));
    $('btn-load-originals').addEventListener('click', () => {
      const n = FACULTY_SEED.filter(f => !people.some(p => p.name.trim().toLowerCase() === f.name.trim().toLowerCase())).length;
      if (!n) return flash('All the original faculty are already in the database.');
      askConfirm('Load original faculty?', `This copies ${n} professor${n === 1 ? '' : 's'} from the official imMBA page into the database, and uploads their photos to Supabase Storage. People already in the list are skipped.`, 'Load', loadOriginals);
    });
    $('btn-editor-close').addEventListener('click', closeEditor);
    $('btn-cancel').addEventListener('click', closeEditor);
    $('editor-form').addEventListener('submit', onSave);
    $('f-photo').addEventListener('change', onPhotoChosen);
    $('btn-confirm-no').addEventListener('click', closeConfirm);
    $('btn-confirm-yes').addEventListener('click', () => { const a = confirmAction; closeConfirm(); if (a) a(); });
    $('modal-confirm').addEventListener('click', e => { if (e.target === $('modal-confirm')) closeConfirm(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeConfirm(); });
    $('faculty-groups').addEventListener('click', e => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      const { act, id } = b.dataset;
      if (act === 'edit') openEditor(id);
      else if (act === 'delete') askDelete(id);
      else if (act === 'up') nudge(id, -1);
      else if (act === 'down') nudge(id, 1);
    });
    initDnD();
    initAuth();
  });
})();

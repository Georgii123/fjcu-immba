/**
 * AdminAlumni back-office: an alumni database with add / edit / delete (soft, with restore), search and filters,
 * a column picker, CSV batch import with checks, CSV export of the filtered list, and an activity history.
 * Data lives in the Supabase tables `alumni` and `audit_log` (see supabase/schema.sql). The activity history is
 * written by the database itself (a trigger), so every create / update / delete / restore is recorded no matter
 * what this page does. Only approved admins can read or change anything.
 */
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cfg = window.SUPABASE_CONFIG;

  const DEGREES = ['Bachelor', 'Master', 'Doctoral', 'Other'];
  // The data structure from the slides. `show` = visible in the table by default.
  const FIELDS = [
    { key: 'full_name',       label: 'Full name',              required: true,  kind: 'text', max: 120,  show: true,  hint: 'Alumni name' },
    { key: 'student_id',      label: 'Student ID',             required: true,  kind: 'text', max: 40,   show: true,  hint: 'Unique for every active record, for example A20260015' },
    { key: 'department',      label: 'Department / Program',   required: true,  kind: 'text', max: 120,  show: true,  hint: 'For example International Management MBA' },
    { key: 'degree_program',  label: 'Degree level',           required: true,  kind: 'degree',          show: true,  hint: 'Only: ' + DEGREES.join(', ') },
    { key: 'admission_year',  label: 'Admission year',         required: false, kind: 'year',            show: false, hint: 'Four digits, for example 2024' },
    { key: 'graduation_year', label: 'Graduation year',        required: false, kind: 'year',            show: true,  hint: 'Four digits; not before the admission year' },
    { key: 'email',           label: 'Email',                  required: false, kind: 'email', max: 200, show: false, hint: 'A valid email address' },
    { key: 'phone',           label: 'Phone',                  required: false, kind: 'text', max: 40,   show: false, hint: '' },
    { key: 'company',         label: 'Current company',        required: false, kind: 'text', max: 120,  show: true,  hint: '' },
    { key: 'job_title',       label: 'Current position',       required: false, kind: 'text', max: 120,  show: true,  hint: '' },
    { key: 'notes',           label: 'Additional information', required: false, kind: 'area', max: 2000, show: false, hint: '' }
  ];
  const KEYS = FIELDS.map(f => f.key);
  const LABEL = Object.fromEntries(FIELDS.map(f => [f.key, f.label]));
  const PAGE = 100;
  const COLS_KEY = 'immba_alumni_cols';
  const MAX_FILE = 2 * 1024 * 1024;

  let sb = null;
  let all = [];                 // every alumni row (active and deleted)
  let view = 'alumni';          // alumni | deleted | history
  let filt = { q: '', degree: '', year: '', dept: '', company: '' };
  let limit = PAGE;
  let editingId = null;
  let cols = defaultCols();
  let importRows = null, importName = '';
  let busy = false;

  // ---------------------------------------------------------------- small helpers
  function defaultCols() { return FIELDS.filter(f => f.show).map(f => f.key); }

  function loadCols() {
    try {
      const saved = JSON.parse(localStorage.getItem(COLS_KEY) || 'null');
      if (Array.isArray(saved)) { const ok = saved.filter(k => KEYS.includes(k)); if (ok.length) return ok; }
    } catch (e) { /* storage may be blocked */ }
    return defaultCols();
  }
  function saveCols() { try { localStorage.setItem(COLS_KEY, JSON.stringify(cols)); } catch (e) { /* ignore */ } }

  function flash(msg, isError) {
    const el = $('status-msg');
    el.textContent = msg;
    el.className = 'mb-4 text-sm font-semibold ' + (isError ? 'text-red-700' : 'text-green-700');
    clearTimeout(flash._t);
    flash._t = setTimeout(() => el.classList.add('hidden'), isError ? 10000 : 5000);
  }

  function errText(e) {
    const msg = (e && (e.message || e.error_description)) || String(e);
    const code = e && e.code;
    if (code === '23505' || /duplicate key|alumni_student_id_active/i.test(msg)) return 'That student ID already belongs to another active alumni record.';
    if (code === '23514' || /violates check constraint/i.test(msg)) return 'A value is not allowed (check the degree level, years and email).';
    if (code === '42501' || /row-level security|permission denied/i.test(msg)) return 'You are not allowed to do this. Is your account approved?';
    if (/Failed to fetch|NetworkError/i.test(msg)) return 'Cannot reach the server. Check your internet connection and try again.';
    return msg;
  }

  const when = iso => iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';
  const norm = s => String(s == null ? '' : s).trim();
  const idKey = s => norm(s).toLowerCase();

  // ---------------------------------------------------------------- validation (used by the editor and the CSV import)
  // raw: every field as text. Returns { rec, errors }.
  function checkRecord(raw) {
    const errors = [], rec = {};
    FIELDS.forEach(f => {
      let v = norm(raw[f.key]);
      if (f.kind === 'year') {
        if (v === '') { rec[f.key] = null; return; }
        if (!/^\d{4}$/.test(v) || +v < 1900 || +v > 2100) { errors.push(`${f.label} must be a four-digit year between 1900 and 2100.`); rec[f.key] = null; return; }
        rec[f.key] = +v; return;
      }
      if (f.kind === 'degree') {
        const hit = DEGREES.find(d => d.toLowerCase() === v.toLowerCase());
        if (v === '') errors.push(`${f.label} is required.`);
        else if (!hit) errors.push(`${f.label} "${v}" is not valid. Use one of: ${DEGREES.join(', ')}.`);
        rec[f.key] = hit || v; return;
      }
      if (f.required && v === '') errors.push(`${f.label} is required.`);
      if (f.max && v.length > f.max) errors.push(`${f.label} is longer than ${f.max} characters.`);
      if (f.kind === 'email' && v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) errors.push('Email is not a valid address.');
      rec[f.key] = v;
    });
    if (rec.admission_year && rec.graduation_year && rec.graduation_year < rec.admission_year) errors.push('Graduation year is before the admission year.');
    return { rec, errors };
  }

  const activeIds = () => new Set(all.filter(r => !r.deleted_at).map(r => idKey(r.student_id)));

  // ---------------------------------------------------------------- data
  async function load() {
    const rows = [];
    for (let from = 0; from < 20000; from += 1000) {
      const { data, error } = await sb.from('alumni').select('*').order('full_name', { ascending: true }).range(from, from + 999);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    all = rows;
  }

  async function reload() {
    try { await load(); } catch (e) { flash(errText(e), true); all = []; }
    refreshFilterOptions();
    render();
  }

  // ---------------------------------------------------------------- list: filters, table, columns
  function matches(r) {
    if (filt.q) {
      const hay = (r.full_name + ' ' + r.student_id + ' ' + r.email).toLowerCase();
      if (!hay.includes(filt.q.toLowerCase())) return false;
    }
    if (filt.degree && r.degree_program !== filt.degree) return false;
    if (filt.year && String(r.graduation_year) !== filt.year) return false;
    if (filt.dept && r.department !== filt.dept) return false;
    if (filt.company && !(r.company || '').toLowerCase().includes(filt.company.toLowerCase())) return false;
    return true;
  }
  const inView = r => (view === 'deleted') === !!r.deleted_at;
  const filtered = () => all.filter(inView).filter(matches);

  function fillSelect(el, first, values) {
    const cur = el.value;
    el.innerHTML = `<option value="">${first}</option>` + values.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
    el.value = values.map(String).includes(cur) ? cur : '';
  }

  function refreshFilterOptions() {
    const rows = all.filter(inView);
    fillSelect($('f-degree'), 'All', DEGREES);
    fillSelect($('f-year'), 'All', [...new Set(rows.map(r => r.graduation_year).filter(Boolean))].sort((a, b) => b - a));
    fillSelect($('f-dept'), 'All', [...new Set(rows.map(r => r.department).filter(Boolean))].sort());
    filt.degree = $('f-degree').value; filt.year = $('f-year').value; filt.dept = $('f-dept').value;
    const dl = $('dept-list');
    if (dl) dl.innerHTML = [...new Set(all.map(r => r.department).filter(Boolean))].sort().map(d => `<option value="${esc(d)}">`).join('');
  }

  function renderViews() {
    const active = all.filter(r => !r.deleted_at).length, deleted = all.length - active;
    const defs = [['alumni', `Alumni (${active})`], ['deleted', `Deleted (${deleted})`], ['history', 'Activity history']];
    $('views').innerHTML = defs.map(([k, label]) => `<button type="button" role="tab" aria-selected="${k === view}" data-view="${k}"
      class="px-4 py-2 border transition ${k === view ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-300 hover:border-burgundy hover:text-burgundy'}">${label}</button>`).join('');
  }

  function renderColumnsMenu() {
    $('columns-menu').innerHTML = '<div class="text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-2">Show these columns</div>' +
      FIELDS.map(f => `<label class="flex items-center gap-2 py-1 cursor-pointer"><input type="checkbox" data-col="${f.key}" ${cols.includes(f.key) ? 'checked' : ''} ${f.key === 'full_name' ? 'disabled' : ''}> ${esc(f.label)}</label>`).join('') +
      '<button type="button" id="cols-reset" class="mt-2 text-xs font-bold text-burgundy hover:underline">Reset to default</button>';
  }

  function renderTable() {
    const isHistory = view === 'history';
    $('filters').classList.toggle('hidden', isHistory);
    $('table-wrap').classList.toggle('hidden', isHistory);
    $('history-view').classList.toggle('hidden', !isHistory);
    $('btn-export').classList.toggle('hidden', isHistory);
    if (isHistory) { $('btn-more').classList.add('hidden'); return; }

    const list = filtered();
    const shown = list.slice(0, limit);
    const visible = FIELDS.filter(f => cols.includes(f.key));
    $('thead').innerHTML = '<tr>' + visible.map(f => `<th class="px-4 py-3 font-bold whitespace-nowrap">${esc(f.label)}</th>`).join('') + '<th class="px-4 py-3 font-bold text-right">Actions</th></tr>';

    const btn = 'px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider border border-slate-300 transition';
    $('rows').innerHTML = shown.map(r => {
      const cells = visible.map(f => {
        const v = r[f.key];
        const t = v == null || v === '' ? '<span class="text-slate-300">&mdash;</span>' : esc(v);
        return `<td class="px-4 py-3 align-top ${f.key === 'notes' ? 'max-w-xs truncate' : ''} ${f.key === 'full_name' ? 'font-bold' : ''}" ${f.key === 'notes' && v ? `title="${esc(v)}"` : ''}>${t}</td>`;
      }).join('');
      const actions = view === 'deleted'
        ? `<button type="button" data-act="restore" data-id="${esc(r.id)}" class="${btn} hover:border-green-700 hover:text-green-700">Restore</button>`
        : `<button type="button" data-act="edit" data-id="${esc(r.id)}" class="${btn} hover:border-burgundy hover:text-burgundy">Edit</button>
           <button type="button" data-act="delete" data-id="${esc(r.id)}" class="${btn} hover:border-red-700 hover:text-red-700">Delete</button>`;
      return `<tr>${cells}<td class="px-4 py-3 align-top text-right whitespace-nowrap"><div class="flex justify-end gap-1.5">${actions}
        <button type="button" data-act="history" data-id="${esc(r.id)}" class="${btn} hover:border-burgundy hover:text-burgundy">History</button></div></td></tr>`;
    }).join('');

    const total = all.filter(inView).length;
    $('count-summary').textContent = list.length === total ? `${total} ${view === 'deleted' ? 'deleted ' : ''}record${total === 1 ? '' : 's'}` : `${list.length} of ${total} records match`;
    const empty = $('empty-msg');
    empty.classList.toggle('hidden', list.length > 0);
    empty.textContent = total === 0 ? (view === 'deleted' ? 'Nothing has been deleted.' : 'No alumni yet. Add one, or import a CSV file.') : 'No records match these filters.';
    $('btn-more').classList.toggle('hidden', list.length <= limit);
  }

  function render() { renderViews(); renderColumnsMenu(); renderTable(); if (view === 'history') loadHistoryView(); }

  // ---------------------------------------------------------------- editor
  function buildEditor() {
    $('editor-fields').innerHTML = FIELDS.map(f => {
      const base = 'w-full border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:border-burgundy';
      let input;
      if (f.kind === 'degree') input = `<select id="e-${f.key}" class="${base}"><option value="">Choose&hellip;</option>${DEGREES.map(d => `<option>${d}</option>`).join('')}</select>`;
      else if (f.kind === 'area') input = `<textarea id="e-${f.key}" rows="3" maxlength="${f.max}" class="${base}"></textarea>`;
      else if (f.kind === 'year') input = `<input id="e-${f.key}" type="number" min="1900" max="2100" class="${base}">`;
      else input = `<input id="e-${f.key}" type="${f.kind === 'email' ? 'email' : 'text'}" maxlength="${f.max}" class="${base}" ${f.key === 'department' ? 'list="dept-list"' : ''}>`;
      return `<div class="${f.kind === 'area' ? 'sm:col-span-2 lg:col-span-3' : ''}">
        <label for="e-${f.key}" class="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">${esc(f.label)}${f.required ? ' <span class="text-burgundy">*</span>' : ''}</label>
        ${input}${f.hint ? `<p class="text-[11px] text-slate-500 mt-1">${esc(f.hint)}</p>` : ''}</div>`;
    }).join('') + '<datalist id="dept-list"></datalist>';
  }

  function openEditor(id) {
    closeImport();
    editingId = id || null;
    const r = id ? all.find(x => x.id === id) : null;
    $('editor-mode').textContent = r ? 'Edit record' : 'New record';
    $('editor-title').textContent = r ? r.full_name : 'New alumnus';
    FIELDS.forEach(f => { $('e-' + f.key).value = r && r[f.key] != null ? r[f.key] : ''; });
    $('editor-error').classList.add('hidden');
    $('editor').classList.remove('hidden');
    $('e-full_name').focus();
    $('editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function closeEditor() { $('editor').classList.add('hidden'); editingId = null; }

  async function saveEditor(e) {
    e.preventDefault();
    if (busy) return;
    const err = $('editor-error');
    err.classList.add('hidden');
    const raw = {};
    FIELDS.forEach(f => { raw[f.key] = $('e-' + f.key).value; });
    const { rec, errors } = checkRecord(raw);
    if (!errors.length && all.some(r => !r.deleted_at && r.id !== editingId && idKey(r.student_id) === idKey(rec.student_id))) errors.push('Another active record already uses this student ID.');
    if (errors.length) { err.textContent = errors.join(' '); err.classList.remove('hidden'); return; }

    busy = true; $('btn-save').disabled = true;
    try {
      let res;
      if (editingId) res = await sb.from('alumni').update(rec).eq('id', editingId).select('id');
      else res = await sb.from('alumni').insert(rec).select('id');
      if (res.error) throw res.error;
      if (!res.data || res.data.length !== 1) throw new Error('The change was not saved. Is your account approved?');
      const wasNew = !editingId;
      closeEditor();
      await reload();
      flash(wasNew ? `${rec.full_name} was added.` : `${rec.full_name} was updated.`);
    } catch (ex) { err.textContent = errText(ex); err.classList.remove('hidden'); }
    busy = false; $('btn-save').disabled = false;
  }

  // ---------------------------------------------------------------- delete (soft) and restore
  async function setDeleted(id, deleted) {
    const r = all.find(x => x.id === id);
    if (!r || busy) return;
    if (deleted && !confirm(`Delete ${r.full_name} (${r.student_id})?\n\nThe record moves to the Deleted list and can be restored.`)) return;
    busy = true;
    try {
      const { data, error } = await sb.from('alumni').update({ deleted_at: deleted ? new Date().toISOString() : null }).eq('id', id).select('id');
      if (error) throw error;
      if (!data || data.length !== 1) throw new Error('The change was not saved. Is your account approved?');
      await reload();
      flash(deleted ? `${r.full_name} was moved to Deleted.` : `${r.full_name} was restored.`);
    } catch (ex) { flash(errText(ex), true); }
    busy = false;
  }

  // ---------------------------------------------------------------- activity history
  const val = v => (v == null || v === '') ? '(empty)' : String(v);

  function describe(h) {
    const ch = h.changes || {};
    const keys = KEYS.filter(k => ch[k]);
    if (h.action === 'DELETE') return 'Moved to Deleted';
    if (h.action === 'RESTORE') return 'Restored from Deleted';
    if (h.action === 'CREATE') return keys.length ? 'New record: ' + keys.map(k => `${LABEL[k]} = ${val(ch[k][1])}`).join('; ') : 'New record';
    return keys.map(k => `${LABEL[k]}: ${val(ch[k][0])} → ${val(ch[k][1])}`).join('; ');
  }

  const ACTION_STYLE = { CREATE: 'bg-green-100 text-green-900', UPDATE: 'bg-blue-100 text-blue-900', DELETE: 'bg-red-100 text-red-900', RESTORE: 'bg-amber-100 text-amber-900' };

  function historyRows(list, showRecord) {
    return list.map(h => `<tr>
      <td class="px-4 py-3 align-top whitespace-nowrap text-slate-700">${esc(when(h.created_at))}</td>
      <td class="px-4 py-3 align-top break-all">${esc(h.admin_email)}</td>
      <td class="px-4 py-3 align-top"><span class="inline-block px-2 py-1 text-[11px] font-bold tracking-wider ${ACTION_STYLE[h.action] || ''}">${esc(h.action)}</span></td>
      ${showRecord ? `<td class="px-4 py-3 align-top">${esc(h.record_label)}</td>` : ''}
      <td class="px-4 py-3 align-top text-slate-700">${esc(describe(h))}${h.source && h.source !== 'manual' ? `<div class="text-xs text-slate-500 mt-0.5">${esc(h.source)}</div>` : ''}</td></tr>`).join('');
  }

  async function loadHistoryView() {
    let q = sb.from('audit_log').select('*').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(300);
    if ($('h-action').value) q = q.eq('action', $('h-action').value);
    const { data, error } = await q;
    if (error) { flash(errText(error), true); return; }
    $('h-rows').innerHTML = historyRows(data || [], true);
    $('h-empty').classList.toggle('hidden', (data || []).length > 0);
  }

  async function openHistory(id) {
    const r = all.find(x => x.id === id);
    $('hist-title').textContent = r ? `History: ${r.full_name}` : 'History';
    $('hist-body').innerHTML = '<p class="text-slate-500">Loading&hellip;</p>';
    $('hist-modal').classList.remove('hidden');
    const { data, error } = await sb.from('audit_log').select('*').eq('record_id', id).order('created_at', { ascending: false }).order('id', { ascending: false });
    if (error) { $('hist-body').innerHTML = `<p class="text-red-700">${esc(errText(error))}</p>`; return; }
    $('hist-body').innerHTML = (data || []).length
      ? `<div class="overflow-x-auto"><table class="w-full text-left"><thead class="bg-slate-100 text-[11px] uppercase tracking-wider text-slate-600"><tr>
          <th class="px-4 py-2 font-bold">When</th><th class="px-4 py-2 font-bold">Admin</th><th class="px-4 py-2 font-bold">Action</th><th class="px-4 py-2 font-bold">What changed</th></tr></thead>
          <tbody class="divide-y divide-slate-200">${historyRows(data, false)}</tbody></table></div>`
      : '<p class="text-slate-500">No recorded activity for this record.</p>';
  }

  // ---------------------------------------------------------------- CSV: parse, template, export
  function parseCSV(text) {
    const rows = []; let row = [], f = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
      else f += c;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    return { rows, unclosedQuote: q };
  }

  function csvCell(v) {
    let s = v == null ? '' : String(v);
    // A cell starting with = + - @ can run as a formula when opened in Excel; keep phone-like numbers as they are
    if (/^[=@\t\r]/.test(s) || (/^[+-]/.test(s) && !/^[+-]?[\d\s()-]+$/.test(s))) s = "'" + s;
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function download(name, text) {
    const url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportCsv() {
    const list = filtered();
    if (!list.length) return flash('There is nothing to export with the current filters.', true);
    const lines = [KEYS.join(',')].concat(list.map(r => KEYS.map(k => csvCell(r[k])).join(',')));
    const d = new Date(), pad = n => String(n).padStart(2, '0');
    download(`alumni-${view === 'deleted' ? 'deleted-' : ''}${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.csv`, lines.join('\r\n') + '\r\n');
    flash(`Exported ${list.length} record${list.length === 1 ? '' : 's'} (the filtered list, all fields).`);
  }

  const downloadTemplate = () => download('alumni-template.csv', KEYS.join(',') + '\r\n');

  // ---------------------------------------------------------------- CSV import: validate first, then import
  function validateImport(text) {
    const out = { fatal: [], rows: [], empty: 0 };
    const { rows, unclosedQuote } = parseCSV(text.replace(/^﻿/, ''));
    if (unclosedQuote) out.fatal.push('A quotation mark is never closed, so the file cannot be read reliably.');
    let h = rows.findIndex(r => r.some(c => norm(c) !== ''));
    if (h < 0) { out.fatal.push('The file is empty.'); return out; }
    const header = rows[h].map(c => norm(c).toLowerCase());
    const unknown = header.filter(c => c && !KEYS.includes(c));
    const missing = FIELDS.filter(f => f.required && !header.includes(f.key)).map(f => f.key);
    const dupes = header.filter((c, i) => c && header.indexOf(c) !== i);
    if (unknown.length) out.fatal.push(`Unknown column name${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}. Use the template's column names exactly.`);
    if (missing.length) out.fatal.push(`Required column${missing.length > 1 ? 's' : ''} missing: ${missing.join(', ')}.`);
    if (dupes.length) out.fatal.push(`Column repeated: ${[...new Set(dupes)].join(', ')}.`);
    if (out.fatal.length) return out;

    const existing = activeIds(), seen = new Map();
    for (let i = h + 1; i < rows.length; i++) {
      const cells = rows[i];
      if (cells.every(c => norm(c) === '')) { out.empty++; continue; }
      const n = i + 1;                                    // spreadsheet row number (the header is the first row)
      const errors = [];
      if (cells.length > header.length) errors.push(`The row has ${cells.length} cells but the header has ${header.length}.`);
      const raw = {};
      header.forEach((c, j) => { if (c) raw[c] = cells[j]; });
      const { rec, errors: e2 } = checkRecord(raw);
      errors.push(...e2);
      const key = idKey(rec.student_id);
      if (key) {
        if (existing.has(key)) errors.push('This student ID already exists in the alumni list.');
        if (seen.has(key)) errors.push(`Duplicate student ID (same as row ${seen.get(key)}).`); else seen.set(key, n);
      }
      out.rows.push({ n, rec, errors });
    }
    if (!out.rows.length) out.fatal.push('The file has a header but no alumni rows.');
    if (out.rows.length > 1000) out.fatal.push(`The file has ${out.rows.length} rows; the limit is 1000 per file. Split it into smaller files.`);
    return out;
  }

  function renderImportReport(v) {
    const box = $('import-report');
    box.classList.remove('hidden');
    if (v.fatal.length) {
      box.innerHTML = `<div class="border border-red-300 bg-red-50 p-4 text-sm text-red-900"><strong>This file cannot be imported.</strong><ul class="list-disc ml-5 mt-1">${v.fatal.map(m => `<li>${esc(m)}</li>`).join('')}</ul></div>`;
      importRows = null; return;
    }
    const good = v.rows.filter(r => !r.errors.length), bad = v.rows.filter(r => r.errors.length);
    importRows = good.map(r => r.rec);
    box.innerHTML = `
      <div class="grid sm:grid-cols-4 gap-3 text-center mb-4">
        <div class="border border-slate-200 p-3"><div class="text-2xl font-bold">${v.rows.length}</div><div class="text-xs text-slate-600">rows read</div></div>
        <div class="border border-green-300 bg-green-50 p-3"><div class="text-2xl font-bold text-green-800">${good.length}</div><div class="text-xs text-green-900">ready to import</div></div>
        <div class="border ${bad.length ? 'border-red-300 bg-red-50' : 'border-slate-200'} p-3"><div class="text-2xl font-bold ${bad.length ? 'text-red-800' : ''}">${bad.length}</div><div class="text-xs ${bad.length ? 'text-red-900' : 'text-slate-600'}">with problems (skipped)</div></div>
        <div class="border border-slate-200 p-3"><div class="text-2xl font-bold">${v.empty}</div><div class="text-xs text-slate-600">empty rows ignored</div></div>
      </div>
      ${bad.length ? `<div class="overflow-x-auto mb-4"><table class="w-full text-sm text-left border border-slate-200"><thead class="bg-slate-100 text-[11px] uppercase tracking-wider text-slate-600"><tr><th class="px-3 py-2">Row</th><th class="px-3 py-2">Name / ID</th><th class="px-3 py-2">Problem</th></tr></thead><tbody class="divide-y divide-slate-200">
        ${bad.slice(0, 100).map(r => `<tr><td class="px-3 py-2 align-top">${r.n}</td><td class="px-3 py-2 align-top">${esc(r.rec.full_name)} ${r.rec.student_id ? '(' + esc(r.rec.student_id) + ')' : ''}</td><td class="px-3 py-2 align-top text-red-800">${r.errors.map(esc).join('<br>')}</td></tr>`).join('')}
        </tbody></table>${bad.length > 100 ? `<p class="text-xs text-slate-500 mt-1">Showing the first 100 problems.</p>` : ''}</div>` : ''}
      <button id="btn-do-import" type="button" class="px-6 py-2.5 bg-slate-900 hover:bg-burgundy text-white text-xs font-bold uppercase tracking-wider transition disabled:opacity-50" ${good.length ? '' : 'disabled'}>Import ${good.length} valid row${good.length === 1 ? '' : 's'}</button>
      ${bad.length ? '<span class="text-xs text-slate-600 ml-3">Rows with problems are not imported. Fix them in the file and import it again.</span>' : ''}`;
  }

  async function onFile(e) {
    const file = e.target.files[0];
    importRows = null;
    $('import-report').classList.add('hidden');
    if (!file) return;
    importName = file.name;
    if (file.size > MAX_FILE) return renderImportReport({ fatal: ['The file is larger than 2 MB.'], rows: [], empty: 0 });
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()); }
    catch (ex) { return renderImportReport({ fatal: ['The file is not UTF-8 text. In Excel use "Save as" → "CSV UTF-8 (Comma delimited)".'], rows: [], empty: 0 }); }
    if (text.includes('�')) return renderImportReport({ fatal: ['The file contains unreadable characters (encoding problem). Save it as "CSV UTF-8" and try again.'], rows: [], empty: 0 });
    renderImportReport(validateImport(text));
  }

  async function doImport() {
    if (busy || !importRows || !importRows.length) return;
    busy = true;
    const btn = $('btn-do-import'); btn.disabled = true; btn.textContent = 'Importing…';
    try {
      const { data, error } = await sb.rpc('import_alumni', { rows: importRows, file_name: importName });
      if (error) throw error;
      const n = importRows.length;
      closeImport();
      view = 'alumni';
      await reload();
      flash(`Imported ${data} of ${n} rows. They are in the list now, and the Activity history shows the import.`);
    } catch (ex) {
      flash('Nothing was imported. ' + errText(ex), true);
      btn.disabled = false; btn.textContent = 'Try again';
    }
    busy = false;
  }

  function openImport() {
    closeEditor();
    $('import-file').value = ''; importRows = null; $('import-report').classList.add('hidden');
    $('import-guide').innerHTML = '<ul class="list-disc ml-5">' + FIELDS.map(f => `<li><code>${f.key}</code> &ndash; ${esc(f.label)}${f.required ? ' (required)' : ''}${f.hint ? '. ' + esc(f.hint) : ''}</li>`).join('') +
      '</ul><p class="mt-2">The first row must be the column names. Save the file as <strong>CSV UTF-8</strong>. Up to 1000 rows and 2 MB per file.</p>';
    $('import-panel').classList.remove('hidden');
    $('import-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function closeImport() { $('import-panel').classList.add('hidden'); importRows = null; }

  // ---------------------------------------------------------------- start
  function bind() {
    $('btn-new').addEventListener('click', () => { if (view === 'history') { view = 'alumni'; render(); } openEditor(null); });
    $('btn-import').addEventListener('click', openImport);
    $('btn-import-close').addEventListener('click', closeImport);
    $('btn-export').addEventListener('click', exportCsv);
    $('btn-template').addEventListener('click', downloadTemplate);
    $('btn-editor-close').addEventListener('click', closeEditor);
    $('btn-cancel').addEventListener('click', closeEditor);
    $('editor-form').addEventListener('submit', saveEditor);
    $('import-file').addEventListener('change', onFile);
    $('import-report').addEventListener('click', e => { if (e.target.closest('#btn-do-import')) doImport(); });

    $('views').addEventListener('click', e => {
      const b = e.target.closest('button[data-view]');
      if (!b) return;
      view = b.dataset.view; limit = PAGE; refreshFilterOptions(); render();
    });
    $('h-action').addEventListener('change', loadHistoryView);

    const refilter = () => { filt.q = $('f-q').value.trim(); filt.degree = $('f-degree').value; filt.year = $('f-year').value; filt.dept = $('f-dept').value; filt.company = $('f-company').value.trim(); limit = PAGE; renderTable(); };
    ['f-q', 'f-company'].forEach(id => $(id).addEventListener('input', refilter));
    ['f-degree', 'f-year', 'f-dept'].forEach(id => $(id).addEventListener('change', refilter));
    $('btn-clear').addEventListener('click', () => { ['f-q', 'f-company', 'f-degree', 'f-year', 'f-dept'].forEach(id => { $(id).value = ''; }); refilter(); });
    $('btn-more').addEventListener('click', () => { limit += PAGE; renderTable(); });

    $('btn-columns').addEventListener('click', e => {
      e.stopPropagation();
      const m = $('columns-menu'); m.classList.toggle('hidden');
      $('btn-columns').setAttribute('aria-expanded', String(!m.classList.contains('hidden')));
    });
    $('columns-menu').addEventListener('click', e => e.stopPropagation());
    $('columns-menu').addEventListener('change', e => {
      const c = e.target.closest('input[data-col]');
      if (!c) return;
      cols = FIELDS.map(f => f.key).filter(k => k === 'full_name' || (k === c.dataset.col ? c.checked : cols.includes(k)));
      saveCols(); renderTable();
    });
    $('columns-menu').addEventListener('click', e => {
      if (e.target.id === 'cols-reset') { cols = defaultCols(); saveCols(); renderColumnsMenu(); renderTable(); }
    });
    document.addEventListener('click', () => { $('columns-menu').classList.add('hidden'); $('btn-columns').setAttribute('aria-expanded', 'false'); });

    $('rows').addEventListener('click', e => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      const id = b.dataset.id;
      if (b.dataset.act === 'edit') openEditor(id);
      else if (b.dataset.act === 'delete') setDeleted(id, true);
      else if (b.dataset.act === 'restore') setDeleted(id, false);
      else if (b.dataset.act === 'history') openHistory(id);
    });
    $('hist-close').addEventListener('click', () => $('hist-modal').classList.add('hidden'));
    $('hist-modal').addEventListener('click', e => { if (e.target === $('hist-modal')) $('hist-modal').classList.add('hidden'); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') $('hist-modal').classList.add('hidden'); });
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
    cols = loadCols();
    buildEditor();
    bind();
    $('btn-logout').addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });
    AdminAuth.init({ sb, area: 'alumni', onSession: enterApp });
  }

  initPage();
})();

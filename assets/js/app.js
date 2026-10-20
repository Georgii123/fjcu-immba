/**
 * FJCU imMBA Official Website JavaScript Logic
 * Top 10 Global Business School Editorial Interactions
 */

let currentLang = 'zh'; // Default language ('zh' or 'en')
let activeCategory = 'all';

document.addEventListener('DOMContentLoaded', () => {
  initLanguage();
  initMenuCollapse();
  initNewsToggle();
  if (document.getElementById('announcements-list')) NewsStore.load().then(renderAnnouncements);
  if (document.getElementById('faculty-list')) FacultyStore.load().then(renderFaculty);
  initComingSoonLinks();
  initStats();
  renderAnnouncements();
  renderFeatures();
  renderAdmissions();
  renderCurriculum();
  renderFaculty();
  renderGlobalPartners();
  renderDownloads();
  renderHighlights();
  renderInfoSections();
  renderGallery();
  initSearchModal();
  initContactForm();

  // Scroll effect for header
  window.addEventListener('scroll', () => {
    const navbar = document.getElementById('navbar');
    if (window.scrollY > 20) {
      navbar.classList.add('shadow-md', 'bg-white/95', 'backdrop-blur-md');
      navbar.classList.remove('bg-white');
    } else {
      navbar.classList.remove('shadow-md', 'bg-white/95', 'backdrop-blur-md');
      navbar.classList.add('bg-white');
    }
  });

  // Mobile menu toggle
  const mobileBtn = document.getElementById('mobile-menu-btn');
  const mobileMenu = document.getElementById('mobile-menu');
  if (mobileBtn && mobileMenu) {
    mobileBtn.addEventListener('click', () => {
      mobileMenu.classList.toggle('hidden');
    });
  }
});

// Language Switcher Functionality
function setLanguage(lang) {
  currentLang = lang;
  try { localStorage.setItem('immba_lang', lang); } catch (e) { /* storage blocked */ }
  document.documentElement.lang = lang === 'zh' ? 'zh-TW' : 'en';

  // Toggle button styling
  document.getElementById('btn-lang-zh').className = `px-3 py-1 text-xs font-bold transition ${lang === 'zh' ? 'bg-burgundy text-white' : 'text-slate-600 hover:text-slate-900'}`;
  document.getElementById('btn-lang-en').className = `px-3 py-1 text-xs font-bold transition ${lang === 'en' ? 'bg-burgundy text-white' : 'text-slate-600 hover:text-slate-900'}`;

  // Update i18n text nodes
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (i18n[lang] && i18n[lang][key]) {
      el.textContent = i18n[lang][key];
    }
  });

  // Re-render dynamic components
  initStats();
  renderAnnouncements();
  renderFeatures();
  renderAdmissions();
  renderCurriculum();
  renderFaculty();
  renderGlobalPartners();
  renderDownloads();
  renderHighlights();
  renderInfoSections();
  renderGallery();
  if (window.__markComingSoon) window.__markComingSoon();
}

// Header: slides away smoothly when the visitor scrolls down and slides back at the top.
// The "Collapse / Expand main menu" button works by hand. Expanding by hand pins the menu open.
function initMenuCollapse() {
  const btn = document.getElementById('menu-collapse-btn');
  const header = document.getElementById('navbar');
  const topbar = document.getElementById('topbar');
  const actions = document.getElementById('nav-actions');
  const slot = document.getElementById('topbar-slot');
  const label = document.getElementById('menu-collapse-label');
  const icon = document.getElementById('menu-collapse-icon');
  if (!btn || !header || !topbar || !actions || !slot) return;

  const root = document.documentElement;
  const desktop = window.matchMedia('(min-width: 1024px)');
  const homeSlot = actions.parentElement;           // where language + Apply live when expanded
  let collapsed = false;
  let autoCollapsed = false;     // collapsed by scrolling (comes back at the top)
  let pinned = false;            // expanded by hand: stays open however far the visitor scrolls
  let lastY = window.scrollY;
  let navTarget = null;
  let navTime = 0;

  // Heights used by the page layout and by anchor links
  function layout(visibleHeader) {
    const tb = topbar.offsetHeight;
    const hh = header.offsetHeight;
    const show = visibleHeader === undefined ? !(collapsed && desktop.matches) : visibleHeader;
    root.style.setProperty('--topbar-h', tb + 'px');
    // The header gets shorter when language + Apply move to the top bar, so only measure it
    // while it is open. Otherwise the hero text would jump up when the header slides away.
    if (!(collapsed && desktop.matches)) root.style.setProperty('--hdr-h', hh + 'px');
    root.style.setProperty('--site-top-h', (tb + (show ? hh : 0)) + 'px');
  }

  function setCollapsed(next, auto) {
    if (next === collapsed) return;
    collapsed = next;
    autoCollapsed = next && !!auto;
    header.classList.toggle('is-collapsed', next);
    (next ? slot : homeSlot).appendChild(actions);
    const key = next ? 'nav_expand' : 'nav_collapse';
    label.setAttribute('data-i18n', key);
    label.textContent = i18n[currentLang][key];
    icon.style.transform = next ? 'rotate(180deg)' : '';
    btn.setAttribute('aria-expanded', String(!next));
    layout();
  }

  btn.addEventListener('click', () => {
    if (collapsed) { pinned = true; setCollapsed(false, false); }   // by hand: keep it open
    else { pinned = false; setCollapsed(true, false); }
  });

  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    if (desktop.matches) {
      if (!collapsed && !pinned && y > lastY && y > 160) setCollapsed(true, true);
      else if (collapsed && autoCollapsed && y <= 4) setCollapsed(false, false);
    }
    lastY = y;
  }, { passive: true });

  // Going to a phone/tablet width: always show the full header again
  desktop.addEventListener('change', e => { if (!e.matches) setCollapsed(false, false); layout(); });

  if (window.ResizeObserver) { const ro = new ResizeObserver(() => layout()); ro.observe(topbar); ro.observe(header); }
  window.addEventListener('resize', () => layout());
  layout();

  // Menu click: work out where the header will be when the scroll ends, so the section lands exactly
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || a.getAttribute('href').length < 2) return;
    const el = document.getElementById(a.getAttribute('href').slice(1));
    if (!el) return;
    navTarget = el.id;
    navTime = Date.now();
    const goingDown = el.getBoundingClientRect().top + window.scrollY > window.scrollY;
    layout(!(desktop.matches && !pinned && (collapsed || goingDown)));
  });

  let settle;
  window.addEventListener('scroll', () => {
    clearTimeout(settle);
    settle = setTimeout(() => {
      if (!navTarget || Date.now() - navTime > 2500) return;
      const el = document.getElementById(navTarget);
      navTarget = null;
      layout();
      if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
    }, 220);
  }, { passive: true });

  // Arriving from another page with #section in the address: land on that section the same way a menu click does
  const goToHash = () => {
    const id = decodeURIComponent(location.hash.slice(1));
    const el = id && document.getElementById(id);
    if (!el) return;
    navTarget = id;
    navTime = Date.now();
    // the browser may already have jumped there, so the scroll listener would not fire: slide the header away by hand
    const farDown = el.getBoundingClientRect().top + window.scrollY > 160;
    if (desktop.matches && !pinned && farDown) setCollapsed(true, true);
    layout(!(desktop.matches && !pinned && farDown));
    el.scrollIntoView({ behavior: 'instant', block: 'start' });
    setTimeout(() => { layout(); el.scrollIntoView({ behavior: 'instant', block: 'start' }); }, 450);
  };
  if (location.hash.length > 1) {
    const t0 = Date.now();
    goToHash();
    // photos and fonts load after the first paint and move things: align again once they are in
    window.addEventListener('load', () => { if (Date.now() - t0 < 6000) setTimeout(goToHash, 100); });
  }
}

// Menu names stay visible for pages that are not built yet; clicking them does nothing
function initComingSoonLinks() {
  const dead = a => {
    const h = a.getAttribute('href') || '';
    return h.length > 1 && h.startsWith('#') && !document.getElementById(h.slice(1));
  };
  const label = () => (currentLang === 'zh' ? '即將推出' : 'Coming soon');
  const mark = () => document.querySelectorAll('#site-top a[href^="#"]').forEach(a => {
    if (dead(a)) { a.setAttribute('title', label()); a.setAttribute('aria-disabled', 'true'); a.classList.add('cursor-default'); }
  });
  mark();
  window.__markComingSoon = mark;
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (a && dead(a)) e.preventDefault();
  }, true);
}

function initNewsToggle() {
  const toggle = document.getElementById('news-toggle');
  if (!toggle) return;
  toggle.addEventListener('click', () => {
    newsExpanded = !newsExpanded;
    renderAnnouncements();
    if (!newsExpanded) document.getElementById('news').scrollIntoView({ block: 'start' });
  });
}

function initLanguage() {
  const zhBtn = document.getElementById('btn-lang-zh');
  const enBtn = document.getElementById('btn-lang-en');
  if (zhBtn) zhBtn.addEventListener('click', () => setLanguage('zh'));
  if (enBtn) enBtn.addEventListener('click', () => setLanguage('en'));
  let saved = 'zh';
  try { saved = localStorage.getItem('immba_lang') === 'en' ? 'en' : 'zh'; } catch (e) { /* storage blocked */ }
  setLanguage(saved);
}

// Render Statistics Ribbon
function initStats() {
  const container = document.getElementById('stats-grid');
  if (!container) return;

  container.innerHTML = imMBAData.stats.map(stat => `
    <div class="py-3 px-2 border-t-2 border-burgundy bg-white text-center">
      <div class="text-xl lg:text-2xl font-serif font-bold text-slate-900">${stat.number}</div>
      <div class="text-[11px] font-bold text-slate-600 leading-snug">${stat[`short_${currentLang}`]}</div>
    </div>
  `).join('');
}

// Render Latest Announcements with Image Thumbnails
// Announcements: cards built from NewsStore (date, title, "View Details" link, source note)
function formatNewsDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d)) return iso;
  return currentLang === 'zh'
    ? iso.replace(/-/g, '/')
    : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const NEWS_PREVIEW_COUNT = 3;
let newsExpanded = false;

function renderAnnouncements() {
  const container = document.getElementById('announcements-list');
  if (!container) return;

  const other = currentLang === 'zh' ? 'en' : 'zh';
  if (!NewsStore.isReady()) {
    container.innerHTML = `<p class="text-sm text-slate-500 col-span-full">${currentLang === 'zh' ? '公告載入中…' : 'Loading announcements…'}</p>`;
    return;
  }
  const all = NewsStore.published();
  const items = newsExpanded ? all : all.slice(0, NEWS_PREVIEW_COUNT);

  const toggle = document.getElementById('news-toggle');
  if (toggle) {
    toggle.classList.toggle('hidden', all.length <= NEWS_PREVIEW_COUNT);
    toggle.setAttribute('aria-expanded', String(newsExpanded));
    toggle.textContent = newsExpanded
      ? (currentLang === 'zh' ? '收合公告' : 'Show fewer')
      : (currentLang === 'zh' ? `查看全部公告（${all.length}）` : `See all announcements (${all.length})`);
  }

  if (!items.length) {
    container.innerHTML = `<p class="text-sm text-slate-500 col-span-full">${currentLang === 'zh' ? '目前沒有公告。' : 'No announcements yet.'}</p>`;
  } else {
    container.innerHTML = items.map(n => {
      const title = n[`title_${currentLang}`] || n[`title_${other}`] || '';
      const excerpt = n[`content_${currentLang}`] || n[`content_${other}`] || '';
      return `
      <article class="news-card group relative flex flex-col bg-white border border-slate-200 p-6 cursor-pointer transition duration-200 ease-out hover:-translate-y-1.5 hover:shadow-xl hover:border-burgundy focus-within:-translate-y-1.5 focus-within:shadow-xl focus-within:border-burgundy">
        <div class="flex items-center justify-between mb-3">
          <time datetime="${escapeHtml(n.date)}" class="text-xs font-mono text-slate-500">${formatNewsDate(n.date)}</time>
          ${n.pinned ? `<span class="px-2 py-0.5 bg-burgundy text-white text-[10px] font-bold uppercase tracking-widest">${currentLang === 'zh' ? '置頂' : 'Pinned'}</span>` : ''}
        </div>
        <h3 class="font-serif text-base font-bold text-slate-900 group-hover:text-burgundy transition leading-snug mb-3">${escapeHtml(title)}</h3>
        <p class="text-xs text-slate-600 leading-relaxed line-clamp-3 mb-5">${escapeHtml(excerpt)}</p>
        <a href="${escapeHtml(n.url)}" target="_blank" rel="noopener" class="mt-auto inline-flex items-center text-xs font-bold text-burgundy uppercase tracking-wider after:absolute after:inset-0 after:content-['']">
          <span>${currentLang === 'zh' ? '查看詳情' : 'View Details'}</span>&nbsp;<svg class="inline-block w-3 h-3 ml-0.5 -mt-0.5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 3h7v7m0-7L10 14M19 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h5"/></svg>
        </a>
      </article>`;
    }).join('');
  }

  const src = document.getElementById('news-source');
  if (src) {
    src.innerHTML = `${currentLang === 'zh' ? NEWS_SOURCE.label_zh : NEWS_SOURCE.label_en} · <a href="${NEWS_SOURCE.url}" target="_blank" rel="noopener" class="underline hover:text-burgundy">${NEWS_SOURCE.url} ${'<svg class="inline-block w-3 h-3 ml-0.5 -mt-0.5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 3h7v7m0-7L10 14M19 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h5"/></svg>'}</a>`;
  }
}

function openAnnouncementModal(id) {
  const item = imMBAData.announcements.find(a => a.id === id);
  if (!item) return;

  const modal = document.getElementById('modal-announcement');
  const title = document.getElementById('modal-title');
  const date = document.getElementById('modal-date');
  const body = document.getElementById('modal-body');

  title.textContent = item[`title_${currentLang}`];
  date.textContent = `${item[`category_${currentLang}`]} | ${item.date}`;
  body.innerHTML = item[`content_${currentLang}`] || item[`summary_${currentLang}`];

  modal.classList.remove('hidden');
}

function closeAnnouncementModal() {
  document.getElementById('modal-announcement').classList.add('hidden');
}

// Render Core Features
function renderFeatures() {
  const container = document.getElementById('features-grid');
  if (!container) return;

  container.innerHTML = imMBAData.features.map(f => `
    <div class="bg-white p-8 border border-slate-200 hover:border-burgundy/40 transition duration-300">
      <div class="font-serif text-3xl font-bold text-burgundy mb-4">${f.number}</div>
      <h3 class="font-serif text-xl font-bold text-slate-900 mb-3">${f[`title_${currentLang}`]}</h3>
      <p class="text-slate-600 text-xs leading-relaxed">${f[`desc_${currentLang}`]}</p>
    </div>
  `).join('');
}

// Render Admissions
function renderAdmissions() {
  const tracksContainer = document.getElementById('admission-tracks');
  const docsContainer = document.getElementById('admission-docs');

  if (tracksContainer) {
    tracksContainer.innerHTML = imMBAData.admissions.domestic.tracks.map(t => `
      <div class="bg-slate-900 text-white p-8 border-t-4 border-burgundy">
        <h4 class="font-serif text-xl font-bold text-white mb-2">${t[`name_${currentLang}`]}</h4>
        <p class="text-xs text-amber-400 font-mono mb-4 uppercase tracking-wider">${t[`time_${currentLang}`]}</p>
        <div class="space-y-2 text-xs text-slate-300 border-t border-slate-800 pt-4">
          <p><strong class="text-white">${currentLang === 'zh' ? '入學時間：' : 'Enrollment: '}</strong>${t[`entry_${currentLang}`]}</p>
          <p><strong class="text-white">${currentLang === 'zh' ? '評分方式：' : 'Selection: '}</strong>${t[`criteria_${currentLang}`]}</p>
        </div>
      </div>
    `).join('');
  }

  const intl = document.getElementById('admission-intl');
  if (intl) {
    const d = imMBAData.admissions.international;
    intl.innerHTML = `<p>${d[`info_${currentLang}`]}</p><p>${d[`scholarship_${currentLang}`]}</p>`;
  }

  if (docsContainer) {
    docsContainer.innerHTML = imMBAData.admissions.domestic.docs.map((doc, idx) => `
      <li class="flex items-start gap-3 p-3 bg-white border border-slate-200 text-xs text-slate-800">
        <span class="font-mono font-bold text-burgundy">${String(idx + 1).padStart(2, '0')}.</span>
        <span class="font-medium">${doc[`name_${currentLang}`]}</span>
      </li>
    `).join('');
  }
}

// Render Curriculum
function renderCurriculum() {
  const container = document.getElementById('curriculum-grid');
  if (!container) return;
  const req = document.getElementById('curriculum-requirements');
  if (req) req.innerHTML = `<strong class="text-slate-900">${i18n[currentLang].cur_requirements_label}${currentLang === 'zh' ? '：' : ': '}</strong>${imMBAData.curriculum[`requirements_${currentLang}`]}`;

  container.innerHTML = imMBAData.curriculum.categories.map(cat => `
    <div class="bg-white border border-slate-200 p-6">
      <div class="flex items-center justify-between border-b border-slate-200 pb-4 mb-4">
        <h4 class="font-serif text-lg font-bold text-slate-900">${cat[`name_${currentLang}`]}</h4>
        <span class="px-3 py-1 bg-slate-100 text-slate-800 text-xs font-bold uppercase font-mono">${cat.credits}</span>
      </div>
      <div class="space-y-2.5">
        ${cat.courses.map(c => `
          <div class="flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 transition">
            <div>
              <span class="text-xs font-mono font-bold text-burgundy me-2">${c.code}</span>
              <span class="text-xs font-semibold text-slate-800">${c[`title_${currentLang}`]}</span>
            </div>
            <span class="text-xs font-mono text-slate-500">${c.credits} ${currentLang === 'zh' ? '學分' : 'Credits'}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

// Render Faculty Directory: one professor per row, full-time first, then part-time
function renderFaculty() {
  const container = document.getElementById('faculty-list');
  if (!container) return;
  const t = key => (i18n[currentLang] && i18n[currentLang][key]) || key;
  const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ico = d => `<svg class="w-4 h-4 mt-0.5 shrink-0 text-burgundy" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="${d}"/></svg>`;
  const ICON_MAIL = 'M3 8l9 6 9-6M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z';
  const ICON_PHONE = 'M3 5a2 2 0 012-2h2.3a1 1 0 01.95.68l1.1 3.3a1 1 0 01-.5 1.2l-1.6.8a11 11 0 005.3 5.3l.8-1.6a1 1 0 011.2-.5l3.3 1.1a1 1 0 01.68.95V19a2 2 0 01-2 2h-1C9.7 21 3 14.3 3 6V5z';
  const ICON_WEB = 'M12 21a9 9 0 100-18 9 9 0 000 18zM3.6 9h16.8M3.6 15h16.8M12 3a14 14 0 010 18M12 3a14 14 0 000 18';

  const card = f => `
    <article class="faculty-card group relative bg-white border border-slate-200 border-l-4 border-l-slate-200 transition duration-200 ease-out hover:-translate-y-1 hover:shadow-xl hover:border-burgundy hover:border-l-burgundy focus-within:border-burgundy focus-within:border-l-burgundy">
      <div class="flex flex-col sm:flex-row">
        <div class="sm:w-48 lg:w-56 shrink-0 bg-slate-100 h-72 sm:h-auto sm:self-stretch overflow-hidden">
          <img src="${esc(f.image_url)}" alt="${esc(f.name)}" loading="lazy" class="w-full h-full min-h-[14rem] object-cover object-top">
        </div>
        <div class="flex-1 p-6 lg:p-8 min-w-0">
          <h3 class="font-serif text-2xl font-bold text-slate-900 leading-tight">${esc(f.name)}</h3>
          <div class="mt-1 text-xs font-bold text-burgundy uppercase tracking-wider">${esc(f.title)}</div>
          <div class="mt-5 pt-5 border-t border-slate-200 grid lg:grid-cols-5 gap-x-10 gap-y-5">
            <div class="lg:col-span-3 space-y-4">
              <div>
                <div class="font-mono text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">${t('fac_education')}</div>
                <p class="text-sm text-slate-700 leading-relaxed">${esc(f.education)}</p>
              </div>
              <div>
                <div class="font-mono text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">${t('fac_research')}</div>
                <div class="flex flex-wrap gap-1.5">
                  ${f.research_fields.split(',').map(x => x.trim()).filter(Boolean).map(x => `<span class="px-2.5 py-1 bg-slate-100 text-slate-700 text-xs">${esc(x)}</span>`).join('')}
                </div>
              </div>
            </div>
            <div class="lg:col-span-2">
              <div class="font-mono text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">${t('fac_contact')}</div>
              <ul class="space-y-2 text-sm text-slate-700">
                ${f.email ? `<li class="flex gap-2.5">${ico(ICON_MAIL)}<a href="mailto:${esc(f.email)}" class="break-all hover:text-burgundy underline-offset-2 hover:underline">${esc(f.email)}</a></li>` : ''}
                ${f.phone ? `<li class="flex gap-2.5">${ico(ICON_PHONE)}<span>${esc(f.phone)}</span></li>` : ''}
                ${f.website ? `<li class="flex gap-2.5">${ico(ICON_WEB)}<a href="${esc(f.website)}" target="_blank" rel="noopener" class="break-all hover:text-burgundy underline-offset-2 hover:underline">${esc(f.website.replace(/^https?:\/\//, ''))}</a></li>` : ''}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </article>`;

  const all = FacultyStore.all();
  const group = (cat, key) => {
    const rows = all.filter(f => f.category === cat).sort((a, b) => a.sort_order - b.sort_order);
    if (!rows.length) return '';
    return `
      <h3 class="flex items-center gap-4 font-serif text-xl font-bold text-slate-900 mb-6 mt-10 first:mt-0">
        <span>${t(key)}</span><span class="font-mono text-xs font-bold text-slate-400">${rows.length}</span><span class="flex-1 border-t border-slate-300"></span>
      </h3>
      <div class="space-y-5">${rows.map(card).join('')}</div>`;
  };

  if (!FacultyStore.isReady()) {
    container.innerHTML = `<p class="py-10 text-center text-sm text-slate-500">${currentLang === 'zh' ? '載入師資中…' : 'Loading faculty…'}</p>`;
    return;
  }
  container.innerHTML = group('Full-time', 'fac_fulltime') + group('Visiting', 'fac_visiting') + group('Adjunct', 'fac_adjunct');
}

// Render Global Partners with Images
function renderGlobalPartners() {
  const container = document.getElementById('global-partners-grid');
  if (!container) return;

  container.innerHTML = imMBAData.globalPartners.map(p => `
    <div class="bg-white border border-slate-200 overflow-hidden group">
      <div class="aspect-video relative overflow-hidden bg-slate-100">
        <img src="${p.image}" alt="${p[`school_${currentLang}`]}" class="w-full h-full object-cover group-hover:scale-105 transition duration-500">
        <span class="absolute top-3 left-3 px-2.5 py-1 bg-slate-900/90 text-white text-[10px] font-bold uppercase tracking-wider">${p.country}</span>
      </div>
      <div class="p-6">
        <span class="text-xs font-bold text-burgundy uppercase tracking-wider block mb-1">${p.type}</span>
        <h4 class="font-serif text-lg font-bold text-slate-900 mb-2 leading-snug">${p[`school_${currentLang}`]}</h4>
        <p class="text-xs text-slate-600 leading-relaxed">${p[`desc_${currentLang}`]}</p>
      </div>
    </div>
  `).join('');
}

// Render Downloads
function renderDownloads() {
  const container = document.getElementById('downloads-list');
  if (!container) return;

  container.innerHTML = imMBAData.downloads.map(d => `
    <div class="bg-white border border-slate-200 p-4 flex items-center justify-between hover:border-burgundy transition">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 bg-slate-100 text-burgundy font-mono font-bold flex items-center justify-center text-xs">
          ${d.file.split('.').pop().toUpperCase()}
        </div>
        <div>
          <h5 class="text-xs font-bold text-slate-900">${d[`title_${currentLang}`]}</h5>
          <span class="text-[11px] text-slate-400 font-mono">${d.file} • ${d.size}</span>
        </div>
      </div>
      <a href="https://www.management.fju.edu.tw/esubweb/immbaengindex/download.php" target="_blank" rel="noopener" class="px-3 py-1.5 bg-slate-900 hover:bg-burgundy text-white text-xs font-bold uppercase transition whitespace-nowrap">
        <span>${i18n[currentLang].btn_download} (${d.file.split('.').pop().toUpperCase()})</span>
        <svg class="inline-block w-3 h-3 ml-0.5 -mt-0.5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 3h7v7m0-7L10 14M19 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h5"/></svg>
      </a>
    </div>
  `).join('');
}

function renderInfoSections() {
  const ext = '<svg class="inline-block w-3 h-3 ml-0.5 -mt-0.5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 3h7v7m0-7L10 14M19 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h5"/></svg>';
  Object.entries(imMBAData.info).forEach(([id, blocks]) => {
    const container = document.getElementById(`info-${id}`);
    if (!container) return;
    container.innerHTML = blocks.map(b => {
      if (b.t === 'p') return `<p>${b[currentLang]}</p>`;
      if (b.t === 'h') return `<h3 class="font-serif text-lg font-bold text-slate-900 pt-2">${b[currentLang]}</h3>`;
      if (b.t === 'ul') return `<ul class="list-disc pl-5 space-y-2">${b[currentLang].map(t => `<li>${t}</li>`).join('')}</ul>`;
      return `<ul class="space-y-2">${b.items.map(l => `
        <li><a href="${l.url}" target="_blank" rel="noopener" class="font-semibold text-burgundy hover:underline">${l[currentLang]}${l.pdf ? ' (PDF)' : ''} ${ext}</a></li>`).join('')}</ul>`;
    }).join('');
  });
}

function renderHighlights() {
  const container = document.getElementById('highlights-grid');
  if (!container) return;

  container.innerHTML = imMBAData.highlights.map(h => `
    <article class="bg-white border border-slate-200 p-6 flex flex-col hover:border-burgundy transition">
      <div class="flex items-center justify-between mb-3">
        <span class="px-2 py-0.5 bg-burgundy text-white text-[10px] font-bold uppercase tracking-widest">${h[`tag_${currentLang}`]}</span>
        <span class="text-[11px] text-slate-400 font-mono">${h.date}</span>
      </div>
      <h3 class="font-serif text-base font-bold text-slate-900 mb-2">${h[`title_${currentLang}`]}</h3>
      <p class="text-xs text-slate-600 leading-relaxed">${h[`summary_${currentLang}`]}</p>
    </article>
  `).join('');
}

function downloadFile(fileName) {
  alert(`${currentLang === 'zh' ? '準備下載檔案：' : 'Downloading file: '} ${fileName}`);
}

// Render Authentic FJCU Gallery
function renderGallery() {
  const container = document.getElementById('gallery-grid');
  if (!container) return;

  container.innerHTML = imMBAData.gallery.map(g => `
    <div class="group relative bg-slate-900 overflow-hidden cursor-pointer aspect-video" onclick="openLightbox('${g.url}', '${g[`title_${currentLang}`]}')">
      <img src="${g.url}" alt="${g[`title_${currentLang}`]}" class="w-full h-full object-cover group-hover:scale-105 transition duration-500 opacity-90 group-hover:opacity-100">
      <div class="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent"></div>
      <div class="absolute bottom-3 left-3 right-3 text-white">
        <span class="px-2 py-0.5 bg-burgundy text-white text-[10px] font-bold uppercase tracking-wider inline-block mb-1">${g.tag}</span>
        <h5 class="text-xs font-bold leading-snug font-serif">${g[`title_${currentLang}`]}</h5>
      </div>
    </div>
  `).join('');
}

function openLightbox(url, caption) {
  const modal = document.getElementById('modal-lightbox');
  const img = document.getElementById('lightbox-img');
  const cap = document.getElementById('lightbox-caption');

  img.src = url;
  cap.textContent = caption;
  modal.classList.remove('hidden');
}

function closeLightbox() {
  document.getElementById('modal-lightbox').classList.add('hidden');
}

// Search Modal
function initSearchModal() {
  const searchInput = document.getElementById('search-input');
  if (!searchInput) return;

  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    const resultsContainer = document.getElementById('search-results');

    if (!query) {
      resultsContainer.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">${currentLang === 'zh' ? '輸入關鍵字搜尋公告、課程或師資...' : 'Type to search announcements, courses, or faculty...'}</p>`;
      return;
    }

    const matchedNews = imMBAData.announcements.filter(a => a[`title_${currentLang}`].toLowerCase().includes(query));
    const matchedFaculty = imMBAData.faculty.filter(f => f[`name_${currentLang}`].toLowerCase().includes(query) || f[`expertise_${currentLang}`].toLowerCase().includes(query));

    let html = '';

    if (matchedNews.length > 0) {
      html += `<div class="mb-2 font-bold text-xs text-burgundy uppercase tracking-wider">${currentLang === 'zh' ? '公告事項' : 'Announcements'}</div>`;
      html += matchedNews.map(n => `
        <div class="p-2 hover:bg-slate-100 cursor-pointer text-xs font-medium text-slate-800" onclick="closeSearchModal(); openAnnouncementModal('${n.id}');">
          ${n[`title_${currentLang}`]}
        </div>
      `).join('');
    }

    if (matchedFaculty.length > 0) {
      html += `<div class="mt-3 mb-2 font-bold text-xs text-burgundy uppercase tracking-wider">${currentLang === 'zh' ? '師資團隊' : 'Faculty'}</div>`;
      html += matchedFaculty.map(f => `
        <div class="p-2 hover:bg-slate-100 cursor-pointer text-xs font-medium text-slate-800">
          👨‍🏫 ${f[`name_${currentLang}`]} — ${f[`expertise_${currentLang}`]}
        </div>
      `).join('');
    }

    if (matchedNews.length === 0 && matchedFaculty.length === 0) {
      html = `<p class="text-xs text-slate-400 text-center py-4">${currentLang === 'zh' ? '未找到相關結果' : 'No matching results found'}</p>`;
    }

    resultsContainer.innerHTML = html;
  });
}

function openSearchModal() {
  document.getElementById('modal-search').classList.remove('hidden');
  document.getElementById('search-input').focus();
}

function closeSearchModal() {
  document.getElementById('modal-search').classList.add('hidden');
}

// Contact Form Handler
function initContactForm() {
  const form = document.getElementById('contact-form');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    alert(currentLang === 'zh' ? '感謝您的諮詢！我們的專員將會儘速與您聯繫。' : 'Thank you for your inquiry! We will contact you shortly.');
    form.reset();
  });
}

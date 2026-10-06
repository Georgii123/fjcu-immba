/**
 * FJCU imMBA Official Website JavaScript Logic
 * Top 10 Global Business School Editorial Interactions
 */

let currentLang = 'zh'; // Default language ('zh' or 'en')
let activeCategory = 'all';

document.addEventListener('DOMContentLoaded', () => {
  initLanguage();
  initStats();
  renderAnnouncements();
  renderFeatures();
  renderAdmissions();
  renderCurriculum();
  renderFaculty();
  renderGlobalPartners();
  renderDownloads();
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
  renderGallery();
}

function initLanguage() {
  const zhBtn = document.getElementById('btn-lang-zh');
  const enBtn = document.getElementById('btn-lang-en');
  if (zhBtn) zhBtn.addEventListener('click', () => setLanguage('zh'));
  if (enBtn) enBtn.addEventListener('click', () => setLanguage('en'));
  setLanguage('zh');
}

// Render Statistics Ribbon
function initStats() {
  const container = document.getElementById('stats-grid');
  if (!container) return;

  container.innerHTML = imMBAData.stats.map(stat => `
    <div class="p-6 border-t-2 border-burgundy bg-white text-center">
      <div class="text-3xl lg:text-4xl font-serif font-bold text-slate-900 mb-1">${stat.number}</div>
      <div class="text-sm font-bold text-slate-800 mb-1 leading-snug">${stat[`label_${currentLang}`]}</div>
      <div class="text-xs text-slate-500 leading-relaxed">${stat[`desc_${currentLang}`]}</div>
    </div>
  `).join('');
}

// Render Latest Announcements with Image Thumbnails
function filterAnnouncements(category) {
  activeCategory = category;
  document.querySelectorAll('.news-tab-btn').forEach(btn => {
    if (btn.getAttribute('data-category') === category) {
      btn.className = 'news-tab-btn px-4 py-2 text-xs font-bold uppercase tracking-wider bg-burgundy text-white border border-burgundy transition';
    } else {
      btn.className = 'news-tab-btn px-4 py-2 text-xs font-bold uppercase tracking-wider bg-white text-slate-700 border border-slate-200 hover:border-slate-400 transition';
    }
  });
  renderAnnouncements();
}

function renderAnnouncements() {
  const container = document.getElementById('announcements-list');
  if (!container) return;

  let items = imMBAData.announcements;
  if (activeCategory !== 'all') {
    items = items.filter(a => a.category === activeCategory);
  }

  container.innerHTML = items.map(a => `
    <div class="bg-white border border-slate-200 hover:border-burgundy/50 transition duration-300 group cursor-pointer overflow-hidden grid md:grid-cols-12 gap-0" onclick="openAnnouncementModal('${a.id}')">
      <!-- Thumbnail Image -->
      <div class="md:col-span-4 aspect-video md:aspect-auto relative overflow-hidden bg-slate-100">
        <img src="${a.image}" alt="${a[`title_${currentLang}`]}" class="w-full h-full object-cover group-hover:scale-105 transition duration-500">
        ${a.top ? `<span class="absolute top-3 left-3 px-2.5 py-1 bg-burgundy text-white text-[10px] font-bold uppercase tracking-widest">TOP</span>` : ''}
      </div>
      
      <!-- Content -->
      <div class="md:col-span-8 p-6 flex flex-col justify-between">
        <div>
          <div class="flex items-center gap-3 mb-2 text-xs text-slate-500 font-sans">
            <span class="font-bold text-burgundy uppercase tracking-wider">${a[`category_${currentLang}`]}</span>
            <span>•</span>
            <span class="font-mono">${a.date}</span>
          </div>
          <h4 class="font-serif text-lg font-bold text-slate-900 group-hover:text-burgundy transition leading-snug mb-2">
            ${a[`title_${currentLang}`]}
          </h4>
          <p class="text-xs text-slate-600 line-clamp-2 leading-relaxed">
            ${a[`summary_${currentLang}`]}
          </p>
        </div>
        <div class="mt-4 pt-3 border-t border-slate-100 flex items-center text-xs font-bold text-burgundy uppercase tracking-wider group-hover:translate-x-1 transition">
          <span>${currentLang === 'zh' ? '閱讀全文' : 'Read Full Article'}</span>
          <svg class="w-3.5 h-3.5 ms-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
        </div>
      </div>
    </div>
  `).join('');
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

// Render Faculty Directory
function renderFaculty() {
  const container = document.getElementById('faculty-grid');
  if (!container) return;

  container.innerHTML = imMBAData.faculty.map(f => `
    <div class="bg-white border border-slate-200 p-6 flex flex-col justify-between hover:border-burgundy/50 transition">
      <div>
        <div class="w-14 h-14 bg-slate-900 text-white font-serif font-bold rounded-none flex items-center justify-center text-lg mb-4">
          ${f.name_en.split(' ').map(n=>n[0]).join('')}
        </div>
        <h4 class="font-serif text-lg font-bold text-slate-900 mb-1">${f[`name_${currentLang}`]}</h4>
        <div class="text-xs font-bold text-burgundy uppercase tracking-wider mb-2">${f[`title_${currentLang}`]}</div>
        <p class="text-xs text-slate-500 mb-3 font-mono">🎓 ${f[`degree_${currentLang}`]}</p>
        <div class="text-xs text-slate-600 leading-relaxed mb-4">
          <strong class="text-slate-900 block mb-1 uppercase tracking-wider font-mono text-[10px]">${currentLang === 'zh' ? '研究專長' : 'Expertise'}</strong>
          ${f[`expertise_${currentLang}`]}
        </div>
      </div>
      <div class="pt-3 border-t border-slate-100 text-[11px] text-slate-500 font-mono space-y-1">
        <div>📧 ${f.email}</div>
        <div>📍 ${f.office}</div>
      </div>
    </div>
  `).join('');
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
      <button onclick="downloadFile('${d.file}')" class="px-3 py-1.5 bg-slate-900 hover:bg-burgundy text-white text-xs font-bold uppercase transition">
        <span>${i18n[currentLang].btn_download} (${d.file.split('.').pop().toUpperCase()})</span>
      </button>
    </div>
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

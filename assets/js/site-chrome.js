/**
 * Shared header (top bar + logo + menu) and footer for every page.
 * Each page loads this file first, right after <body>, with data-page="home|about|admissions|curriculum|faculty".
 * Menu links point to the right page; a link to the page you are already on is just "#section".
 */
(() => {
  const page = (document.currentScript && document.currentScript.dataset.page) || 'home';
  const FILES = { home: 'index.html', about: 'about.html', admissions: 'admissions.html', curriculum: 'curriculum.html', faculty: 'faculty.html' };
  const h = (p, hash) => (p === page && hash ? '' : FILES[p]) + (hash ? '#' + hash : '');
  const on = p => (p === page ? '!text-burgundy' : '');

  document.write(`
  <div id="site-top" class="fixed top-0 inset-x-0 z-40">
  <!-- ==================== TOP ANNOUNCEMENT BAR ==================== -->
  <div id="topbar" class="relative z-10 bg-slate-900 text-white text-xs py-2 px-4 border-b border-slate-800">
    <div class="max-w-7xl mx-auto flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center lg:grid lg:grid-cols-[1fr_auto_1fr] lg:gap-x-6">
      <div class="hidden lg:block" aria-hidden="true"></div>
      <div class="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        <span class="font-medium text-slate-300">Georgii Zhukov F15381061. This is a course project not an official website</span>
        <span class="hidden sm:inline text-slate-600" aria-hidden="true">|</span>
        <span class="text-slate-300 font-medium whitespace-nowrap">
          <a href="https://www.management.fju.edu.tw/esubweb/immbaengindex/" target="_blank" rel="noopener" class="hover:text-white transition">Official imMBA website <svg class="inline-block w-3 h-3 ml-0.5 -mt-0.5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 3h7v7m0-7L10 14M19 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h5"/></svg></a>
        </span>
      </div>
      <!-- Tools: collapse / expand the header. When collapsed, the language switch and Apply button move in here. -->
      <div id="topbar-tools" class="hidden lg:flex items-center justify-end gap-3">
        <div id="topbar-slot" class="flex items-center"></div>
        <button id="menu-collapse-btn" type="button" aria-expanded="true" aria-controls="navbar" class="flex items-center gap-1.5 px-2.5 py-1 border border-slate-600 text-[11px] font-bold text-slate-200 hover:border-white hover:text-white transition whitespace-nowrap">
        <span id="menu-collapse-label" data-i18n="nav_collapse">Collapse main menu</span>
        <svg id="menu-collapse-icon" class="w-3 h-3 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 15l7-7 7 7"/></svg>
      </button>
      </div>
    </div>
  </div>

  <!-- ==================== MAIN HEADER / NAVIGATION ==================== -->
  <header id="navbar" class="relative z-0 bg-white border-b border-slate-200">
    <!-- Title bar (branding) -->
    <div id="brand-bar" class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex items-center justify-between lg:justify-center h-[72px]">
        <div class="flex items-center">
          <!-- Seal: opens the AdminNews back-office -->
          <a href="admin-news.html" title="Back-office (AdminNews)" aria-label="Open the AdminNews back-office" class="shrink-0 mr-3 rounded-full focus:outline-none focus:ring-2 focus:ring-burgundy">
            <img src="assets/img/seal.svg" alt="Fu Jen Catholic University imMBA seal" class="w-16 h-16 shrink-0 mr-3">
          </a>
          <a href="${h('home')}" class="text-base sm:text-xl font-medium text-[#3a6cb5] hover:text-burgundy transition" data-i18n="nav_title">MBA Program in International Management(imMBA)</a>
        </div>

        <!-- Mobile Toggle Button -->
        <button id="mobile-menu-btn" class="lg:hidden p-2 text-slate-700">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
        </button>
      </div>
    </div>

    <!-- Main menu with dropdowns -->
    <div class="hidden lg:block border-t border-slate-100">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-6">
        <nav id="main-menu" class="flex flex-1 flex-wrap items-center justify-center text-[14px] font-semibold text-slate-800">
          <div class="relative group flex items-center">
            <a href="${h('about')}" class="${on('about')} px-3.5 py-3 hover:text-burgundy transition" data-i18n="nav_about">關於學程</a>
            <div class="absolute left-1/2 -translate-x-1/2 top-full hidden group-hover:block group-focus-within:block z-50">
              <div class="min-w-[230px] bg-white border border-slate-200 border-t-2 border-t-burgundy shadow-lg py-1 text-center font-medium">
                <a href="${h('about','overview')}" class="block px-5 py-2.5 text-[13px] hover:bg-slate-50 hover:text-burgundy transition whitespace-nowrap" data-i18n="nav_about_overview">學程概覽與國際排名</a>
                <a href="${h('about','gallery')}" class="block px-5 py-2.5 text-[13px] hover:bg-slate-50 hover:text-burgundy transition whitespace-nowrap" data-i18n="nav_about_env">我們的學習環境</a>
              </div>
            </div>
          </div>
          <div class="relative group flex items-center">
            <a href="${h('admissions')}" class="${on('admissions')} px-3.5 py-3 hover:text-burgundy transition" data-i18n="nav_admissions">招生專區</a>
            <div class="absolute left-1/2 -translate-x-1/2 top-full hidden group-hover:block group-focus-within:block z-50">
              <div class="min-w-[230px] bg-white border border-slate-200 border-t-2 border-t-burgundy shadow-lg py-1 text-center font-medium">
                <a href="${h('admissions','apply')}" class="block px-5 py-2.5 text-[13px] hover:bg-slate-50 hover:text-burgundy transition whitespace-nowrap" data-i18n="nav_adm_tracks">報名輔大 imMBA</a>
              </div>
            </div>
          </div>
          <div class="relative group flex items-center">
            <a href="${h('curriculum')}" class="${on('curriculum')} px-3.5 py-3 hover:text-burgundy transition" data-i18n="nav_curriculum">課程架構</a>
            <div class="absolute left-1/2 -translate-x-1/2 top-full hidden group-hover:block group-focus-within:block z-50">
              <div class="min-w-[230px] bg-white border border-slate-200 border-t-2 border-t-burgundy shadow-lg py-1 text-center font-medium">
                <a href="${h('curriculum','curriculum')}" class="block px-5 py-2.5 text-[13px] hover:bg-slate-50 hover:text-burgundy transition whitespace-nowrap" data-i18n="nav_cur_curriculum">課程與修業規定</a>
              </div>
            </div>
          </div>
          <a href="${h('faculty')}" class="${on('faculty')} px-3.5 py-3 hover:text-burgundy transition"><span data-i18n="nav_faculty">師資陣容</span></a>
          <a href="#guide" class="px-3.5 py-3 hover:text-burgundy transition"><span data-i18n="nav_guide">學程指南</span></a>
          <a href="#graduation" class="px-3.5 py-3 hover:text-burgundy transition"><span data-i18n="nav_graduation">畢業規定</span></a>
          <a href="#global" class="px-3.5 py-3 hover:text-burgundy transition"><span data-i18n="nav_global">跨國雙碩士</span></a>
          <a href="#exchange" class="px-3.5 py-3 hover:text-burgundy transition"><span data-i18n="nav_exchange">海外交換</span></a>
          <a href="#marketplace" class="px-3.5 py-3 hover:text-burgundy transition"><span data-i18n="nav_marketplace">職缺平台</span></a>
          <a href="#highlights" class="px-3.5 py-3 hover:text-burgundy transition"><span data-i18n="nav_events">活動花絮</span></a>
          <a href="${h('home','news')}" class="px-3.5 py-3 hover:text-burgundy transition"><span data-i18n="nav_announcements">最新公告</span></a>
          <a href="#downloads" class="px-3.5 py-3 hover:text-burgundy transition"><span data-i18n="nav_downloads">表格下載</span></a>
          <a href="https://www.management.fju.edu.tw/index_en.php" target="_blank" rel="noopener" class="px-3.5 py-3 hover:text-burgundy transition"><span data-i18n="nav_college_menu">管理學院</span> <svg class="inline-block w-3 h-3 ml-0.5 -mt-0.5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 3h7v7m0-7L10 14M19 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h5"/></svg></a>
      </nav>

        <div id="nav-actions" class="flex items-center gap-3 shrink-0 ml-auto">
          <!-- Language Switcher -->
          <div class="flex items-center border border-slate-200">
            <button id="btn-lang-zh" class="px-2.5 py-1 text-xs font-bold bg-burgundy text-white">中文</button>
            <button id="btn-lang-en" class="px-2.5 py-1 text-xs font-bold text-slate-600 hover:text-slate-900">EN</button>
          </div>
          <!-- Apply CTA -->
          <a href="https://www.management.fju.edu.tw/esubweb/immbaengindex/enroll.php?IID=3" target="_blank" rel="noopener" class="px-5 py-2.5 bg-slate-900 hover:bg-burgundy text-white text-xs font-bold uppercase tracking-wider transition whitespace-nowrap"><span data-i18n="btn_apply">立即報名</span> <svg class="inline-block w-3 h-3 ml-0.5 -mt-0.5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 3h7v7m0-7L10 14M19 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h5"/></svg></a>
        </div>
      </div>
    </div>

    <!-- Mobile Dropdown Menu -->
    <div id="mobile-menu" class="hidden lg:hidden bg-white border-t border-slate-200 px-4 py-4 space-y-3">
      <a href="${h('about')}" class="${on('about')} block text-slate-800 font-bold text-sm hover:text-burgundy" data-i18n="nav_about">關於學程</a>
      <a href="${h('admissions')}" class="${on('admissions')} block text-slate-800 font-bold text-sm hover:text-burgundy" data-i18n="nav_admissions">招生專區</a>
      <a href="${h('curriculum')}" class="${on('curriculum')} block text-slate-800 font-bold text-sm hover:text-burgundy" data-i18n="nav_curriculum">課程架構</a>
      <a href="${h('faculty')}" class="${on('faculty')} block text-slate-800 font-bold text-sm hover:text-burgundy" data-i18n="nav_faculty">師資陣容</a>
      <a href="#guide" class="block text-slate-800 font-bold text-sm hover:text-burgundy" data-i18n="nav_guide">學程指南</a>
      <a href="#graduation" class="block text-slate-800 font-bold text-sm hover:text-burgundy" data-i18n="nav_graduation">畢業規定</a>
      <a href="#global" class="block text-slate-800 font-bold text-sm hover:text-burgundy" data-i18n="nav_global">跨國雙碩士</a>
      <a href="#exchange" class="block text-slate-800 font-bold text-sm hover:text-burgundy" data-i18n="nav_exchange">海外交換</a>
      <a href="#marketplace" class="block text-slate-800 font-bold text-sm hover:text-burgundy" data-i18n="nav_marketplace">職缺平台</a>
      <a href="#highlights" class="block text-slate-800 font-bold text-sm hover:text-burgundy" data-i18n="nav_events">活動花絮</a>
      <a href="${h('home','news')}" class="block text-slate-800 font-bold text-sm hover:text-burgundy" data-i18n="nav_announcements">最新公告</a>
      <a href="#downloads" class="block text-slate-800 font-bold text-sm hover:text-burgundy" data-i18n="nav_downloads">表格下載</a>
      <a href="#contact" class="block text-slate-800 font-bold text-sm hover:text-burgundy" data-i18n="nav_contact">聯絡我們</a>
      <a href="https://www.management.fju.edu.tw/index_en.php" target="_blank" rel="noopener" class="block text-slate-800 font-bold text-sm hover:text-burgundy"><span data-i18n="nav_college_menu">管理學院</span> <svg class="inline-block w-3 h-3 ml-0.5 -mt-0.5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 3h7v7m0-7L10 14M19 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h5"/></svg></a>
      <a href="https://www.management.fju.edu.tw/esubweb/immbaengindex/enroll.php?IID=3" target="_blank" rel="noopener" class="block text-center px-5 py-2.5 bg-slate-900 text-white text-xs font-bold uppercase tracking-wider"><span data-i18n="btn_apply">立即報名</span> <svg class="inline-block w-3 h-3 ml-0.5 -mt-0.5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 3h7v7m0-7L10 14M19 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h5"/></svg></a>
      <div class="pt-3 border-t border-slate-200 flex items-center justify-between">
        <span class="text-xs text-slate-500">Language / 語言：</span>
        <div class="flex border border-slate-200">
          <button onclick="setLanguage('zh')" class="px-3 py-1 bg-burgundy text-white text-xs font-bold">中文</button>
          <button onclick="setLanguage('en')" class="px-3 py-1 bg-white text-slate-700 text-xs font-bold">EN</button>
        </div>
      </div>
    </div>
  </header>
  </div>

  <div id="top-spacer" aria-hidden="true"></div>
`);

  // Footer goes in once the page has loaded (before app.js applies the language)
  document.addEventListener('DOMContentLoaded', () => {
    document.body.insertAdjacentHTML('beforeend', `
  <footer class="bg-slate-950 text-slate-500 py-8 border-t border-slate-800 text-[11px]">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
      <div data-i18n="footer_copyright">
        Copyright © 2026 輔仁大學管理學院 國際經營管理碩士班. 版權所有.
      </div>
      <div class="flex gap-4 font-mono">
        <a href="https://www.management.fju.edu.tw/" target="_blank" rel="noopener" class="hover:text-amber-400">輔大管理學院主網 <svg class="inline-block w-3 h-3 ml-0.5 -mt-0.5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 3h7v7m0-7L10 14M19 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h5"/></svg></a>
        <a href="https://www.fju.edu.tw/" target="_blank" rel="noopener" class="hover:text-amber-400">輔仁大學校園網 <svg class="inline-block w-3 h-3 ml-0.5 -mt-0.5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 3h7v7m0-7L10 14M19 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h5"/></svg></a>
      </div>
    </div>
  </footer>
`);
  });
})();

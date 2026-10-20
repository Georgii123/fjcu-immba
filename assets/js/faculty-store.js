/**
 * FacultyStore: where the public website gets its faculty list.
 * Source of truth = the Supabase table `faculty` (managed on the AdminFaculty page).
 * If Supabase cannot be reached, or the table is still empty, it falls back to the last
 * list this browser received, and finally to the built-in list (FACULTY_SEED in faculty-seed.js).
 */
const FacultyStore = (() => {
  const CACHE_KEY = 'immba_faculty_cache_v1';
  let cache = null;
  let ready = false;
  let source = 'loading'; // 'supabase' | 'cache' | 'seed'

  const sortList = list => list.slice().sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0));

  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      const parsed = raw && JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length ? parsed : null;
    } catch (e) { return null; }
  }

  function writeCache(list) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(list)); } catch (e) { /* storage blocked */ }
  }

  async function load() {
    const cfg = window.SUPABASE_CONFIG;
    try {
      if (!cfg || !cfg.url || !cfg.key) throw new Error('Supabase is not configured');
      const res = await fetch(`${cfg.url}/rest/v1/faculty?select=*&order=sort_order.asc`, {
        headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` }
      });
      if (!res.ok) throw new Error('Supabase answered ' + res.status);
      const data = await res.json();
      if (!Array.isArray(data) || !data.length) throw new Error('No faculty in the database yet');
      cache = sortList(data);
      source = 'supabase';
      writeCache(cache);
    } catch (e) {
      const old = readCache();
      cache = sortList(old || FACULTY_SEED);
      source = old ? 'cache' : 'seed';
    }
    ready = true;
    return cache;
  }

  return {
    load,
    all: () => cache || sortList(FACULTY_SEED),
    isReady: () => ready,
    source: () => source
  };
})();

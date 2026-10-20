/**
 * NewsStore: where the public website gets its announcements.
 * Source of truth = the Supabase table `announcements` (shared by every visitor).
 * If Supabase cannot be reached, it falls back to the last list this browser
 * received, and finally to the built-in list (NEWS_SEED in news-seed.js).
 * The AdminNews page talks to Supabase directly (see admin-news.js).
 */
const NewsStore = (() => {
  const CACHE_KEY = 'immba_news_cache_v2';
  let cache = null;       // published announcements, sorted by display order
  let ready = false;
  let source = 'loading'; // 'supabase' | 'cache' | 'seed'

  const sortByOrder = list => list.slice().sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  const seedPublished = () => sortByOrder(NEWS_SEED.filter(n => n.status === 'published'));

  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      const parsed = raw && JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch (e) { return null; }
  }

  function writeCache(list) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(list)); } catch (e) { /* storage blocked */ }
  }

  async function load() {
    const cfg = window.SUPABASE_CONFIG;
    try {
      if (!cfg || !cfg.url || !cfg.key) throw new Error('Supabase is not configured');
      const res = await fetch(`${cfg.url}/rest/v1/announcements?select=*&status=eq.published&order=order.asc`, {
        headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` }
      });
      if (!res.ok) throw new Error('Supabase answered ' + res.status);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('Unexpected response');
      cache = sortByOrder(data);
      source = 'supabase';
      writeCache(cache);
    } catch (e) {
      const old = readCache();
      cache = old ? sortByOrder(old) : seedPublished();
      source = old ? 'cache' : 'seed';
    }
    ready = true;
    return cache;
  }

  return {
    load,
    published: () => cache || seedPublished(),
    isReady: () => ready,
    source: () => source
  };
})();

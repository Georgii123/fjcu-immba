/**
 * NewsStore: one place that reads and writes announcements.
 * Records live in this browser's localStorage (key below). On first use they are
 * copied from NEWS_SEED (assets/js/news-seed.js). The public Announcements section
 * and the AdminNews page both use this store, so edits show up on the site.
 */
const NewsStore = (() => {
  const KEY = 'immba_news_v1';

  function seedCopy() {
    return JSON.parse(JSON.stringify(NEWS_SEED));
  }

  function all() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) { /* storage unavailable or corrupted: fall back to the seed */ }
    return seedCopy();
  }

  function save(list) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      return false;
    }
  }

  function published() {
    return all()
      .filter(n => n.status === 'published')
      .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  }

  function reset() {
    try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  }

  return { all, save, published, reset, seedCopy, KEY };
})();

// Offline copy and updates for the website / home-screen version of the game.
//  - The page itself: always fetched fresh when online (so a new version is picked up the
//    next time the game is opened), falling back to the saved copy when offline or when the
//    network takes too long.
//  - Everything else (the game code, fonts, icons): taken from the saved copy if there, else
//    downloaded and saved. Game code files have a new name for every version, so a new
//    version never gets an old file by mistake.
// Old files are cleared out each time a new version of the page is saved.
const CACHE = 'w7-game';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

async function freshPage(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await Promise.race([
      fetch(req, { cache: 'no-store' }),
      new Promise((_, no) => setTimeout(() => no(new Error('slow')), 4000))
    ]);
    if (res && res.ok) {
      await cache.put('./', res.clone());
      prune(cache, await res.clone().text());
    }
    return res;
  } catch (e) {
    return (await cache.match('./')) || (await cache.match(req)) || Response.error();
  }
}

/** Remove saved game files that the current page no longer uses. */
async function prune(cache, html) {
  for (const req of await cache.keys()) {
    const u = new URL(req.url);
    if (u.origin === location.origin && /\/assets\//.test(u.pathname)) {
      const name = u.pathname.split('/').pop();
      if (!html.includes(name)) cache.delete(req);
    }
  }
}

async function saved(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate') { e.respondWith(freshPage(req)); return; }
  const fonts = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (url.origin === location.origin || fonts) {
    if (url.pathname.endsWith('/sw.js')) return;
    e.respondWith(saved(req));
  }
});

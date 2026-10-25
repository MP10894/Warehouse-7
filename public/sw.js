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
    if (u.origin === location.origin && /\/assets\//.test(u.pathname)) {   // (old game code and old music)
      const name = u.pathname.split('/').pop();
      if (/\.(mp3|ogg|m4a|wav)$/i.test(name)) continue;   // music is named in the game code, not the page: keep it
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

/**
 * Music and sound files: saved whole the first time, then served from the saved copy. Audio
 * players ask for pieces of the file ("ranges"), and iPhones insist on getting exactly those
 * pieces back, so they're cut out of the saved file here.
 */
async function savedAudio(req) {
  const cache = await caches.open(CACHE);
  const key = new Request(req.url);
  let full = await cache.match(key);
  if (!full) {
    const res = await fetch(key);
    if (!res.ok) return res;
    await cache.put(key, res.clone());
    full = res;
  }
  const range = req.headers.get('range');
  if (!range) return full;
  const blob = await full.blob();
  const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
  const size = blob.size, start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2] || 0));
  const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  return new Response(blob.slice(start, end + 1), {
    status: 206, statusText: 'Partial Content',
    headers: { 'Content-Type': full.headers.get('Content-Type') || 'audio/mpeg', 'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes' }
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate') { e.respondWith(freshPage(req)); return; }
  if (url.origin === location.origin && /\.(mp3|ogg|m4a|wav)$/i.test(url.pathname)) { e.respondWith(savedAudio(req)); return; }
  const fonts = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (url.origin === location.origin || fonts) {
    if (url.pathname.endsWith('/sw.js')) return;
    e.respondWith(saved(req));
  }
});

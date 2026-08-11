const CACHE = 'rhythmos-v3';
const SHELL = ['/', '/index.html'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (
    url.hostname.includes('firebase') ||
    url.hostname.includes('google') ||
    url.hostname.includes('gstatic') ||
    url.hostname.includes('cloudflare') ||
    url.hostname.includes('fonts')
  ) {
    return;
  }
  // Network-first: always try to fetch the current, real file first. Only if
  // that fails (genuinely offline) do we fall back to whatever was cached.
  // This is the opposite of the old cache-first approach, which could keep
  // showing an outdated screen indefinitely after an update, even after the
  // person cleared their browser's normal cache, since a service worker's
  // cache is a separate storage bucket that "clear cache" doesn't always reach.
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const resClone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, resClone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

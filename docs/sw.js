// Offline support for the home-screen app.
// Same-origin files (the page, icons, manifest): try the network first so updates
// arrive straight away, and fall back to the saved copy when offline.
// Data from Apps Script (another origin) is never cached here; the page keeps its own last copy.
// v2: older versions could have cached addresses that still carried ?key=…; activating v2 deletes them.
const CACHE = 'dashboard-shell-v2';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // Store under the bare path: nothing from an address's ?query is ever kept on disk.
  const bare = url.origin + url.pathname;
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(bare, copy)); }
      return res;
    }).catch(() => caches.match(bare).then(hit => hit || caches.match('./index.html')))
  );
});

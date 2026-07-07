const CACHE = 'fixturely-v3';
const SHELL = [
  '/fixturely-app.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', e => {
  // Fetch each shell item ourselves and store a clean copy: addAll() would store
  // redirect-tainted responses (e.g. the 307→login flow), which navigations
  // can't be served from and which poison the offline fallback.
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(async u => {
    try {
      const r = await fetch(u, { redirect: 'follow', credentials: 'same-origin' });
      if (!r.ok || new URL(r.url).pathname !== u) return; // skip anything that redirected away
      const body = await r.blob();
      await c.put(u, new Response(body, { status: 200, headers: r.headers }));
    } catch (_) {}
  }))));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Network-first for navigations. The auth middleware answers with 307s, and
  // redirect responses can't pass through respondWith portably (Chrome rejects
  // followed-redirect responses, Safari blanks on opaqueredirect passthrough).
  // So: follow the redirect ourselves and return a clean copy of the final page.
  if (e.request.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const r = await fetch(e.request.url, { redirect: 'follow', credentials: 'same-origin' });
        const body = await r.blob();
        const clean = new Response(body, { status: r.status, statusText: r.statusText, headers: r.headers });
        // Keep the offline copy fresh — but only the app shell, never the login page
        if (r.ok && new URL(r.url).pathname === '/fixturely-app.html') {
          caches.open(CACHE).then(c => c.put('/fixturely-app.html', clean.clone()));
        }
        return clean;
      } catch (_) {
        return (await caches.match(e.request)) ||
               (await caches.match('/fixturely-app.html')) ||
               new Response('Offline', { status: 503 });
      }
    })());
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request).then(r => r || new Response('Offline', { status: 503 })))
    );
    return;
  }

  // Cache-first for static assets
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
      .catch(() => new Response('', { status: 404 }))
  );
});

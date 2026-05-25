const CACHE_NAME = 'scheduler-pwa-v3';

// Install event - cache all resources
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        // Cache all required resources with relative paths
        return cache.addAll([
          './',
          './index.html',
          './css/style.css',
          './js/app.js',
          './js/db.js',
          './lib/sql-wasm.js',
          './lib/sql-wasm.wasm',
          './lib/xlsx.full.min.js',
          './manifest.json'
        ]);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached version or fetch from network
        return response || fetch(event.request)
          .then(fetchResponse => {
            // Cache successful responses
            if (fetchResponse.ok) {
              const responseClone = fetchResponse.clone();
              caches.open(CACHE_NAME)
                .then(cache => cache.put(event.request, responseClone));
            }
            return fetchResponse;
          });
      })
      .catch(() => {
        // Offline fallback
        return caches.match('./index.html');
      })
  );
});
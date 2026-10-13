const CACHE_NAME = 'nopdf-cache-v2';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './css/style.css',
    './css/tools.css',
    './js/core.js',
    './js/app.js',
    './js/tools/pages.js',
    './js/tools/merge-split.js',
    './js/tools/optimize.js',
    './js/tools/convert.js',
    './js/tools/edit.js',
    './js/tools/colorsplit.js',
    './vendor/pdf.min.js',
    './vendor/pdf.worker.min.js',
    './vendor/pdf-lib.min.js',
    './vendor/jszip.min.js',
    './vendor/fa/css/all.min.css',
    './vendor/fa/webfonts/fa-solid-900.woff2'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        }).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Network-First strategy: selalu ambil data terbaru jika online, fallback ke cache jika offline
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            })
            .catch(() => {
                return caches.match(event.request).then((cachedResponse) => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    if (event.request.mode === 'navigate') {
                        return caches.match('./index.html');
                    }
                });
            })
    );
});

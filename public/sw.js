// public/sw.js
const CACHE_NAME = 'gold-calculator-v2';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(urlsToCache).catch((error) => {
          console.log('Cache addAll failed:', error);
          return Promise.allSettled(
            urlsToCache.map(url => cache.add(url))
          );
        });
      })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // CRITICAL: Don't intercept proxy requests
  if (url.pathname.startsWith('/hidden-app') || 
      url.pathname.startsWith('/hidden-api')) {
    // Let proxy handle these requests - don't cache or intercept
    return;
  }
  
  // Only handle navigation requests and local resources
  if (event.request.mode === 'navigate' || 
      (event.request.url.startsWith(self.location.origin) && 
       !event.request.url.includes('lovableproject.com'))) {
    event.respondWith(
      caches.match(event.request)
        .then((response) => {
          if (response) {
            return response;
          }
          return fetch(event.request).then((response) => {
            // Cache successful responses (but not HEAD requests)
            if (response.status === 200 && event.request.method === 'GET') {
              const responseClone = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseClone);
              });
            }
            return response;
          }).catch(() => {
            // Return cached index.html for navigation requests when offline
            if (event.request.mode === 'navigate') {
              return caches.match('/index.html');
            }
            throw new Error('Network error and no cache available');
          });
        })
    );
  }
});
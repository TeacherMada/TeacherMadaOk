
const CACHE_NAME = 'teachermada-v2';
const ASSETS = [
  '/',
  '/index.html',
  'https://i.ibb.co/B2XmRwmJ/logo.png',
  '/manifest.json'
];

// 1. Installation : On met en cache les fichiers critiques
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch(err => console.warn("Cache addAll failed", err));
    })
  );
});

// 2. Activation : On nettoie les vieux caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch : C'est ce bloc qui permet à Chrome de valider le critère "Offline capable"
// Sans ce fetch handler, le bouton d'installation n'apparaîtra pas.
self.addEventListener('fetch', (event) => {
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    fetch(event.request)
      .catch(() => {
        return caches.match(event.request);
      })
  );
});

// Service Worker Removed.

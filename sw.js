const CACHE_NAME = 'teachermada-v3-secure';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/logo.svg',
  '/logo.png',
  '/manifest.json'
];

// Install: Cache static core assets
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(err => console.warn("Cache addAll failed", err));
    })
  );
});

// Activate: Cleanup old caches
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

// Fetch: Strategy "Network Only" for API/Supabase, "Cache First" for static files
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. IGNORER STRICTEMENT LES REQUÊTES API / SUPABASE / DYNAMIQUES
  // Cela garantit que les crédits et données utilisateur viennent toujours du serveur
  if (url.href.includes('supabase.co') || url.pathname.includes('/api/') || event.request.method !== 'GET') {
    return; // Laisse le navigateur gérer (Network only)
  }

  // 2. Pour les fichiers statiques (JS, CSS, Images, Fonts) -> Cache First
  const isStatic = 
    url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|json|woff2)$/) || 
    STATIC_ASSETS.includes(url.pathname);

  if (isStatic) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        // Retourne le cache si dispo, sinon réseau
        return cachedResponse || fetch(event.request).then((networkResponse) => {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        });
      })
    );
    return;
  }

  // 3. Pour la navigation (HTML) -> Network First (pour avoir la dernière version de l'app)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match('/index.html');
      })
    );
  }
});

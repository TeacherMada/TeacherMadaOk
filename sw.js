
const CACHE_NAME = 'teachermada-online-shortcut';

// INSTALLATION
self.addEventListener('install', (event) => {
  // On force l'activation immédiate pour remplacer l'ancien SW buggé
  self.skipWaiting();
});

// ACTIVATION & NETTOYAGE
self.addEventListener('activate', (event) => {
  event.waitUntil(
    // CRITIQUE : On supprime TOUS les anciens caches (v1, v2, v3, etc.)
    // Cela force l'application à se recharger proprement depuis le serveur.
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          console.log('Nettoyage du cache PWA:', cache);
          return caches.delete(cache);
        })
      );
    }).then(() => self.clients.claim()) // Prend le contrôle immédiat des pages ouvertes
  );
});

// FETCH (INTERCEPTION RÉSEAU)
self.addEventListener('fetch', (event) => {
  // STRATÉGIE : NETWORK ONLY (Comme Chrome)
  // On ne fait RIEN ici (pas de event.respondWith).
  // On laisse le navigateur faire la requête réseau standard.
  // Cela garantit que l'utilisateur a toujours la dernière version et évite les erreurs de chargement de profil liées à un cache obsolète.
  return;
});

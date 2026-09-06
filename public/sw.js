// Service worker minimal : necessaire pour l'installabilite PWA sur
// certains navigateurs (Chrome/Android), mais ne met rien en cache -
// l'app est entierement pilotee par des donnees a jour (offres, criteres,
// candidatures...), une version hors-ligne figee serait trompeuse plutot
// qu'utile pour un outil personnel de recherche active.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});

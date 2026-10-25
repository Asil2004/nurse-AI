// AI Nurse — minimal service worker for installable PWA.
// No offline caching; keeps HTML/asset requests going to the network so updates always apply.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});

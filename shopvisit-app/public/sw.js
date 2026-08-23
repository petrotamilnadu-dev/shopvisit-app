// Minimal service worker — just enough to make the app installable as a home-screen icon.
// It does not cache anything, so staff always get the latest version (no stale offline data).
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => self.clients.claim());
self.addEventListener('fetch', () => {}); // pass-through, required for installability on some Android browsers

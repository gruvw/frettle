'use strict';

/* Frettle service worker: makes the app installable and usable offline.
   Network first: when online, every file comes fresh from the server (so
   updates show up right away) and the saved copy is refreshed; when offline,
   the saved copy is used. */

const CACHE = 'frettle-v2';
const FILES = [
  './',
  'index.html',
  'styles.css',
  'script.js',
  'manifest.json',
  'favicon.svg',
  'favicon.ico',
  'icon-192.png',
  'icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

// Remove caches from older versions of this file
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true })
        .then((saved) => saved || caches.match('index.html')))
  );
});

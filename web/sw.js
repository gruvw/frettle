'use strict';

/* Frettle service worker: makes the app installable and usable offline.

   Opening the app: the page comes fresh from the server when it answers
   quickly (so updates show up right away), else, after WAIT, the saved
   copy (a slow connection, a venue with bad signal, opens the app as fast
   as offline does). Each opening then refreshes the saved copy in the
   background.
   The page's files follow the page: fresh with a fresh page (from the saved
   copy only when the server fails), saved with a saved page, so the files
   of one opening are all from the same version.
   The saved copy is replaced as a whole, only once every file has come
   (never half old, half new). */

const CACHE = 'frettle-v3';
const WAIT = 3000;   // ms the server has to answer, with a saved copy to fall back to
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

// Every file fresh from the server (checked with it, past the browser's own cache), or none
async function fetchAll() {
  const responses = await Promise.all(FILES.map((file) => fetch(new Request(file, { cache: 'no-cache' }))));
  if (responses.some((response) => !response.ok)) throw new Error('incomplete');
  return responses;
}
async function saveAll(responses) {
  const cache = await caches.open(CACHE);
  await Promise.all(FILES.map((file, i) => cache.put(file, responses[i])));
}

self.addEventListener('install', (event) => {
  event.waitUntil(fetchAll().then(saveAll).then(() => self.skipWaiting()));
});

// Remove caches from older versions of this file
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// The saved copy refreshed, at most once at a time
let refreshing = null;
function refresh() {
  if (!refreshing) refreshing = fetchAll().then(saveAll).catch(() => {}).finally(() => { refreshing = null; });
  return refreshing;
}

const saved = (request) => caches.match(request, { ignoreSearch: true });
const savedPage = (request) => saved(request).then((page) => page || caches.match('index.html'));

// Each opening (a page, by its client id): its files saved too when it is
const fromSaved = new Set();

async function openPage(event) {
  const { request } = event;
  const page = await savedPage(request);
  const fresh = fetch(request);
  if (!page) return fresh;   // nothing saved yet: the server, however long it takes
  const late = new Promise((resolve) => { setTimeout(() => resolve(null), WAIT); });
  const answer = await Promise.race([fresh.then((response) => (response.ok ? response : page), () => page), late]);
  if (answer && answer !== page) return answer;
  if (event.resultingClientId) fromSaved.add(event.resultingClientId);
  return page;
}

async function pageFile(event) {
  const { request } = event;
  if (fromSaved.has(event.clientId)) {
    const file = await saved(request);
    if (file) return file;
  }
  try {
    const response = await fetch(request);
    if (response.ok || !(await saved(request))) return response;
  } catch (error) {
    if (!(await saved(request))) throw error;
  }
  return saved(request);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(openPage(event));
    event.waitUntil(refresh());
  } else {
    event.respondWith(pageFile(event));
  }
});

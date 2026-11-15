'use strict';

/* Frettle service worker: makes the app installable and usable offline.

   Opening the app: the page comes fresh from the server when it answers
   quickly (so updates show up right away), else, after WAIT, the saved
   copy (a slow connection, a venue with bad signal, opens the app as fast
   as offline does). Each opening then refreshes the saved copy in the
   background.
   The page's files follow the page: fresh with a fresh page (from the saved
   copy only when the server fails), saved with a saved page, so the files
   of one opening are all from the same version. A page opened from the
   saved copy keeps that copy (read when it opened) for its files: the copy
   refreshed meanwhile (by this opening, or a new version of this file as
   it installs) is for the next opening.
   A saved copy is a cache of its own, kept once every file is in it (never
   half old, half new); the copies before it then go. */

const COPY = 'frettle-';   // a saved copy's cache: COPY and when it was made
const WHOLE = 'saved-copy-whole';   // (in a copy once every file is in it)
const WAIT = 3000;   // ms the server has to answer, with a saved copy to fall back to
const FILES = [
  './',
  'index.html',
  'styles.css',
  'script.js',
  'accidentals.woff2',
  'manifest.json',
  'favicon.svg',
  'favicon.ico',
  'icon-192.png',
  'icon-512.png',
];

const made = (name) => (/^frettle-\d+$/.test(name) ? Number(name.slice(COPY.length)) : -1);   // (-1: not a copy, an older version's cache)
// A file's address, without its query ("?instrument=guitar": the same page)
const address = (url) => { const u = new URL(url, self.registration.scope); u.search = ''; u.hash = ''; return u.href; };

// Every file fresh from the server (checked with it, past the browser's own cache), or none
async function fetchAll() {
  const responses = await Promise.all(FILES.map((file) => fetch(new Request(file, { cache: 'no-cache' }))));
  if (responses.some((response) => !response.ok)) throw new Error('incomplete');
  return responses;
}
// Saved as a new copy; with drop, the copies before it go
async function saveAll(responses, drop = true) {
  const name = COPY + Date.now();
  const cache = await caches.open(name);
  await Promise.all(FILES.map((file, i) => cache.put(file, responses[i])));
  await cache.put(WHOLE, new Response(''));
  if (drop) await dropBefore(name);
}
// The newest whole copy: { name, cache }, or null
async function savedCopy() {
  const names = (await caches.keys()).filter((name) => made(name) >= 0).sort((a, b) => made(b) - made(a));
  for (const name of names) {
    const cache = await caches.open(name);
    if (await cache.match(WHOLE)) return { name, cache };
  }
  return null;
}
// Every cache before this copy goes (a newer one, being saved, stays)
async function dropBefore(keep) {
  const names = await caches.keys();
  await Promise.all(names.filter((name) => name !== keep && made(name) < made(keep)).map((name) => caches.delete(name)));
}

self.addEventListener('install', (event) => {
  // The copies before it stay: the version still running may be serving
  // one. It takes over once a page that version may be opening (this
  // update was found as it opened: answered by WAIT) has asked for its
  // files, so they come from its copy, as the page did.
  const settled = new Promise((resolve) => { setTimeout(resolve, WAIT + 2000); });
  event.waitUntil(fetchAll().then((responses) => saveAll(responses, false)).then(() => settled).then(() => self.skipWaiting()));
});

// Remove the caches from before this version's copy
self.addEventListener('activate', (event) => {
  event.waitUntil(
    savedCopy()
      .then((copy) => copy && dropBefore(copy.name))
      .then(() => self.clients.claim())
  );
});

// The saved copy refreshed, at most once at a time
let refreshing = null;
function refresh() {
  if (!refreshing) refreshing = fetchAll().then(saveAll).catch(() => {}).finally(() => { refreshing = null; });
  return refreshing;
}

/* The saved copy as it is now, every file read: Map address → { body,
   init }, or null (none yet). A copy is never changed, only dropped once
   a newer one is whole: one dropped while read, the newer one. */
async function readCopy() {
  for (let tries = 0; tries < 3; tries++) {
    try {
      const copy = await savedCopy();
      if (!copy) return null;
      const files = new Map();
      for (const file of FILES) {
        const response = await copy.cache.match(file);
        if (!response) throw new Error('dropped');
        files.set(address(file), { body: await response.blob(), init: { status: response.status, statusText: response.statusText, headers: response.headers } });
      }
      return files;
    } catch {
      /* read again */
    }
  }
  return null;
}
const answer = (kept) => new Response(kept.body, kept.init);

// Each opening from the saved copy (a page, by its client id): that copy, for its files
const opened = new Map();
const OPENED_MAX = 5;

async function openPage(event, reading) {
  const { request } = event;
  const fresh = fetch(request);
  const files = await reading;
  const page = files && (files.get(address(request.url)) || files.get(address('index.html')));
  if (!page) return fresh;   // nothing saved yet: the server, however long it takes
  const late = new Promise((resolve) => { setTimeout(() => resolve(null), WAIT); });
  const got = await Promise.race([fresh.then((response) => (response.ok ? response : null), () => null), late]);
  if (got) return got;
  if (event.resultingClientId) {
    opened.set(event.resultingClientId, files);
    if (opened.size > OPENED_MAX) opened.delete(opened.keys().next().value);   // (the oldest opening's: long loaded)
  }
  return answer(page);
}

const saved = async (request) => {
  const copy = await savedCopy();
  return copy ? copy.cache.match(request, { ignoreSearch: true }) : undefined;
};

async function pageFile(event) {
  const { request } = event;
  const files = opened.get(event.clientId);
  const kept = files && files.get(address(request.url));
  if (kept) return answer(kept);
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
    const reading = readCopy();   // (then its refresh: a new copy, for the next opening)
    event.respondWith(openPage(event, reading));
    event.waitUntil(reading.then(refresh));
  } else {
    event.respondWith(pageFile(event));
  }
});

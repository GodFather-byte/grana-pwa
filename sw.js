/* Grana — service worker: deixa o app abrir sem internet. Mude VERSAO a cada publicação. */
const VERSAO = 'grana-v1';
const ARQUIVOS = ['./', 'index.html', 'css/app.css', 'js/app.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;                                   // chamadas ao Gemini passam direto
  const fonte = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== location.origin && !fonte) return;

  e.respondWith(caches.open(VERSAO).then(async cache => {
    const guardado = await cache.match(req, { ignoreSearch: url.origin === location.origin });
    const rede = fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; }).catch(() => null);
    if (fonte && guardado) return guardado;                            // fontes: cache primeiro
    if (guardado) { e.waitUntil(rede); return guardado; }              // app: abre do cache e atualiza por trás
    const res = await rede;
    if (res) return res;
    if (req.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
    return Response.error();
  }));
});

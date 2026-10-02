/* 離線快取：先用快取秒開，背景抓新版，下次打開就是新的。改版時把 VERSION 加一。 */
const VERSION = 'mt-2.0.7';
const FILES = [
  './', 'index.html', 'style.css', 'manifest.webmanifest',
  'js/data.js', 'js/core.js', 'js/sprites.js', 'js/audio.js', 'js/i18n.js', 'js/sync.js', 'js/main.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  // cache: 'reload' 繞過瀏覽器的 HTTP 快取（GitHub Pages 每個檔案快取 10 分鐘）：不然改版後幾分鐘內裝的新快取
  // 會拿到新的 index.html 配舊的 js，版本號是新的、程式卻是舊的（1.4.3 的 sync.js 因此還寫舊路徑）
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // GitHub API 不快取
  e.respondWith(caches.open(VERSION).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request, { cache: 'no-cache' }).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});

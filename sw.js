// 離線快取：有網路時一律抓最新版（並更新快取），沒網路才用快取
const CACHE = 'trip-world-v2';
const SHOTS = Array.from({ length: 29 }, (_, i) => `img/routes/shot${i}.jpg`);
const ASSETS = ['./', 'index.html', 'app.js', 'styles.css', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', ...SHOTS];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // 路線截圖不常變：快取優先；其他（頁面、程式、樣式）：網路優先，略過瀏覽器 HTTP 快取
  const isImage = url.pathname.includes('/img/');
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const cached = await cache.match(e.request, { ignoreSearch: true });
    if (isImage && cached) return cached;
    try {
      const res = await fetch(e.request, { cache: 'no-cache' });
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    } catch {
      return cached || Response.error();
    }
  }));
});

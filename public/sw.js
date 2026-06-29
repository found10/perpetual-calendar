/**
 * Service Worker - PWA离线缓存 + 后台同步
 * 支持 iOS / Android / 鸿蒙 安装到桌面
 */

const CACHE_NAME = 'calendar-gps-v1.0.0';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/lunar.js',
  '/gps.js',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

// 安装：预缓存核心资源
self.addEventListener('install', (event) => {
  console.log('[SW] 安装中...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] 缓存核心资源');
        return cache.addAll(ASSETS).catch(err => {
          console.warn('[SW] 部分资源缓存失败:', err);
        });
      })
      .then(() => self.skipWaiting())
  );
});

// 激活：清理旧缓存
self.addEventListener('activate', (event) => {
  console.log('[SW] 激活中...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// 请求拦截：缓存优先 + 网络回退
self.addEventListener('fetch', (event) => {
  // 跳过API请求和GPS上报
  if (event.request.url.includes('/api/')) {
    return; // 不走缓存，直接网络请求
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      // 缓存命中直接返回
      if (cached) return cached;

      // 网络请求并缓存
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, clone);
        });
        return response;
      }).catch(() => {
        // 离线回退
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
        return new Response('离线模式 - 资源不可用', { status: 503 });
      });
    })
  );
});

// 后台同步 (如果浏览器支持)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-location') {
    console.log('[SW] 后台同步触发');
    event.waitUntil(syncPendingLocations());
  }
});

async function syncPendingLocations() {
  // 获取待同步的定位数据
  const clients = await self.clients.matchAll();
  for (const client of clients) {
    client.postMessage({ type: 'SYNC_LOCATIONS' });
  }
}

/* ===========================================================
 *  sw.js  —  Service Worker（PWA 离线外壳）
 *
 *  缓存策略（关键）：
 *  - Supabase 云端请求：永远走网络，绝不缓存任何业务数据。
 *  - 同源静态资源（HTML/CSS/JS/图标/本地 vendor）：缓存优先 +
 *    后台静默更新（stale-while-revalidate）。联网/断网都先用缓存
 *    秒出外壳，不再干等网络，真正解决「联网打开反而空白几秒」。
 *    后台 fetch 拿到新版后写入缓存，配合版本号 + app.js 的
 *    controllerchange 刷新，部署新代码仍会自动生效。
 *  - 业务数据完全依赖云端 Supabase，不写入本地缓存。
 * =========================================================== */
var CACHE = 'tennis-ao-2.0.8';

var SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/config.js',
  './js/utils.js',
  './js/api.js',
  './js/page-records.js',
  './js/page-calendar.js',
  './js/page-stats.js',
  './js/page-settings.js',
  './js/app.js',
  './js/vendor/supabase.min.js',
  './icons/favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(SHELL.map(function (url) {
        // cache:'reload' 确保安装时拉的是服务端最新文件
        return c.add(new Request(url, { cache: 'reload' })).catch(function () { /* 单个失败不阻塞安装 */ });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);

  // Supabase（认证 / 数据）永远走网络，绝不缓存
  if (url.hostname.indexOf('supabase.co') >= 0) return;

  // 同源资源（HTML/CSS/JS/图标/本地 vendor）：缓存优先 + 后台静默更新。
  // 先用缓存秒回响应（联网/断网都即时），同时后台 fetch 拉最新版写入缓存。
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then(function (cached) {
        // 后台更新：拿网络新版覆盖缓存（失败不影响已返回的缓存响应）
        var updating = fetch(new Request(req, { cache: 'no-cache' }))
          .then(function (res) {
            if (res && (res.status === 200 || res.type === 'opaque')) {
              var copy = res.clone();
              caches.open(CACHE).then(function (c) { c.put(req, copy); });
            }
            return res;
          })
          .catch(function () { /* 断网或网络错误：忽略，保留旧缓存 */ });

        // 有缓存就立刻返回；没有缓存（首次安装）才等网络
        return cached || updating.then(function (r) { return r; }).catch(function () {
          return caches.match('./index.html');   // 导航兜底回首页
        });
      })
    );
  }
});

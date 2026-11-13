/* Music – service worker
 * - Precaches the app shell and icons
 * - Caches songs/covers on request (CACHE_MEDIA message) for full offline playback
 * - Serves audio with HTTP Range support so seeking works offline
 */
const VERSION = "v1";
const SHELL_CACHE = `music-shell-${VERSION}`;
const MEDIA_CACHE = `music-media-${VERSION}`;
const RUNTIME_CACHE = `music-runtime-${VERSION}`;

const SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./favicon.ico",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => Promise.allSettled(SHELL.map((u) => cache.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  const keep = [SHELL_CACHE, MEDIA_CACHE, RUNTIME_CACHE];
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("music-") && !keep.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const isMedia = (url) => /\.(mp3|m4a|ogg|wav|flac|aac)$/i.test(url.pathname);
const isImage = (url) => /\.(jpe?g|png|webp|gif|svg)$/i.test(url.pathname);

async function rangeResponse(request, cached) {
  const header = request.headers.get("range");
  const buf = await cached.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(header || "");
  if (!m) return cached;
  const size = buf.byteLength;
  let start = m[1] ? parseInt(m[1], 10) : 0;
  let end = m[2] ? parseInt(m[2], 10) : size - 1;
  if (!m[1] && m[2]) { start = size - parseInt(m[2], 10); end = size - 1; }
  end = Math.min(end, size - 1);
  if (start > end || start >= size) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    statusText: "Partial Content",
    headers: {
      "Content-Type": cached.headers.get("Content-Type") || "audio/mpeg",
      "Content-Length": String(end - start + 1),
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Accept-Ranges": "bytes"
    }
  });
}

async function mediaHandler(request) {
  const cache = await caches.open(MEDIA_CACHE);
  const key = new Request(request.url);
  const cached = await cache.match(key);
  if (cached) return request.headers.has("range") ? rangeResponse(request, cached) : cached;
  try {
    const res = await fetch(request);
    // Cache complete responses only (not 206 partials)
    if (res.status === 200) cache.put(key, res.clone());
    return res;
  } catch (err) {
    return new Response("Offline", { status: 503, statusText: "Offline" });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => { if (res && (res.status === 200 || res.type === "opaque")) cache.put(request, res.clone()); return res; })
    .catch(() => null);
  return cached || (await network) || new Response("", { status: 504 });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Pages: network first, fall back to cached shell
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => { const copy = res.clone(); caches.open(SHELL_CACHE).then((c) => c.put("./index.html", copy)); return res; })
        .catch(() => caches.match("./index.html").then((r) => r || caches.match("./")))
    );
    return;
  }

  if (url.origin === location.origin && isMedia(url)) {
    event.respondWith(mediaHandler(request));
    return;
  }

  if (url.origin === location.origin && isImage(url)) {
    event.respondWith(staleWhileRevalidate(request, MEDIA_CACHE));
    return;
  }

  // Google Fonts + same-origin static files
  if (url.origin === location.origin || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
  }
});

// Page asks us to download every song + cover for offline use
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "CACHE_MEDIA" || !Array.isArray(data.urls)) return;
  event.waitUntil(cacheAll(data.urls));
});

async function broadcast(msg) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  clients.forEach((c) => c.postMessage(msg));
}

async function cacheAll(urls) {
  const cache = await caches.open(MEDIA_CACHE);
  const total = urls.length;
  let done = 0, failed = 0;
  await broadcast({ type: "PROGRESS", done, total, failed });
  for (const u of urls) {
    try {
      const key = new Request(u);
      if (!(await cache.match(key))) {
        const res = await fetch(key);
        if (res.status === 200) await cache.put(key, res);
        else failed++;
      }
    } catch (e) {
      failed++;
    }
    done++;
    await broadcast({ type: "PROGRESS", done, total, failed });
  }
}

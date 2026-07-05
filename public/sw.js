const STATIC_CACHE_NAME = "egia-static-assets-v1";
const VERSIONED_ASSET_RE = /^\/assets\/.+-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/;

const OFFLINE_HTML = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#0b0b0f" />
    <title>EGIA hors ligne</title>
    <style>
      :root {
        color: #0b0b0f;
        background: #f6f4ee;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      body {
        min-height: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
      }
      main {
        width: min(28rem, calc(100vw - 2rem));
        border: 1px solid #e2e8f0;
        border-radius: 1rem;
        background: #ffffff;
        padding: 1.5rem;
        box-shadow: 0 20px 40px -24px rgba(15, 23, 42, 0.28);
      }
      h1 {
        margin: 0;
        font-size: 1.25rem;
        line-height: 1.4;
      }
      p {
        margin: 0.5rem 0 0;
        color: #475569;
        line-height: 1.6;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>EGIA est hors ligne</h1>
      <p>Reconnectez-vous pour charger vos dernières données.</p>
    </main>
  </body>
</html>`;

const isVersionedStaticAsset = (url) =>
  url.origin === self.location.origin && VERSIONED_ASSET_RE.test(url.pathname);

const isSensitiveSameOriginPath = (url) =>
  url.pathname.startsWith("/api/") ||
  url.pathname.startsWith("/auth/") ||
  url.pathname === "/google_oauth_callback" ||
  url.pathname === "/manifest.webmanifest" ||
  url.pathname === "/sw.js";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  if (isSensitiveSameOriginPath(url)) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(new Request(request, { cache: "no-store" })).catch(
        () =>
          new Response(OFFLINE_HTML, {
            status: 503,
            headers: { "Content-Type": "text/html; charset=utf-8" }
          })
      )
    );
    return;
  }

  if (!isVersionedStaticAsset(url)) {
    return;
  }

  event.respondWith(
    caches.open(STATIC_CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) {
        return cached;
      }

      const response = await fetch(request);
      if (response.ok) {
        await cache.put(request, response.clone());
      }
      return response;
    })
  );
});

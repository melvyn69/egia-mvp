type VercelRequest = {
  url?: string;
};

type VercelResponse = {
  setHeader: (name: string, value: string) => VercelResponse;
  status: (code: number) => VercelResponse;
  json: (payload: unknown) => unknown;
  send: (payload: string) => unknown;
};

const retryAfterSeconds = 120;

export default function maintenance(
  req: VercelRequest,
  res: VercelResponse
) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Retry-After", String(retryAfterSeconds));
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");

  const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
  if (pathname.startsWith("/api/")) {
    return res.status(503).json({
      ok: false,
      error: {
        code: "GOAL002_MAINTENANCE",
        message: "Service temporarily unavailable"
      }
    });
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(503).send(`<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="robots" content="noindex,nofollow">
    <title>EGIA — Maintenance de sécurité</title>
    <style>
      :root { color-scheme: light; font-family: Inter, system-ui, sans-serif; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center;
        background: #f7f3ec; color: #111827; }
      main { width: min(34rem, calc(100% - 2rem)); padding: 2rem;
        border: 1px solid #e5e7eb; border-radius: 1.5rem; background: white;
        box-shadow: 0 1.5rem 4rem rgba(15, 23, 42, .08); }
      p { line-height: 1.6; color: #475569; }
    </style>
  </head>
  <body>
    <main>
      <h1>Maintenance de sécurité en cours</h1>
      <p>EGIA est momentanément indisponible. Aucune action n’est requise.
      Le service sera rétabli automatiquement après les vérifications.</p>
    </main>
  </body>
</html>`);
}

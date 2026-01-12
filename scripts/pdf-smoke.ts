import { renderPdfFromHtml } from "../server/_shared/pdf_html.ts";

const html = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>PDF Smoke</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 24px; }
      h1 { font-size: 24px; margin: 0 0 12px; }
      p { font-size: 14px; }
    </style>
  </head>
  <body>
    <h1>EGIA PDF Smoke</h1>
    <p>Test minimal HTML -> PDF.</p>
  </body>
</html>`;

const run = async () => {
  const isServerless = Boolean(process.env.VERCEL) || process.platform === "linux";
  const localExecPath =
    process.env.CHROME_PATH ?? process.env.PUPPETEER_EXECUTABLE_PATH;
  if (!isServerless && !localExecPath) {
    console.log(
      "pdf smoke skipped: set CHROME_PATH to a local Chrome/Chromium binary."
    );
    process.exit(0);
  }

  const buffer = await renderPdfFromHtml({ html, requestId: "pdf-smoke" });
  console.log(`PDF bytes: ${buffer.length}`);
};

run().catch((error) => {
  console.error("pdf smoke failed", error);
  process.exit(1);
});

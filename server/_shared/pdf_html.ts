import puppeteer from "puppeteer-core";

export async function renderPdfFromHtml(html: string) {
  const isServerless = process.platform === "linux";

  const launchOptions = isServerless
    ? await (async () => {
        const mod: unknown = await import("@sparticuz/chromium");
        const chromium = (mod as { default?: unknown }).default ?? mod;
        const chrom = chromium as {
          args: string[];
          executablePath: () => Promise<string>;
          headless?: "shell" | boolean;
        };
        return {
          args: chrom.args,
          executablePath: await chrom.executablePath(),
          headless: chrom.headless ?? "shell"
        } as const;
      })()
    : {
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
        executablePath:
          process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH,
        headless: true
      };

  if (!isServerless && !launchOptions.executablePath) {
    throw new Error(
      "Local HTML→PDF: set CHROME_PATH or PUPPETEER_EXECUTABLE_PATH to your Chrome/Chromium binary."
    );
  }

  const browser = await puppeteer.launch(launchOptions as never);
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "18mm", right: "14mm", bottom: "18mm", left: "14mm" }
    });
    return pdf;
  } finally {
    await browser.close();
  }
}

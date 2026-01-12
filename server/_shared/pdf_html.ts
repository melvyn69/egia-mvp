import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

type RenderParams = {
  html: string;
  baseUrl?: string;
  requestId?: string;
};

const renderPdfFromHtml = async ({ html, baseUrl, requestId }: RenderParams) => {
  const isServerless = Boolean(process.env.VERCEL) || process.platform === "linux";
  const localExecPath =
    process.env.CHROME_PATH ?? process.env.PUPPETEER_EXECUTABLE_PATH;
  if (!isServerless && !localExecPath) {
    throw new Error(
      "Local PDF smoke requires CHROME_PATH to a local Chrome/Chromium binary. @sparticuz/chromium is linux-only."
    );
  }

  const execPath = isServerless
    ? await chromium.executablePath()
    : (localExecPath as string);
  const args = isServerless ? chromium.args : ["--no-sandbox"];
  const headless = isServerless ? "shell" : true;

  const browser = await puppeteer.launch({
    args,
    defaultViewport: isServerless ? chromium.defaultViewport : undefined,
    executablePath: execPath,
    headless
  });

  try {
    const page = await browser.newPage();
    if (baseUrl) {
      await page.setContent(html, { waitUntil: "networkidle0" });
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" }).catch(() => null);
    } else {
      await page.setContent(html, { waitUntil: "networkidle0" });
    }

    const buffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "24px", right: "24px", bottom: "32px", left: "24px" }
    });
    return Buffer.from(buffer);
  } catch (error) {
    console.error("[pdf-html] render failed", {
      requestId,
      message: error instanceof Error ? error.message : String(error)
    });
    throw error;
  } finally {
    await browser.close();
  }
};

export { renderPdfFromHtml };

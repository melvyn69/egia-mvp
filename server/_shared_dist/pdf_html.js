"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderPdfFromHtml = renderPdfFromHtml;
const chromium_min_1 = __importDefault(require("@sparticuz/chromium-min"));
const puppeteer_core_1 = __importDefault(require("puppeteer-core"));
async function renderPdfFromHtml(html) {
    const isServerless = process.platform === "linux";
    const launchOptions = isServerless
        ? {
            args: chromium_min_1.default.args,
            executablePath: await chromium_min_1.default.executablePath(),
            headless: "shell"
        }
        : {
            args: ["--no-sandbox", "--disable-setuid-sandbox"],
            executablePath: process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH,
            headless: true
        };
    if (!isServerless && !launchOptions.executablePath) {
        throw new Error("Local HTML→PDF: set CHROME_PATH or PUPPETEER_EXECUTABLE_PATH to your Chrome/Chromium binary.");
    }
    const browser = await puppeteer_core_1.default.launch(launchOptions);
    try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "networkidle0" });
        const pdf = await page.pdf({
            format: "A4",
            printBackground: true,
            margin: { top: "18mm", right: "14mm", bottom: "18mm", left: "14mm" }
        });
        return pdf;
    }
    finally {
        await browser.close();
    }
}

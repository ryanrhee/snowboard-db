import { chromium, Browser, BrowserContext } from "playwright";
import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "fs";
import { join } from "path";
import { delay } from "./utils";

let browser: Browser | null = null;
const contexts = new Map<string, BrowserContext>();

const LAUNCH_ARGS = [
  "--disable-blink-features=AutomationControlled",
  "--no-sandbox",
  "--disable-setuid-sandbox",
];

const isDev = process.env.NODE_ENV !== "production";
const CACHE_DIR = join(process.cwd(), ".scrape-cache");
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function getCachePath(url: string): string {
  const hash = createHash("md5").update(url).digest("hex");
  return join(CACHE_DIR, `${hash}.html`);
}

function readCache(url: string): string | null {
  if (!isDev) return null;
  const path = getCachePath(url);
  if (!existsSync(path)) return null;
  const stat = statSync(path);
  if (Date.now() - stat.mtimeMs > CACHE_TTL_MS) return null;
  console.log(`[browser] Cache hit for ${url}`);
  return readFileSync(path, "utf-8");
}

function writeCache(url: string, html: string): void {
  if (!isDev) return;
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(getCachePath(url), html, "utf-8");
}

async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      headless: true,
      args: LAUNCH_ARGS,
    });
  }
  return browser;
}

function getDomain(url: string): string {
  return new URL(url).hostname;
}

async function getContext(domain: string): Promise<BrowserContext> {
  let ctx = contexts.get(domain);
  if (ctx) return ctx;

  const b = await getBrowser();
  ctx = await b.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 720 },
  });
  contexts.set(domain, ctx);
  return ctx;
}

export async function fetchPageWithBrowser(
  url: string,
  options: {
    retries?: number;
    retryDelayMs?: number;
    timeoutMs?: number;
    waitUntil?: "load" | "domcontentloaded" | "networkidle";
  } = {}
): Promise<string> {
  // Check cache first (dev only)
  const cached = readCache(url);
  if (cached) return cached;

  const {
    retries = 3,
    retryDelayMs = 2000,
    timeoutMs = 45000,
    waitUntil = "load",
  } = options;

  const domain = getDomain(url);

  for (let attempt = 0; attempt <= retries; attempt++) {
    let page = null;
    try {
      const ctx = await getContext(domain);
      page = await ctx.newPage();

      // Block images, fonts, media for speed (keep CSS — Cloudflare may need it)
      await page.route("**/*", (route) => {
        const type = route.request().resourceType();
        if (["image", "font", "media"].includes(type)) {
          return route.abort();
        }
        return route.continue();
      });

      await page.goto(url, { waitUntil, timeout: timeoutMs });

      // Wait a bit for JS-rendered content to appear
      await delay(3000);

      const content = await page.content();
      await page.close();

      // Cache the response (dev only)
      writeCache(url, content);

      return content;
    } catch (error) {
      if (page) {
        await page.close().catch(() => {});
      }

      if (attempt < retries) {
        const backoff = retryDelayMs * Math.pow(2, attempt);
        console.warn(
          `[browser] Attempt ${attempt + 1} failed for ${url}, retrying in ${backoff}ms:`,
          error instanceof Error ? error.message : error
        );
        await delay(backoff);
        continue;
      }
      throw error;
    }
  }

  throw new Error(`Failed to fetch ${url} with browser after ${retries} retries`);
}

export async function closeBrowser(): Promise<void> {
  for (const [domain, ctx] of contexts) {
    await ctx.close().catch(() => {});
    contexts.delete(domain);
  }
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
  }
}

// Clean up on process exit
function handleExit() {
  closeBrowser().catch(() => {});
}

process.on("SIGINT", handleExit);
process.on("SIGTERM", handleExit);
process.on("exit", handleExit);

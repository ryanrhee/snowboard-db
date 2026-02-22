import { chromium, Browser, BrowserContext } from "playwright";
import { delay } from "./utils";
import { getHttpCache, setHttpCache } from "./http-cache";

// Per-channel browser + context pools
const browsers = new Map<string, Browser>();
const contexts = new Map<string, BrowserContext>();

const LAUNCH_ARGS = [
  "--disable-blink-features=AutomationControlled",
  "--no-sandbox",
  "--disable-setuid-sandbox",
];

async function getBrowser(channel?: string): Promise<Browser> {
  const key = channel || "_default";
  let browser = browsers.get(key);
  if (browser && browser.isConnected()) return browser;

  browser = await chromium.launch({
    headless: true,
    args: LAUNCH_ARGS,
    channel,
  });
  browsers.set(key, browser);
  return browser;
}

function getDomain(url: string): string {
  return new URL(url).hostname;
}

function contextKey(domain: string, channel?: string): string {
  return channel ? `${channel}:${domain}` : domain;
}

async function getContext(domain: string, channel?: string): Promise<BrowserContext> {
  const key = contextKey(domain, channel);
  let ctx = contexts.get(key);
  if (ctx) return ctx;

  const b = await getBrowser(channel);
  ctx = await b.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
  });
  contexts.set(key, ctx);
  return ctx;
}

export async function fetchPageWithBrowser(
  url: string,
  options: {
    retries?: number;
    retryDelayMs?: number;
    timeoutMs?: number;
    waitUntil?: "load" | "domcontentloaded" | "networkidle";
    cacheTtlMs?: number;
    channel?: string;
  } = {}
): Promise<string> {
  const {
    retries = 3,
    retryDelayMs = 2000,
    timeoutMs = 45000,
    waitUntil = "load",
    cacheTtlMs,
    channel,
  } = options;

  // Check SQLite cache
  const cached = getHttpCache(url, cacheTtlMs);
  if (cached) return cached;

  const domain = getDomain(url);

  for (let attempt = 0; attempt <= retries; attempt++) {
    let page = null;
    try {
      const ctx = await getContext(domain, channel);
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

      setHttpCache(url, content, { ttlMs: cacheTtlMs });

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
  for (const [key, ctx] of contexts) {
    await ctx.close().catch(() => {});
    contexts.delete(key);
  }
  for (const [key, browser] of browsers) {
    await browser.close().catch(() => {});
    browsers.delete(key);
  }
}

// Clean up on process exit
function handleExit() {
  closeBrowser().catch(() => {});
}

process.on("SIGINT", handleExit);
process.on("SIGTERM", handleExit);
process.on("exit", handleExit);

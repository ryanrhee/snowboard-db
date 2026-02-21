import { config } from "../config";
import { ProxyAgent, fetch as undiciFetch } from "undici";

export async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getProxyDispatcher(): ProxyAgent | undefined {
  const proxyUrl =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;
  if (!proxyUrl) return undefined;
  return new ProxyAgent(proxyUrl);
}

export async function fetchPage(
  url: string,
  options: {
    retries?: number;
    retryDelayMs?: number;
    timeoutMs?: number;
  } = {}
): Promise<string> {
  const { retries = 3, retryDelayMs = 2000, timeoutMs = 15000 } = options;
  const dispatcher = getProxyDispatcher();

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const fetchOptions: Parameters<typeof undiciFetch>[1] = {
        headers: {
          "User-Agent": config.getRandomUserAgent(),
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: controller.signal,
        dispatcher,
      };

      const response = await undiciFetch(url, fetchOptions);

      clearTimeout(timeout);

      if (response.status === 429 || response.status === 503) {
        if (attempt < retries) {
          const backoff = retryDelayMs * Math.pow(2, attempt);
          await delay(backoff);
          continue;
        }
        throw new Error(`Rate limited (${response.status}) after ${retries} retries: ${url}`);
      }

      if (response.status === 403) {
        throw new Error(`Access denied (403) for ${url}`);
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }

      return await response.text();
    } catch (error: unknown) {
      if (attempt < retries && error instanceof Error && error.name === "AbortError") {
        const backoff = retryDelayMs * Math.pow(2, attempt);
        await delay(backoff);
        continue;
      }
      if (attempt === retries) throw error;
    }
  }

  throw new Error(`Failed to fetch ${url} after ${retries} retries`);
}

export function parsePrice(raw: string): number | null {
  if (!raw) return null;
  // Remove currency symbols and whitespace
  const cleaned = raw.replace(/[₩$€£,\s]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

export function parseLengthCm(raw: string): number | null {
  if (!raw) return null;
  // Match patterns like "156cm", "156 cm", "156"
  const match = raw.match(/([\d.]+)\s*(?:cm)?/i);
  if (!match) return null;
  const num = parseFloat(match[1]);
  return isNaN(num) ? null : num;
}

export function normalizeBrand(raw: string): string {
  if (!raw) return "Unknown";
  return raw
    .replace(/\s*snowboards?\s*/gi, "")
    .replace(/\s*snowboard\s*co\.?\s*/gi, "")
    .trim();
}

export { fetchPageWithBrowser } from "./browser";

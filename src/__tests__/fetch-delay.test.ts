import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock http-cache before importing fetchPage
vi.mock("../lib/scraping/http-cache", () => ({
  getHttpCache: vi.fn(),
  setHttpCache: vi.fn(),
}));

// Mock undici fetch
vi.mock("undici", () => ({
  fetch: vi.fn(),
  ProxyAgent: vi.fn(),
}));

import { fetchPage, delay } from "../lib/scraping/utils";
import { getHttpCache, setHttpCache } from "../lib/scraping/http-cache";
import { fetch as undiciFetch } from "undici";

describe("fetchPage politeness delay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does NOT delay when cache hits", async () => {
    const delaySpy = vi.spyOn(global, "setTimeout");
    (getHttpCache as ReturnType<typeof vi.fn>).mockReturnValue("<html>cached</html>");

    const start = Date.now();
    const result = await fetchPage("https://example.com/page");
    const elapsed = Date.now() - start;

    expect(result).toBe("<html>cached</html>");
    // Should return almost immediately (well under 100ms, certainly not 1000ms)
    expect(elapsed).toBeLessThan(100);
  });

  it("delays before real network fetch", async () => {
    (getHttpCache as ReturnType<typeof vi.fn>).mockReturnValue(null);
    (undiciFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("<html>fresh</html>"),
    });

    const start = Date.now();
    const result = await fetchPage("https://example.com/page", {
      politeDelayMs: 50, // use short delay for test speed
    });
    const elapsed = Date.now() - start;

    expect(result).toBe("<html>fresh</html>");
    // Should have waited at least the polite delay
    expect(elapsed).toBeGreaterThanOrEqual(45);
  });

  it("skips delay when politeDelayMs is 0", async () => {
    (getHttpCache as ReturnType<typeof vi.fn>).mockReturnValue(null);
    (undiciFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("<html>fast</html>"),
    });

    const start = Date.now();
    const result = await fetchPage("https://example.com/page", {
      politeDelayMs: 0,
    });
    const elapsed = Date.now() - start;

    expect(result).toBe("<html>fast</html>");
    expect(elapsed).toBeLessThan(100);
  });
});

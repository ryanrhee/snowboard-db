import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const action = body.action || "run";

  if (action === "metadata-check" || action === "run") {
    // Re-run search pipeline from cache (retailers only by default)
    const { runSearchPipeline } = await import("@/lib/pipeline");
    const db = getDb();

    const result = await runSearchPipeline({
      retailers: body.retailers,
      manufacturers: body.manufacturers ?? [],
      sites: body.sites,
    });

    // Query DB for distributions
    const conditionDist = db.prepare("SELECT condition, COUNT(*) as cnt FROM listings WHERE run_id = ? GROUP BY condition ORDER BY cnt DESC").all(result.run.id) as { condition: string; cnt: number }[];
    const genderDistBoards = db.prepare(`
      SELECT
        CASE
          WHEN board_key LIKE '%|womens' THEN 'womens'
          WHEN board_key LIKE '%|kids' THEN 'kids'
          ELSE 'unisex'
        END as gender,
        COUNT(*) as cnt
      FROM boards
      WHERE board_key IN (SELECT DISTINCT board_key FROM listings WHERE run_id = ?)
      GROUP BY gender ORDER BY cnt DESC
    `).all(result.run.id) as { gender: string; cnt: number }[];

    return NextResponse.json({
      action,
      runId: result.run.id,
      totalBoards: result.boards.length,
      totalListings: result.boards.reduce((s, b) => s + b.listings.length, 0),
      errors: result.errors,
      conditionDistribution: conditionDist,
      genderDistributionBoards: genderDistBoards,
    });
  }

  if (action === "full-pipeline" || action === "run-full") {
    // Re-run pipeline with all retailers + all manufacturers
    const { runSearchPipeline } = await import("@/lib/pipeline");
    const result = await runSearchPipeline();
    return NextResponse.json({
      action,
      runId: result.run.id,
      totalBoards: result.boards.length,
      totalListings: result.boards.reduce((s, b) => s + b.listings.length, 0),
      errors: result.errors,
      withFlex: result.boards.filter(b => b.flex !== null).length,
      withProfile: result.boards.filter(b => b.profile !== null).length,
      withShape: result.boards.filter(b => b.shape !== null).length,
      withCategory: result.boards.filter(b => b.category !== null).length,
    });
  }

  if (action === "scrape-specs" || action === "run-manufacturers") {
    // Run manufacturer scrapers only (no retailers)
    const { runSearchPipeline } = await import("@/lib/pipeline");
    const result = await runSearchPipeline({
      retailers: [], // no retailers, only manufacturers
      manufacturers: body.manufacturers,
    });
    const db = getDb();
    const abilityRows = db.prepare("SELECT brand_model, field, value, source FROM spec_sources WHERE field = 'ability level' AND source = 'manufacturer'").all();
    return NextResponse.json({
      action,
      boardCount: result.boards.length,
      abilityLevelEntries: abilityRows,
    });
  }

  if (action === "slow-scrape") {
    // Slowly fetch rate-limited pages (REI detail pages) to populate http_cache.
    // Fetches one uncached URL at a time with configurable delay between attempts.
    // Stops on first WAF block. Run repeatedly (minutes apart) to build up cache.
    //
    // Usage: ./debug.sh '{"action":"slow-scrape"}'
    //        ./debug.sh '{"action":"slow-scrape","delayMs":30000,"maxPages":3}'
    //        ./debug.sh '{"action":"slow-scrape","useSystemChrome":true}'
    const { delay: delayFn } = await import("@/lib/scraping/utils");
    const { getHttpCache, setHttpCache } = await import("@/lib/scraping/http-cache");
    const db = getDb();

    const delayMs = body.delayMs || 20000; // 20s between requests by default
    const maxPages = body.maxPages || 5;   // max pages per invocation
    const useSystemChrome = body.useSystemChrome || false;

    // Collect all REI product URLs from listings table
    const reiUrls = db.prepare(
      "SELECT DISTINCT url FROM listings WHERE retailer = 'rei' ORDER BY url"
    ).all() as { url: string }[];

    // Filter to uncached URLs
    const uncached = reiUrls.filter(r => !getHttpCache(r.url));
    const alreadyCached = reiUrls.length - uncached.length;

    console.log(`[slow-scrape] REI: ${alreadyCached}/${reiUrls.length} cached, ${uncached.length} remaining`);

    const results: { url: string; status: string; htmlLength?: number; error?: string }[] = [];
    let blocked = false;

    if (useSystemChrome) {
      // Connect to running Chrome via CDP (launch Chrome with --remote-debugging-port=9222)
      const { chromium } = await import("playwright");

      let browser;
      try {
        browser = await chromium.connectOverCDP("http://localhost:9222");
        console.log(`[slow-scrape] Connected to Chrome via CDP`);
      } catch (err) {
        return NextResponse.json({
          action,
          error: "Could not connect to Chrome. Launch Chrome with: /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222",
          detail: err instanceof Error ? err.message : String(err),
        });
      }

      try {
        const context = browser.contexts()[0] || await browser.newContext();

        for (let i = 0; i < Math.min(uncached.length, maxPages); i++) {
          const { url } = uncached[i];
          if (i > 0) {
            console.log(`[slow-scrape] Waiting ${delayMs}ms...`);
            await delayFn(delayMs);
          }

          try {
            console.log(`[slow-scrape] Fetching (CDP) ${url}`);
            const page = await context.newPage();
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
            await delayFn(3000);
            const html = await page.content();
            await page.close();

            if (html.length < 5000 || html.includes("Access Denied")) {
              console.log(`[slow-scrape] Blocked (${html.length} bytes)`);
              results.push({ url, status: "blocked", htmlLength: html.length });
              blocked = true;
              break;
            }

            setHttpCache(url, html);
            console.log(`[slow-scrape] OK (${html.length} bytes), cached`);
            results.push({ url, status: "ok", htmlLength: html.length });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.log(`[slow-scrape] Failed: ${msg}`);
            results.push({ url, status: "error", error: msg });
            blocked = true;
            break;
          }
        }
      } finally {
        // Disconnect but don't close — it's the user's browser
        browser.close().catch(() => {});
      }
    } else {
      // Plain HTTP fetch (no browser)
      const { fetchPage } = await import("@/lib/scraping/utils");

      for (let i = 0; i < Math.min(uncached.length, maxPages); i++) {
        const { url } = uncached[i];
        if (i > 0) {
          console.log(`[slow-scrape] Waiting ${delayMs}ms before next request...`);
          await delayFn(delayMs);
        }

        try {
          console.log(`[slow-scrape] Fetching ${url}`);
          const html = await fetchPage(url, { timeoutMs: 25000 });

          if (html.length < 5000) {
            console.log(`[slow-scrape] Blocked (${html.length} bytes), stopping`);
            results.push({ url, status: "blocked", htmlLength: html.length });
            blocked = true;
            break;
          }

          console.log(`[slow-scrape] OK (${html.length} bytes)`);
          results.push({ url, status: "ok", htmlLength: html.length });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.log(`[slow-scrape] Failed: ${msg}`);
          results.push({ url, status: "error", error: msg });
          blocked = true;
          break;
        }
      }
    }

    return NextResponse.json({
      action,
      strategy: useSystemChrome ? "system-chrome" : "plain-http",
      delayMs,
      maxPages,
      totalUrls: reiUrls.length,
      alreadyCached,
      remaining: uncached.length - results.filter(r => r.status === "ok").length,
      fetched: results,
      blocked,
    });
  }

  if (action === "scrape-status") {
    // Show which detail pages are cached vs uncached per retailer
    const { getHttpCache } = await import("@/lib/scraping/http-cache");
    const db = getDb();

    const retailers = db.prepare(
      "SELECT DISTINCT retailer FROM listings ORDER BY retailer"
    ).all() as { retailer: string }[];

    const status: Record<string, { total: number; cached: number; uncached: number }> = {};
    for (const { retailer } of retailers) {
      const urls = db.prepare(
        "SELECT DISTINCT url FROM listings WHERE retailer = ? ORDER BY url"
      ).all(retailer) as { url: string }[];

      let cached = 0;
      for (const { url } of urls) {
        if (getHttpCache(url)) cached++;
      }
      status[retailer] = { total: urls.length, cached, uncached: urls.length - cached };
    }

    return NextResponse.json({ action, status });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}

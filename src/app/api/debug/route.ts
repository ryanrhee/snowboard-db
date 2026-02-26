import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const action = body.action || "run";

  // Primary action: run the scrape pipeline
  // Default: all scrapers. Filter with sites, retailers, manufacturers.
  //
  // Examples:
  //   {"action":"run"}                                          — all scrapers
  //   {"action":"run","sites":["retailer:tactics","manufacturer:burton"]}  — specific scrapers
  //   {"action":"run","retailers":["tactics"]}                  — specific retailers, all manufacturers
  //   {"action":"run","manufacturers":[]}                       — all retailers, no manufacturers
  //   {"action":"run","retailers":[],"manufacturers":["burton"]} — no retailers, specific manufacturer
  //
  // Legacy aliases: metadata-check, run-full, full-pipeline, scrape-specs, run-manufacturers
  const RUN_ACTIONS = new Set(["run", "metadata-check", "run-full", "full-pipeline", "scrape-specs", "run-manufacturers"]);

  if (RUN_ACTIONS.has(action)) {
    const { runSearchPipeline } = await import("@/lib/pipeline");
    const db = getDb();

    const result = await runSearchPipeline({
      retailers: body.retailers,
      manufacturers: body.manufacturers,
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

  if (action === "slow-scrape") {
    // REI scraper that works without launching Playwright's Chromium:
    //   Phase 1: Fetch listing pages (if uncached) → parse → run pipeline → populate DB
    //   Phase 2: Fetch uncached detail pages via CDP (system Chrome) or plain HTTP
    //
    // Usage: ./debug.sh '{"action":"slow-scrape"}'
    //        ./debug.sh '{"action":"slow-scrape","useSystemChrome":true}'
    //        ./debug.sh '{"action":"slow-scrape","delayMs":10000}'
    const { delay: delayFn } = await import("@/lib/scraping/utils");
    const { getHttpCache, setHttpCache } = await import("@/lib/scraping/http-cache");
    const db = getDb();

    const delayMs = body.delayMs ?? 5000;
    const useSystemChrome = body.useSystemChrome || false;
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

    type FetchResult = { url: string; status: string; htmlLength?: number; error?: string };
    const results: FetchResult[] = [];
    let blocked = false;

    // Shared fetch function — fetches a URL, caches it, returns result
    async function fetchAndCache(
      url: string,
      fetcher: (url: string) => Promise<string>
    ): Promise<FetchResult> {
      try {
        console.log(`[slow-scrape] Fetching ${url}`);
        const html = await fetcher(url);

        if (html.length < 50000 || html.includes("Access Denied")) {
          console.log(`[slow-scrape] Blocked (${html.length} bytes)`);
          return { url, status: "blocked", htmlLength: html.length };
        }

        setHttpCache(url, html);
        console.log(`[slow-scrape] OK (${html.length} bytes), cached`);
        return { url, status: "ok", htmlLength: html.length };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`[slow-scrape] Failed: ${msg}`);
        return { url, status: "error", error: msg };
      }
    }

    // Set up fetcher (CDP browser or plain HTTP)
    let browser: any = null;
    let fetcher: (url: string) => Promise<string>;

    if (useSystemChrome) {
      const { chromium } = await import("playwright");
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
      const context = browser.contexts()[0] || await browser.newContext();
      fetcher = async (url: string) => {
        const page = await context.newPage();
        await page.goto(url, { waitUntil: "load", timeout: 45000 });
        await delayFn(5000);
        const html = await page.content();
        await page.close();
        return html;
      };
    } else {
      const { fetchPage } = await import("@/lib/scraping/utils");
      fetcher = (url: string) => fetchPage(url, { timeoutMs: 25000 });
    }

    try {
      // Phase 1: Populate REI listings from cached (or freshly fetched) listing pages
      const existingReiCount = (db.prepare(
        "SELECT COUNT(*) as cnt FROM listings WHERE retailer = 'rei'"
      ).get() as { cnt: number }).cnt;

      let phase1Summary: { products: number; boards: number; listings: number } | null = null;

      if (existingReiCount === 0) {
        console.log(`[slow-scrape] Phase 1: No REI listings in DB`);

        const { scrapeRei } = await import("@/lib/retailers/rei");

        // Fetcher that checks cache first, falls back to CDP/HTTP
        let fetchCount = 0;
        const cacheThenFetch = async (url: string): Promise<string> => {
          const cached = getHttpCache(url, SEVEN_DAYS);
          if (cached) return cached;
          if (blocked) return "";

          if (fetchCount > 0) await delayFn(delayMs);
          const result = await fetchAndCache(url, fetcher);
          results.push(result);
          fetchCount++;
          if (result.status !== "ok") { blocked = true; return ""; }
          return getHttpCache(url, SEVEN_DAYS) || "";
        };

        const scrapedBoards = await scrapeRei(
          cacheThenFetch,
          async (url) => {
            const html = await cacheThenFetch(url);
            return (html && html.length >= 5000) ? html : null;
          },
        );

        if (scrapedBoards.length > 0) {
          const { runSearchPipeline } = await import("@/lib/pipeline");
          const pipelineResult = await runSearchPipeline({
            retailers: [],
            manufacturers: [],
            extraScrapedBoards: scrapedBoards,
          });
          phase1Summary = {
            products: scrapedBoards.length,
            boards: pipelineResult.boards.length,
            listings: pipelineResult.boards.reduce((s, b) => s + b.listings.length, 0),
          };
          console.log(`[slow-scrape] Phase 1 complete: ${phase1Summary.boards} boards, ${phase1Summary.listings} listings`);
        }
      }

      // Phase 2: Fetch any remaining uncached detail pages
      const reiUrls = db.prepare(
        "SELECT DISTINCT url FROM listings WHERE retailer = 'rei' ORDER BY url"
      ).all() as { url: string }[];
      const uncached = reiUrls.filter(r => !getHttpCache(r.url));
      const alreadyCached = reiUrls.length - uncached.length;

      console.log(`[slow-scrape] REI details: ${alreadyCached}/${reiUrls.length} cached, ${uncached.length} remaining`);

      for (let i = 0; i < uncached.length; i++) {
        if (blocked) break;
        if (i > 0 || results.length > 0) await delayFn(delayMs);
        const result = await fetchAndCache(uncached[i].url, fetcher);
        results.push(result);
        if (result.status !== "ok") { blocked = true; }
      }

      return NextResponse.json({
        action,
        strategy: useSystemChrome ? "system-chrome" : "plain-http",
        phase1: phase1Summary,
        totalDetailUrls: reiUrls.length,
        detailsCached: alreadyCached,
        fetched: results,
        blocked,
      });
    } finally {
      if (browser) browser.close().catch(() => {});
    }
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

  if (action === "inspect-pagination") {
    // Fetch listing page for a retailer and dump pagination-related HTML
    const site = body.site || "evo";
    const urls: Record<string, string> = {
      evo: "https://www.evo.com/shop/snowboard/snowboards",
      tactics: "https://www.tactics.com/snowboards",
      backcountry: "https://www.backcountry.com/snowboards",
    };
    const url = urls[site];
    if (!url) return NextResponse.json({ error: `Unknown site: ${site}` });

    const { fetchPageWithBrowser } = await import("@/lib/scraping/utils");
    const cheerio = await import("cheerio");
    const html = await fetchPageWithBrowser(url);
    const $ = cheerio.load(html);

    // Dump various pagination selectors
    const paginationHtml: string[] = [];
    const selectors = [
      ".pagination", "[class*=pagination]", "[class*=Pagination]",
      ".paging", "[class*=paging]", "[class*=Paging]",
      "[class*=page-nav]", "[class*=PageNav]",
      "nav[aria-label*=page]", "nav[aria-label*=Page]",
      "[data-page]", "[class*=next-page]", "[class*=load-more]",
      "[class*=LoadMore]", "[class*=show-more]",
    ];
    for (const sel of selectors) {
      const els = $(sel);
      if (els.length > 0) {
        paginationHtml.push(`--- ${sel} (${els.length} matches) ---`);
        els.each((_, el) => { paginationHtml.push($(el).html()?.slice(0, 2000) || ""); });
      }
    }

    // Also check __NEXT_DATA__ for pagination info (backcountry)
    const nextData = $("#__NEXT_DATA__").text();
    let nextDataPagination: unknown = null;
    if (nextData) {
      try {
        const parsed = JSON.parse(nextData);
        const pageProps = parsed?.props?.pageProps;
        // Look for pagination-related keys
        nextDataPagination = {
          totalResults: pageProps?.totalResults ?? pageProps?.totalCount,
          totalPages: pageProps?.totalPages,
          pageSize: pageProps?.pageSize,
          keys: Object.keys(pageProps || {}),
        };
      } catch {}
    }

    // Look for any links with page numbers in href
    const pageLinks: string[] = [];
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href") || "";
      if (/page|p[=_]\d/i.test(href)) pageLinks.push(href);
    });


    return NextResponse.json({
      action,
      site,
      url,
      htmlLength: html.length,
      productCount: site === "evo" ? $(".product-thumb").length :
                    site === "tactics" ? $("div.browse-grid-item").length :
                    $("[data-id='productCard']").length,
      paginationHtml: paginationHtml.join("\n"),
      nextDataPagination,
      pageLinks: [...new Set(pageLinks)].slice(0, 20),
    });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}

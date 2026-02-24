import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const action = body.action || "mfr-ability-scan";

  if (action === "mfr-ability-scan") {
    // Scan all cached manufacturer detail pages for ability level keywords
    const db = getDb();
    const rows = db.prepare("SELECT url, body FROM http_cache").all() as { url: string; body: string }[];

    const results: Record<string, unknown>[] = [];
    const keywords = ["ability level", "rider level", "riding level", "skill level",
      "beginner", "intermediate", "advanced", "expert"];

    for (const row of rows) {
      // Only look at manufacturer pages
      const isMfr = row.url.includes("burton.com") ||
        row.url.includes("lib-tech.com") ||
        row.url.includes("capitasnowboarding.com");
      if (!isMfr) continue;

      const lower = row.body.toLowerCase();
      const hits: Record<string, number> = {};
      for (const kw of keywords) {
        const count = lower.split(kw).length - 1;
        if (count > 0) hits[kw] = count;
      }

      if (Object.keys(hits).length > 0) {
        // Extract context around "ability level", "rider level", etc.
        const contexts: string[] = [];
        for (const label of ["ability level", "rider level", "riding level"]) {
          let idx = lower.indexOf(label);
          while (idx >= 0 && contexts.length < 3) {
            const start = Math.max(0, idx - 60);
            const end = Math.min(row.body.length, idx + label.length + 100);
            contexts.push(row.body.slice(start, end));
            idx = lower.indexOf(label, idx + 1);
          }
        }

        results.push({
          url: row.url,
          bodyLength: row.body.length,
          hits,
          contexts: contexts.slice(0, 5),
        });
      }
    }

    return NextResponse.json({ action, scanned: rows.length, mfrPages: results.length, results });
  }

  if (action === "burton-descriptions") {
    // Extract Burton product descriptions to see what ability-related text exists
    const db = getDb();
    const rows = db.prepare("SELECT url, body FROM http_cache WHERE url LIKE '%burton.com%'").all() as { url: string; body: string }[];

    const results: Record<string, unknown>[] = [];

    for (const row of rows) {
      // Find __bootstrap JSON
      const startMarker = "window.__bootstrap = ";
      const startIdx = row.body.indexOf(startMarker);
      if (startIdx < 0) continue;

      const jsonStart = startIdx + startMarker.length;
      const endMarker = "};\n</script>";
      const endIdx = row.body.indexOf(endMarker, jsonStart);
      if (endIdx < 0) continue;

      try {
        const cleanedJson = row.body.slice(jsonStart, endIdx + 1).replace(/,\s*([}\]])/g, "$1");
        const data = JSON.parse(cleanedJson);
        const products = data?.data?.productSearch?.productIds ?? [];

        for (const entry of products) {
          const hit = entry.productSearchHit;
          if (!hit) continue;
          const p = hit.product;
          const name = p.productName || "";
          const desc = (p.shortDescriptionValue || "") + " " + (p.longDescription || "");
          const lower = desc.toLowerCase();

          const abilityKeywords = ["beginner", "intermediate", "advanced", "expert",
            "first board", "learning", "entry level", "pro level", "all levels"];
          const found = abilityKeywords.filter(kw => lower.includes(kw));

          if (found.length > 0) {
            results.push({ name, keywords: found, descSnippet: desc.slice(0, 300) });
          }
        }
      } catch { /* skip */ }
    }

    return NextResponse.json({ action, results });
  }

  if (action === "capita-tags") {
    // Check CAPiTA Shopify product tags and body HTML for ability data
    const db = getDb();
    const rows = db.prepare("SELECT url, body FROM http_cache WHERE url LIKE '%capitasnowboarding.com%products.json%'").all() as { url: string; body: string }[];

    const results: Record<string, unknown>[] = [];

    for (const row of rows) {
      try {
        const data = JSON.parse(row.body);
        for (const p of data.products || []) {
          const body_html = p.body_html || "";
          const lower = body_html.toLowerCase();
          const tags = p.tags || [];

          const abilityKeywords = ["beginner", "intermediate", "advanced", "expert",
            "ability", "rider level", "skill"];
          const found = abilityKeywords.filter(kw => lower.includes(kw) || tags.some((t: string) => t.toLowerCase().includes(kw)));

          results.push({
            title: p.title,
            tags: tags.slice(0, 10),
            abilityHits: found,
            bodySnippet: body_html.slice(0, 200),
          });
        }
      } catch { /* skip malformed */ }
    }

    return NextResponse.json({ action, results: results.slice(0, 20) });
  }

  if (action === "burton-skill-level") {
    // Find where "skill level" appears in Burton pages
    const db = getDb();
    const rows = db.prepare("SELECT url, body FROM http_cache WHERE url LIKE '%burton.com%'").all() as { url: string; body: string }[];

    const results: Record<string, unknown>[] = [];
    for (const row of rows) {
      const lower = row.body.toLowerCase();
      let idx = lower.indexOf("skill level");
      const contexts: string[] = [];
      while (idx >= 0 && contexts.length < 6) {
        const start = Math.max(0, idx - 100);
        const end = Math.min(row.body.length, idx + 200);
        contexts.push(row.body.slice(start, end));
        idx = lower.indexOf("skill level", idx + 1);
      }
      if (contexts.length > 0) {
        results.push({ url: row.url, contexts });
      }
    }
    return NextResponse.json({ action, results });
  }

  if (action === "capita-body") {
    // Show CAPiTA products that have ability keywords in body_html
    const db = getDb();
    const rows = db.prepare("SELECT url, body FROM http_cache WHERE url LIKE '%capitasnowboarding.com%products.json%'").all() as { url: string; body: string }[];
    const results: Record<string, unknown>[] = [];
    for (const row of rows) {
      try {
        const data = JSON.parse(row.body);
        for (const p of data.products || []) {
          const bh = p.body_html || "";
          const lower = bh.toLowerCase();
          const found: string[] = [];
          for (const kw of ["beginner", "intermediate", "advanced", "expert", "ability", "rider level"]) {
            if (lower.includes(kw)) found.push(kw);
          }
          if (found.length > 0) {
            // Extract context around each keyword
            const contexts: string[] = [];
            for (const kw of found) {
              const ki = lower.indexOf(kw);
              if (ki >= 0) {
                contexts.push(bh.slice(Math.max(0, ki - 60), ki + kw.length + 80));
              }
            }
            results.push({ title: p.title, keywords: found, contexts });
          }
        }
      } catch { /* skip */ }
    }
    return NextResponse.json({ action, results });
  }

  if (action === "libtech-riderlevel") {
    // Examine ALL Lib Tech detail pages for rider level data
    const db = getDb();
    const cheerio = await import("cheerio");
    const rows = db.prepare("SELECT url, body FROM http_cache WHERE url LIKE '%lib-tech.com/%' AND url NOT LIKE '%/snowboards'").all() as { url: string; body: string }[];

    const results: Record<string, unknown>[] = [];
    for (const row of rows) {
      const $ = cheerio.load(row.body);
      const title = $("h1").first().text().trim();

      // Find ALL images with rider/level/terrain/ability in src or alt
      const relevantImgs: { src: string; alt: string }[] = [];
      $("img").each((_, el) => {
        const src = $(el).attr("src") || $(el).attr("data-src") || "";
        const alt = $(el).attr("alt") || "";
        const combined = (src + alt).toLowerCase();
        if (combined.includes("rider") || combined.includes("level") ||
            combined.includes("terrain") || combined.includes("ability") ||
            combined.includes("beginner") || combined.includes("intermediate") ||
            combined.includes("advanced") || combined.includes("expert")) {
          relevantImgs.push({ src, alt });
        }
      });

      // Find ALL SVG <use> references
      const svgUses: string[] = [];
      $("use, svg use").each((_, el) => {
        const href = $(el).attr("xlink:href") || $(el).attr("href") || "";
        if (href) svgUses.push(href);
      });

      // Find ALL SVG <symbol> ids
      const svgSymbols: string[] = [];
      $("symbol[id]").each((_, el) => {
        svgSymbols.push($(el).attr("id") || "");
      });

      // Look for any element with class containing rider/level/ability
      const levelClasses: string[] = [];
      $("[class*='rider'], [class*='level'], [class*='ability']").each((_, el) => {
        const cls = $(el).attr("class") || "";
        const text = $(el).text().trim().slice(0, 100);
        levelClasses.push(`class="${cls}" text="${text}"`);
      });

      // Search ALL script blocks for rider/level keywords
      const scriptHits: string[] = [];
      $("script:not([src])").each((_, el) => {
        const text = $(el).text();
        const lower = text.toLowerCase();
        for (const kw of ["rider level", "riderlevel", "rider_level", "ability_level", "abilitylevel", "skill_level"]) {
          const idx = lower.indexOf(kw);
          if (idx >= 0) {
            scriptHits.push(text.slice(Math.max(0, idx - 80), idx + kw.length + 80));
          }
        }
      });

      // Check for any structured product data in script tags
      const productData: string[] = [];
      $("script:not([src])").each((_, el) => {
        const text = $(el).text();
        if (text.includes("Mage.") || text.includes("require(") || text.includes("spConfig")) {
          // Look for rider/level mentions
          const lower = text.toLowerCase();
          for (const kw of ["rider", "level", "ability"]) {
            const idx = lower.indexOf(kw);
            if (idx >= 0) {
              productData.push(text.slice(Math.max(0, idx - 60), Math.min(text.length, idx + 120)));
            }
          }
        }
      });

      if (title && !row.url.endsWith("/snowboards")) {
        results.push({
          url: row.url,
          title,
          relevantImgs,
          svgUses: svgUses.slice(0, 20),
          svgSymbols: svgSymbols.slice(0, 20),
          levelClasses: levelClasses.slice(0, 10),
          scriptHits: scriptHits.slice(0, 5),
          productData: productData.slice(0, 5),
        });
      }
    }

    return NextResponse.json({ action, pageCount: rows.length, results });
  }

  if (action === "lt-infographic-urls") {
    // Extract infographic image URLs from all cached Lib Tech detail pages
    const db = getDb();
    const cheerio = await import("cheerio");
    const rows = db.prepare("SELECT url, body FROM http_cache WHERE url LIKE '%lib-tech.com/%' AND url NOT LIKE '%/snowboards'").all() as { url: string; body: string }[];

    const results: { pageUrl: string; title: string; imgUrl: string; alt: string }[] = [];
    for (const row of rows) {
      const $ = cheerio.load(row.body);
      const title = $("h1").first().text().trim();
      $("img").each((_, el) => {
        const src = $(el).attr("src") || "";
        if (src.toLowerCase().includes("terrain") && src.toLowerCase().includes("riderlevel")) {
          results.push({
            pageUrl: row.url,
            title,
            imgUrl: src,
            alt: $(el).attr("alt") || "",
          });
        }
      });
    }
    // Deduplicate by imgUrl
    const seen = new Set<string>();
    const unique = results.filter(r => { if (seen.has(r.imgUrl)) return false; seen.add(r.imgUrl); return true; });
    return NextResponse.json({ action, count: unique.length, results: unique });
  }

  if (action === "lt-svg") {
    // Extract SVG use/symbol structure from a single Lib Tech product page
    const db = getDb();
    const cheerio = await import("cheerio");
    const row = db.prepare("SELECT url, body FROM http_cache WHERE url = 'https://www.lib-tech.com/skate-banana'").get() as { url: string; body: string } | undefined;
    if (!row) return NextResponse.json({ error: "skate-banana not in cache" });

    const $ = cheerio.load(row.body);

    // Find ALL SVG elements and their children
    const svgBlocks: string[] = [];
    $("svg").each((_, el) => {
      const html = $(el).toString();
      const lower = html.toLowerCase();
      if (lower.includes("beginner") || lower.includes("intermediate") ||
          lower.includes("advanced") || lower.includes("expert") ||
          lower.includes("rider") || lower.includes("level")) {
        svgBlocks.push(html.slice(0, 2000));
      }
    });

    // Find all <use> elements anywhere
    const useElements: string[] = [];
    $("use").each((_, el) => {
      useElements.push($(el).parent().toString().slice(0, 500));
    });

    // Find the rider level infographic section — look for image with terrain/rider/level/flex
    const infographicImgs: { src: string; alt: string; parentHtml: string }[] = [];
    $("img").each((_, el) => {
      const src = $(el).attr("src") || $(el).attr("data-src") || "";
      const alt = $(el).attr("alt") || "";
      if (src.toLowerCase().includes("terrain") || src.toLowerCase().includes("rider") ||
          src.toLowerCase().includes("level") || src.toLowerCase().includes("flex") ||
          src.toLowerCase().includes("infographic")) {
        infographicImgs.push({
          src, alt,
          parentHtml: $(el).parent().parent().toString().slice(0, 1000)
        });
      }
    });

    // Find all elements with "rider" in class, id, or data attributes
    const riderElements: string[] = [];
    $("*").each((_, el) => {
      const attrs = $(el).attr() || {};
      const attrStr = JSON.stringify(attrs);
      if (attrStr.toLowerCase().includes("rider") || attrStr.toLowerCase().includes("level")) {
        riderElements.push($(el).toString().slice(0, 300));
      }
    });

    // Look for the section that renders the visual rider level indicator
    // It might be a div with specific classes that uses CSS to show the level
    const descSection = $(".product.attribute.description .value, .product-description, [class*='tech-spec'], [class*='product-info']").first().html()?.slice(0, 3000) || "";

    return NextResponse.json({
      action,
      url: row.url,
      svgBlockCount: svgBlocks.length,
      svgBlocks: svgBlocks.slice(0, 3),
      useElements: useElements.slice(0, 10),
      infographicImgs,
      riderElements: riderElements.slice(0, 15),
      descSectionSnippet: descSection.slice(0, 2000),
    });
  }

  if (action === "capita-detail") {
    // Fetch an actual CAPiTA detail page and look for chart/hexagon data
    const { fetchPage } = await import("@/lib/scraping/utils");
    const slug = body.slug || "doa-2026";
    const url = `https://www.capitasnowboarding.com/products/${slug}`;
    const html = await fetchPage(url, { timeoutMs: 15000 });
    const cheerio = await import("cheerio");
    const $ = cheerio.load(html);

    // Look for SVGs
    const svgs: string[] = [];
    $("svg").each((_, el) => { svgs.push($(el).toString().slice(0, 2000)); });

    // Look for any element with chart-related class/id
    const chartElements: string[] = [];
    $("[class*='chart'], [class*='hexagon'], [class*='radar'], [class*='spider'], [class*='skill'], [class*='rating'], [id*='chart'], [id*='hexagon']").each((_, el) => {
      chartElements.push($(el).toString().slice(0, 1000));
    });

    // Look for script tags containing chart data
    const chartScripts: string[] = [];
    $("script").each((_, el) => {
      const text = $(el).text();
      const lower = text.toLowerCase();
      if (lower.includes("hexagon") || lower.includes("radar") || lower.includes("skill") ||
          lower.includes("jibbing") || lower.includes("groomers") || lower.includes("versatility") ||
          lower.includes("polygon") || lower.includes("spider")) {
        chartScripts.push(text.slice(0, 3000));
      }
    });

    // Look for metafields or JSON data
    const metafields: string[] = [];
    $("script[type='application/json']").each((_, el) => {
      const text = $(el).text();
      if (text.toLowerCase().includes("skill") || text.toLowerCase().includes("jibbing") ||
          text.toLowerCase().includes("groomers") || text.toLowerCase().includes("versatility")) {
        metafields.push(text.slice(0, 3000));
      }
    });

    // Search entire HTML for keywords
    const htmlLower = html.toLowerCase();
    const keywords = ["jibbing", "groomers", "versatility", "skill level", "hexagon", "radar-chart"];
    const found: Record<string, { count: number; context: string }> = {};
    for (const kw of keywords) {
      const idx = htmlLower.indexOf(kw);
      if (idx >= 0) {
        found[kw] = {
          count: htmlLower.split(kw).length - 1,
          context: html.slice(Math.max(0, idx - 100), idx + kw.length + 200),
        };
      }
    }

    return NextResponse.json({
      action, url, htmlLength: html.length,
      svgCount: svgs.length,
      svgs: svgs.slice(0, 5),
      chartElements: chartElements.slice(0, 10),
      chartScripts: chartScripts.slice(0, 3),
      metafields: metafields.slice(0, 3),
      keywordHits: found,
    });
  }

  if (action === "capita-svg") {
    // Extract body_html for a specific CAPiTA product to find the hexagon chart SVG
    const db = getDb();
    const rows = db.prepare("SELECT url, body FROM http_cache WHERE url LIKE '%capitasnowboarding.com%products.json%'").all() as { url: string; body: string }[];
    const target = body.model || "D.O.A.";
    for (const row of rows) {
      try {
        const data = JSON.parse(row.body);
        for (const p of data.products || []) {
          if (p.title === target) {
            return NextResponse.json({
              action,
              title: p.title,
              handle: p.handle,
              bodyHtmlLength: (p.body_html || "").length,
              hasSvg: (p.body_html || "").includes("<svg"),
              hasPolygon: (p.body_html || "").includes("<polygon"),
              hasHexagon: (p.body_html || "").toLowerCase().includes("hexagon"),
              bodyHtml: p.body_html || "",
            });
          }
        }
      } catch { /* skip */ }
    }
    return NextResponse.json({ action, error: `Board "${target}" not found` });
  }

  if (action === "capita-missing") {
    // List CAPiTA boards without ability level data, with correct URLs
    const db = getDb();
    const rows = db.prepare("SELECT url, body FROM http_cache WHERE url LIKE '%capitasnowboarding.com%products.json%'").all() as { url: string; body: string }[];
    const abilityKeywords = ["beginner", "intermediate", "advanced", "expert", "entry level"];
    const results: { title: string; url: string; hasAbility: boolean }[] = [];
    for (const row of rows) {
      try {
        const data = JSON.parse(row.body);
        for (const p of data.products || []) {
          const lower = (p.body_html || "").toLowerCase();
          const has = abilityKeywords.some(kw => lower.includes(kw));
          results.push({
            title: p.title,
            url: `https://www.capitasnowboarding.com/products/${p.handle}`,
            hasAbility: has,
          });
        }
      } catch { /* skip */ }
    }
    const missing = results.filter(r => !r.hasAbility);
    return NextResponse.json({ action, total: results.length, missing: missing.length, boards: missing });
  }

  if (action === "capita-handles") {
    // Show all CAPiTA product handles and types from Shopify JSON
    const db = getDb();
    const rows = db.prepare("SELECT url, body FROM http_cache WHERE url LIKE '%capitasnowboarding.com%products.json%'").all() as { url: string; body: string }[];
    const products: { title: string; handle: string; product_type: string; tags: string[] }[] = [];
    for (const row of rows) {
      try {
        const data = JSON.parse(row.body);
        for (const p of data.products || []) products.push({
          title: p.title, handle: p.handle,
          product_type: p.product_type || "",
          tags: (p.tags || []).slice(0, 5),
        });
      } catch { /* skip */ }
    }
    return NextResponse.json({ action, count: products.length, products });
  }

  if (action === "capita-test-detail") {
    // Fetch specific CAPiTA detail pages and check for hexagon data
    const cheerio = await import("cheerio");
    const { fetchPage } = await import("@/lib/scraping/utils");
    const slugs = body.slugs || ["scott-stevens-mini-2026", "capita-warpspeed-automobili-lamborghini", "darkhorse-154-austin-vizz-ltd", "d-o-a-154-benny-milam-ltd", "navigator-158-miles-fallon-ltd"];
    const results: Record<string, unknown>[] = [];
    for (const slug of slugs) {
      try {
        const url = `https://www.capitasnowboarding.com/products/${slug}`;
        const html = await fetchPage(url, { timeoutMs: 15000 });
        const $ = cheerio.load(html);
        const hexDiv = $(".c-hexagon.js-hexagon, [data-skills]").first();
        const dataSkills = hexDiv.attr("data-skills") || null;
        const title = $("h1").first().text().trim() || $("title").text().trim();
        results.push({ slug, title, dataSkills, htmlLength: html.length });
      } catch (err) {
        results.push({ slug, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return NextResponse.json({ action, results });
  }

  if (action === "capita-coverage") {
    // Show which CAPiTA boards have/don't have ability level in spec_sources
    const { specKey: sk } = await import("@/lib/db");
    const { normalizeModel } = await import("@/lib/normalization");
    const db = getDb();
    const rows = db.prepare("SELECT url, body FROM http_cache WHERE url LIKE '%capitasnowboarding.com%products.json%'").all() as { url: string; body: string }[];
    const allProducts: { title: string; handle: string; key: string }[] = [];
    for (const row of rows) {
      try {
        const data = JSON.parse(row.body);
        for (const p of data.products || []) {
          const model = p.title.replace(/^CAPiTA\s+/i, "").replace(/^Capita\s+/i, "").replace(/\s+Snowboard$/i, "").trim();
          const key = sk("CAPiTA", model);
          allProducts.push({ title: p.title, handle: p.handle, key });
        }
      } catch { /* skip */ }
    }
    const abilityRows = db.prepare("SELECT brand_model, value FROM spec_sources WHERE brand_model LIKE 'capita|%' AND field IN ('ability level', 'abilityLevel') AND source = 'manufacturer'").all() as { brand_model: string; value: string }[];
    const hasAbility = new Map(abilityRows.map(r => [r.brand_model, r.value]));
    const withAbility = allProducts.filter(p => hasAbility.has(p.key)).map(p => ({
      title: p.title, key: p.key, value: hasAbility.get(p.key),
    }));
    const missing = allProducts.filter(p => !hasAbility.has(p.key)).map(p => ({
      title: p.title, key: p.key, url: `https://www.capitasnowboarding.com/products/${p.handle}`,
    }));
    return NextResponse.json({ action, total: allProducts.length, withAbility: withAbility.length, missingCount: missing.length, missing, allKeys: hasAbility.size });
  }

  if (action === "clear-capita-ability") {
    const db = getDb();
    const result = db.prepare("DELETE FROM spec_sources WHERE brand_model LIKE 'capita|%' AND field IN ('ability level', 'abilityLevel') AND source = 'manufacturer'").run();
    return NextResponse.json({ action, deleted: result.changes });
  }

  if (action === "clear-lt-ability") {
    // Clear stale Lib Tech ability level entries from spec_sources so re-scrape writes fresh data
    const db = getDb();
    const result = db.prepare("DELETE FROM spec_sources WHERE brand_model LIKE 'lib tech|%' AND field = 'ability level' AND source = 'manufacturer'").run();
    return NextResponse.json({ action, deleted: result.changes });
  }

  if (action === "burton-detail") {
    // Fetch a Burton detail page and analyze its structure for spec data
    const { fetchPage } = await import("@/lib/scraping/utils");
    const cheerio = await import("cheerio");
    const slug = body.slug || "/us/en/p/mens-custom-camber-snowboard/W25-106891.html";
    const url = slug.startsWith("http") ? slug : `https://www.burton.com${slug}`;
    const html = await fetchPage(url, { timeoutMs: 20000 });
    const $ = cheerio.load(html);

    // 1. Look for any JSON-LD structured data
    const jsonLd: unknown[] = [];
    $("script[type='application/ld+json']").each((_, el) => {
      try { jsonLd.push(JSON.parse($(el).text())); } catch { /* skip */ }
    });

    // 2. Look for __bootstrap or other inline JSON
    const bootstrapSnippets: string[] = [];
    $("script:not([src])").each((_, el) => {
      const text = $(el).text();
      if (text.includes("__bootstrap") || text.includes("productDetail")) {
        // Extract first 3000 chars of relevant scripts
        const idx = text.indexOf("__bootstrap") >= 0 ? text.indexOf("__bootstrap") : text.indexOf("productDetail");
        bootstrapSnippets.push(text.slice(Math.max(0, idx - 100), idx + 3000));
      }
    });

    // 3. Look for spec tables or key-value pairs
    const specElements: { selector: string; html: string }[] = [];
    const specSelectors = [
      "[class*='spec'], [class*='Spec']",
      "[class*='detail'], [class*='Detail']",
      "[class*='feature'], [class*='Feature']",
      "[class*='tech'], [class*='Tech']",
      "[class*='attribute'], [class*='Attribute']",
      "table",
      "dl, dt, dd",
    ];
    for (const sel of specSelectors) {
      $(sel).each((_, el) => {
        const h = $(el).toString();
        if (h.length < 5000 && specElements.length < 20) {
          specElements.push({ selector: sel, html: h.slice(0, 1500) });
        }
      });
    }

    // 4. Look for ability/skill/level/flex/terrain keywords in the page
    const htmlLower = html.toLowerCase();
    const keywords = ["ability", "skill level", "rider level", "terrain", "flex rating",
      "beginner", "intermediate", "advanced", "expert", "riding style", "best for"];
    const keywordHits: Record<string, { count: number; context: string }> = {};
    for (const kw of keywords) {
      const idx = htmlLower.indexOf(kw);
      if (idx >= 0) {
        keywordHits[kw] = {
          count: htmlLower.split(kw).length - 1,
          context: html.slice(Math.max(0, idx - 80), idx + kw.length + 200),
        };
      }
    }

    // 5. Page title
    const title = $("h1").first().text().trim() || $("title").text().trim();

    return NextResponse.json({
      action, url, title, htmlLength: html.length,
      jsonLdCount: jsonLd.length, jsonLd: jsonLd.slice(0, 2),
      bootstrapSnippets: bootstrapSnippets.slice(0, 2),
      specElements: specElements.slice(0, 15),
      keywordHits,
    });
  }

  if (action === "burton-detail-attrs") {
    // Fetch a Burton detail page and extract ALL product attributes from __bootstrap
    const { fetchPage } = await import("@/lib/scraping/utils");
    const slug = body.slug || "/us/en/p/mens-burton-custom-camber-snowboard/W26-106881.html";
    const url = slug.startsWith("http") ? slug : `https://www.burton.com${slug}`;
    const html = await fetchPage(url, { timeoutMs: 20000 });

    // Extract __bootstrap JSON
    const startMarker = "window.__bootstrap = ";
    const startIdx = html.indexOf(startMarker);
    if (startIdx < 0) return NextResponse.json({ action, error: "No __bootstrap found" });
    const jsonStart = startIdx + startMarker.length;
    const endMarker = "};\n</script>";
    const endIdx = html.indexOf(endMarker, jsonStart);
    if (endIdx < 0) return NextResponse.json({ action, error: "No end marker found" });

    // The detail page might have multiple __bootstrap blocks or different structure
    // Try to find the attributeGroups via regex on the raw HTML instead
    const attrGroupRegex = /"attributeGroups"\s*:\s*(\[[\s\S]*?\])\s*,\s*"(?:availability|variation|promotion)/;
    const attrMatch = html.match(attrGroupRegex);

    // Also try a simpler approach: find "Board Skill Level" context directly
    const skillMatch = html.match(/"Board Skill Level"[^}]*"value"\s*:\s*(\[[^\]]+\])/);

    // Find ALL label/value pairs in the attributes structure
    const labelValueRegex = /"label"\s*:\s*"([^"]+)"\s*,\s*"value"\s*:\s*(\[[^\]]*\]|"[^"]*")/g;
    const allAttrs: { label: string; value: string }[] = [];
    let lvm;
    while ((lvm = labelValueRegex.exec(html)) !== null) {
      allAttrs.push({ label: lvm[1], value: lvm[2] });
    }

    // Deduplicate by label (take first occurrence)
    const seen = new Set<string>();
    const uniqueAttrs = allAttrs.filter(a => {
      if (seen.has(a.label)) return false;
      seen.add(a.label);
      return true;
    });

    return NextResponse.json({
      action, url,
      skillLevelDirect: skillMatch ? skillMatch[1] : null,
      attrGroupFound: !!attrMatch,
      allAttrs: uniqueAttrs,
    });
  }

  if (action === "burton-all-detail-attrs") {
    // Fetch all Burton detail pages and extract Board Skill Level + other attrs via regex
    const { fetchPage } = await import("@/lib/scraping/utils");
    const db = getDb();
    const rows = db.prepare("SELECT url, body FROM http_cache WHERE url LIKE '%burton.com%/c/%boards%'").all() as { url: string; body: string }[];

    // Get all board URLs from catalog
    const boardUrls: { name: string; url: string }[] = [];
    for (const row of rows) {
      const startMarker = "window.__bootstrap = ";
      const startIdx = row.body.indexOf(startMarker);
      if (startIdx < 0) continue;
      const jsonStart = startIdx + startMarker.length;
      const endMarker = "};\n</script>";
      const endIdx = row.body.indexOf(endMarker, jsonStart);
      if (endIdx < 0) continue;
      try {
        const cleanedJson = row.body.slice(jsonStart, endIdx + 1).replace(/,\s*([}\]])/g, "$1");
        const data = JSON.parse(cleanedJson);
        const products = data?.data?.productSearch?.productIds ?? [];
        for (const entry of products) {
          const hit = entry.productSearchHit;
          if (!hit) continue;
          const name = hit.product?.productName || "";
          const productPath = hit.urls?.product || "";
          const fullUrl = productPath.startsWith("http") ? productPath : `https://www.burton.com${productPath}`;
          if (name) boardUrls.push({ name, url: fullUrl });
        }
      } catch { /* skip */ }
    }

    // Fetch detail pages with concurrency 3
    const CONCURRENCY = 3;
    const results: Record<string, unknown>[] = [];
    for (let i = 0; i < boardUrls.length; i += CONCURRENCY) {
      const batch = boardUrls.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map(async ({ name, url: boardUrl }) => {
          try {
            const html = await fetchPage(boardUrl, { timeoutMs: 20000 });
            // Extract label/value pairs via regex (JSON parsing fails on detail pages)
            const labelValueRegex = /"label"\s*:\s*"([^"]+)"\s*,\s*"value"\s*:\s*(\[[^\]]*\])/g;
            const attrs: Record<string, string> = {};
            let lvm;
            const seen = new Set<string>();
            while ((lvm = labelValueRegex.exec(html)) !== null) {
              if (!seen.has(lvm[1])) {
                seen.add(lvm[1]);
                attrs[lvm[1]] = lvm[2];
              }
            }
            return { name, url: boardUrl, attrs };
          } catch (err) {
            return { name, url: boardUrl, error: err instanceof Error ? err.message : String(err) };
          }
        })
      );
      results.push(...batchResults);
    }

    // Summarize
    const attrCounts: Record<string, number> = {};
    const skillLevels: { name: string; value: string }[] = [];
    for (const r of results) {
      const attrs = (r as { attrs?: Record<string, string> }).attrs;
      if (!attrs) continue;
      for (const key of Object.keys(attrs)) {
        attrCounts[key] = (attrCounts[key] || 0) + 1;
      }
      if (attrs["Board Skill Level"]) {
        skillLevels.push({ name: r.name as string, value: attrs["Board Skill Level"] });
      }
    }

    return NextResponse.json({
      action,
      totalBoards: boardUrls.length,
      fetchedOk: results.filter(r => !(r as { error?: string }).error).length,
      errors: results.filter(r => (r as { error?: string }).error).map(r => ({ name: (r as { name: string }).name, error: (r as { error: string }).error })),
      attrCounts,
      skillLevelCount: skillLevels.length,
      skillLevels,
    });
  }

  if (action === "burton-urls") {
    // List all Burton board URLs from the catalog for detail page scraping
    const db = getDb();
    const rows = db.prepare("SELECT url, body FROM http_cache WHERE url LIKE '%burton.com%/c/%boards%'").all() as { url: string; body: string }[];
    const boards: { name: string; url: string }[] = [];
    for (const row of rows) {
      const startMarker = "window.__bootstrap = ";
      const startIdx = row.body.indexOf(startMarker);
      if (startIdx < 0) continue;
      const jsonStart = startIdx + startMarker.length;
      const endMarker = "};\n</script>";
      const endIdx = row.body.indexOf(endMarker, jsonStart);
      if (endIdx < 0) continue;
      try {
        const cleanedJson = row.body.slice(jsonStart, endIdx + 1).replace(/,\s*([}\]])/g, "$1");
        const data = JSON.parse(cleanedJson);
        const products = data?.data?.productSearch?.productIds ?? [];
        for (const entry of products) {
          const hit = entry.productSearchHit;
          if (!hit) continue;
          const name = hit.product?.productName || "";
          const productPath = hit.urls?.product || "";
          const fullUrl = productPath.startsWith("http") ? productPath : `https://www.burton.com${productPath}`;
          if (name) boards.push({ name, url: fullUrl });
        }
      } catch { /* skip */ }
    }
    const filter = body.filter ? boards.filter((b: { name: string }) => b.name.toLowerCase().includes(body.filter.toLowerCase())) : boards;
    return NextResponse.json({ action, count: boards.length, boards: filter });
  }

  if (action === "ability-coverage") {
    // Show ability level coverage across all manufacturers
    const db = getDb();
    const allAbility = db.prepare("SELECT brand_model, value FROM spec_sources WHERE field IN ('ability level', 'abilityLevel') AND source = 'manufacturer'").all() as { brand_model: string; value: string }[];
    const byBrand: Record<string, { total: number; withAbility: number; boards: { key: string; value: string }[] }> = {};
    for (const row of allAbility) {
      const brand = row.brand_model.split("|")[0];
      if (!byBrand[brand]) byBrand[brand] = { total: 0, withAbility: 0, boards: [] };
      byBrand[brand].withAbility++;
      byBrand[brand].boards.push({ key: row.brand_model, value: row.value });
    }
    // Count total boards per brand from spec_cache
    const allCache = db.prepare("SELECT brand_model FROM spec_cache WHERE source = 'manufacturer'").all() as { brand_model: string }[];
    for (const row of allCache) {
      const brand = row.brand_model.split("|")[0];
      if (!byBrand[brand]) byBrand[brand] = { total: 0, withAbility: 0, boards: [] };
      byBrand[brand].total++;
    }
    // Find boards WITHOUT ability level
    const missing: Record<string, string[]> = {};
    for (const row of allCache) {
      const brand = row.brand_model.split("|")[0];
      const hasAbility = allAbility.some(a => a.brand_model === row.brand_model);
      if (!hasAbility) {
        if (!missing[brand]) missing[brand] = [];
        missing[brand].push(row.brand_model);
      }
    }
    return NextResponse.json({ action, byBrand, missing });
  }

  if (action === "clear-burton-ability") {
    const db = getDb();
    const result = db.prepare("DELETE FROM spec_sources WHERE brand_model LIKE 'burton|%' AND field IN ('ability level', 'abilityLevel') AND source = 'manufacturer'").run();
    return NextResponse.json({ action, deleted: result.changes });
  }

  if (action === "clear-burton-specs") {
    // Clear all Burton manufacturer spec_cache entries so they get re-ingested with detail page data
    const db = getDb();
    const r1 = db.prepare("DELETE FROM spec_sources WHERE brand_model LIKE 'burton|%' AND source = 'manufacturer'").run();
    const r2 = db.prepare("DELETE FROM spec_cache WHERE brand_model LIKE 'burton|%' AND source = 'manufacturer'").run();
    return NextResponse.json({ action, specSourcesDeleted: r1.changes, specCacheDeleted: r2.changes });
  }

  if (action === "llm-audit") {
    // Show all LLM-derived data in spec_cache and spec_sources (excluding judgment)
    const db = getDb();
    const llmCache = db.prepare("SELECT * FROM spec_cache WHERE source = 'llm'").all();
    const llmSources = db.prepare("SELECT * FROM spec_sources WHERE source = 'llm'").all();
    const judgmentSources = db.prepare("SELECT * FROM spec_sources WHERE source = 'judgment'").all();
    // Also check boards that only have LLM-sourced specs (no manufacturer/review/retailer data)
    const allBoardKeys = db.prepare("SELECT DISTINCT brand_model FROM spec_sources").all() as { brand_model: string }[];
    const llmOnlyBoards: string[] = [];
    for (const { brand_model } of allBoardKeys) {
      const sources = db.prepare("SELECT DISTINCT source FROM spec_sources WHERE brand_model = ?").all(brand_model) as { source: string }[];
      const sourceSet = new Set(sources.map(s => s.source));
      if (sourceSet.has("llm") && !sourceSet.has("manufacturer") && !sourceSet.has("review-site") && !Array.from(sourceSet).some(s => s.startsWith("retailer:"))) {
        llmOnlyBoards.push(brand_model);
      }
    }
    return NextResponse.json({
      action,
      llmCacheCount: llmCache.length,
      llmSourcesCount: llmSources.length,
      judgmentCount: judgmentSources.length,
      llmOnlyBoardCount: llmOnlyBoards.length,
      llmCache,
      llmSources,
      judgmentSources,
      llmOnlyBoards,
    });
  }

  if (action === "purge-llm") {
    // Remove all LLM-derived data from spec_cache and spec_sources (keep judgment)
    const db = getDb();
    const r1 = db.prepare("DELETE FROM spec_cache WHERE source = 'llm'").run();
    const r2 = db.prepare("DELETE FROM spec_sources WHERE source = 'llm'").run();
    // Null out spec fields on boards whose resolved values came from LLM
    // Find boards that now have NO remaining spec_sources for a given field
    const boardRows = db.prepare("SELECT board_key FROM boards").all() as { board_key: string }[];
    let boardsCleared = 0;
    for (const { board_key } of boardRows) {
      const remaining = db.prepare("SELECT DISTINCT field FROM spec_sources WHERE brand_model = ?").all(board_key) as { field: string }[];
      const fieldsWithData = new Set(remaining.map(r => r.field));
      const updates: string[] = [];
      if (!fieldsWithData.has("flex")) updates.push("flex = NULL");
      if (!fieldsWithData.has("profile")) updates.push("profile = NULL");
      if (!fieldsWithData.has("shape")) updates.push("shape = NULL");
      if (!fieldsWithData.has("category")) updates.push("category = NULL");
      if (updates.length > 0) {
        db.prepare(`UPDATE boards SET ${updates.join(", ")} WHERE board_key = ?`).run(board_key);
        boardsCleared++;
      }
    }
    return NextResponse.json({
      action,
      specCacheDeleted: r1.changes,
      specSourcesDeleted: r2.changes,
      boardsCleared,
    });
  }

  if (action === "key-mismatch") {
    const db = getDb();
    // All board_key values from boards table (from retailer pipeline)
    const boardKeys = db.prepare("SELECT board_key, brand, model FROM boards ORDER BY board_key").all() as { board_key: string; brand: string; model: string }[];
    // All spec_cache keys (from manufacturer scraping)
    const specKeys = db.prepare("SELECT brand_model, source FROM spec_cache WHERE source = 'manufacturer' ORDER BY brand_model").all() as { brand_model: string; source: string }[];
    const specKeySet = new Set(specKeys.map(s => s.brand_model));
    const boardKeySet = new Set(boardKeys.map(b => b.board_key));

    // Boards with no matching spec_cache entry
    const boardsWithoutSpecs = boardKeys.filter(b => !specKeySet.has(b.board_key));
    // Spec cache entries with no matching board
    const specsWithoutBoards = specKeys.filter(s => !boardKeySet.has(s.brand_model));

    // Try fuzzy matching: for each unmatched board, find closest spec_cache key by brand
    const fuzzyMatches: { boardKey: string; boardModel: string; specKey: string; similarity: string }[] = [];
    for (const b of boardsWithoutSpecs) {
      const brand = b.board_key.split("|")[0];
      const boardModel = b.board_key.split("|").slice(1).join("|");
      const candidates = specsWithoutBoards
        .filter(s => s.brand_model.startsWith(brand + "|"))
        .map(s => {
          const specModel = s.brand_model.split("|").slice(1).join("|");
          // Check if one contains the other
          const contains = specModel.includes(boardModel) || boardModel.includes(specModel);
          return { specKey: s.brand_model, specModel, contains };
        })
        .filter(c => c.contains);
      for (const c of candidates) {
        fuzzyMatches.push({ boardKey: b.board_key, boardModel: b.model, specKey: c.specKey, similarity: "substring" });
      }
    }

    return NextResponse.json({
      action,
      totalBoards: boardKeys.length,
      totalSpecKeys: specKeys.length,
      boardsWithoutSpecs: boardsWithoutSpecs.length,
      specsWithoutBoards: specsWithoutBoards.length,
      fuzzyMatches,
      unmatchedBoards: boardsWithoutSpecs.map(b => ({ key: b.board_key, brand: b.brand, model: b.model })),
      unmatchedSpecs: specsWithoutBoards.map(s => s.brand_model),
    });
  }

  if (action === "scrape-specs") {
    // Run manufacturer scrapers through unified pipeline (manufacturers only, no retailers)
    const { runSearchPipeline } = await import("@/lib/pipeline");
    const result = await runSearchPipeline({
      skipEnrichment: true,
      skipManufacturers: false,
      retailers: [], // no retailers, only manufacturers
    });
    // Show updated ability level entries
    const db = getDb();
    const abilityRows = db.prepare("SELECT brand_model, field, value, source FROM spec_sources WHERE field = 'ability level' AND source = 'manufacturer'").all();
    return NextResponse.json({
      action,
      boardCount: result.boards.length,
      abilityLevelEntries: abilityRows,
    });
  }

  if (action === "brand-coverage") {
    const db = getDb();

    // 1. Count of boards per brand, ordered by count descending
    const boardsPerBrand = db.prepare(`
      SELECT brand, COUNT(*) as board_count
      FROM boards
      GROUP BY brand
      ORDER BY board_count DESC
    `).all() as { brand: string; board_count: number }[];

    // 2. Count of spec_sources entries per brand where source='manufacturer'
    const specSourcesPerBrand = db.prepare(`
      SELECT SUBSTR(brand_model, 1, INSTR(brand_model, '|') - 1) as brand,
             COUNT(DISTINCT brand_model) as boards_with_mfr_sources,
             COUNT(*) as total_mfr_source_entries
      FROM spec_sources
      WHERE source = 'manufacturer'
      GROUP BY brand
      ORDER BY boards_with_mfr_sources DESC
    `).all() as { brand: string; boards_with_mfr_sources: number; total_mfr_source_entries: number }[];

    // 3. Count of spec_cache entries per brand where source='manufacturer'
    const specCachePerBrand = db.prepare(`
      SELECT SUBSTR(brand_model, 1, INSTR(brand_model, '|') - 1) as brand,
             COUNT(*) as mfr_cache_count
      FROM spec_cache
      WHERE source = 'manufacturer'
      GROUP BY brand
      ORDER BY mfr_cache_count DESC
    `).all() as { brand: string; mfr_cache_count: number }[];

    // 4. Brands WITHOUT manufacturer data: board count, listing count, avg discount
    // First, find all brand_model keys that DO have manufacturer spec_sources
    const mfrBrandModels = db.prepare(`
      SELECT DISTINCT brand_model FROM spec_sources WHERE source = 'manufacturer'
    `).all() as { brand_model: string }[];
    const mfrKeySet = new Set(mfrBrandModels.map(r => r.brand_model));

    // Get all boards
    const allBoards = db.prepare(`SELECT board_key, brand FROM boards`).all() as { board_key: string; brand: string }[];

    // Partition boards into those with/without manufacturer data
    const brandsWithout: Record<string, string[]> = {};
    for (const b of allBoards) {
      if (!mfrKeySet.has(b.board_key)) {
        if (!brandsWithout[b.brand]) brandsWithout[b.brand] = [];
        brandsWithout[b.brand].push(b.board_key);
      }
    }

    // For brands without mfr data, get listing stats
    const brandImpact: {
      brand: string;
      boards_without_mfr: number;
      listing_count: number;
      avg_discount_percent: number | null;
    }[] = [];

    for (const [brand, boardKeys] of Object.entries(brandsWithout)) {
      // Check if this brand has ANY boards with mfr data
      const hasAnyMfr = allBoards.some(b => b.brand === brand && mfrKeySet.has(b.board_key));
      // Only include brands where NO boards have mfr data (fully uncovered brands)
      // But also show partial coverage brands separately
      const placeholders = boardKeys.map(() => '?').join(',');
      const listingStats = db.prepare(`
        SELECT COUNT(*) as listing_count,
               AVG(discount_percent) as avg_discount
        FROM listings
        WHERE board_key IN (${placeholders})
      `).get(...boardKeys) as { listing_count: number; avg_discount: number | null };

      brandImpact.push({
        brand,
        boards_without_mfr: boardKeys.length,
        listing_count: listingStats.listing_count,
        avg_discount_percent: listingStats.avg_discount !== null
          ? Math.round(listingStats.avg_discount * 100) / 100
          : null,
      });
    }

    // Sort by boards_without_mfr descending
    brandImpact.sort((a, b) => b.boards_without_mfr - a.boards_without_mfr);

    return NextResponse.json({
      action,
      boardsPerBrand,
      specSourcesPerBrand,
      specCachePerBrand,
      brandsWithoutMfrData: brandImpact,
    });
  }

  if (action === "metadata-check") {
    // Re-run search pipeline with skipEnrichment to test condition/gender/stockCount detection
    const { runSearchPipeline } = await import("@/lib/pipeline");
    const db = getDb();

    const result = await runSearchPipeline({ skipEnrichment: true, skipManufacturers: true });

    // Query DB for distributions
    const conditionDist = db.prepare("SELECT condition, COUNT(*) as cnt FROM listings WHERE run_id = ? GROUP BY condition ORDER BY cnt DESC").all(result.run.id) as { condition: string; cnt: number }[];
    const genderDistListings = db.prepare("SELECT gender, COUNT(*) as cnt FROM listings WHERE run_id = ? GROUP BY gender ORDER BY cnt DESC").all(result.run.id) as { gender: string; cnt: number }[];
    const genderDistBoards = db.prepare("SELECT gender, COUNT(*) as cnt FROM boards WHERE board_key IN (SELECT DISTINCT board_key FROM listings WHERE run_id = ?) GROUP BY gender ORDER BY cnt DESC").all(result.run.id) as { gender: string; cnt: number }[];
    const stockRows = db.prepare("SELECT retailer, COUNT(*) as cnt, AVG(stock_count) as avg_stock FROM listings WHERE run_id = ? AND stock_count IS NOT NULL GROUP BY retailer").all(result.run.id) as { retailer: string; cnt: number; avg_stock: number }[];

    // Sample some interesting rows
    const blemRows = db.prepare("SELECT retailer, url, condition FROM listings WHERE run_id = ? AND condition != 'new' AND condition != 'unknown' LIMIT 10").all(result.run.id);
    const genderedRows = db.prepare("SELECT retailer, url, gender FROM listings WHERE run_id = ? AND gender != 'unisex' LIMIT 10").all(result.run.id);

    // Also check: what conditions exist for closeout/blem URLs specifically
    const closeoutListings = db.prepare("SELECT url, condition FROM listings WHERE run_id = ? AND (url LIKE '%closeout%' OR url LIKE '%blem%')").all(result.run.id) as { url: string; condition: string }[];

    // Check from the result object directly (pre-DB)
    const resultConditions = result.boards.flatMap(b =>
      b.listings.filter(l => l.url.includes("closeout") || l.url.includes("blem"))
        .map(l => ({ url: l.url, condition: l.condition }))
    );

    return NextResponse.json({
      action,
      runId: result.run.id,
      totalBoards: result.boards.length,
      totalListings: result.boards.reduce((s, b) => s + b.listings.length, 0),
      errors: result.errors,
      conditionDistribution: conditionDist,
      genderDistributionListings: genderDistListings,
      genderDistributionBoards: genderDistBoards,
      stockByRetailer: stockRows,
      sampleBlemished: blemRows,
      sampleGendered: genderedRows,
      closeoutInDb: closeoutListings,
      closeoutInResult: resultConditions,
    });
  }

  if (action === "condition-debug") {
    // Trace condition detection through the actual pipeline with no constraint filtering
    const { detectCondition, normalizeBoard } = await import("@/lib/normalization");
    const { BoardIdentifier } = await import("@/lib/board-identifier");
    const { Currency, Region } = await import("@/lib/types");
    const { tactics } = await import("@/lib/retailers/tactics");
    const { evo } = await import("@/lib/retailers/evo");

    // Run scrapers and find closeout/blem boards
    const tacticsBoards = await tactics.searchBoards({});
    const evoBoards = await evo.searchBoards({});
    const closeoutKws = ["closeout", "blem", "outlet"];

    const allBoards = [...tacticsBoards, ...evoBoards];
    const interesting = allBoards.filter(b =>
      closeoutKws.some(kw => b.url.toLowerCase().includes(kw)) ||
      (b.model && closeoutKws.some(kw => b.model!.toLowerCase().includes(kw)))
    );

    const traced = interesting.map(raw => {
      const cb = normalizeBoard(raw, "trace-run");
      return {
        retailer: raw.retailer,
        rawUrl: raw.url,
        rawModel: raw.model,
        rawBrand: raw.brand,
        lengthCm: raw.lengthCm ?? null,
        salePrice: raw.salePrice,
        condition: cb.condition,
        gender: cb.gender,
        model: cb.model,
        // Why might it be filtered?
        wouldBeFilteredByLength: raw.lengthCm != null && (raw.lengthCm < 155 || raw.lengthCm > 161),
        wouldBeFilteredByPrice: (raw.salePrice ?? 0) > 650,
        wouldBeFilteredByWomens: /women|wmns/i.test(`${cb.brand} ${cb.model} ${raw.description || ""}`),
      };
    });

    return NextResponse.json({ action, total: allBoards.length, closeoutBoards: traced });
  }

  if (action === "full-pipeline") {
    const { runSearchPipeline } = await import("@/lib/pipeline");
    const result = await runSearchPipeline({ skipEnrichment: false, skipManufacturers: false });
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

  if (action === "evo-detail-html") {
    const { fetchPageWithBrowser } = await import("@/lib/scraping/utils");
    const cheerio = await import("cheerio");
    const url = body.url || "https://www.evo.com/snowboards/gnu-money-snowboard";
    const html = await fetchPageWithBrowser(url);
    const $ = cheerio.load(html);

    // Look for spec sections
    const specSections: { selector: string; html: string }[] = [];
    for (const sel of [
      "[class*='spec']", "[class*='Spec']", "[class*='detail']", "[class*='Detail']",
      "[class*='feature']", "[class*='Feature']", "[class*='tech']", "[class*='Tech']",
      "table", "dl", ".pdp-specs", ".product-specs",
    ]) {
      $(sel).each((_, el) => {
        const h = $(el).toString();
        if (h.length < 8000 && specSections.length < 25) {
          specSections.push({ selector: sel, html: h.slice(0, 3000) });
        }
      });
    }

    // JSON-LD
    const jsonLd: unknown[] = [];
    $("script[type='application/ld+json']").each((_, el) => {
      try { jsonLd.push(JSON.parse($(el).text())); } catch { /* skip */ }
    });

    // Keyword search
    const htmlLower = html.toLowerCase();
    const keywords = ["flex", "profile", "camber", "rocker", "shape", "terrain", "ability", "skill", "best for", "riding style"];
    const keywordHits: Record<string, { count: number; context: string }> = {};
    for (const kw of keywords) {
      const idx = htmlLower.indexOf(kw);
      if (idx >= 0) {
        keywordHits[kw] = {
          count: htmlLower.split(kw).length - 1,
          context: html.slice(Math.max(0, idx - 100), idx + kw.length + 200),
        };
      }
    }

    return NextResponse.json({ action, url, htmlLength: html.length, specSections, jsonLd, keywordHits });
  }

  if (action === "rei-product-data") {
    // Inspect the raw product objects from REI listing pages to see available fields
    const db = getDb();
    const rows = db.prepare("SELECT url, body FROM http_cache WHERE url LIKE '%rei.com/c/snowboards%'").all() as { url: string; body: string }[];
    const products: unknown[] = [];
    for (const row of rows) {
      const linkPattern = /"link":"\/product\/\d+\//g;
      const matches = [...row.body.matchAll(linkPattern)];
      for (const match of matches.slice(0, 3)) {
        const startIdx = match.index!;
        let depth = 0;
        let objStart = startIdx;
        for (let i = startIdx; i >= Math.max(0, startIdx - 5000); i--) {
          if (row.body[i] === "}") depth++;
          if (row.body[i] === "{") { depth--; if (depth < 0) { objStart = i; break; } }
        }
        depth = 0;
        let objEnd = startIdx;
        for (let i = objStart; i < Math.min(row.body.length, objStart + 10000); i++) {
          if (row.body[i] === "{") depth++;
          if (row.body[i] === "}") { depth--; if (depth === 0) { objEnd = i + 1; break; } }
        }
        try {
          const product = JSON.parse(row.body.slice(objStart, objEnd));
          products.push(product);
        } catch { /* skip */ }
      }
      if (products.length >= 3) break;
    }
    return NextResponse.json({ action, sampleCount: products.length, products });
  }

  if (action === "rei-detail-html") {
    const { chromium } = await import("playwright");
    const cheerio = await import("cheerio");
    const targetUrl = body.url || "https://www.rei.com/product/236379/jones-flagship-snowboard-20252026";

    const browser = await chromium.launch({
      headless: true,
      channel: "chrome",
      args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
    });
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();

    // Navigate to listing page first to establish cookies
    await page.goto("https://www.rei.com/c/snowboards", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(3000);

    // Now navigate to detail page in same tab
    await page.goto(targetUrl, { waitUntil: "load", timeout: 45000 });
    await page.waitForTimeout(3000);

    const html = await page.content();
    await browser.close();

    const $ = cheerio.load(html);

    // Look for spec sections
    const specSections: { selector: string; html: string }[] = [];
    for (const sel of [
      "[class*='spec']", "[class*='Spec']", "[class*='detail']", "[class*='Detail']",
      "[class*='feature']", "[class*='Feature']", "[class*='tech']", "[class*='Tech']",
      "table", "dl", "#specs", "#product-specs",
    ]) {
      $(sel).each((_, el) => {
        const h = $(el).toString();
        if (h.length < 8000 && specSections.length < 25) {
          specSections.push({ selector: sel, html: h.slice(0, 3000) });
        }
      });
    }

    // JSON-LD
    const jsonLd: unknown[] = [];
    $("script[type='application/ld+json']").each((_, el) => {
      try { jsonLd.push(JSON.parse($(el).text())); } catch { /* skip */ }
    });

    // Keyword search
    const htmlLower = html.toLowerCase();
    const keywords = ["flex", "profile", "camber", "rocker", "shape", "terrain", "ability", "skill", "best for", "riding style"];
    const keywordHits: Record<string, { count: number; context: string }> = {};
    for (const kw of keywords) {
      const idx = htmlLower.indexOf(kw);
      if (idx >= 0) {
        keywordHits[kw] = {
          count: htmlLower.split(kw).length - 1,
          context: html.slice(Math.max(0, idx - 100), idx + kw.length + 200),
        };
      }
    }

    return NextResponse.json({ action, url: targetUrl, htmlLength: html.length, specSections, jsonLd, keywordHits });
  }

  if (action === "bc-detail-html") {
    const db = getDb();
    const cheerio = await import("cheerio");
    const row = db.prepare("SELECT url, body FROM http_cache WHERE url LIKE '%backcountry.com%' AND url NOT LIKE '%/snowboards' LIMIT 1").get() as { url: string; body: string } | undefined;
    if (!row) return NextResponse.json({ error: "No backcountry detail page in cache" });

    const $ = cheerio.load(row.body);

    // Check __NEXT_DATA__ for structured product data
    let nextData: unknown = null;
    const nextDataScript = $("#__NEXT_DATA__");
    if (nextDataScript.length > 0) {
      try {
        const parsed = JSON.parse(nextDataScript.text());
        const pageProps = parsed?.props?.pageProps || {};
        const apollo = pageProps.__APOLLO_STATE__;
        if (apollo) {
          // Find product entries with specs
          const productEntries: Record<string, unknown>[] = [];
          for (const [key, value] of Object.entries(apollo)) {
            const v = value as Record<string, unknown>;
            if (v.__typename === "Product" || v.__typename === "ProductAttribute" ||
                v.__typename === "Specification" || v.__typename === "TechSpec" ||
                (typeof key === "string" && (key.includes("spec") || key.includes("Spec") || key.includes("attribute")))) {
              productEntries.push({ key, ...v });
            }
          }
          // Also find all unique __typename values
          const types = new Set<string>();
          for (const value of Object.values(apollo)) {
            const v = value as Record<string, unknown>;
            if (v.__typename) types.add(v.__typename as string);
          }
          nextData = { typenames: [...types], productEntries: productEntries.slice(0, 20) };
        }
      } catch { /* skip */ }
    }

    // Also look for detailsAccordion bullet points
    const bulletPoints: string[] = [];
    $("[data-id='detailsAccordion'] li").each((_, el) => {
      bulletPoints.push($(el).text().trim());
    });

    // JSON-LD
    const jsonLd: unknown[] = [];
    $("script[type='application/ld+json']").each((_, el) => {
      try { jsonLd.push(JSON.parse($(el).text())); } catch { /* skip */ }
    });

    return NextResponse.json({ action, url: row.url, htmlLength: row.body.length, nextData, bulletPoints, jsonLd });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

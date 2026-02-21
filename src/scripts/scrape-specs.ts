import { getManufacturers, getAllManufacturerBrands } from "../lib/manufacturers/registry";
import { ingestManufacturerSpecs } from "../lib/manufacturers/ingest";
import { closeBrowser } from "../lib/scraping/browser";

async function main() {
  const args = process.argv.slice(2);
  const brands: string[] = [];

  // Parse --brand flags
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--brand" && args[i + 1]) {
      brands.push(args[i + 1]);
      i++;
    }
  }

  if (brands.length === 0) {
    console.log(`Scraping all manufacturers: ${getAllManufacturerBrands().join(", ")}`);
  } else {
    console.log(`Scraping manufacturers: ${brands.join(", ")}`);
  }

  const manufacturers = getManufacturers(brands.length > 0 ? brands : undefined);

  if (manufacturers.length === 0) {
    console.error(`No matching manufacturers found. Available: ${getAllManufacturerBrands().join(", ")}`);
    process.exit(1);
  }

  let totalInserted = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;

  for (const mfr of manufacturers) {
    console.log(`\n=== ${mfr.brand} ===`);
    try {
      const specs = await mfr.scrapeSpecs();
      console.log(`[${mfr.brand}] Scraped ${specs.length} board specs`);

      const stats = ingestManufacturerSpecs(specs);
      console.log(`[${mfr.brand}] Ingested: ${stats.inserted} inserted, ${stats.updated} updated, ${stats.skipped} skipped`);

      totalInserted += stats.inserted;
      totalUpdated += stats.updated;
      totalSkipped += stats.skipped;
    } catch (err) {
      console.error(`[${mfr.brand}] Failed:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Inserted: ${totalInserted}`);
  console.log(`Updated: ${totalUpdated}`);
  console.log(`Skipped: ${totalSkipped}`);
  console.log(`Total: ${totalInserted + totalUpdated + totalSkipped}`);

  await closeBrowser();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  closeBrowser().then(() => process.exit(1));
});

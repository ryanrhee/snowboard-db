import { runSearchPipeline } from "../lib/pipeline";
import { getManufacturerBrands } from "../lib/scrapers/registry";
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
    console.log(`Scraping all manufacturers: ${getManufacturerBrands().join(", ")}`);
  } else {
    console.log(`Scraping manufacturers: ${brands.join(", ")}`);
  }

  const result = await runSearchPipeline({
    manufacturers: brands.length > 0 ? brands : undefined,
    retailers: [], // manufacturers only
  });

  console.log(`\n=== Summary ===`);
  console.log(`Boards: ${result.boards.length}`);
  console.log(`Errors: ${result.errors.length}`);
  if (result.errors.length > 0) {
    for (const err of result.errors) {
      console.error(`  [${err.retailer}] ${err.error}`);
    }
  }

  await closeBrowser();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  closeBrowser().then(() => process.exit(1));
});

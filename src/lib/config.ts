export const config = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  dbPath: process.env.DB_PATH || "data/snowboard-finder.db",
  scrapeDelayMs: parseInt(process.env.SCRAPE_DELAY_MS || "1000", 10),
  krwToUsdRate: parseFloat(process.env.KRW_TO_USD_RATE || "0.00074"),
  maxConcurrentRetailers: parseInt(process.env.MAX_CONCURRENT_RETAILERS || "3", 10),
  enableSpecEnrichment: process.env.ENABLE_SPEC_ENRICHMENT !== "false",
  userAgents: [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  ],
  getRandomUserAgent(): string {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  },
};

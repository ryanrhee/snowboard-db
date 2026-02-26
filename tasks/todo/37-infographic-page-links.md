# Task 37: Fix infographic audit page links to show only manufacturer URLs

## Problem

The `/lt-infographics` and `/gnu-infographics` audit pages show links to both manufacturer and retailer listings for each board. This is unnecessary — the infographic pages are for debugging manufacturer spec extraction, not for shopping. Some boards (e.g. Apex Orca, Cold Brew) show no links at all.

## Goal

1. Each board on the infographic audit pages should show exactly one link: the manufacturer's product page URL.
2. Every board should have a link — if the board was scraped from the manufacturer site, its product page URL is known.
3. Remove retailer links from these pages entirely.
4. The manufacturer link doesn't need to be a purchasable page — informational product pages are fine.

## Known issues

- **Skunk Ape Camber** links to the non-Camber (C2?) Skunk Ape product page — wrong variant linked
- **Apex Orca** has no links — DB has "Lib Tech T. Rice Apex Orca", possibly a name matching issue between infographic board name and DB board key
- **Legitimizer** shows 2 evo links (2025 vs 2026) — should only show the manufacturer link, not retailer links at all

Analyze the full dataset for more issues like these: wrong variant links, missing links, duplicate links, retailer links that shouldn't be there.

## Approach

1. Check the API routes (`src/app/api/lt-infographics/route.ts`, `src/app/api/gnu-infographics/route.ts`) to see where links are sourced from. They likely pull from the `listings` table which mixes manufacturer and retailer sources.
2. Filter to only `manufacturer:*` source URLs, or better yet, pull the product page URL directly from the manufacturer scraper output (the `sourceUrl` / `manufacturer_url` field on the board).
3. For boards with no links (Apex Orca, Cold Brew), investigate why — they should have manufacturer URLs if they were scraped from lib-tech.com.
4. Update the UI components to show a single manufacturer link per board instead of a list.

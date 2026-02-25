# Task 32: Stop merging profile variants into the same board key

## Problem

Some manufacturers sell the same model in multiple profile variants as distinct products — e.g. Burton "Custom Camber" (W26-106881) and "Custom Flying V" (W26-107071). These are different boards with different specs, different URLs, and different size runs.

`normalizeModel()` strips the profile suffix ("Camber", "Flying V") during normalization, collapsing both into `burton|custom|unisex`. This causes:

- Duplicate listings under one board (two URLs, overlapping sizes)
- Spec conflicts (one board has camber profile, the other has hybrid rocker)
- Incorrect spec resolution (whichever source writes last wins)

This is a normalization issue, not a scraping issue — the scrapers correctly extract distinct products.

## Scope

**3 brands, 7 models affected** (14 products → 7 collapsed keys):

| Brand | Model | Variant A | Variant B |
|-------|-------|-----------|-----------|
| Burton | Custom | Camber | Flying V |
| Burton | Feelgood | Camber | Flying V |
| Burton | Process | Camber | Flying V |
| Burton | Yeasayer | Camber | Flying V |
| Lib Tech | Skunk Ape | C2 (default) | Camber |
| Lib Tech | T.Rice Pro | C2 (default) | Camber |
| GNU | Ladies Choice | C2 (default) | Camber |

Burton uses Camber vs Flying V as the variant axis. Mervin brands (Lib Tech, GNU) use C2 (hybrid) vs Camber.

**Important**: Burton uses multiple profile suffixes across their lineup (Camber, Flying V, Flat Top, PurePop Camber). Most single-variant boards have a suffix too (e.g. "Rewind Camber", "Cultivator Flat Top"). We can't simply "stop stripping Camber" globally — that would break matching for all single-variant boards where retailers list them without the suffix.

## Current retailer behavior (from pipeline run)

Retailers use **both** naming conventions:
- Backcountry: "Burton Custom" (no suffix) → ambiguous
- Backcountry: "Burton Process Flying V" (with suffix) → specific, but gets stripped to `burton|process`
- Backcountry: "Burton Feelgood" (no suffix) → ambiguous
- Backcountry: "Lib Tech Skunk Ape Camber" (with suffix) → specific, but gets stripped to `lib tech|skunk ape`

## Goal

Profile variants should be separate boards with separate board keys. `burton|custom camber|unisex` and `burton|custom flying v|unisex` should coexist. Retailer listings without a profile suffix should still match.

## Approach: collision detection at coalesce time

Can't selectively stop stripping at normalization time — we don't know which models have variants until all scrapers have run. Instead, strip everything as today, then detect and fix collisions after the fact.

### Flow

All scrapers run (any order), all strip profile suffixes as today. Scrapers must pass through the **raw model name** alongside the normalized one so coalesce can recover the suffix.

#### Phase 1: Detect manufacturer collisions

During coalesce, after all scraper results are collected:
- Group by board key
- If a board key has multiple distinct source URLs from the same manufacturer site, the suffix was meaningful → this model has profile variants
- Re-derive keys with suffix preserved for those specific models (e.g. `burton|custom` splits into `burton|custom camber` and `burton|custom flying v`)

#### Phase 2: Reassign retailer listings for variant models

For models identified as having variants:
- If the retailer's raw model name had a suffix (e.g. "Process Flying V") → match to that specific variant key
- If no suffix (e.g. "Custom") → check the detail page profile spec (camber, hybrid rocker, etc.) → match to the right variant
- If no detail page data → default to the "standard" variant (Camber for Burton, C2/non-suffixed for Mervin)

No ordering dependency between scrapers. All logic runs at coalesce time with the full dataset available.

### Requirements

- **Task 33 (prerequisite)**: Scrapers must emit `rawModel` (pre-normalization name) alongside the normalized `model`
- **Task 34 (prerequisite)**: Retailer detail page profile extraction needed to disambiguate suffix-less listings (e.g. "Burton Custom" → which variant?)
- Default variant mapping: Burton → Camber, Lib Tech/GNU → non-suffixed (C2)

## Considerations

- This was originally "fixed" in Task 3 by stripping the suffix, which solved cross-source matching but created the collision.
- Custom X is a separate model (not a profile variant of Custom) and already has its own key — no collision there.
- The default-to-Camber fallback will sometimes be wrong, but it's a reasonable best guess until detail page scraping fills in the profile for all retailers.
- No dependency on manufacturer scrapers running first — collision detection works on the combined output of all scrapers.

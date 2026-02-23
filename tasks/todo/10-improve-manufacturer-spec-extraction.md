# Task 10: Improve manufacturer scraper spec extraction (especially flex)

## Problem

Only 10/104 boards have `flex` populated. Profile (51), shape (52), and category (58) are better but still incomplete. The main issue is that manufacturer scrapers store data in `tags` or other aggregate fields rather than extracting individual spec fields like `flex`, `profile`, `shape`.

For example, CAPiTA's manufacturer data has `tags: "150, 152, camber, CAPiTA, Freestyle, Men's, true twin"` — the profile (`camber`) and shape (`true twin`) are embedded in tags but never extracted into the `profile` and `shape` spec_source fields.

## Subtasks

### 1. Audit current manufacturer scrapers — document which fields each extracts

For each manufacturer scraper (debug actions that populate `spec_sources` with `source='manufacturer'`), document:
- Which debug action(s) drive it
- Which fields it writes to `spec_sources` (flex, profile, shape, category, abilityLevel, etc.)
- Which fields are missing or buried in aggregate fields like `tags`
- Sample board showing the gap

Run this query to see what fields each manufacturer scraper actually produces:
```sql
SELECT field, COUNT(*) as cnt
FROM spec_sources
WHERE source = 'manufacturer'
GROUP BY field
ORDER BY cnt DESC;
```

### 2. Per-manufacturer improvement subtasks

After the audit, create subtasks for each manufacturer that needs work. Likely candidates:

- **CAPiTA** — has `tags` field with profile/shape data embedded; needs parsing into separate `profile` and `shape` fields. Also has `flex` as a number but may not be on 1-10 scale.
- **Burton** — check if flex/profile/shape are stored individually or need extraction from detail page attributes.
- **Lib Tech** — check infographic SVG parsing; may have rider level but not flex.
- **Jones** — likely no manufacturer scraper yet; only gets specs from The Good Ride review site.
- **Others** (GNU, Ride, Rossignol, Nitro, Salomon, Arbor, Bataleon, Rome, Yes, Nidecker, DWD, Roxy) — likely no manufacturer scraper at all.

### 3. Parse structured data from `tags` field

As a quick win, the `resolveSpecSources` or `saveRetailerSpecs` step could parse known patterns from the `tags` field:
- Profile keywords: `camber`, `rocker`, `flat`, `hybrid`
- Shape keywords: `true twin`, `directional`, `tapered`
- Gender keywords: `Men's`, `Women's`, `Kids`

This would immediately improve coverage for CAPiTA and any other manufacturer that stores specs in tags.

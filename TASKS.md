# TASKS

## 6. Separate data ingestion from personal search constraints

**Status:** open
**Priority:** high — architectural prerequisite for all other work

### Problem

The pipeline currently merges data scraping with personal search filtering (`DEFAULT_CONSTRAINTS`: 155-161cm, max $650, excludeWomens, excludeKids). This means:

1. **Data loss** — boards outside personal constraints are never stored. Closeout/blem items that happen to be wrong size or price are discarded before they even reach the DB.
2. **Single-user lock-in** — the stored data can't serve other queries (e.g. finding a women's board for someone else).
3. **Wrong layer** — filtering belongs in the query/UI layer, not the ingestion layer.

### Solution

Restructure into two phases:

1. **Ingestion phase** — scrape ALL boards from retailers and manufacturers. Store everything: all sizes, all genders, all price points. No personal constraints applied. This includes:
   - Manufacturer specs (Burton, Lib Tech, CAPiTA, etc.)
   - Review site data (The Good Ride, etc.)
   - Retailer listings (Tactics, evo, REI, Backcountry) with condition, gender, stock

2. **Query phase** — apply user-specific filters at query time through the API/UI layer. `DEFAULT_CONSTRAINTS` moves from pipeline ingestion to the frontend/API query parameters.

### Implementation notes

- `runSearchPipeline()` should scrape and store without applying `applyConstraints`
- `applyConstraints` / `filterBoardsWithListings` move to the API response layer
- Frontend filters (length, price, gender, condition) become UI controls
- DB becomes the comprehensive snowboard catalog; queries are views into it

## 5. Add listing-level retail metadata: condition, gender, and extras

**Status:** open
**Priority:** medium — improves search value and buyer decision-making

### Problem

Listings currently track only price/availability/size data. Several important retail attributes are either silently discarded during normalization or available in scraper HTML but never captured. This means a $200 blemished board and a $200 new board look identical, a closeout being cleared for next season's stock isn't distinguishable from a regular sale, and gendered products aren't filterable.

Three categories of missing data:

#### A. Condition — blemished, used, closeout

Retailers mark products as blemished (cosmetic defects, sold at discount), closeout (end-of-season liquidation), or occasionally used/refurbished. This is critical information: a blemished board at $300 is a fundamentally different value proposition than a new board at $300.

**Currently lost in normalization.** `normalizeModel()` in `normalization.ts:183-185` actively strips these tags from the model string:

```typescript
// Strip retail tags: (Closeout), (Blem), (Sale) or "- Blem", "- Closeout"
model = model.replace(/\s*\((?:Closeout|Blem|Sale)\)/gi, "");
model = model.replace(/\s*-\s*(?:Closeout|Blem|Sale)\b/gi, "");
```

The data is correctly removed from the model name (so keys stay clean) but it's thrown away instead of being captured onto the listing.

**Retailer-specific signals:**

| Retailer | How condition is indicated | Currently captured? |
|---|---|---|
| **Evo** | Model name contains `(Blem)`, `(Closeout)`, `- Blem`; URL contains `/outlet/` for outlet items | No — stripped by `normalizeModel()` |
| **Tactics** | Model name contains `(Closeout)`, `(Blem)` | No — stripped by `normalizeModel()` |
| **REI** | `clearance: boolean` field in inline JSON data; `sale: boolean` | `clearance` used for filtering only (`rei.ts:145`), not stored |
| **Backcountry** | Model name contains `(Blem)`, `(Closeout)`; URL may contain `/outlet/` | No — stripped by `normalizeModel()` |
| **Best Snowboard (KR)** | Not typically applicable (Korean retail doesn't use "blem" convention) | N/A |

#### B. Gender target

`normalizeModel()` strips gendered suffixes (`" - Women's"`, `" - Men's"`, `" - Kids'"`) without capturing them. This is useful for filtering — a user searching for women's boards can't currently do so.

```typescript
// normalization.ts:194-196
model = model.replace(/\s*-\s*(?:Men's|Women's|Kids'|Boys'|Girls')$/i, "");
model = model.replace(/^(?:Women's|Men's|Kids'|Boys'|Girls')\s+/i, "");
```

The gender is detectable from the model string at normalization time, or from URL patterns (e.g. Evo uses `/w/` in women's URLs, REI uses `womens` in product paths).

#### C. Stock quantity

Tactics' scraper parses exact stock counts per size (`tactics.ts:189`) but only uses them as a filter — the actual count is discarded. Other retailers report binary availability only.

### Proposed schema changes

#### New enum: `ListingCondition`

```typescript
export enum ListingCondition {
  NEW = "new",
  BLEMISHED = "blemished",    // cosmetic defects only, fully functional
  CLOSEOUT = "closeout",      // end-of-season clearance, new condition
  USED = "used",              // pre-owned
  UNKNOWN = "unknown",
}
```

#### New enum: `GenderTarget`

```typescript
export enum GenderTarget {
  MENS = "mens",
  WOMENS = "womens",
  KIDS = "kids",
  UNISEX = "unisex",
}
```

#### `listings` table additions

```sql
ALTER TABLE listings ADD COLUMN condition TEXT NOT NULL DEFAULT 'unknown';
  -- new, blemished, closeout, used, unknown
ALTER TABLE listings ADD COLUMN gender TEXT NOT NULL DEFAULT 'unisex';
  -- mens, womens, kids, unisex
ALTER TABLE listings ADD COLUMN stock_count INTEGER;
  -- actual inventory count if retailer provides it, NULL otherwise
```

#### `boards` table addition

```sql
ALTER TABLE boards ADD COLUMN gender TEXT NOT NULL DEFAULT 'unisex';
  -- mens, womens, kids, unisex
  -- resolved from listings: if all listings agree, use that; otherwise unisex
```

Gender belongs on the board (the Burton Feelgood _is_ a women's board) but condition belongs on the listing (one retailer may sell a blem, another sells new).

#### Type changes

```typescript
// RawBoard: add optional fields
export interface RawBoard {
  // ... existing fields ...
  condition?: string;    // raw condition string from retailer
  gender?: string;       // raw gender string from retailer
  stockCount?: number;   // inventory count if available
}

// CanonicalBoard: add normalized fields
export interface CanonicalBoard {
  // ... existing fields ...
  condition: ListingCondition;
  gender: GenderTarget;
  stockCount: number | null;
}

// Listing: add to persisted type
export interface Listing {
  // ... existing fields ...
  condition: string;     // ListingCondition value
  gender: string;        // GenderTarget value
  stockCount: number | null;
}
```

### Implementation

#### 1. Detect condition before stripping from model name (`normalization.ts`)

In `normalizeModel()`, _before_ the existing regex strips `(Blem)`, `(Closeout)`, `(Sale)`, test for their presence and return the condition as a side channel. The cleanest approach is to change `normalizeModel()` to return `{ model: string; condition: ListingCondition }` instead of just a string, or add a separate `detectCondition(rawModel: string): ListingCondition` function that runs on the raw model before normalization.

Additionally detect from URL patterns:
- `/outlet/` in Evo/Backcountry URLs → `closeout`
- REI `clearance: true` → `closeout`

#### 2. Detect gender before stripping from model name (`normalization.ts`)

Same approach: detect `Women's`, `Men's`, `Kids'` in the model string before normalization strips them. Also detect from URL patterns and product metadata.

Add a `detectGender(rawModel: string, url?: string): GenderTarget` function.

#### 3. Capture stock count from Tactics (`tactics.ts`)

The `stock` field is already parsed at `tactics.ts:189`. Pass it through `RawBoard.stockCount` instead of discarding it.

#### 4. Update each retailer scraper

| Retailer | Changes needed |
|---|---|
| **Evo** | Check URL for `/outlet/`; pass raw model through `detectCondition()` before normalization |
| **Tactics** | Pass raw model through `detectCondition()`; forward `stock` count from size parser |
| **REI** | Map `clearance: true` → `closeout`, capture `sale` flag; pass raw model through `detectCondition()` |
| **Backcountry** | Check URL for `/outlet/`; pass raw model through `detectCondition()` |
| **Best Snowboard** | Likely no condition data; set to `new` by default |

#### 5. Update normalization pipeline (`normalization.ts`)

`normalizeBoard()` should call `detectCondition()` and `detectGender()` on the raw model/URL, then proceed with existing normalization. The detected values flow through `CanonicalBoard` to `Listing`.

#### 6. Update DB schema and CRUD (`db.ts`)

- Migration: `ALTER TABLE listings ADD COLUMN condition ...`, `ADD COLUMN gender ...`, `ADD COLUMN stock_count ...`
- Migration: `ALTER TABLE boards ADD COLUMN gender ...`
- Update `insertListings()`, `getBoardsWithListings()`, `upsertBoards()`

#### 7. Update pipeline (`pipeline.ts`)

`splitIntoBoardsAndListings()` should copy `condition`, `gender`, `stockCount` from `CanonicalBoard` to `Listing`. Board-level `gender` should be resolved from listings (majority vote or all-agree).

#### 8. Frontend

- Show condition badge on listing rows (color-coded: green=new, yellow=blemished, orange=closeout)
- Add gender filter to search UI
- Show stock count where available (e.g. "3 left" indicator)
- Condition should factor into how the listing is displayed — a blem at $200 vs new at $300 is important context

### Edge cases

- **"Sale" tag is not a condition.** `(Sale)` in a model name means it's on sale (price-reduced), not a condition like blemished. Don't map it to a condition — it's already captured via `discountPercent`. Continue stripping it from the model name.
- **Closeout vs. sale overlap.** A board can be both on closeout _and_ on sale. `condition=closeout` with a `discountPercent` captures this.
- **Gender on unisex boards.** Many boards (especially all-mountain) are marketed as unisex. If the model name doesn't mention a gender and the URL has no gender signal, default to `unisex`.
- **Gender disagreement across retailers.** Rare but possible — one retailer may list a board under "Women's" while another doesn't. Board-level gender should use majority or most-specific signal.
- **Blemished boards and value scoring.** A blemished board at 40% off is a _better_ value than a new board at 40% off (because the discount is on top of the blem discount). Consider whether `calcValueScore` should get a condition-aware boost. Not required for initial implementation.

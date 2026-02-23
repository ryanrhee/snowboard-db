# TASKS

## 1. Brand normalization is not applied when generating board keys from retailer data

**Status:** open
**Priority:** high — causes duplicate boards and broken spec matching

### Problem

`specKey()` in `db.ts:287` builds keys as `brand.toLowerCase()|normalizeModel(model, brand).toLowerCase()`. It does **not** call `canonicalizeBrand()` or `normalizeBrand()` on the brand. The brand string it receives has _already_ been normalized by `normalizeBoard()` in the pipeline, but some retailers emit brand names that `normalizeBrand()` doesn't handle:

| Retailer brand | `normalizeBrand` output | Correct canonical | Board key produced | Correct key |
|---|---|---|---|---|
| `"Lib Technologies"` | `"Lib Technologies"` | `"Lib Tech"` | `lib technologies\|glider` | `lib tech\|glider` |
| `"Lib"` | `"Lib"` | `"Lib Tech"` | `lib\|lib tech cold brew c2 ltd` | `lib tech\|cold brew c2 ltd` |
| `"Gnu"` | `"Gnu"` | `"GNU"` | `gnu\|frosting c2` | `gnu\|frosting c2` |
| `"YES"` | `"YES"` | `"Yes."` | `yes\|basic` | `yes.\|basic` |
| `"SIMS"` | `"SIMS"` | `"Sims"` | `sims\|mystery lunch` | `sims\|mystery lunch` |
| `"Dinosaurs"` | `"Dinosaurs"` | `"Dinosaurs Will Die"` | `dinosaurs\|dinosaurs will die wizard stick` | `dinosaurs will die\|wizard stick` |
| `"Capita"` | `"Capita"` | `"CAPiTA"` | `capita\|horrorscope` | `capita\|horrorscope` |

This creates multiple board entries for the same product (e.g. `gnu|frosting c2` and `gnu|gnu frosting c2`), and none of them match the manufacturer's `spec_cache` key which uses the canonical brand.

### Root cause

1. `canonicalizeBrand()` in `scraping/utils.ts:122` does a case-insensitive lookup but the alias map doesn't include all variations. `"Lib Technologies"`, `"Lib"` (without "Tech"), `"Dinosaurs"` (without "Will Die") are missing.
2. More importantly, some retailer scrapers don't clean the brand before returning it, so `normalizeBrand()` receives strings like `"Lib"` that it can't fix.
3. `specKey()` only calls `normalizeModel()`, not `normalizeBrand()` / `canonicalizeBrand()`. It trusts the caller to have already normalized the brand. The pipeline does (`normalizeBoard()` calls `normalizeBrand()`), but the key is generated from the _result_, and if `normalizeBrand` doesn't canonicalize, the key is wrong.

### Fix

1. Add missing aliases to `BRAND_ALIASES`: `"lib" → "Lib Tech"`, `"lib technologies" → "Lib Tech"`, `"dinosaurs" → "Dinosaurs Will Die"`, `"sims" → "Sims"`, `"yes" → "Yes."`.
   _Note: some of these are already present but only match on exact lowercase. The issue may be that `normalizeBrand` strips "Snowboard(s)" first but some retailers emit just the short name._
2. Make `specKey()` call `canonicalizeBrand()` on the brand before lowercasing, so it's resilient to non-normalized input.
3. Audit each retailer scraper's brand extraction to see which ones emit non-canonical brand names. Fix at the source where possible.

---

## 2. Model names not fully normalized — brand name leaks into model string

**Status:** open
**Priority:** high — creates phantom board entries and breaks spec matching

### Problem

Several retailer scrapers return the full product title as the model name. `normalizeModel()` strips "Snowboard", years, gender suffixes, and handles a few known brand leaks (Lib Tech `"Tech ..."`, DWD `"Will Die ..."`), but many other brands leak into the model:

| Board key produced | Raw model | Should be |
|---|---|---|
| `gnu\|gnu asym ladies choice c2x` | `GNU Asym Ladies Choice C2X Snowboard - Women's 2025` | `gnu\|asym ladies choice c2x` |
| `jones\|jones dream weaver 2.0` | `Jones Dream Weaver 2.0 Snowboard - Women's 2026` | `jones\|dream weaver 2.0` |
| `rossignol\|rossignol juggernaut` | `Rossignol Juggernaut Snowboard 2025` | `rossignol\|juggernaut` |
| `sims\|sims bowl squad` | `Sims Bowl Squad Snowboard 2026` | `sims\|bowl squad` |
| `season\|season kin` | `Season Kin Snowboard 2026` | `season\|kin` |
| `yes.\|yes. airmaster 3d` | `Yes. Airmaster 3D Snowboard 2026` | `yes.\|airmaster 3d` |
| `salomon\|salomon sight x` | `Salomon Sight X Snowboard 2026` | `salomon\|sight x` |
| `rome\|rome heist` | `Rome Heist Snowboard - Women's 2024` | `rome\|heist` |
| `lib\|lib tech dynamiss c3` | `Lib Tech Dynamiss C3 Snowboard - Women's 2025` | `lib tech\|dynamiss c3` |

This creates duplicate board entries (e.g. `sims|bowl squad` from one retailer and `sims|sims bowl squad` from another) that don't merge, and neither matches the manufacturer's spec_cache key.

### Root cause

`normalizeModel()` has a hardcoded brand-leak fix for Lib Tech and DWD only. It does **not** strip the brand name generically from the start of the model string. Some retailers (appears to be Backcountry and REI from the patterns) prepend the brand to the model in their product titles.

### Fix

Add a generic brand-prefix stripping step to `normalizeModel()`: if the model string starts with the brand name (case-insensitive), strip it. This must happen _after_ the brand has been canonicalized (e.g. strip `"Yes. "` not just `"Yes "`). Edge cases:
- `"K2 Standard"` → the model _is_ `"Standard"`, brand is `"K2"`. Stripping works.
- `"Burton Custom"` → model is `"Custom"`. Stripping works.
- Some models legitimately start with a word that matches the brand — unlikely but check test suite.

This generic fix would also replace the Lib Tech and DWD-specific hacks.

---

## 3. Manufacturer spec keys include profile suffixes that retailers don't use

**Status:** open
**Priority:** high — this is the "95 of 119 don't match" problem from the restructure plan

### Problem

Manufacturer scrapers (Burton especially) emit one product entry per profile variant: `burton|custom camber`, `burton|custom flying v`, `burton|feelgood camber`, `burton|feelgood flying v`, `burton|counterbalance camber`. Retailers list the same board as just `burton|custom`, `burton|feelgood`, `burton|counterbalance`.

Fuzzy match data from the key-mismatch audit:

| Board key (retailer) | Spec_cache key (manufacturer) |
|---|---|
| `burton\|custom` | `burton\|custom camber`, `burton\|custom flying v`, `burton\|custom x camber` |
| `burton\|feelgood` | `burton\|feelgood camber`, `burton\|feelgood flying v` |
| `burton\|counterbalance` | `burton\|counterbalance camber` |
| `burton\|good company` | `burton\|good company undefeated camber` |
| `burton\|rewind` | `burton\|rewind camber` |
| `capita\|arthur longo aeronaut` | `capita\|aeronaut` |
| `lib tech\|legitimizer c3` | `lib tech\|legitimizer` |
| `lib tech\|rasman c2x` | `lib tech\|rasman` |
| `lib tech\|t. rice apex orca` | `lib tech\|apex orca` |

The pattern is bidirectional:
- **Burton**: manufacturer key = `model + " " + profile`. Retailer key = just `model`. Manufacturer key is _longer_.
- **Lib Tech**: manufacturer key = base model name. Retailer key = `model + " " + profile_code`. Manufacturer key is _shorter_.
- **CAPiTA**: manufacturer uses full name `aeronaut`, retailer uses `arthur longo aeronaut` (artist prefix). Manufacturer key is _shorter_.

### Root cause

1. **Burton scraper** (`src/lib/manufacturers/burton.ts`): uses the full `productName` which includes the profile variant as part of the name (e.g. "Custom Camber Snowboard"). `normalizeModel()` doesn't know to strip profile suffixes like "Camber", "Flying V" because those are valid model name words in other contexts.
2. **Lib Tech scraper**: uses the page slug as the model (e.g. "legitimizer", "rasman") while retailers append the profile code ("C3", "C2X") that Lib Tech uses in their naming.
3. **CAPiTA**: retailer prepends artist names that the manufacturer omits from the Shopify handle.

### Fix

This needs a fuzzy matching / alias resolution layer when looking up specs. Options:

**Option A — Strip known profile suffixes during key generation.** In `normalizeModel()`, strip trailing profile-like words (`Camber`, `Flying V`, `Rocker`, `Flat Top`, `C2`, `C3`, `C2X`, `C2E`, `C3 BTX`) when the brand is known to use profile-in-name conventions. Risk: some models legitimately end with these words.

**Option B — Fuzzy spec_cache lookup.** When `specKey(brand, model)` doesn't hit in `spec_cache`, try progressively shorter suffixes of the model, or check if any spec_cache key for the same brand is a substring of the query (or vice versa). This is more robust but needs careful implementation to avoid false matches.

**Option C — Manufacturer-side normalization.** Fix each manufacturer scraper to strip profile suffixes before emitting the model name, and store the profile in the `profile` field instead. Burton's scraper should emit `model="Custom"`, `profile="Camber"` rather than `model="Custom Camber"`. Lib Tech's scraper should emit `model="Legitimizer C3"` to match retailer convention, or add C3/C2X as an alias.

Likely the best approach is a combination: fix manufacturer scrapers to normalize their models (Option C), and add a fuzzy fallback (Option B) to catch remaining mismatches.

---

## 4. Some model names retain unsanitized retailer formatting

**Status:** open
**Priority:** medium — cosmetic but also breaks deduplication

### Problem

A handful of boards have model names that still contain raw retailer formatting that `normalizeModel()` didn't strip:

| Board key | Raw model | Issue |
|---|---|---|
| `nitro\|optisym` | `Optisym Snowboard  - 2025` | double space before dash |
| `season\|lolo` | `Lolo Snowboard 2026` | "Snowboard" not stripped |
| `salomon\|sight x` | `Sight X Snowboard 2026` | "Snowboard" not stripped |
| `arbor\|bryan iguchi pro 2.0` | `Bryan Iguchi Pro 2.0/` | trailing slash |
| `arbor\|element` | `Element/` | trailing slash |
| `nidecker\|escape` | `Escape/` | trailing slash |
| `nitro\|alternator` | `Alternator/` | trailing slash |

The trailing slashes come from a retailer (appears to be REI based on URL format) that includes them in product names. The "Snowboard" not being stripped suggests some model strings bypass `normalizeModel()` or the stripping regex doesn't match in certain contexts.

### Root cause

1. Trailing `/` is not handled by `normalizeModel()`.
2. "Snowboard" appears to be stripped correctly by `normalizeModel()` (via regex `\s+Snowboard\b`), but these boards' model names in the `boards` table come from the _migration_ path (`populateFromLegacy`), which calls `normalizeModel()` on the legacy model. The legacy model may have already been partially normalized, leaving behind format artifacts.
3. Double spaces suggest a concatenation or regex substitution left extra whitespace.

### Fix

1. Add trailing slash stripping to `normalizeModel()`: `model = model.replace(/\/+$/, "")`.
2. Ensure the whitespace cleanup regex catches double spaces from dash-separated patterns.
3. These are minor — will be fixed naturally once the brand-prefix stripping (Task 2) and model normalization are improved.

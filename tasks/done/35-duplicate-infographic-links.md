# Task 35: Eliminate redundant manufacturer link mechanisms

Completed: 2026-02-26

## Problem

Manufacturer links appeared via three redundant mechanisms, causing duplicate display (e.g. both "Manufacturer" and "manufacturer:lib tech" linking to the same URL). All 7 manufacturer scrapers produced listings stored with `retailer = "manufacturer:<brand>"`, but older code paths also hardcoded the same URL separately.

## What was done

1. **Stripped `manufacturer:` prefix in coalesce** (`coalesce.ts:247-251`) — symmetric with how `retailer:` prefix was already stripped. Manufacturer listings now store clean names ("burton", "lib tech") instead of "manufacturer:burton".

2. **Removed hardcoded "Manufacturer" link from infographic routes** (`lt-infographics/route.ts:77`, `gnu-infographics/route.ts:75`) — links now come solely from the listings query, eliminating the duplicate.

3. **Removed "Manufacturer page" header link from BoardDetail** (`BoardDetail.tsx:315-325`) — the manufacturer appears in the listings table like any other source, removing the dual-path display.

4. **Migrated existing DB data** — stripped `manufacturer:` prefix from all existing listing rows in `listings.retailer`.

SearchResults badges fixed for free by Fix 1 — they now show clean names instead of raw `manufacturer:*` strings.

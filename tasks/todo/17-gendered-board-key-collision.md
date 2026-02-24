# Task 17: Gendered board key collision

## Problem

Men's and women's versions of the same board model get coalesced under one `board_key` because the gender suffix is stripped during model normalization. For example:

- `Jones Flagship Snowboard - 2025/2026` (men's) -> `jones|flagship`
- `Jones Flagship Snowboard - Women's - 2025/2026` (women's) -> `jones|flagship`

These are different boards with different specs, sizes, flex, and shapes. Merging them causes:
- Spec data from one gender to overwrite the other in `spec_sources`
- Listings from both genders to appear under a single board
- Incorrect spec resolution when men's and women's specs disagree

## Observed in

REI listings: both `product/236379` (men's) and `product/236388` (women's) Flagship map to `jones|flagship`.

## Likely fix

The `specKey()` or model normalization in `coalesce.ts` needs to preserve gender as part of the board identity. Options:
1. Include gender in `board_key`: `jones|flagship|womens`
2. Keep "Women's" / "Womens" in the model name: `jones|flagship womens`
3. Detect gendered variants and avoid stripping the suffix

Need to check how evo/backcountry handle this — they may already produce separate `RawBoard` entries with correct gender but the same model name.

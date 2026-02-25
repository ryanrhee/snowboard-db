# Task 35: Investigate duplicate links in infographic API responses

## Problem

The lt-infographics and gnu-infographics API endpoints return duplicate links for some boards. For example, the Skate Banana entry has two links pointing to the same `https://www.lib-tech.com/skate-banana` URL with different labels ("Manufacturer" and "manufacturer:lib tech"). This caused React duplicate key warnings in the UI (worked around with index-based keys).

## Investigation needed

- Trace where the `links` array is built in the API routes (`/api/lt-infographics`, `/api/gnu-infographics`)
- Determine why some boards get both a "Manufacturer" link and a "manufacturer:lib tech" link to the same URL
- Deduplicate links by URL in the API response, or fix the upstream data source producing duplicates

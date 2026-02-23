# Task 9: Add spec scraping to evo, backcountry, and rei scrapers

## Problem

Evo, backcountry, and rei scrapers skip detail pages for speed, returning only listing-level data (price, URL, brand, model). They produce no spec fields (flex, profile, shape, category, ability level).

Only tactics fetches detail pages and extracts specs.

## Goal

Add detail-page fetching (or at least spec extraction from listing pages where available) to evo, backcountry, and rei so that retailer-sourced specs flow into `spec_sources` for these boards too.

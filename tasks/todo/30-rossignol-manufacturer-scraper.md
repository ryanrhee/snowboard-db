# Task 30: Add Rossignol manufacturer scraper

## Problem

Rossignol is the largest brand without a manufacturer scraper (5 boards, 25 listings). All specs for Rossignol boards currently come from retailers and review sites only.

Referenced from Task 10 subtask 8.

## Goal

Add a manufacturer scraper for rossignol.com that extracts specs (flex, profile, shape, category, ability level) and MSRP for all Rossignol snowboards.

## Approach

1. Investigate rossignol.com product page structure (Shopify, custom, etc.)
2. Build scraper following existing patterns (see `docs/manufacturers.md` for conventions)
3. Register in scraper registry
4. Add tests

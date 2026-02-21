# Snowboard Deal Finder

Find the best beginner snowboard deals across retailers (Tactics, Evo, Backcountry). Scrapes live listings, enriches specs via Claude, and scores boards for beginner-friendliness and value.

## Setup

```bash
npm install
npx playwright install chromium
```

Copy `.env.local.example` to `.env.local` and set your `ANTHROPIC_API_KEY`.

## Running the dev server

**Important:** The dev server must be run from a regular terminal, not from within Claude Code. Meta's sandbox on the Claude process blocks Chromium's mach port bootstrap calls, causing Playwright to crash with `SIGSEGV` on launch.

```bash
# Run from a regular terminal:
npx next dev -p 3099
```

Claude Code can still be used for editing, searching, and committing -- just run the server separately.

## Architecture

- **Scraping:** Tactics (fetch), Evo & Backcountry (Playwright headless browser)
- **Enrichment:** Missing specs (flex, profile, shape, category) are looked up via Claude Haiku + web search. Results are cached in SQLite across restarts.
- **Scoring:** Boards are scored on beginner-friendliness and value. Boards missing spec data are shown in a separate "Missing Spec Data" section in the UI.

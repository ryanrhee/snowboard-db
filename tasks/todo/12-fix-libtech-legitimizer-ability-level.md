# Task 12: Fix Lib Tech Legitimizer ability level extraction

## Problem

The Lib Tech Legitimizer has incorrect ability level data from the manufacturer scraper:

- **Manufacturer scraper says**: beginner-intermediate
- **Manufacturer site actually shows**: intermediate-advanced (in an infographic image)
- **Retailer (evo) says**: intermediate-advanced — but this data is currently missing from spec_sources
- **Review site (The Good Ride) says**: beginner-advanced

The manufacturer scraper is likely parsing the wrong data or misinterpreting the infographic image. The image that contains the actual rider level is:

```html
<img class="pagebuilder-mobile-hidden"
     src="https://www.lib-tech.com/media/wysiwyg/Legitimizer-terrain-riderlevel-flex-2.jpg"
     alt="Lib Tech Legitimizer Snowboard Rider Scale"
     title=""
     data-element="desktop_image"
     data-pb-style="IHS0MQF">
```

## Subtasks

1. Investigate how the Lib Tech scraper currently extracts ability level — is it parsing text that doesn't actually represent rider level, or misinterpreting the infographic?
2. Investigate why evo's intermediate-advanced ability level data for the Legitimizer isn't making it into spec_sources
3. Fix the Lib Tech scraper to either correctly parse the infographic metadata or skip ability level when it can't be reliably determined
4. Verify that retailer-provided ability levels flow through the unified pipeline into spec_sources

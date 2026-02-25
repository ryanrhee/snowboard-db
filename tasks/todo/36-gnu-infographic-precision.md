# Task 36: Improve GNU infographic gradient bar parsing precision

## Problem

The current `analyzeGnuInfographic()` in `src/lib/manufacturers/gnu-infographic.ts` measures gradient bar extents imprecisely:

1. **Scale bounds (0% and 100%)**: Currently uses the left/right extent of the horizontal black border line (`findScaleBorders`). But the actual 0% and 100% positions are defined by **vertical tick marks** at the ends of the scale — small vertical lines that form the `|` in `|________|`. The code should find the inner edges of these tick marks as the true 0% and 100%.

2. **Gradient shape edges**: The gradient bars are lens/almond-shaped (`<====>`). The current approach samples at the vertical midpoint and a few surrounding rows to find left/right extent. This misses the actual pointed tips of the `<` and `>` shapes, which may be at a different Y coordinate than the midpoint. The code should trace the left and right edges from top to bottom to find the exact X positions of the leftmost and rightmost points.

3. **No visual debugging**: There's no way to visually verify where the code thinks 0-100% is or where the gradient start/end points are. Need an overlay on the `/gnu-infographics` audit page.

## Goal

1. **Precise scale bounds**: Find the vertical tick marks at each end of the scale bar. Set 0% to the first pixel inside the left tick mark and 100% to the last pixel inside the right tick mark.
2. **Precise gradient edges**: Trace the left and right edges of the `<====>` shape across all Y rows between top and bottom edges. The start point is the X coordinate of the leftmost colored pixel across all rows (the tip of the `<`). The end point is the X coordinate of the rightmost colored pixel (the tip of the `>`).
3. **Visual debug overlay**: Add a control to the `/gnu-infographics` page that overlays red lines (or similar) on the original infographic image showing:
   - Where 0% and 100% are set (the tick mark inner edges)
   - Where the gradient bar start and end points are detected
   - The top and bottom edges of the gradient shape

## Approach

### 1. Find tick marks for scale bounds

The scale has the shape `|________|` — vertical tick marks at the left and right ends connected by a horizontal line. To find the tick marks:
- From the horizontal border line, look for short vertical black segments at the left and right extremes
- The inner edge of the left tick mark = 0%, the inner edge of the right tick mark = 100%
- Handle cases where there is or isn't whitespace between the gradient bar and the tick marks

### 2. Trace gradient shape edges

The gradient shape is `<====>` — pointed at both ends:
- Find the top and bottom Y coordinates of the gradient shape (already done via `gradientTop`/`gradientBottom`)
- For each Y row between top and bottom, find the leftmost and rightmost colored pixel
- The overall leftmost X across all rows = gradient start (tip of `<`)
- The overall rightmost X across all rows = gradient end (tip of `>`)
- This replaces the current midpoint-sampling approach

### 3. Debug overlay on `/gnu-infographics`

Add a toggle/checkbox to the audit page that renders the infographic with overlaid markers:
- Vertical red lines at the 0% and 100% tick mark positions
- Vertical green lines (or dots) at the detected gradient start and end X positions
- Horizontal lines at the top and bottom edges of the gradient shape
- Could use a canvas overlay on top of the image, or generate an annotated image server-side via sharp

## Files

- `src/lib/manufacturers/gnu-infographic.ts` — core analysis logic
- `src/app/gnu-infographics/page.tsx` — audit/debug UI
- `src/app/api/gnu-infographics/route.ts` — API route (may need to return additional data or annotated image)

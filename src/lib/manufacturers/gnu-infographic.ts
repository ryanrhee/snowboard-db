import sharp from "sharp";

export interface BarExtent {
  /** Start of gradient shape as percentage of scale width (0–100) */
  startPct: number;
  /** End of gradient shape as percentage of scale width (0–100) */
  endPct: number;
  /** Left edge of the scale (inner edge of left tick mark) in pixels */
  scaleLeft: number;
  /** Right edge of the scale (inner edge of right tick mark) in pixels */
  scaleRight: number;
  /** Left edge of the gradient shape in pixels */
  gradientLeft: number;
  /** Right edge of the gradient shape in pixels */
  gradientRight: number;
  /** Top edge of the gradient shape in pixels */
  gradientTop: number;
  /** Bottom edge of the gradient shape in pixels */
  gradientBottom: number;
}

export interface GnuInfographicAnalysis {
  terrain: BarExtent;
  riderLevel: BarExtent;
  flex: BarExtent;
  width: number;
  height: number;
}

/**
 * Find horizontal rows where black pixels span most of the image width.
 * Only rows where nearly ALL pixels are black (>90%) qualify as true border
 * lines — this excludes rows with text overlays that have gaps in the black.
 */
function findScaleBorders(
  data: Buffer,
  width: number,
  height: number,
  channels: number
): { y: number; left: number; right: number }[] {
  const borders: { y: number; left: number; right: number }[] = [];
  const minSpan = width * 0.8;

  for (let y = 0; y < height; y++) {
    let left = -1;
    let right = -1;
    let blackCount = 0;

    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      const avg = (r + g + b) / 3;
      if (avg < 30) {
        blackCount++;
        if (left === -1) left = x;
        right = x;
      }
    }

    // Require >90% of span to be black — true scale borders are solid lines,
    // not text regions that happen to have wide black extent
    const span = right - left;
    if (span > minSpan && blackCount > span * 0.9) {
      borders.push({ y, left, right });
    }
  }

  return borders;
}

/**
 * Group consecutive border rows into clusters and return the top edge of each.
 * The top edge is the correct anchor for upward gradient search — the midpoint
 * would fall inside the text overlay region below the actual scale line.
 */
function clusterBorders(
  borders: { y: number; left: number; right: number }[],
  imageHeight: number
): { y: number; left: number; right: number }[] {
  if (borders.length === 0) return [];

  // Gap threshold proportional to image height. Within a single scale bar,
  // the top border and bottom border are separated by ~20-50px of text;
  // between bars the gap is ~100-265px. 10% of height merges within-bar
  // splits while keeping bars separate.
  const gapThreshold = Math.round(imageHeight * 0.1);
  const clusters: { y: number; left: number; right: number }[][] = [];
  let current = [borders[0]];

  for (let i = 1; i < borders.length; i++) {
    if (borders[i].y - borders[i - 1].y <= gapThreshold) {
      current.push(borders[i]);
    } else {
      clusters.push(current);
      current = [borders[i]];
    }
  }
  clusters.push(current);

  // Use the FIRST (topmost) row of each cluster as the anchor, average left/right
  return clusters.map((cluster) => {
    const top = cluster[0];
    const avgLeft = Math.round(
      cluster.reduce((s, b) => s + b.left, 0) / cluster.length
    );
    const avgRight = Math.round(
      cluster.reduce((s, b) => s + b.right, 0) / cluster.length
    );
    return { y: top.y, left: avgLeft, right: avgRight };
  });
}

/**
 * Find the vertical tick marks at the ends of a scale bar.
 * The scale looks like |________| — vertical tick marks connected by a horizontal line.
 * Returns the inner edges of the tick marks as the true 0% and 100% positions.
 */
function findTickMarks(
  data: Buffer,
  width: number,
  channels: number,
  border: { y: number; left: number; right: number }
): { scaleLeft: number; scaleRight: number } {
  const { y: borderY, left: borderLeft, right: borderRight } = border;

  // Look for vertical black segments extending above and below the border line
  // at the left and right extremes. Tick marks are short vertical lines.
  // Search a few pixels above and below the border Y for vertical black runs.
  const searchUp = 8;
  const searchDown = 8;
  const searchInward = Math.round((borderRight - borderLeft) * 0.1);

  // Find left tick mark: scan from borderLeft rightward looking for a column
  // with vertical black continuity (the tick mark). The inner edge is where
  // the tick ends and the horizontal line continues alone.
  let leftTickInner = borderLeft;
  for (let x = borderLeft; x < borderLeft + searchInward; x++) {
    let verticalBlackCount = 0;
    for (let dy = -searchUp; dy <= searchDown; dy++) {
      const y = borderY + dy;
      if (y < 0 || y >= width) continue; // safety
      const idx = (y * width + x) * channels;
      const avg = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      if (avg < 30) verticalBlackCount++;
    }
    // A tick mark column has black pixels extending above/below the border line
    // (at least 3 pixels above or below beyond just the border line itself)
    if (verticalBlackCount >= searchUp + searchDown - 2) {
      leftTickInner = x + 1; // inner edge is one pixel to the right
    } else if (leftTickInner > borderLeft) {
      break; // found the end of the tick mark
    }
  }

  // Find right tick mark: scan from borderRight leftward
  let rightTickInner = borderRight;
  for (let x = borderRight; x > borderRight - searchInward; x--) {
    let verticalBlackCount = 0;
    for (let dy = -searchUp; dy <= searchDown; dy++) {
      const y = borderY + dy;
      if (y < 0 || y >= width) continue;
      const idx = (y * width + x) * channels;
      const avg = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      if (avg < 30) verticalBlackCount++;
    }
    if (verticalBlackCount >= searchUp + searchDown - 2) {
      rightTickInner = x - 1; // inner edge is one pixel to the left
    } else if (rightTickInner < borderRight) {
      break;
    }
  }

  return { scaleLeft: leftTickInner, scaleRight: rightTickInner };
}

/**
 * Check if a pixel is "colored" — not black, not white, not near-gray.
 * Returns true if the pixel has some saturation and isn't too dark or too light.
 */
function isColoredPixel(r: number, g: number, b: number): boolean {
  const avg = (r + g + b) / 3;
  if (avg < 30 || avg > 240) return false;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  // GNU gradient shapes are colored, not gray — require minimum saturation
  return (mx - mn) > 15;
}

/**
 * For a given scale border, search upward to find the gradient shape region
 * and measure its horizontal extent by tracing edges across all rows.
 */
function measureGradientShape(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  border: { y: number; left: number; right: number }
): BarExtent {
  // Find tick marks for precise scale bounds
  const { scaleLeft, scaleRight } = findTickMarks(data, width, channels, border);
  const scaleWidth = scaleRight - scaleLeft;
  const { y: borderY } = border;

  // Search upward from the border top edge. Scale the search window
  // proportionally to image height (handles both 1x and 2x images).
  const searchWindow = Math.round(height * 0.15);
  const searchStart = Math.max(0, borderY - searchWindow);
  const searchEnd = borderY;

  // Minimum fraction of the scale width that must have colored pixels
  // for a row to count as part of the gradient shape (filters out text labels)
  const minDensity = 0.15;
  const sampleStep = 2;
  const samplesPerRow = Math.floor(scaleWidth / sampleStep);
  const minColorCount = Math.round(samplesPerRow * minDensity);

  let gradientTop = -1;
  let gradientBottom = -1;

  for (let y = searchEnd - 1; y >= searchStart; y--) {
    let colorCount = 0;
    for (let x = scaleLeft; x <= scaleRight; x += sampleStep) {
      const idx = (y * width + x) * channels;
      if (isColoredPixel(data[idx], data[idx + 1], data[idx + 2])) {
        colorCount++;
      }
    }
    const isDenseColor = colorCount >= minColorCount;
    if (isDenseColor) {
      if (gradientBottom === -1) gradientBottom = y;
      gradientTop = y;
    } else if (gradientBottom !== -1) {
      break;
    }
  }

  if (gradientTop === -1 || gradientBottom === -1) {
    return {
      startPct: 0,
      endPct: 100,
      scaleLeft,
      scaleRight,
      gradientLeft: scaleLeft,
      gradientRight: scaleRight,
      gradientTop: borderY - 10,
      gradientBottom: borderY - 1,
    };
  }

  // Trace left and right edges across ALL rows between gradientTop and gradientBottom
  // to find the true tips of the almond/lens shape. The shape has a black outline
  // forming a hexagon — we need to include those dark border pixels, not just the
  // colored interior. Within the gradient's Y range, scan from each side inward:
  // the first non-white pixel is the shape edge (outline or fill).
  let gradientLeft = scaleRight;
  let gradientRight = scaleLeft;

  for (let y = gradientTop; y <= gradientBottom; y++) {
    // Scan from left to find first non-white pixel
    for (let x = scaleLeft; x <= scaleRight; x++) {
      const idx = (y * width + x) * channels;
      const avg = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      if (avg < 240) {
        if (x < gradientLeft) gradientLeft = x;
        break;
      }
    }
    // Scan from right to find first non-white pixel
    for (let x = scaleRight; x >= scaleLeft; x--) {
      const idx = (y * width + x) * channels;
      const avg = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      if (avg < 240) {
        if (x > gradientRight) gradientRight = x;
        break;
      }
    }
  }

  const startPct =
    scaleWidth > 0
      ? Math.round(((gradientLeft - scaleLeft) / scaleWidth) * 100)
      : 0;
  const endPct =
    scaleWidth > 0
      ? Math.round(((gradientRight - scaleLeft) / scaleWidth) * 100)
      : 100;

  return {
    startPct,
    endPct,
    scaleLeft,
    scaleRight,
    gradientLeft,
    gradientRight,
    gradientTop,
    gradientBottom,
  };
}

/**
 * Analyze a GNU infographic image buffer.
 *
 * GNU infographics have 3 horizontal scale bars (terrain, rider level, flex),
 * each with a lens/almond-shaped gradient sitting above a black scale border.
 * The gradient shape's horizontal extent indicates the board's range on each scale.
 */
export async function analyzeGnuInfographic(
  imageBuffer: Buffer
): Promise<GnuInfographicAnalysis> {
  const { data, info } = await sharp(imageBuffer)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const allBorders = findScaleBorders(
    data,
    info.width,
    info.height,
    info.channels
  );
  const borders = clusterBorders(allBorders, info.height);

  if (borders.length < 3) {
    console.warn(
      `[gnu-infographic] Expected 3 scale borders, found ${borders.length}`
    );
  }

  const emptyBar: BarExtent = {
    startPct: 0,
    endPct: 100,
    scaleLeft: 0,
    scaleRight: info.width,
    gradientLeft: 0,
    gradientRight: info.width,
    gradientTop: 0,
    gradientBottom: 0,
  };

  return {
    terrain: borders[0]
      ? measureGradientShape(data, info.width, info.height, info.channels, borders[0])
      : emptyBar,
    riderLevel: borders[1]
      ? measureGradientShape(data, info.width, info.height, info.channels, borders[1])
      : emptyBar,
    flex: borders[2]
      ? measureGradientShape(data, info.width, info.height, info.channels, borders[2])
      : emptyBar,
    width: info.width,
    height: info.height,
  };
}

/**
 * Generate an annotated version of the infographic with debug overlay lines.
 * Red vertical lines = scale bounds (0% and 100% tick mark positions)
 * Green vertical lines = gradient start/end
 * Blue horizontal lines = gradient top/bottom edges
 */
export async function generateDebugOverlay(
  imageBuffer: Buffer,
  analysis: GnuInfographicAnalysis
): Promise<Buffer> {
  const { info } = await sharp(imageBuffer)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width: w, height: h } = info;
  const lineWidth = Math.max(1, Math.round(w / 200));

  // Build SVG overlay with debug lines
  const bars = [analysis.terrain, analysis.riderLevel, analysis.flex];
  let svgLines = "";

  for (const bar of bars) {
    // Red lines at scale bounds (0% and 100%)
    svgLines += `<line x1="${bar.scaleLeft}" y1="${bar.gradientTop - 5}" x2="${bar.scaleLeft}" y2="${bar.gradientBottom + 5}" stroke="red" stroke-width="${lineWidth}" opacity="0.9"/>`;
    svgLines += `<line x1="${bar.scaleRight}" y1="${bar.gradientTop - 5}" x2="${bar.scaleRight}" y2="${bar.gradientBottom + 5}" stroke="red" stroke-width="${lineWidth}" opacity="0.9"/>`;

    // Green lines at gradient start/end
    svgLines += `<line x1="${bar.gradientLeft}" y1="${bar.gradientTop - 5}" x2="${bar.gradientLeft}" y2="${bar.gradientBottom + 5}" stroke="lime" stroke-width="${lineWidth}" opacity="0.9"/>`;
    svgLines += `<line x1="${bar.gradientRight}" y1="${bar.gradientTop - 5}" x2="${bar.gradientRight}" y2="${bar.gradientBottom + 5}" stroke="lime" stroke-width="${lineWidth}" opacity="0.9"/>`;

    // Blue horizontal lines at gradient top/bottom
    svgLines += `<line x1="${bar.scaleLeft - 5}" y1="${bar.gradientTop}" x2="${bar.scaleRight + 5}" y2="${bar.gradientTop}" stroke="cyan" stroke-width="${lineWidth}" opacity="0.7"/>`;
    svgLines += `<line x1="${bar.scaleLeft - 5}" y1="${bar.gradientBottom}" x2="${bar.scaleRight + 5}" y2="${bar.gradientBottom}" stroke="cyan" stroke-width="${lineWidth}" opacity="0.7"/>`;
  }

  const svg = `<svg width="${w}" height="${h}">${svgLines}</svg>`;

  return sharp(imageBuffer)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();
}

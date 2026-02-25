import sharp from "sharp";

export interface BarExtent {
  /** Start of gradient shape as percentage of scale width (0–100) */
  startPct: number;
  /** End of gradient shape as percentage of scale width (0–100) */
  endPct: number;
  /** Left edge of the scale border in pixels */
  scaleLeft: number;
  /** Right edge of the scale border in pixels */
  scaleRight: number;
  /** Left edge of the gradient shape in pixels */
  gradientLeft: number;
  /** Right edge of the gradient shape in pixels */
  gradientRight: number;
}

export interface GnuInfographicAnalysis {
  terrain: BarExtent;
  riderLevel: BarExtent;
  flex: BarExtent;
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
 * Check if a pixel is "colored" — not black, not white, not near-gray.
 * Returns true if the pixel has some saturation and isn't too dark or too light.
 */
function isColoredPixel(r: number, g: number, b: number): boolean {
  const avg = (r + g + b) / 3;
  if (avg < 30 || avg > 240) return false;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  // Need some color difference (saturation) or be in a mid-range gray that's part of the shape
  // GNU gradient shapes are colored, not gray — require minimum saturation
  return (mx - mn) > 15;
}

/**
 * For a given scale border, search upward to find the gradient shape region
 * and measure its horizontal extent.
 */
function measureGradientShape(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  border: { y: number; left: number; right: number }
): BarExtent {
  const { y: borderY, left: scaleLeft, right: scaleRight } = border;
  const scaleWidth = scaleRight - scaleLeft;

  // Search upward from the border top edge. Scale the search window
  // proportionally to image height (handles both 1x and 2x images).
  // Standard images (~468px) → ~70px window; 2x images (~1084px) → ~162px.
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
      // Found a gap — stop searching
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
    };
  }

  // Sample at the vertical middle of the gradient region to find left/right extent
  const midY = Math.round((gradientTop + gradientBottom) / 2);

  // Also sample a few rows around midY for robustness
  const sampleRows = [midY - 2, midY - 1, midY, midY + 1, midY + 2].filter(
    (y) => y >= gradientTop && y <= gradientBottom
  );

  let gradientLeft = scaleRight;
  let gradientRight = scaleLeft;

  for (const y of sampleRows) {
    for (let x = scaleLeft; x <= scaleRight; x++) {
      const idx = (y * width + x) * channels;
      if (isColoredPixel(data[idx], data[idx + 1], data[idx + 2])) {
        if (x < gradientLeft) gradientLeft = x;
        if (x > gradientRight) gradientRight = x;
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

  // We expect exactly 3 scale borders (terrain, rider level, flex)
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
  };
}

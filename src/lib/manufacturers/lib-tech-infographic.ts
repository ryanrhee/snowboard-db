import sharp from "sharp";

export interface BarAnalysis {
  /**
   * RGB of the board's theme color for this bar (the fully-saturated end).
   * Always one of the canonical colors (gray, yellow, orange, blue, red).
   */
  themeColor: [number, number, number];
  /**
   * Which canonical color family was matched (gray, yellow, orange, blue, red).
   */
  colorFamily: string;
  /**
   * Where the gradient reaches full theme color from the gray end (0–100).
   * This is the LEFT edge of the "flat colored" region.
   * For the rider level bar: 0 = Day 1, 50 ≈ Intermediate, 100 = Advanced.
   */
  colorStartPct: number;
  /**
   * Where the gradient starts fading back to gray (0–100), or 100 if it stays
   * colored all the way to the right edge.
   * This is the RIGHT edge of the "flat colored" region.
   */
  colorEndPct: number;
  /** Average per-channel pixel error of the reconstructed gradient (lower = better fit). */
  fitError: number;
}

export interface InfographicAnalysis {
  terrain: BarAnalysis;
  riderLevel: BarAnalysis;
  flex: BarAnalysis;
}

/**
 * Bar Y positions in the standard 1000×510/512 Lib Tech infographic layout.
 * Each infographic has three horizontal gradient bars separated by white space
 * and text labels. These Y coordinates sample the upper portion of each bar,
 * above the overlaid text labels (DAY 1 / INTERMEDIATE / ADVANCED etc.).
 */
const BAR_Y = { terrain: 55, riderLevel: 250, flex: 455 } as const;

/**
 * The neutral gray that all Lib Tech infographic gradient bars blend from.
 * Measured empirically — consistent across all boards.
 */
const GRAY_BASE: [number, number, number] = [148, 149, 152];

/**
 * Canonical theme colors measured from flat regions of known Lib Tech infographics.
 * Every board uses one of these colors for all three bars.
 */
const CANONICAL_COLORS: { name: string; rgb: [number, number, number] }[] = [
  { name: "yellow", rgb: [254, 242, 0] },
  { name: "orange", rgb: [248, 147, 29] },
  { name: "blue", rgb: [109, 207, 246] },
  { name: "red", rgb: [237, 27, 36] },
];

/** sRGB (0–255) → linear-light (0–1). Applies the inverse sRGB transfer function. */
function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** Linear-light (0–1) → sRGB (0–255). Applies the sRGB transfer function. */
function linearToSrgb(c: number): number {
  const s = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(255, s * 255)));
}

/** Euclidean distance squared between two RGB triples. */
function rgbDistSq(a: [number, number, number], b: [number, number, number]): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

/**
 * Classify a rough detected color into the nearest canonical family.
 * Returns the canonical entry. If the detected color is closer to GRAY_BASE
 * than any canonical color, returns gray.
 */
function classifyColor(detected: [number, number, number]): { name: string; rgb: [number, number, number] } {
  let best = { name: "gray", rgb: GRAY_BASE };
  let bestDist = rgbDistSq(detected, GRAY_BASE);
  for (const c of CANONICAL_COLORS) {
    const d = rgbDistSq(detected, c.rgb);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

/**
 * Given raw pixel data, fit a trapezoidal gradient model to a single bar.
 *
 * Model: the bar is a linear blend between GRAY_BASE and a theme color.
 * The blend factor t(x) follows a trapezoidal shape:
 *   t = 0 (gray) → ramps up → t = 1 (flat color) → ramps down → t = 0 (gray)
 *
 * We recover: themeColor, and the two edges of the flat (t≈1) region.
 */
function fitBar(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  barY: number
): BarAnalysis {
  // Multi-row averaging: sample 5 rows around barY to smooth JPEG artifacts.
  // Per-pixel filtering: exclude black pixels (text overlays) and white pixels
  // (background borders) before averaging so they don't corrupt gradient samples.
  // Thresholds: avg < 50 catches black text (darkest gradient pixel is gray ~150),
  //             avg > 240 catches white bg (brightest gradient pixel is yellow ~165).
  const rowOffsets = [-4, -2, 0, 2, 4];
  const validRows = rowOffsets
    .map((off) => barY + off)
    .filter((y) => y >= 0 && y < height);

  const samples: { x: number; r: number; g: number; b: number }[] = [];
  for (let x = 0; x < width; x += 2) {
    let rSum = 0, gSum = 0, bSum = 0, count = 0;
    for (const y of validRows) {
      const idx = (y * width + x) * channels;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      const avg = (r + g + b) / 3;
      if (avg > 240 || avg < 50) continue;
      rSum += r;
      gSum += g;
      bSum += b;
      count++;
    }
    if (count === 0) continue; // all rows were white/black at this x — skip column
    samples.push({
      x,
      r: Math.round(rSum / count),
      g: Math.round(gSum / count),
      b: Math.round(bSum / count),
    });
  }

  // Bar bounds for percentage calculations (white/black columns excluded above)
  const barStartX = samples.length > 0 ? samples[0].x : 0;
  const barEndX = samples.length > 0 ? samples[samples.length - 1].x : width;
  const barSpan = barEndX - barStartX;

  // Find rough theme color: median of the top 10% most-saturated pixels.
  const withSat = samples.map((p) => {
    const mx = Math.max(p.r, p.g, p.b);
    const mn = Math.min(p.r, p.g, p.b);
    return { ...p, sat: mx === 0 ? 0 : (mx - mn) / mx };
  });
  withSat.sort((a, b) => b.sat - a.sat);
  const top10 = withSat.slice(0, Math.max(1, Math.floor(withSat.length * 0.1)));
  const roughColor: [number, number, number] = [
    Math.round(top10.reduce((s, p) => s + p.r, 0) / top10.length),
    Math.round(top10.reduce((s, p) => s + p.g, 0) / top10.length),
    Math.round(top10.reduce((s, p) => s + p.b, 0) / top10.length),
  ];

  // Snap to nearest canonical color for classification.
  const canonical = classifyColor(roughColor);
  const colorFamily = canonical.name;

  // Two-pass theme color refinement:
  // Pass 1 — use roughColor to estimate blend factors and find the flat region.
  // Pass 2 — average the actual pixel colors in the flat region for a precise
  //          theme color, then recompute blend factors and error with it.
  // This avoids both (a) canonical color mismatch (e.g. Skunk Ape's orange is
  // slightly different) and (b) roughColor skew from including transition pixels.
  const grayLin = GRAY_BASE.map(srgbToLinear);

  function computeBlendT(
    theme: [number, number, number],
    p: { r: number; g: number; b: number }
  ): number {
    const tLin = theme.map(srgbToLinear);
    const dR = tLin[0] - grayLin[0];
    const dG = tLin[1] - grayLin[1];
    const dB = tLin[2] - grayLin[2];
    const den = dR * dR + dG * dG + dB * dB;
    if (den === 0) return 0;
    const pR = srgbToLinear(p.r);
    const pG = srgbToLinear(p.g);
    const pB = srgbToLinear(p.b);
    const num = (pR - grayLin[0]) * dR + (pG - grayLin[1]) * dG + (pB - grayLin[2]) * dB;
    return Math.max(0, Math.min(1, num / den));
  }

  // Pass 1: find flat region using roughColor
  const roughT = samples.map((p) => computeBlendT(roughColor, p));
  const flatSamples = samples.filter((_, i) => roughT[i] > 0.95);

  // Refine theme color from flat-region pixels (or fall back to roughColor)
  let themeColor: [number, number, number];
  if (flatSamples.length >= 3) {
    themeColor = [
      Math.round(flatSamples.reduce((s, p) => s + p.r, 0) / flatSamples.length),
      Math.round(flatSamples.reduce((s, p) => s + p.g, 0) / flatSamples.length),
      Math.round(flatSamples.reduce((s, p) => s + p.b, 0) / flatSamples.length),
    ];
  } else {
    themeColor = roughColor;
  }

  // Pass 2: recompute blend factors with refined theme color
  const themeLin = themeColor.map(srgbToLinear);
  const dlR = themeLin[0] - grayLin[0];
  const dlG = themeLin[1] - grayLin[1];
  const dlB = themeLin[2] - grayLin[2];
  const denomLin = dlR * dlR + dlG * dlG + dlB * dlB;

  function blendT(p: { r: number; g: number; b: number }): number {
    if (denomLin === 0) return 0;
    const pR = srgbToLinear(p.r);
    const pG = srgbToLinear(p.g);
    const pB = srgbToLinear(p.b);
    const num =
      (pR - grayLin[0]) * dlR +
      (pG - grayLin[1]) * dlG +
      (pB - grayLin[2]) * dlB;
    return Math.max(0, Math.min(1, num / denomLin));
  }

  const tValues = samples.map((p) => ({ x: p.x, t: blendT(p) }));

  // Find the flat region where t ≈ 1 (within 5%).
  // Threshold is 0.95 rather than 0.98 because small JPEG artifacts in sRGB
  // get amplified by the nonlinear sRGB→linear decode, pushing t further from 1.
  const flatIndices = tValues.filter((v) => v.t > 0.95);
  let colorStartPct: number;
  let colorEndPct: number;

  if (flatIndices.length > 0) {
    colorStartPct = barSpan > 0
      ? Math.round(((flatIndices[0].x - barStartX) / barSpan) * 100)
      : 0;
    colorEndPct = barSpan > 0
      ? Math.round(((flatIndices[flatIndices.length - 1].x - barStartX) / barSpan) * 100)
      : 0;
  } else {
    // No flat region found — use center of mass as fallback
    let sumT = 0,
      sumTX = 0;
    for (const v of tValues) {
      sumT += v.t;
      sumTX += v.t * v.x;
    }
    const com = sumT > 0 ? sumTX / sumT : (barStartX + barEndX) / 2;
    colorStartPct = barSpan > 0
      ? Math.round(((com - barStartX) / barSpan) * 100)
      : 50;
    colorEndPct = colorStartPct;
  }

  // Reconstruction error: blend in linear space, convert back to sRGB, compare
  let totalError = 0;
  for (const p of samples) {
    const t = blendT(p);
    const predR = linearToSrgb(grayLin[0] + dlR * t);
    const predG = linearToSrgb(grayLin[1] + dlG * t);
    const predB = linearToSrgb(grayLin[2] + dlB * t);
    totalError +=
      Math.abs(p.r - predR) +
      Math.abs(p.g - predG) +
      Math.abs(p.b - predB);
  }
  const fitError =
    Math.round((totalError / samples.length / 3) * 10) / 10;

  return { themeColor, colorFamily, colorStartPct, colorEndPct, fitError };
}

/**
 * Analyze a Lib Tech infographic image buffer.
 *
 * For each bar (Terrain, Rider Level, Flex), fits a gradient model and returns
 * the theme color, the flat-color region boundaries, and the reconstruction error.
 */
export async function analyzeInfographic(
  imageBuffer: Buffer
): Promise<InfographicAnalysis> {
  const { data, info } = await sharp(imageBuffer)
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    terrain: fitBar(data, info.width, info.height, info.channels, BAR_Y.terrain),
    riderLevel: fitBar(data, info.width, info.height, info.channels, BAR_Y.riderLevel),
    flex: fitBar(data, info.width, info.height, info.channels, BAR_Y.flex),
  };
}

import { BoardIdentificationStrategy, BoardSignal, BoardIdentity } from "./types";
import { sharedNormalize, sharedPostNormalize } from "./shared";

/**
 * Mervin contour codes (ordered longest-first for regex).
 * These appear as suffixes in GNU and Lib Tech model names.
 */
const MERVIN_CONTOUR_CODES = ["c3 btx", "c2x", "c2e", "c2", "c3", "btx", "camber"];

const MERVIN_CONTOUR_RE = new RegExp(
  `\\s+(?:${MERVIN_CONTOUR_CODES.map(s => s.replace(/\s+/g, "\\s+")).join("|")})$`,
  "i"
);

const GNU_RIDER_NAMES = ["Forest Bailey", "Max Warbington", "Cummins'"];
const LIBTECH_RIDER_NAMES = ["T. Rice", "Travis Rice"];

export class MervinStrategy implements BoardIdentificationStrategy {
  identify(signal: BoardSignal): BoardIdentity {
    let m = signal.rawModel;
    if (!m || m === "Unknown") return { model: m, profileVariant: null };

    const isGnu = signal.brand === "GNU";

    // Shared pre-normalization
    m = sharedNormalize(m, signal.brand);

    // Lib Tech brand leak fix
    if (signal.brand === "Lib Tech") {
      m = m.replace(/^Tech\s+/i, "");
    }

    // Normalize T.Rice → T. Rice
    m = m.replace(/T\.Rice/g, "T. Rice");

    // Extract contour code BEFORE stripping it
    const contourMatch = m.match(MERVIN_CONTOUR_RE);
    let profileVariant: string | null = null;
    if (contourMatch) {
      const raw = contourMatch[0].trim().toLowerCase();
      // Map generic "camber" → "c3" for Mervin brands
      profileVariant = raw === "camber" ? "c3" : raw;
      m = m.replace(MERVIN_CONTOUR_RE, "");
    }

    // If no contour code in model name, try to derive from profile spec
    if (!profileVariant && signal.profile) {
      profileVariant = deriveContourFromProfile(signal.profile);
    }

    // Strip rider names (before GNU-specific transforms)
    const riders = isGnu ? GNU_RIDER_NAMES : LIBTECH_RIDER_NAMES;
    m = stripRiderNames(m, riders);

    // Strip "Signature Series" / "Ltd" prefix
    m = m.replace(/^(?:Signature Series|Ltd)\s+/i, "");

    // GNU-specific: strip "Asym" prefix/suffix
    if (isGnu) {
      m = m.replace(/^Asym\s+/i, "");
      m = m.replace(/\s+Asym\b/i, "");
    }

    // GNU-specific: strip "C " prefix and " C" suffix
    // Replace hyphens first so "Gloss-C" becomes "Gloss C" before C-stripping
    if (isGnu) {
      m = m.replace(/-/g, " ");
      m = m.replace(/^C\s+/i, "");
      m = m.replace(/\s+C$/i, "");
    }

    // Shared post-normalization
    m = sharedPostNormalize(m);

    // Model aliases
    m = applyMervinAliases(m);

    return { model: m || signal.rawModel, profileVariant };
  }
}

/**
 * Derive a Mervin contour code from a raw profile spec string.
 */
function deriveContourFromProfile(profile: string): string | null {
  const lower = profile.toLowerCase().trim();

  // Direct contour code matches
  if (/\bc2x\b/.test(lower)) return "c2x";
  if (/\bc2e\b/.test(lower)) return "c2e";
  if (/\bc2\b/.test(lower)) return "c2";
  if (/\bc3\s*btx\b/.test(lower)) return "c3 btx";
  if (/\bc3\b/.test(lower)) return "c3";
  if (/\bbtx\b/.test(lower)) return "btx";

  // Map normalized profile types to contour codes
  if (/\bcamber\b/.test(lower) && !/rocker|hybrid|flying/i.test(lower)) return "c3";
  if (/\bhybrid.?camber\b/.test(lower) || /\bcamrock\b/.test(lower)) return "c2";
  if (/\bhybrid.?rocker\b/.test(lower) || /\bflying\s*v\b/.test(lower)) return "btx";
  if (/\brocker\b/.test(lower) && !/camber|hybrid/i.test(lower)) return "btx";

  return null;
}

function stripRiderNames(m: string, riders: string[]): string {
  const mLower = m.toLowerCase();
  for (const rider of riders) {
    const rLower = rider.toLowerCase();
    const byIdx = mLower.indexOf(" by " + rLower);
    if (byIdx >= 0) {
      return (m.slice(0, byIdx) + m.slice(byIdx + 4 + rider.length)).trim();
    }
    if (mLower.startsWith(rLower + " ")) {
      return m.slice(rider.length).trimStart();
    }
    if (mLower.endsWith(" " + rLower)) {
      return m.slice(0, m.length - rider.length - 1);
    }
  }
  return m;
}

function applyMervinAliases(m: string): string {
  const lower = m.toLowerCase();
  const ALIASES: Record<string, string> = {
    "son of a birdman": "son of birdman",
  };
  if (ALIASES[lower]) return ALIASES[lower];
  return m;
}

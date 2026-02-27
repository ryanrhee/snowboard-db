import { BoardIdentificationStrategy, BoardSignal, BoardIdentity } from "./types";
import { sharedNormalize, sharedPostNormalize } from "./shared";

/**
 * Mervin contour codes (ordered longest-first for regex).
 * These appear as suffixes in retailer model names (e.g., evo "Skunk Ape C2X").
 * Note: "camber" is NOT a contour code — it's a model name variant marker
 * (e.g., "Skunk Ape Camber", "Ladies Choice Camber").
 */
const MERVIN_CONTOUR_CODES = ["c3 btx", "c2x", "c2e", "c2", "c3", "btx"];

const MERVIN_CONTOUR_RE = new RegExp(
  `\\s+(?:${MERVIN_CONTOUR_CODES.map(s => s.replace(/\s+/g, "\\s+")).join("|")})$`,
  "i"
);

const GNU_RIDER_NAMES = ["Forest Bailey", "Max Warbington", "Cummins'"];
const LIBTECH_RIDER_NAMES = ["T. Rice", "Travis Rice"];

export class MervinStrategy implements BoardIdentificationStrategy {
  identify(signal: BoardSignal): BoardIdentity {
    let m = signal.rawModel;
    if (!m || m === "Unknown") return { model: m };

    const isGnu = signal.brand === "GNU";

    // Shared pre-normalization
    m = sharedNormalize(m, signal.brand);

    // Lib Tech brand leak fix
    if (signal.brand === "Lib Tech") {
      m = m.replace(/^Tech\s+/i, "");
    }

    // Normalize T.Rice → T. Rice
    m = m.replace(/T\.Rice/g, "T. Rice");

    // Strip contour codes from model name (retailer suffixes like C2X, C2E, C3, BTX)
    m = m.replace(MERVIN_CONTOUR_RE, "");

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

    // Shared post-normalization
    m = sharedPostNormalize(m);

    // Model aliases
    m = applyMervinAliases(m);

    return { model: m || signal.rawModel };
  }
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

import { BoardIdentificationStrategy, BoardSignal, BoardIdentity } from "./types";
import { sharedNormalize, sharedPostNormalize } from "./shared";

/**
 * Burton-specific profile suffixes, ordered longest-first to avoid partial matches.
 */
const BURTON_PROFILE_SUFFIXES = [
  "purepop camber",
  "flying v",
  "flat top",
  "purepop",
  "camber",
];

const BURTON_PROFILE_RE = new RegExp(
  `\\s+(?:${BURTON_PROFILE_SUFFIXES.map(s => s.replace(/\s+/g, "\\s+")).join("|")})$`,
  "i"
);

export class BurtonStrategy implements BoardIdentificationStrategy {
  identify(signal: BoardSignal): BoardIdentity {
    let m = signal.rawModel;
    if (!m || m === "Unknown") return { model: m, profileVariant: null };

    // Shared pre-normalization
    m = sharedNormalize(m, signal.brand);

    // Fix Lib Tech brand leak (doesn't apply to Burton, but keep Dinosaurs Will Die)
    // No brand-specific leak fixes needed for Burton

    // Normalize T.Rice (generic, doesn't matter for Burton but harmless)
    m = m.replace(/T\.Rice/g, "T. Rice");

    // Extract profile variant BEFORE stripping it
    const profileMatch = m.match(BURTON_PROFILE_RE);
    let profileVariant: string | null = null;
    if (profileMatch) {
      profileVariant = profileMatch[0].trim().toLowerCase();
      m = m.replace(BURTON_PROFILE_RE, "");
    }

    // Shared post-normalization
    m = sharedPostNormalize(m);

    // Model aliases
    m = applyBurtonAliases(m);

    return { model: m || signal.rawModel, profileVariant };
  }
}

function applyBurtonAliases(m: string): string {
  const lower = m.toLowerCase();
  const ALIASES: Record<string, string> = {
    "fish 3d directional": "3d fish directional",
    "fish 3d": "3d fish directional",
    "3d family tree channel surfer": "family tree 3d channel surfer",
  };
  if (ALIASES[lower]) return ALIASES[lower];

  // Prefix aliases
  if (lower.startsWith("snowboards ")) return m.slice("snowboards ".length);

  return m;
}

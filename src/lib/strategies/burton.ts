import { BoardIdentificationStrategy, BoardSignal, BoardIdentity } from "./types";
import { sharedNormalize, sharedPostNormalize } from "./shared";

export class BurtonStrategy implements BoardIdentificationStrategy {
  identify(signal: BoardSignal): BoardIdentity {
    let m = signal.rawModel;
    if (!m || m === "Unknown") return { model: m };

    // Shared pre-normalization
    m = sharedNormalize(m, signal.brand);

    // Normalize T.Rice (generic, doesn't matter for Burton but harmless)
    m = m.replace(/T\.Rice/g, "T. Rice");

    // Profile suffixes (Camber, Flying V, Flat Top, PurePop Camber, PurePop)
    // are retained in the model name — they ARE the model name variant.

    // Shared post-normalization
    m = sharedPostNormalize(m);

    // Model aliases
    m = applyBurtonAliases(m);

    return { model: m || signal.rawModel };
  }
}

function applyBurtonAliases(m: string): string {
  const lower = m.toLowerCase();
  const ALIASES: Record<string, string> = {
    "3d family tree channel surfer": "family tree 3d channel surfer",
  };
  if (ALIASES[lower]) return ALIASES[lower];

  // Prefix aliases — match prefix and keep any trailing suffix (e.g., profile variant)
  const PREFIX_ALIASES: [string, string][] = [
    ["fish 3d directional ", "3d fish directional "],
    ["fish 3d ", "3d fish directional "],
    ["snowboards ", ""],
  ];
  for (const [prefix, replacement] of PREFIX_ALIASES) {
    if (lower.startsWith(prefix)) {
      return replacement + m.slice(prefix.length);
    }
  }

  // Exact match aliases (model IS the alias, no trailing content)
  if (lower === "fish 3d directional") return "3d fish directional";
  if (lower === "fish 3d") return "3d fish directional";

  return m;
}

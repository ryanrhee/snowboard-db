import { BoardIdentificationStrategy, BoardSignal, BoardIdentity } from "./types";
import { sharedNormalize, sharedPostNormalize } from "./shared";

const RIDER_NAMES: Record<string, string[]> = {
  "CAPiTA": ["Arthur Longo", "Jess Kimura"],
  "Nitro": ["Hailey Langland", "Marcus Kleveland"],
  "Jones": ["Harry Kearney", "Ruiki Masuda"],
  "Arbor": ["Bryan Iguchi", "Erik Leon", "Jared Elston", "Pat Moore", "Mike Liddle", "Danny Kass", "DK"],
  "Gentemstick": ["Alex Yoder"],
  "Aesmo": ["Fernando Elvira"],
};

const MODEL_ALIASES: Record<string, string> = {
  "mega merc": "mega mercury",
  "hel yes": "hell yes",
  "dreamweaver": "dream weaver",
  "paradice": "paradise",
  "x konvoi surfer": "konvoi x nitro surfer",
};

const MODEL_PREFIX_ALIASES: [string, string][] = [
  ["sb ", "spring break "],
  ["snowboards ", ""],
  ["darkhorse ", "dark horse "],
];

export class DefaultStrategy implements BoardIdentificationStrategy {
  identify(signal: BoardSignal): BoardIdentity {
    let m = signal.rawModel;
    if (!m || m === "Unknown") return { model: m };

    // Shared pre-normalization
    m = sharedNormalize(m, signal.brand);

    // DWD brand leak fix
    if (signal.brand === "Dinosaurs Will Die") {
      m = m.replace(/^(?:Will Die|Dinosaurs)\s+/i, "");
    }

    // Normalize T.Rice (generic, harmless for non-Mervin)
    m = m.replace(/T\.Rice/g, "T. Rice");

    // Strip rider names
    const riders = RIDER_NAMES[signal.brand];
    if (riders) {
      m = stripRiderNames(m, riders);
    }

    // Strip "Signature Series" / "Ltd" prefix
    m = m.replace(/^(?:Signature Series|Ltd)\s+/i, "");

    // Shared post-normalization
    m = sharedPostNormalize(m);

    // Model aliases
    m = applyDefaultAliases(m);

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

function applyDefaultAliases(m: string): string {
  const lower = m.toLowerCase();
  if (MODEL_ALIASES[lower]) return MODEL_ALIASES[lower];
  for (const [prefix, replacement] of MODEL_PREFIX_ALIASES) {
    if (lower.startsWith(prefix)) {
      return replacement + m.slice(prefix.length);
    }
  }
  return m;
}

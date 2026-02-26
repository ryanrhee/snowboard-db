/**
 * Immutable identifier that resolves a raw brand string to its canonical form
 * and manufacturer group. All derived properties are lazy-computed and cached.
 *
 * Usage:
 *   const id = new BrandIdentifier("Lib Technologies Snowboards");
 *   id.canonical   // "Lib Tech"
 *   id.manufacturer // "mervin"
 */
export class BrandIdentifier {
  readonly raw: string;

  private _cleaned?: string;
  private _canonical?: string;
  private _manufacturer?: string;

  constructor(raw: string) {
    this.raw = raw;
  }

  /**
   * Create a BrandIdentifier from the first non-empty string among candidates.
   * Accepts unknown values (typical for untyped JSON parse results) — skips
   * anything that isn't a non-empty string. Returns undefined if no usable
   * brand string is found.
   */
  static from(...candidates: unknown[]): BrandIdentifier | undefined {
    for (const c of candidates) {
      if (typeof c === "string" && c.trim()) {
        return new BrandIdentifier(c);
      }
    }
    return undefined;
  }

  /** Brand after stripping unicode junk and "Snowboard(s/ing)" suffixes */
  get cleaned(): string {
    if (this._cleaned === undefined) {
      if (!this.raw) {
        this._cleaned = "";
      } else {
        this._cleaned = this.raw
          .replace(/[\u200b\u200c\u200d\ufeff\u00ad]/g, "")
          .replace(/\s*snowboard\s*co\.?\s*/gi, "")
          .replace(/\s*snowboarding\b/gi, "")
          .replace(/\s*snowboards?\b/gi, "")
          .trim();
      }
    }
    return this._cleaned;
  }

  /** Canonical brand name (alias-resolved) */
  get canonical(): string {
    if (this._canonical === undefined) {
      const key = this.cleaned.toLowerCase().trim();
      this._canonical = BRAND_ALIASES[key] ?? this.cleaned;
    }
    return this._canonical;
  }

  /** Manufacturer group key for strategy dispatch */
  get manufacturer(): string {
    return (this._manufacturer ??=
      CANONICAL_TO_MANUFACTURER.get(this.canonical.toLowerCase()) ?? "default");
  }
}

// ---------------------------------------------------------------------------
// Alias table — maps variant spellings to canonical brand name
// ---------------------------------------------------------------------------

const BRAND_ALIASES: Record<string, string> = {
  // Yes.
  "yes": "Yes.",
  "yes.": "Yes.",
  // Dinosaurs Will Die
  "dinosaurs": "Dinosaurs Will Die",
  "dwd": "Dinosaurs Will Die",
  "dinosaurs will die": "Dinosaurs Will Die",
  // Sims
  "sims": "Sims",
  // Lib Tech (Mervin)
  "lib": "Lib Tech",
  "libtech": "Lib Tech",
  "lib tech": "Lib Tech",
  "lib technologies": "Lib Tech",
  // CAPiTA
  "capita": "CAPiTA",
  "capita snowboarding": "CAPiTA",
  // GNU (Mervin)
  "gnu": "GNU",
  // Never Summer
  "never summer": "Never Summer",
  // United Shapes
  "united shapes": "United Shapes",
};

// ---------------------------------------------------------------------------
// Manufacturer group mapping — drives strategy dispatch
// Case-insensitive via Map keyed on lowercase canonical brand
// ---------------------------------------------------------------------------

const CANONICAL_TO_MANUFACTURER = new Map<string, string>(
  Object.entries({
    "burton": "burton",
    "gnu": "mervin",
    "lib tech": "mervin",
  }).map(([k, v]) => [k.toLowerCase(), v])
);

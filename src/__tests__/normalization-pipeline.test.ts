import { describe, it, expect } from "vitest";
import { normalizeModel, normalizeModelDebug, NORMALIZATION_PIPELINE } from "../lib/normalization";
import snapshotFixture from "./fixtures/normalization-inputs.json";

// =============================================================================
// Snapshot tests — bulk regression detection
// =============================================================================

describe("normalizeModel — snapshot tests", () => {
  it.each(
    snapshotFixture.map((entry: { raw: string; brand: string | null; expected: string }) => [
      entry.raw,
      entry.brand,
      entry.expected,
    ])
  )('normalizeModel(%j, %j) → %j', (raw, brand, expected) => {
    expect(normalizeModel(raw, brand ?? undefined)).toBe(expected);
  });
});

// =============================================================================
// Step-level unit tests — individual pipeline steps in isolation
// =============================================================================

function findStep(name: string) {
  const step = NORMALIZATION_PIPELINE.find((s) => s.name === name);
  if (!step) throw new Error(`Step "${name}" not found in pipeline`);
  return step;
}

describe("pipeline step: strip-unicode", () => {
  const step = findStep("strip-unicode");

  it("strips zero-width space", () => {
    expect(step.transform("Cus\u200btom", undefined)).toBe("Custom");
  });

  it("strips BOM", () => {
    expect(step.transform("\ufeffCustom", undefined)).toBe("Custom");
  });

  it("strips soft hyphen", () => {
    expect(step.transform("Custom\u00ad", undefined)).toBe("Custom");
  });

  it("no-ops on clean input", () => {
    expect(step.transform("Custom", undefined)).toBe("Custom");
  });
});

describe("pipeline step: strip-combo", () => {
  const step = findStep("strip-combo");

  it("strips + binding info", () => {
    expect(step.transform("Board + Binding", undefined)).toBe("Board");
  });

  it("strips w/ package info", () => {
    expect(step.transform("Board w/ Package", undefined)).toBe("Board");
  });

  it("strips & Bindings pattern", () => {
    expect(step.transform("Poppy & Bindings Snowboard", undefined)).toBe("Poppy");
  });

  it("strips & Binding (singular) pattern", () => {
    expect(step.transform("Recess & Binding", undefined)).toBe("Recess");
  });
});

describe("pipeline step: strip-pipe", () => {
  const step = findStep("strip-pipe");

  it("replaces pipe with space", () => {
    expect(step.transform("Warpspeed | Automobili", undefined)).toBe("Warpspeed Automobili");
  });

  it("no-ops without pipe", () => {
    expect(step.transform("Custom", undefined)).toBe("Custom");
  });
});

describe("pipeline step: strip-retail-tags", () => {
  const step = findStep("strip-retail-tags");

  it("strips (Closeout)", () => {
    expect(step.transform("Board (Closeout)", undefined)).toBe("Board");
  });

  it("strips - Blem", () => {
    expect(step.transform("Board - Blem", undefined)).toBe("Board");
  });

  it("strips (Sale)", () => {
    expect(step.transform("Board (Sale)", undefined)).toBe("Board");
  });
});

describe("pipeline step: strip-snowboard", () => {
  const step = findStep("strip-snowboard");

  it("strips ' Snowboard'", () => {
    expect(step.transform("Custom Snowboard", undefined)).toBe("Custom");
  });

  it("case-insensitive", () => {
    expect(step.transform("Custom SNOWBOARD", undefined)).toBe("Custom");
  });
});

describe("pipeline step: strip-year", () => {
  const step = findStep("strip-year");

  it("strips 4-digit year", () => {
    expect(step.transform("Custom 2026", undefined)).toBe("Custom");
  });

  it("strips year range", () => {
    expect(step.transform("Custom 2025/2026", undefined)).toBe("Custom");
  });

  it("strips ' - 2026'", () => {
    expect(step.transform("Custom - 2026", undefined)).toBe("Custom");
  });
});

describe("pipeline step: strip-season-suffix", () => {
  const step = findStep("strip-season-suffix");

  it("strips '2627 EARLY RELEASE'", () => {
    expect(step.transform("Orca 2627 EARLY RELEASE", undefined)).toBe("Orca");
  });

  it("strips '- 2627 EARLY RELEASE'", () => {
    expect(step.transform("Orca - 2627 EARLY RELEASE", undefined)).toBe("Orca");
  });
});

describe("pipeline step: strip-trailing-size", () => {
  const step = findStep("strip-trailing-size");

  it("strips 3-digit board length at end", () => {
    expect(step.transform("Doughboy 185", undefined)).toBe("Doughboy");
  });

  it("strips 3-digit board length mid-string", () => {
    expect(step.transform("SI 144 Pow Surfer", undefined)).toBe("SI Pow Surfer");
  });

  it("strips multiple embedded sizes", () => {
    expect(step.transform("DOA 154 Benny Milam LTD", undefined)).toBe("DOA Benny Milam LTD");
  });

  it("strips sizes in 130-139 range", () => {
    expect(step.transform("FK 136 Powskate", undefined)).toBe("FK Powskate");
  });

  it("does not strip 2-digit numbers", () => {
    expect(step.transform("Board 42", undefined)).toBe("Board 42");
  });

  it("does not strip 4-digit numbers", () => {
    expect(step.transform("K2000 ATSB LTD", undefined)).toBe("K2000 ATSB LTD");
  });

  it("does not strip numbers outside board size range", () => {
    expect(step.transform("Board 100", undefined)).toBe("Board 100");
  });
});

describe("pipeline step: strip-gender-suffix", () => {
  const step = findStep("strip-gender-suffix");

  it("strips - Women's", () => {
    expect(step.transform("Board - Women's", undefined)).toBe("Board");
  });

  it("strips - Men's", () => {
    expect(step.transform("Board - Men's", undefined)).toBe("Board");
  });

  it("strips - Kids'", () => {
    expect(step.transform("Board - Kids'", undefined)).toBe("Board");
  });
});

describe("pipeline step: strip-gender-prefix", () => {
  const step = findStep("strip-gender-prefix");

  it("strips Women's prefix", () => {
    expect(step.transform("Women's Board", undefined)).toBe("Board");
  });

  it("strips Men's prefix", () => {
    expect(step.transform("Men's Board", undefined)).toBe("Board");
  });
});

describe("pipeline step: strip-brand-prefix", () => {
  const step = findStep("strip-brand-prefix");

  it("strips brand from start of model", () => {
    expect(step.transform("Burton Custom", "Burton")).toBe("Custom");
  });

  it("no-ops when brand not at start", () => {
    expect(step.transform("Chrome Rome", "Rome")).toBe("Chrome Rome");
  });

  it("no-ops when no brand provided", () => {
    expect(step.transform("Burton Custom", undefined)).toBe("Burton Custom");
  });
});

describe("pipeline step: fix-libtech-brand-leak", () => {
  const step = findStep("fix-libtech-brand-leak");

  it("strips leading Tech", () => {
    expect(step.transform("Tech Cold Brew", "Lib Tech")).toBe("Cold Brew");
  });

  it("has brand scope of Lib Tech", () => {
    expect(step.brands).toEqual(["Lib Tech"]);
  });
});

describe("pipeline step: fix-dwd-brand-leak", () => {
  const step = findStep("fix-dwd-brand-leak");

  it("strips leading Will Die", () => {
    expect(step.transform("Will Die Wizard Stick", "Dinosaurs Will Die")).toBe("Wizard Stick");
  });

  it("strips leading Dinosaurs", () => {
    expect(step.transform("Dinosaurs Wizard Stick", "Dinosaurs Will Die")).toBe("Wizard Stick");
  });
});

describe("pipeline step: normalize-trice", () => {
  const step = findStep("normalize-trice");

  it("normalizes T.Rice to T. Rice", () => {
    expect(step.transform("T.Rice Pro", undefined)).toBe("T. Rice Pro");
  });

  it("no-ops on T. Rice (already correct)", () => {
    expect(step.transform("T. Rice Pro", undefined)).toBe("T. Rice Pro");
  });
});

describe("pipeline step: strip-acronym-periods", () => {
  const step = findStep("strip-acronym-periods");

  it("strips D.O.A. → DOA", () => {
    expect(step.transform("D.O.A.", undefined)).toBe("DOA");
  });

  it("preserves version numbers like 2.0", () => {
    expect(step.transform("Board 2.0", undefined)).toBe("Board 2.0");
  });

  it("handles mixed: D.O.A. 2.0 → DOA 2.0", () => {
    expect(step.transform("D.O.A. 2.0", undefined)).toBe("DOA 2.0");
  });

  it("preserves T. Rice (single letter initial)", () => {
    expect(step.transform("T. Rice", undefined)).toBe("T. Rice");
  });
});

describe("pipeline step: replace-hyphens", () => {
  const step = findStep("replace-hyphens");

  it("replaces hyphens with spaces", () => {
    expect(step.transform("Gloss-C", undefined)).toBe("Gloss C");
  });
});

describe("pipeline step: apply-model-aliases", () => {
  const step = findStep("apply-model-aliases");

  it("aliases Mega Merc → mega mercury", () => {
    expect(step.transform("Mega Merc", undefined)).toBe("mega mercury");
  });

  it("aliases SB prefix → spring break", () => {
    expect(step.transform("SB Slush Slashers", undefined)).toBe("spring break Slush Slashers");
  });

  it("aliases Son Of A Birdman → son of birdman", () => {
    expect(step.transform("Son Of A Birdman", undefined)).toBe("son of birdman");
  });

  it("aliases Hel Yes → hell yes", () => {
    expect(step.transform("Hel Yes", undefined)).toBe("hell yes");
  });

  it("aliases Dreamweaver → dream weaver", () => {
    expect(step.transform("Dreamweaver", undefined)).toBe("dream weaver");
  });

  it("aliases Paradice → paradise", () => {
    expect(step.transform("Paradice", undefined)).toBe("paradise");
  });

  it("aliases Fish 3D Directional → 3d fish directional", () => {
    expect(step.transform("Fish 3D Directional", undefined)).toBe("3d fish directional");
  });

  it("aliases Fish 3D → 3d fish directional", () => {
    expect(step.transform("Fish 3D", undefined)).toBe("3d fish directional");
  });

  it("aliases Fish 3D Directional Flat Top → 3d fish directional Flat Top (prefix match)", () => {
    expect(step.transform("Fish 3D Directional Flat Top", undefined)).toBe("3d fish directional Flat Top");
  });

  it("aliases Fish 3D Flat Top → 3d fish directional Flat Top (prefix match)", () => {
    expect(step.transform("Fish 3D Flat Top", undefined)).toBe("3d fish directional Flat Top");
  });

  it("aliases 3D Family Tree Channel Surfer → family tree 3d channel surfer", () => {
    expect(step.transform("3D Family Tree Channel Surfer", undefined)).toBe("family tree 3d channel surfer");
  });

  it("aliases X Konvoi Surfer → konvoi x nitro surfer", () => {
    expect(step.transform("X Konvoi Surfer", undefined)).toBe("konvoi x nitro surfer");
  });

  it("aliases Darkhorse prefix → dark horse", () => {
    expect(step.transform("Darkhorse Austin Vizz LTD", undefined)).toBe("dark horse Austin Vizz LTD");
  });
});

describe("pipeline step: strip-rider-names", () => {
  const step = findStep("strip-rider-names");

  it("strips rider prefix", () => {
    expect(step.transform("Forest Bailey Head Space", "GNU")).toBe("Head Space");
  });

  it("strips rider suffix", () => {
    expect(step.transform("Team Pro Marcus Kleveland", "Nitro")).toBe("Team Pro");
  });

  it("strips 'by rider' infix", () => {
    expect(step.transform("Equalizer By Jess Kimura", "CAPiTA")).toBe("Equalizer");
  });

  it("strips Aesmo rider suffix", () => {
    expect(step.transform("SI Pow Surfer Fernando Elvira", "Aesmo")).toBe("SI Pow Surfer");
  });

  it("no-ops without brand", () => {
    expect(step.transform("Forest Bailey Head Space", undefined)).toBe("Forest Bailey Head Space");
  });

  it("no-ops for non-matching brand", () => {
    expect(step.transform("Forest Bailey Head Space", "Burton")).toBe("Forest Bailey Head Space");
  });
});

describe("pipeline step: strip-gnu-asym", () => {
  const step = findStep("strip-gnu-asym");

  it("strips leading Asym", () => {
    expect(step.transform("Asym Ladies Choice", "GNU")).toBe("Ladies Choice");
  });

  it("strips trailing Asym", () => {
    expect(step.transform("Finest Asym", "GNU")).toBe("Finest");
  });
});

describe("pipeline step: strip-package", () => {
  const step = findStep("strip-package");

  it("strips Package keyword", () => {
    expect(step.transform("After School Special Package", undefined)).toBe("After School Special");
  });

  it("no-ops without Package keyword", () => {
    expect(step.transform("Custom", undefined)).toBe("Custom");
  });
});

describe("pipeline step: clean-whitespace", () => {
  const step = findStep("clean-whitespace");

  it("trims and collapses whitespace", () => {
    expect(step.transform("  Board  Name  ", undefined)).toBe("Board Name");
  });

  it("strips trailing slashes", () => {
    expect(step.transform("Element///", undefined)).toBe("Element");
  });

  it("strips leading/trailing dashes", () => {
    expect(step.transform("- Board -", undefined)).toBe("Board");
  });
});

// =============================================================================
// normalizeModelDebug — trace output
// =============================================================================

describe("normalizeModelDebug", () => {
  it("returns trace with input and all applied steps", () => {
    const trace = normalizeModelDebug("Custom Snowboard 2026", "Burton");
    expect(trace[0]).toEqual({ step: "input", result: "Custom Snowboard 2026" });
    expect(trace.length).toBeGreaterThan(2);
    const last = trace[trace.length - 1];
    expect(last.result).toBe("Custom");
  });

  it("returns early-return for Unknown", () => {
    const trace = normalizeModelDebug("Unknown");
    expect(trace).toEqual([{ step: "early-return", result: "Unknown" }]);
  });

  it("returns early-return for empty string", () => {
    const trace = normalizeModelDebug("");
    expect(trace).toEqual([{ step: "early-return", result: "" }]);
  });

  it("includes strip-profile step for contour codes", () => {
    const trace = normalizeModelDebug("Legitimizer C3", "Lib Tech");
    const profileStep = trace.find((t) => t.step === "strip-profile");
    expect(profileStep).toBeDefined();
    expect(profileStep!.result).toBe("Legitimizer");
  });

  it("strip-profile does NOT strip Camber (it is a model variant, not a contour code)", () => {
    const trace = normalizeModelDebug("Custom Camber", "Burton");
    const profileStep = trace.find((t) => t.step === "strip-profile");
    // strip-profile only matches contour codes now, not "Camber"
    if (profileStep) {
      expect(profileStep.result).toBe("Custom Camber");
    }
  });

  it("omits strip-profile step when keepProfile is true", () => {
    const trace = normalizeModelDebug("Custom Camber", "Burton", { keepProfile: true });
    const profileStep = trace.find((t) => t.step === "strip-profile");
    expect(profileStep).toBeUndefined();
  });

  it("skips brand-scoped steps when brand does not match", () => {
    const trace = normalizeModelDebug("Tech Something", "Burton");
    const libtechStep = trace.find((t) => t.step === "fix-libtech-brand-leak");
    expect(libtechStep).toBeUndefined();
  });
});

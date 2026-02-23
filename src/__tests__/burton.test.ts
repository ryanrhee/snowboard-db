import { describe, it, expect } from "vitest";
import {
  extractDetailAttrs,
  extractPersonalityFlex,
  mapSkillLevel,
  mapBend,
  mapTerrain,
  mapShape,
  cleanModelName,
  extractSpecsFromText,
} from "../lib/manufacturers/burton";

describe("extractPersonalityFlex", () => {
  it("extracts flex from Personality slider (Custom: 40-70 → 6)", () => {
    const html = `"productSliders":[{"title":"Personality","units":10,"sort":30,"labels":["Soft & Playful","Happy Medium","Stiff & Aggressive"],"lowerValue":"40","upperValue":"70"}]`;
    expect(extractPersonalityFlex(html)).toBe(6);
  });

  it("extracts flex from stiff board (Custom X: 60-90 → 8)", () => {
    const html = `"title":"Personality","units":10,"sort":30,"labels":["Soft & Playful","Happy Medium","Stiff & Aggressive"],"lowerValue":"60","upperValue":"90"}`;
    expect(extractPersonalityFlex(html)).toBe(8);
  });

  it("extracts flex from soft board (Instigator: 00-30 → 2)", () => {
    const html = `"title":"Personality","units":10,"sort":30,"labels":["Soft & Playful","Happy Medium","Stiff & Aggressive"],"lowerValue":"00","upperValue":"30"}`;
    expect(extractPersonalityFlex(html)).toBe(2);
  });

  it("extracts flex from medium-soft board (Process: 20-50 → 4)", () => {
    const html = `"title":"Personality","units":10,"sort":30,"labels":["Soft & Playful","Happy Medium","Stiff & Aggressive"],"lowerValue":"20","upperValue":"50"}`;
    expect(extractPersonalityFlex(html)).toBe(4);
  });

  it("returns null when no Personality slider found", () => {
    const html = `<html><body>No slider data here</body></html>`;
    expect(extractPersonalityFlex(html)).toBeNull();
  });

  it("clamps minimum to 1", () => {
    const html = `"title":"Personality","units":10,"sort":30,"labels":["Soft & Playful","Happy Medium","Stiff & Aggressive"],"lowerValue":"00","upperValue":"00"}`;
    expect(extractPersonalityFlex(html)).toBe(1);
  });
});

describe("extractDetailAttrs", () => {
  it("extracts a simple label/value pair", () => {
    const html = `"label":"Board Bend","value":["Camber"]`;
    expect(extractDetailAttrs(html)).toEqual({ "Board Bend": ["Camber"] });
  });

  it("extracts multi-value arrays", () => {
    const html = `"label":"Board Terrain","value":["All Mountain","Park","Powder"]`;
    expect(extractDetailAttrs(html)).toEqual({
      "Board Terrain": ["All Mountain", "Park", "Powder"],
    });
  });

  it("extracts multiple distinct labels", () => {
    const html = `"label":"Board Bend","value":["Camber"],"label":"Board Shape","value":["Twin"]`;
    const result = extractDetailAttrs(html);
    expect(result["Board Bend"]).toEqual(["Camber"]);
    expect(result["Board Shape"]).toEqual(["Twin"]);
  });

  it("deduplicates labels, first occurrence wins", () => {
    const html = `"label":"Board Bend","value":["Camber"] something "label":"Board Bend","value":["Flying V"]`;
    expect(extractDetailAttrs(html)).toEqual({ "Board Bend": ["Camber"] });
  });

  it("handles whitespace variations around colons", () => {
    const html = `"label" : "Board Bend" , "value" : ["Flat Top"]`;
    expect(extractDetailAttrs(html)).toEqual({ "Board Bend": ["Flat Top"] });
  });

  it("returns empty object for empty HTML", () => {
    expect(extractDetailAttrs("")).toEqual({});
  });

  it("returns empty object when no matching pattern exists", () => {
    expect(extractDetailAttrs("<html><body>No data here</body></html>")).toEqual({});
  });

  it("falls back to raw string when JSON parse fails", () => {
    const html = `"label":"Broken","value":[not valid json]`;
    const result = extractDetailAttrs(html);
    expect(result["Broken"]).toEqual(["[not valid json]"]);
  });
});

describe("mapSkillLevel", () => {
  it("returns single level lowercased", () => {
    expect(mapSkillLevel(["Intermediate"])).toBe("intermediate");
  });

  it("returns single beginner lowercased", () => {
    expect(mapSkillLevel(["Beginner"])).toBe("beginner");
  });

  it("returns single expert lowercased", () => {
    expect(mapSkillLevel(["Expert"])).toBe("expert");
  });

  it("returns single advanced lowercased", () => {
    expect(mapSkillLevel(["Advanced"])).toBe("advanced");
  });

  it("sorts two levels and returns min-max range", () => {
    expect(mapSkillLevel(["Expert", "Intermediate"])).toBe("intermediate-expert");
  });

  it("sorts beginner and advanced correctly", () => {
    expect(mapSkillLevel(["Advanced", "Beginner"])).toBe("beginner-advanced");
  });

  it("handles 3+ levels and picks min-max", () => {
    expect(mapSkillLevel(["Expert", "Beginner", "Intermediate"])).toBe("beginner-expert");
  });

  it("handles all four levels", () => {
    expect(mapSkillLevel(["Expert", "Advanced", "Beginner", "Intermediate"])).toBe("beginner-expert");
  });

  it("handles intermediate-advanced range", () => {
    expect(mapSkillLevel(["Advanced", "Intermediate"])).toBe("intermediate-advanced");
  });
});

describe("mapBend", () => {
  it("maps PurePop to hybrid_rocker", () => {
    expect(mapBend("PurePop")).toBe("hybrid_rocker");
  });

  it("maps 'PurePop Camber' to hybrid_rocker", () => {
    expect(mapBend("PurePop Camber")).toBe("hybrid_rocker");
  });

  it("maps Flying V to 'flying v'", () => {
    expect(mapBend("Flying V")).toBe("flying v");
  });

  it("maps 'Directional Flat Top' exactly to 'directional flat top'", () => {
    expect(mapBend("Directional Flat Top")).toBe("directional flat top");
  });

  it("maps 'Flat Top' to 'flat top'", () => {
    expect(mapBend("Flat Top")).toBe("flat top");
  });

  it("maps 'Camber' to 'camber'", () => {
    expect(mapBend("Camber")).toBe("camber");
  });

  it("passes through unknown bend string unchanged", () => {
    expect(mapBend("Banana Rocker")).toBe("Banana Rocker");
  });
});

describe("mapTerrain", () => {
  it("maps 'All Mountain' to 'all-mountain'", () => {
    expect(mapTerrain("All Mountain")).toBe("all-mountain");
  });

  it("maps 'Park' to 'park'", () => {
    expect(mapTerrain("Park")).toBe("park");
  });

  it("maps 'Park & Ride' (includes park) to 'park'", () => {
    expect(mapTerrain("Park & Ride")).toBe("park");
  });

  it("maps 'Freestyle' to 'freestyle'", () => {
    expect(mapTerrain("Freestyle")).toBe("freestyle");
  });

  it("maps 'Freeride' to 'freeride'", () => {
    expect(mapTerrain("Freeride")).toBe("freeride");
  });

  it("maps 'Backcountry' to 'freeride'", () => {
    expect(mapTerrain("Backcountry")).toBe("freeride");
  });

  it("maps 'Powder' to 'powder'", () => {
    expect(mapTerrain("Powder")).toBe("powder");
  });

  it("passes through unknown terrain string unchanged", () => {
    expect(mapTerrain("Groomer")).toBe("Groomer");
  });
});

describe("mapShape", () => {
  it("maps 'True Twin' to 'true twin'", () => {
    expect(mapShape("True Twin")).toBe("true twin");
  });

  it("maps exact 'Twin' to 'true twin'", () => {
    expect(mapShape("Twin")).toBe("true twin");
  });

  it("maps 'Directional Twin' to 'directional twin'", () => {
    expect(mapShape("Directional Twin")).toBe("directional twin");
  });

  it("maps 'All Mountain Directional' to 'directional'", () => {
    expect(mapShape("All Mountain Directional")).toBe("directional");
  });

  it("maps 'Tapered' to 'tapered directional'", () => {
    expect(mapShape("Tapered")).toBe("tapered directional");
  });

  it("passes through unknown shape string unchanged", () => {
    expect(mapShape("Asymmetric")).toBe("Asymmetric");
  });
});

describe("cleanModelName", () => {
  it("strips 'Men's ' prefix", () => {
    expect(cleanModelName("Men's Burton Custom Snowboard")).toBe("Custom");
  });

  it("strips 'Women's ' prefix", () => {
    expect(cleanModelName("Women's Burton Feelgood Snowboard")).toBe("Feelgood");
  });

  it("strips 'Kids' ' prefix", () => {
    expect(cleanModelName("Kids' Burton Chopper Snowboard")).toBe("Chopper");
  });

  it("strips 'Boy's ' prefix", () => {
    expect(cleanModelName("Boy's Burton After School Special Snowboard")).toBe(
      "After School Special"
    );
  });

  it("strips 'Girl's ' prefix", () => {
    expect(cleanModelName("Girl's Burton Chicklet Snowboard")).toBe("Chicklet");
  });

  it("strips 'Burton ' prefix alone", () => {
    expect(cleanModelName("Burton Custom")).toBe("Custom");
  });

  it("strips ' Snowboard' suffix alone", () => {
    expect(cleanModelName("Custom Snowboard")).toBe("Custom");
  });

  it("preserves ' Splitboard' with leading space", () => {
    expect(cleanModelName("Burton Hometown Hero Splitboard")).toBe(
      "Hometown Hero Splitboard"
    );
  });

  it("returns plain name unchanged", () => {
    expect(cleanModelName("Custom")).toBe("Custom");
  });

  it("trims surrounding whitespace", () => {
    expect(cleanModelName("  Custom  ")).toBe("Custom");
  });
});

describe("extractSpecsFromText", () => {
  // Profile tests
  it("detects PurePop Camber as hybrid_rocker profile", () => {
    const result = extractSpecsFromText("Features PurePop Camber for a playful ride");
    expect(result.profile).toBe("hybrid_rocker");
  });

  it("detects Pure Pop Camber (with space) as hybrid_rocker", () => {
    const result = extractSpecsFromText("Pure Pop Camber technology");
    expect(result.profile).toBe("hybrid_rocker");
  });

  it("detects Flying V profile", () => {
    const result = extractSpecsFromText("Built with Flying V bend");
    expect(result.profile).toBe("flying v");
  });

  it("detects Directional Flat Top profile", () => {
    const result = extractSpecsFromText("Directional Flat Top design");
    expect(result.profile).toBe("directional flat top");
  });

  it("detects Flat Top profile", () => {
    const result = extractSpecsFromText("Flat Top bend for stability");
    expect(result.profile).toBe("flat top");
  });

  it("detects Camber profile", () => {
    const result = extractSpecsFromText("Classic camber construction");
    expect(result.profile).toBe("camber");
  });

  it("detects bend keyword as fallback profile", () => {
    const result = extractSpecsFromText("A unique bend for control");
    expect(result.profile).toBe("bend");
  });

  // Shape tests
  it("detects true twin shape", () => {
    const result = extractSpecsFromText("True twin shape rides the same forwards and backwards");
    expect(result.shape).toBe("true twin");
  });

  it("detects twin flex as true twin", () => {
    const result = extractSpecsFromText("Twin flex pattern for switch riding");
    expect(result.shape).toBe("true twin");
  });

  it("detects directional twin shape", () => {
    const result = extractSpecsFromText("Directional twin for versatility");
    expect(result.shape).toBe("directional twin");
  });

  it("detects directional shape via 'directional shape' keyword", () => {
    const result = extractSpecsFromText("A directional shape for speed");
    expect(result.shape).toBe("directional");
  });

  it("detects directional via 'directional board' keyword", () => {
    const result = extractSpecsFromText("This directional board charges");
    expect(result.shape).toBe("directional");
  });

  it("detects tapered shape", () => {
    const result = extractSpecsFromText("Tapered nose and tail");
    expect(result.shape).toBe("tapered");
  });

  it("detects twin + freestyle combo as true twin", () => {
    const result = extractSpecsFromText("A twin board for freestyle tricks");
    expect(result.shape).toBe("true twin");
  });

  it("detects standalone directional as shape fallback", () => {
    const result = extractSpecsFromText("Featuring a directional design for powder");
    expect(result.shape).toBe("directional");
  });

  // Category tests
  it("detects all-mountain category (hyphenated)", () => {
    const result = extractSpecsFromText("The ultimate all-mountain snowboard");
    expect(result.category).toBe("all-mountain");
  });

  it("detects all mountain category (no hyphen)", () => {
    const result = extractSpecsFromText("An all mountain board for any terrain");
    expect(result.category).toBe("all-mountain");
  });

  it("detects quiver-of-one as all-mountain", () => {
    const result = extractSpecsFromText("A true quiver-of-one board");
    expect(result.category).toBe("all-mountain");
  });

  it("detects park and pipe as park category", () => {
    const result = extractSpecsFromText("Dominate the park and pipe");
    expect(result.category).toBe("park");
  });

  it("detects freestyle category", () => {
    const result = extractSpecsFromText("Built for freestyle riding");
    expect(result.category).toBe("freestyle");
  });

  it("detects playful as freestyle category", () => {
    const result = extractSpecsFromText("A playful board for jibbing");
    expect(result.category).toBe("freestyle");
  });

  it("detects freeride category", () => {
    const result = extractSpecsFromText("A freeride machine");
    expect(result.category).toBe("freeride");
  });

  it("detects backcountry as freeride", () => {
    const result = extractSpecsFromText("Built for backcountry exploration");
    expect(result.category).toBe("freeride");
  });

  it("detects big mountain as freeride", () => {
    const result = extractSpecsFromText("A big mountain charger");
    expect(result.category).toBe("freeride");
  });

  it("detects powder category", () => {
    const result = extractSpecsFromText("Designed for powder days");
    expect(result.category).toBe("powder");
  });

  it("detects deep snow as powder", () => {
    const result = extractSpecsFromText("Floats in deep snow");
    expect(result.category).toBe("powder");
  });

  it("detects standalone park as park category", () => {
    const result = extractSpecsFromText("A park board for rails and boxes");
    expect(result.category).toBe("park");
  });

  it("detects beginner as all-mountain category", () => {
    const result = extractSpecsFromText("Perfect for the beginner rider");
    expect(result.category).toBe("all-mountain");
  });

  // Ability level tests
  it("detects beginner + intermediate combo", () => {
    const result = extractSpecsFromText("Great for beginner to intermediate riders");
    expect(result.abilityLevel).toBe("beginner-intermediate");
  });

  it("detects intermediate + advanced combo", () => {
    const result = extractSpecsFromText("For intermediate and advanced riders");
    expect(result.abilityLevel).toBe("intermediate-advanced");
  });

  it("detects advanced + expert combo", () => {
    const result = extractSpecsFromText("Built for advanced and expert shredders");
    expect(result.abilityLevel).toBe("advanced-expert");
  });

  it("detects 'first board' as beginner", () => {
    const result = extractSpecsFromText("The perfect first board");
    expect(result.abilityLevel).toBe("beginner");
  });

  it("detects 'pro level' as expert", () => {
    const result = extractSpecsFromText("Pro level performance for demanding riders");
    expect(result.abilityLevel).toBe("expert");
  });

  it("detects standalone advanced", () => {
    const result = extractSpecsFromText("An advanced board for hard chargers");
    expect(result.abilityLevel).toBe("advanced");
  });

  it("detects standalone intermediate", () => {
    const result = extractSpecsFromText("Ideal for intermediate riders progressing their skills");
    expect(result.abilityLevel).toBe("intermediate");
  });

  // Null / unrecognized
  it("returns all nulls for unrecognized text", () => {
    const result = extractSpecsFromText("This is just a regular product page with no specs");
    expect(result).toEqual({
      profile: null,
      shape: null,
      category: null,
      abilityLevel: null,
    });
  });
});

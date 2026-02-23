import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config";
import { CanonicalBoard, BoardProfile, BoardShape, BoardCategory } from "./types";
import { specKey, getSpecSources, setSpecSource, SpecSourceEntry } from "./db";
import { normalizeAbilityRange } from "./normalization";

// Priority: manufacturer > review-site = judgment > retailer > llm
const SOURCE_PRIORITY: Record<string, number> = {
  manufacturer: 4,
  "review-site": 3,
  judgment: 3,
  llm: 1,
};

function getSourcePriority(source: string): number {
  if (source.startsWith("retailer:")) return 2;
  return SOURCE_PRIORITY[source] ?? 0;
}

export interface SpecFieldInfo {
  resolved: string | number | null;
  resolvedSource: string;
  agreement: boolean;
  sources: { source: string; value: string; sourceUrl?: string }[];
  judgment?: {
    chosenValue: string;
    reasoning: string;
  };
}

interface DisagreementContext {
  brand: string;
  model: string;
  year: number | null;
  field: string;
  mfgrValue: string;
  consensusValue: string;
  allMfgrSpecs: Record<string, string>;
  allReviewSpecs: Record<string, string>;
  allRetailerSpecs: Record<string, string>;
  mfgrSourceUrl: string | null;
  reviewSourceUrl: string | null;
  retailerUrls: string[];
}

const REPORT_JUDGMENT_TOOL: Anthropic.Tool = {
  name: "report_judgment",
  description: "Report your judgment on which spec value is correct.",
  input_schema: {
    type: "object" as const,
    properties: {
      chosen_value: {
        type: "string",
        description: "The value you believe is correct",
      },
      reasoning: {
        type: "string",
        description: "Brief explanation of why you chose this value",
      },
    },
    required: ["chosen_value", "reasoning"],
  },
};

let anthropicClient: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!config.anthropicApiKey) return null;
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return anthropicClient;
}

async function judgeDisagreement(ctx: DisagreementContext): Promise<{ chosenValue: string; reasoning: string } | null> {
  const anthropic = getClient();
  if (!anthropic) return null;

  const mfgrSpecsStr = Object.entries(ctx.allMfgrSpecs).map(([k, v]) => `${k}=${v}`).join(", ");
  const reviewSpecsStr = Object.entries(ctx.allReviewSpecs).map(([k, v]) => `${k}=${v}`).join(", ");
  const retailerSpecsStr = Object.entries(ctx.allRetailerSpecs).map(([k, v]) => `${k}=${v}`).join(", ");

  const prompt = `I need you to resolve a spec disagreement for the ${ctx.brand} ${ctx.model}${ctx.year ? ` (${ctx.year})` : ""} snowboard.

DISAGREEMENT: The "${ctx.field}" spec differs between sources.
- Manufacturer${ctx.mfgrSourceUrl ? ` (${ctx.mfgrSourceUrl})` : ""} claims: ${ctx.mfgrValue}
- Review site/retailer consensus: ${ctx.consensusValue}

FULL CONTEXT — all specs from each source:
Manufacturer: ${mfgrSpecsStr || "(none)"}
Review site:  ${reviewSpecsStr || "(none)"}
Retailer:     ${retailerSpecsStr || "(none)"}

THINGS TO CONSIDER:
- Manufacturers sometimes use proprietary profile names (e.g. Burton "Flying V" = hybrid rocker, Lib Tech "C2" = hybrid camber) that may not map cleanly to standard categories
- Flex scales differ between sources (manufacturer 1-5 vs review site 1-10)
- Review sites like The Good Ride test boards hands-on and may rate flex differently than the manufacturer's marketing spec
- Retailers often copy manufacturer data but may also editorialize

Search the web if needed to verify claims. Then report your judgment using the report_judgment tool.`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      tools: [
        REPORT_JUDGMENT_TOOL,
        { type: "web_search_20250305", name: "web_search", max_uses: 3 },
      ],
      messages: [{ role: "user", content: prompt }],
    });

    for (const block of response.content) {
      if (block.type === "tool_use" && block.name === "report_judgment") {
        const input = block.input as { chosen_value: string; reasoning: string };
        return { chosenValue: input.chosen_value, reasoning: input.reasoning };
      }
    }
  } catch (error) {
    console.error(`[spec-resolution] Judgment call failed for ${ctx.brand} ${ctx.model} ${ctx.field}:`, error);
  }

  return null;
}

function findConsensus(
  entries: SpecSourceEntry[],
  field: string
): { value: string; sources: string[] } | null {
  // Look for agreement among non-manufacturer, non-llm sources
  const candidates = entries.filter(
    (e) => e.source !== "manufacturer" && e.source !== "llm" && e.source !== "judgment"
  );
  if (candidates.length < 2) return null;

  // Group by normalized value
  const groups = new Map<string, string[]>();
  for (const c of candidates) {
    const normalized = field === "flex" ? String(Math.round(Number(c.value))) : c.value;
    const existing = groups.get(normalized);
    if (existing) {
      existing.push(c.source);
    } else {
      groups.set(normalized, [c.source]);
    }
  }

  // Find the group with >=2 agreeing sources
  for (const [value, sources] of groups) {
    if (sources.length >= 2) {
      return { value, sources };
    }
  }

  return null;
}

function valuesMatch(a: string, b: string, field: string): boolean {
  if (field === "flex") {
    return Math.round(Number(a)) === Math.round(Number(b));
  }
  return a === b;
}

export async function resolveSpecSources(boards: CanonicalBoard[]): Promise<CanonicalBoard[]> {
  // Group boards by specKey to avoid redundant resolution
  const keyToBoards = new Map<string, CanonicalBoard[]>();
  for (const board of boards) {
    const key = specKey(board.brand, board.model);
    const group = keyToBoards.get(key);
    if (group) {
      group.push(board);
    } else {
      keyToBoards.set(key, [board]);
    }
  }

  const SPEC_FIELDS = ["flex", "profile", "shape", "category", "abilityLevel"] as const;

  // Collect disagreements for batched LLM judgment
  const disagreements: { key: string; field: string; ctx: DisagreementContext }[] = [];

  // First pass: resolve by priority, detect disagreements
  const resolvedMap = new Map<string, Record<string, SpecFieldInfo>>();

  for (const [key, groupBoards] of keyToBoards) {
    const allSources = getSpecSources(key);
    const fieldInfoMap: Record<string, SpecFieldInfo> = {};

    for (const field of SPEC_FIELDS) {
      const entries = allSources[field] || [];
      if (entries.length === 0) {
        fieldInfoMap[field] = {
          resolved: null,
          resolvedSource: "none",
          agreement: true,
          sources: [],
        };
        continue;
      }

      // Sort by priority descending
      const sorted = [...entries].sort(
        (a, b) => getSourcePriority(b.source) - getSourcePriority(a.source)
      );

      const topEntry = sorted[0];
      const allAgree = entries.every((e) => valuesMatch(e.value, topEntry.value, field));

      // Check for manufacturer vs consensus disagreement
      const mfgrEntry = entries.find((e) => e.source === "manufacturer");
      const consensus = findConsensus(entries, field);
      const hasDisagreement = mfgrEntry && consensus && !valuesMatch(mfgrEntry.value, consensus.value, field);

      if (hasDisagreement && mfgrEntry && consensus) {
        // Collect all specs per source type for context
        const allMfgrSpecs: Record<string, string> = {};
        const allReviewSpecs: Record<string, string> = {};
        const allRetailerSpecs: Record<string, string> = {};
        const retailerUrls: string[] = [];

        for (const f of SPEC_FIELDS) {
          for (const entry of allSources[f] || []) {
            if (entry.source === "manufacturer") allMfgrSpecs[f] = entry.value;
            else if (entry.source === "review-site") allReviewSpecs[f] = entry.value;
            else if (entry.source.startsWith("retailer:")) {
              allRetailerSpecs[f] = entry.value;
              if (entry.sourceUrl && !retailerUrls.includes(entry.sourceUrl)) {
                retailerUrls.push(entry.sourceUrl);
              }
            }
          }
        }

        const reviewEntry = entries.find((e) => e.source === "review-site");

        disagreements.push({
          key,
          field,
          ctx: {
            brand: groupBoards[0].brand,
            model: groupBoards[0].model,
            year: groupBoards[0].year,
            field,
            mfgrValue: mfgrEntry.value,
            consensusValue: consensus.value,
            allMfgrSpecs,
            allReviewSpecs,
            allRetailerSpecs,
            mfgrSourceUrl: mfgrEntry.sourceUrl,
            reviewSourceUrl: reviewEntry?.sourceUrl ?? null,
            retailerUrls,
          },
        });
      }

      fieldInfoMap[field] = {
        resolved: topEntry.value,
        resolvedSource: topEntry.source,
        agreement: allAgree,
        sources: entries.map((e) => ({
          source: e.source,
          value: e.value,
          sourceUrl: e.sourceUrl ?? undefined,
        })),
      };
    }

    resolvedMap.set(key, fieldInfoMap);
  }

  // Second pass: resolve disagreements via LLM judgment (concurrency 3)
  const JUDGMENT_CONCURRENCY = 3;
  for (let i = 0; i < disagreements.length; i += JUDGMENT_CONCURRENCY) {
    const batch = disagreements.slice(i, i + JUDGMENT_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (d) => {
        console.log(`[spec-resolution] Judging disagreement: ${d.ctx.brand} ${d.ctx.model} ${d.field}`);
        const judgment = await judgeDisagreement(d.ctx);
        return { ...d, judgment };
      })
    );

    for (const { key, field, judgment } of results) {
      if (!judgment) continue;

      const fieldInfoMap = resolvedMap.get(key)!;
      const fieldInfo = fieldInfoMap[field];

      // Store judgment in spec_sources
      setSpecSource(key, field, "judgment", judgment.chosenValue);

      // Update field info with judgment
      fieldInfo.resolved = judgment.chosenValue;
      fieldInfo.resolvedSource = "judgment";
      fieldInfo.judgment = judgment;
      fieldInfo.sources.push({
        source: "judgment",
        value: judgment.chosenValue,
      });
    }
  }

  // Apply resolved values to boards
  return boards.map((board) => {
    const key = specKey(board.brand, board.model);
    const fieldInfoMap = resolvedMap.get(key);
    if (!fieldInfoMap) return board;

    const updated = { ...board };

    // Apply resolved flex
    const flexInfo = fieldInfoMap.flex;
    if (flexInfo && flexInfo.resolved !== null) {
      updated.flex = Number(flexInfo.resolved);
    }

    // Apply resolved profile
    const profileInfo = fieldInfoMap.profile;
    if (profileInfo && profileInfo.resolved !== null) {
      updated.profile = profileInfo.resolved as BoardProfile;
    }

    // Apply resolved shape
    const shapeInfo = fieldInfoMap.shape;
    if (shapeInfo && shapeInfo.resolved !== null) {
      updated.shape = shapeInfo.resolved as BoardShape;
    }

    // Apply resolved category
    const categoryInfo = fieldInfoMap.category;
    if (categoryInfo && categoryInfo.resolved !== null) {
      updated.category = categoryInfo.resolved as BoardCategory;
    }

    // Apply resolved abilityLevel → split into min/max range
    const abilityLevelInfo = fieldInfoMap.abilityLevel;
    if (abilityLevelInfo && abilityLevelInfo.resolved !== null) {
      const range = normalizeAbilityRange(abilityLevelInfo.resolved as string);
      updated.abilityLevelMin = range.min;
      updated.abilityLevelMax = range.max;
    }

    updated.specSources = JSON.stringify(fieldInfoMap);

    return updated;
  });
}

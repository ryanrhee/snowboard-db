import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";
import { getCachedSpecs, setCachedSpecsWithPriority } from "../db";
import { CanonicalBoard, BoardProfile, BoardShape, BoardCategory } from "../types";
import { normalizeProfile, normalizeShape, normalizeCategory, normalizeFlex } from "../normalization";
import { tryReviewSiteLookup } from "../review-sites/the-good-ride";

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!config.anthropicApiKey) return null;
  if (!client) {
    client = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return client;
}

interface EnrichedSpecs {
  flex: number | null;
  profile: BoardProfile | null;
  shape: BoardShape | null;
  category: BoardCategory | null;
  msrpUsd: number | null;
}

// In-memory cache keyed by "brand|model" (lowercased)
const specCache = new Map<string, EnrichedSpecs | null>();

function modelKey(brand: string, model: string): string {
  return `${brand.toLowerCase()}|${cleanModelForKey(model)}`;
}

/**
 * Strip "Snowboard", year, profile suffixes, leading brand, trailing dashes etc.
 * from model name so manufacturer and retailer keys align.
 */
function cleanModelForKey(model: string): string {
  return model
    .toLowerCase()
    .replace(/\bsnowboard\b/gi, "")
    .replace(/\b20[1-2]\d\b/g, "")
    .replace(/\bmen'?s\b/gi, "")
    .replace(/\bwomen'?s\b/gi, "")
    // Strip profile terms that retailers sometimes append
    .replace(/\b(?:camber|rocker|flat|c2x?|c3|btx)\b/gi, "")
    // "Flat Top" → "top" after stripping "flat" — clean up the orphan
    .replace(/\b(?:top)\b/gi, "")
    // Normalize abbreviation dots: "t. rice" -> "t.rice"
    .replace(/(\w)\.\s+/g, "$1.")
    .replace(/[-–—]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function needsEnrichment(board: CanonicalBoard): boolean {
  return (
    board.flex === null ||
    board.profile === null ||
    board.shape === null ||
    board.category === null
  );
}

const REPORT_SPECS_TOOL: Anthropic.Tool = {
  name: "report_specs",
  description:
    "Report the snowboard specs you found. Use null for any spec you could not determine.",
  input_schema: {
    type: "object" as const,
    properties: {
      flex: {
        type: ["number", "null"],
        description: "Flex rating normalized to a 1-10 scale (1=softest, 10=stiffest). If the source uses a different scale (e.g. 1-5), convert it (e.g. 3/5 → 6/10). null if unknown.",
      },
      profile: {
        type: ["string", "null"],
        enum: [
          "camber",
          "rocker",
          "flat",
          "hybrid_camber",
          "hybrid_rocker",
          null,
        ],
        description: "Board profile/bend type. null if unknown.",
      },
      shape: {
        type: ["string", "null"],
        enum: ["true_twin", "directional_twin", "directional", "tapered", null],
        description: "Board shape. null if unknown.",
      },
      category: {
        type: ["string", "null"],
        enum: ["all_mountain", "freestyle", "freeride", "powder", "park", null],
        description: "Primary riding category. null if unknown.",
      },
    },
    required: ["flex", "profile", "shape", "category"],
  },
};

async function lookupSpecs(
  brand: string,
  model: string,
  year: number | null
): Promise<EnrichedSpecs | null> {
  const anthropic = getClient();
  if (!anthropic) return null;

  const yearStr = year ? ` ${year}` : "";
  const prompt = `Look up the specs for the ${brand} ${model}${yearStr} snowboard. I need: flex rating (1-10 scale), profile/bend type, shape, and riding category. IMPORTANT: Different retailers use different flex scales (e.g. Evo uses 1-5, Burton uses 1-10). You MUST normalize flex to a 1-10 scale — for example, a 3/5 from Evo should be reported as 6/10. Search the web, then report using the report_specs tool.`;

  // API/network errors intentionally propagate to stop the batch loop.
  // Only "model not found" (no report_specs call) returns null.
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    tools: [
      REPORT_SPECS_TOOL,
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 3,
      },
    ],
    messages: [{ role: "user", content: prompt }],
  });

  // Extract the report_specs tool call from the response
  for (const block of response.content) {
    if (block.type === "tool_use" && block.name === "report_specs") {
      const input = block.input as {
        flex: number | null;
        profile: string | null;
        shape: string | null;
        category: string | null;
      };

      return {
        flex:
          input.flex !== null &&
          input.flex >= 1 &&
          input.flex <= 10
            ? Math.round(input.flex)
            : null,
        profile: input.profile as BoardProfile | null,
        shape: input.shape as BoardShape | null,
        category: input.category as BoardCategory | null,
        msrpUsd: null,
      };
    }
  }

  // Model didn't call report_specs — treat as lookup miss (resumable)
  console.warn(`[enrich] No report_specs call for ${brand} ${model}`);
  return null;
}

function applySpecs(board: CanonicalBoard, specs: EnrichedSpecs): CanonicalBoard {
  return {
    ...board,
    flex: board.flex ?? specs.flex,
    profile: board.profile ?? specs.profile,
    shape: board.shape ?? specs.shape,
    category: board.category ?? specs.category,
    originalPriceUsd: board.originalPriceUsd ?? specs.msrpUsd,
  };
}

/**
 * Enrich boards that are missing specs (flex, profile, shape, category)
 * by looking them up via Claude + web search.
 * Groups by brand+model so one lookup covers all size variants.
 */
export async function enrichBoardSpecs(
  boards: CanonicalBoard[]
): Promise<CanonicalBoard[]> {
  if (!config.enableSpecEnrichment) {
    console.log("[enrich] Spec enrichment disabled, skipping");
    return boards;
  }

  if (!config.anthropicApiKey) {
    console.log("[enrich] No API key, skipping enrichment");
    return boards;
  }

  // Group boards that need enrichment by brand|model
  const groups = new Map<string, CanonicalBoard[]>();
  for (const board of boards) {
    if (!needsEnrichment(board)) continue;
    const key = modelKey(board.brand, board.model);
    const group = groups.get(key);
    if (group) {
      group.push(board);
    } else {
      groups.set(key, [board]);
    }
  }

  if (groups.size === 0) {
    console.log("[enrich] All boards already have specs, skipping");
    return boards;
  }

  console.log(
    `[enrich] ${groups.size} unique models need spec lookup (${boards.filter(needsEnrichment).length} boards total)`
  );

  // Look up specs with concurrency limit of 3
  const CONCURRENCY = 3;
  const keys = Array.from(groups.keys());
  let aborted = false;

  for (let i = 0; i < keys.length; i += CONCURRENCY) {
    if (aborted) break;

    const batch = keys.slice(i, i + CONCURRENCY);
    const lookups = batch.map(async (key) => {
      if (aborted) return { key, specs: null };

      // Fast path: in-memory cache
      if (specCache.has(key)) {
        return { key, specs: specCache.get(key)! };
      }

      // Check persistent DB cache
      const dbHit = getCachedSpecs(key);
      if (dbHit) {
        console.log(`[enrich] DB cache hit: ${key}`);
        const specs: EnrichedSpecs = {
          flex: dbHit.flex,
          profile: dbHit.profile as BoardProfile | null,
          shape: dbHit.shape as BoardShape | null,
          category: dbHit.category as BoardCategory | null,
          msrpUsd: dbHit.msrpUsd,
        };
        specCache.set(key, specs);
        return { key, specs };
      }

      if (aborted) return { key, specs: null };

      const boardSample = groups.get(key)![0];

      // Try review site before LLM
      try {
        const reviewSpec = await tryReviewSiteLookup(boardSample.brand, boardSample.model);
        if (reviewSpec) {
          const specs: EnrichedSpecs = {
            flex: reviewSpec.flex ? normalizeFlex(reviewSpec.flex) : null,
            profile: reviewSpec.profile ? normalizeProfile(reviewSpec.profile) as BoardProfile | null : null,
            shape: reviewSpec.shape ? normalizeShape(reviewSpec.shape) as BoardShape | null : null,
            category: reviewSpec.category ? normalizeCategory(reviewSpec.category) as BoardCategory | null : null,
            msrpUsd: reviewSpec.msrpUsd,
          };
          specCache.set(key, specs);
          setCachedSpecsWithPriority(key, {
            flex: specs.flex,
            profile: specs.profile,
            shape: specs.shape,
            category: specs.category,
            msrpUsd: specs.msrpUsd,
            source: "review-site",
            sourceUrl: reviewSpec.sourceUrl,
          });
          console.log(`[enrich] Review site hit: ${key}`);
          return { key, specs };
        }
      } catch (err) {
        console.warn("[enrich] Review site lookup failed:", (err as Error).message);
      }

      console.log(
        `[enrich] Looking up: ${boardSample.brand} ${boardSample.model}${boardSample.year ? ` ${boardSample.year}` : ""}`
      );

      try {
        const specs = await lookupSpecs(
          boardSample.brand,
          boardSample.model,
          boardSample.year
        );

        specCache.set(key, specs);

        // Persist successful lookups to DB (respects source priority)
        if (specs) {
          setCachedSpecsWithPriority(key, {
            flex: specs.flex,
            profile: specs.profile,
            shape: specs.shape,
            category: specs.category,
            msrpUsd: null,
            source: "llm",
            sourceUrl: null,
          });
        }

        return { key, specs };
      } catch (error) {
        aborted = true;
        console.error("[enrich] LLM call failed, stopping enrichment:", error);
        return { key, specs: null };
      }
    });

    await Promise.all(lookups);
  }

  // Apply enriched specs to boards
  return boards.map((board) => {
    if (!needsEnrichment(board)) return board;

    const key = modelKey(board.brand, board.model);
    const specs = specCache.get(key);
    if (!specs) return board;

    return applySpecs(board, specs);
  });
}

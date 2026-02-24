import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "crypto";
import { config } from "../config";
import { getCachedSpecs, setCachedSpecsWithPriority, specKey, setSpecSource } from "../db";
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

// In-memory cache keyed by input hash
const specCache = new Map<string, EnrichedSpecs | null>();

/**
 * Hash all scraper-provided fields for a board.  This is the cache key
 * for enrichment: if any scraper output changes the hash changes and
 * we re-enrich.
 */
function inputHash(board: CanonicalBoard): string {
  const data = [
    board.brand,
    board.model,
    String(board.year ?? ""),
    String(board.flex ?? ""),
    board.profile ?? "",
    board.shape ?? "",
    board.category ?? "",
    board.description ?? "",
  ].join("\0");
  return createHash("sha256").update(data).digest("hex").slice(0, 16);
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
  _brand: string,
  _model: string,
  _year: number | null
): Promise<EnrichedSpecs | null> {
  // LLM enrichment disabled to avoid API spend
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
 * Groups by input hash so one lookup covers all size variants with
 * identical scraper output.
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

  // Group boards that need enrichment by input hash
  // (boards with identical scraper output share one lookup)
  const groups = new Map<string, CanonicalBoard[]>();
  for (const board of boards) {
    if (!needsEnrichment(board)) continue;
    const hash = inputHash(board);
    const group = groups.get(hash);
    if (group) {
      group.push(board);
    } else {
      groups.set(hash, [board]);
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
  const hashes = Array.from(groups.keys());
  let aborted = false;

  for (let i = 0; i < hashes.length; i += CONCURRENCY) {
    if (aborted) break;

    const batch = hashes.slice(i, i + CONCURRENCY);
    const lookups = batch.map(async (hash) => {
      if (aborted) return { hash, specs: null };

      // Fast path: in-memory cache
      if (specCache.has(hash)) {
        return { hash, specs: specCache.get(hash)! };
      }

      const boardSample = groups.get(hash)![0];

      // Check persistent DB cache (keyed by hash of scraper output)
      const dbHit = getCachedSpecs(hash);
      if (dbHit) {
        console.log(`[enrich] DB cache hit: ${boardSample.brand} ${boardSample.model}`);
        const specs: EnrichedSpecs = {
          flex: dbHit.flex,
          profile: dbHit.profile as BoardProfile | null,
          shape: dbHit.shape as BoardShape | null,
          category: dbHit.category as BoardCategory | null,
          msrpUsd: dbHit.msrpUsd,
        };
        specCache.set(hash, specs);
        return { hash, specs };
      }

      if (aborted) return { hash, specs: null };

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
          specCache.set(hash, specs);
          setCachedSpecsWithPriority(hash, {
            flex: specs.flex,
            profile: specs.profile,
            shape: specs.shape,
            category: specs.category,
            msrpUsd: specs.msrpUsd,
            source: "review-site",
            sourceUrl: reviewSpec.sourceUrl,
          });
          // Write individual fields to spec_sources
          const sk = specKey(boardSample.brand, boardSample.model, boardSample.gender);
          if (specs.flex !== null) setSpecSource(sk, 'flex', 'review-site', String(specs.flex), reviewSpec.sourceUrl);
          if (specs.profile !== null) setSpecSource(sk, 'profile', 'review-site', specs.profile, reviewSpec.sourceUrl);
          if (specs.shape !== null) setSpecSource(sk, 'shape', 'review-site', specs.shape, reviewSpec.sourceUrl);
          if (specs.category !== null) setSpecSource(sk, 'category', 'review-site', specs.category, reviewSpec.sourceUrl);

          // Store ability level from review site
          if (reviewSpec.abilityLevel) {
            setSpecSource(sk, 'abilityLevel', 'review-site', reviewSpec.abilityLevel, reviewSpec.sourceUrl);
          }

          // Store all extra fields from review site
          for (const [field, value] of Object.entries(reviewSpec.extras)) {
            setSpecSource(sk, field, 'review-site', value, reviewSpec.sourceUrl);
          }
          console.log(`[enrich] Review site hit: ${boardSample.brand} ${boardSample.model}`);
          return { hash, specs };
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

        specCache.set(hash, specs);

        // Persist successful lookups to DB
        if (specs) {
          setCachedSpecsWithPriority(hash, {
            flex: specs.flex,
            profile: specs.profile,
            shape: specs.shape,
            category: specs.category,
            msrpUsd: null,
            source: "llm",
            sourceUrl: null,
          });
          // Write individual fields to spec_sources
          const sk = specKey(boardSample.brand, boardSample.model, boardSample.gender);
          if (specs.flex !== null) setSpecSource(sk, 'flex', 'llm', String(specs.flex));
          if (specs.profile !== null) setSpecSource(sk, 'profile', 'llm', specs.profile);
          if (specs.shape !== null) setSpecSource(sk, 'shape', 'llm', specs.shape);
          if (specs.category !== null) setSpecSource(sk, 'category', 'llm', specs.category);
        }

        return { hash, specs };
      } catch (error) {
        aborted = true;
        console.error("[enrich] LLM call failed, stopping enrichment:", error);
        return { hash, specs: null };
      }
    });

    await Promise.all(lookups);
  }

  // Apply enriched specs to boards
  return boards.map((board) => {
    if (!needsEnrichment(board)) return board;

    const hash = inputHash(board);
    const specs = specCache.get(hash);
    if (!specs) return board;

    return applySpecs(board, specs);
  });
}

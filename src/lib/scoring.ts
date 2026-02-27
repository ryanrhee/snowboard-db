import type { Board, Listing } from "./types";
import type { SpecFitCriteria } from "./profiles";

// Ability levels in ascending order
const ABILITY_ORDER = ["beginner", "intermediate", "advanced", "expert"];

function abilityIndex(level: string | null): number {
  if (!level) return -1;
  return ABILITY_ORDER.indexOf(level);
}

// ===== Deal Score =====

export function calcDealScore(board: Board, bestPrice: number, bestListing: Listing): number {
  // Derive discount percent
  const discountPercent = bestListing.discountPercent ??
    (board.msrpUsd && board.msrpUsd > bestPrice
      ? Math.round(((board.msrpUsd - bestPrice) / board.msrpUsd) * 100)
      : null);

  let score: number;
  if (discountPercent === null || discountPercent <= 0) {
    score = 0.1;
  } else if (discountPercent >= 50) {
    score = 1.0;
  } else if (discountPercent >= 40) {
    score = 0.9;
  } else if (discountPercent >= 30) {
    score = 0.75;
  } else if (discountPercent >= 20) {
    score = 0.55;
  } else if (discountPercent >= 10) {
    score = 0.35;
  } else {
    score = 0.2;
  }

  // Condition bonus for blemished/closeout
  const condition = bestListing.condition?.toLowerCase() ?? "";
  if (condition === "blemished" || condition === "closeout") {
    score = Math.min(1.0, score + 0.1);
  }

  return Math.round(score * 100) / 100;
}

// ===== Core Fit Score =====

export function calcCoreFitScore(board: Board, criteria: SpecFitCriteria): number {
  const dimensions: number[] = [];

  // Flex in range
  if (board.flex !== null) {
    dimensions.push(board.flex >= criteria.flexRange[0] && board.flex <= criteria.flexRange[1] ? 1.0 : 0.0);
  } else {
    dimensions.push(0.5);
  }

  // Profile match
  if (board.profile !== null) {
    dimensions.push(criteria.preferredProfiles.includes(board.profile) ? 1.0 : 0.0);
  } else {
    dimensions.push(0.5);
  }

  // Shape match
  if (board.shape !== null) {
    dimensions.push(criteria.preferredShapes.includes(board.shape) ? 1.0 : 0.0);
  } else {
    dimensions.push(0.5);
  }

  // Category match
  if (board.category !== null) {
    dimensions.push(criteria.preferredCategories.includes(board.category) ? 1.0 : 0.0);
  } else {
    dimensions.push(0.5);
  }

  // Ability overlap
  const boardMin = abilityIndex(board.abilityLevelMin);
  const boardMax = abilityIndex(board.abilityLevelMax);
  const critMin = abilityIndex(criteria.abilityRange[0]);
  const critMax = abilityIndex(criteria.abilityRange[1]);

  if (boardMin === -1 || boardMax === -1) {
    dimensions.push(0.5);
  } else {
    // Check if ranges overlap
    const overlaps = boardMin <= critMax && boardMax >= critMin;
    dimensions.push(overlaps ? 1.0 : 0.0);
  }

  const avg = dimensions.reduce((a, b) => a + b, 0) / dimensions.length;
  return Math.round(avg * 100) / 100;
}

// ===== Versatility Score =====

export function calcVersatilityScore(board: Board, ridingProfile: string): number {
  switch (ridingProfile) {
    case "beginner":
      return versatilityBeginner(board);
    case "intermediate_am_freestyle":
      return versatilityIntermediateSpecialist(board, ["park", "freestyle"]);
    case "intermediate_am_freeride":
      return versatilityIntermediateSpecialist(board, ["freeride", "powder"]);
    case "advanced_freestyle":
      return versatilityAdvancedSpecialist(board, ["park", "freestyle"]);
    case "advanced_freeride":
      return versatilityAdvancedSpecialist(board, ["freeride", "powder"]);
    case "advanced_am":
      return 0; // redundant with fit for AM — weight is 0
    default:
      return versatilityBeginner(board);
  }
}

function versatilityBeginner(board: Board): number {
  const min = abilityIndex(board.abilityLevelMin);
  const max = abilityIndex(board.abilityLevelMax);

  if (min === -1 || max === -1) return 0.5;

  const breadth = max - min + 1;
  if (breadth >= 3) return 1.0;
  if (breadth === 2) return 0.7;
  return 0.4;
}

function versatilityIntermediateSpecialist(board: Board, primaryKeys: string[]): number {
  const ts = board.terrainScores;
  const piste = ts.piste ?? 0;
  const terrainMap: Record<string, number | null> = {
    piste: ts.piste,
    powder: ts.powder,
    park: ts.park,
    freeride: ts.freeride,
    freestyle: ts.freestyle,
  };

  // Must have groomer baseline
  if (piste < 2) return 0.2;

  // Primary terrain lean must score ≥2
  const hasPrimary = primaryKeys.some((k) => (terrainMap[k] ?? 0) >= 2);
  if (!hasPrimary) return 0.3;

  // Bonus for additional terrains scoring ≥2 (excluding piste and primary)
  const otherKeys = Object.keys(terrainMap).filter(
    (k) => k !== "piste" && !primaryKeys.includes(k)
  );
  const extras = otherKeys.filter((k) => (terrainMap[k] ?? 0) >= 2).length;

  return Math.min(1.0, Math.round((0.5 + extras * 0.2) * 100) / 100);
}

function versatilityAdvancedSpecialist(board: Board, primaryKeys: string[]): number {
  const ts = board.terrainScores;
  const terrainMap: Record<string, number | null> = {
    piste: ts.piste,
    powder: ts.powder,
    park: ts.park,
    freeride: ts.freeride,
    freestyle: ts.freestyle,
  };

  // Primary terrain must score ≥2
  const hasPrimary = primaryKeys.some((k) => (terrainMap[k] ?? 0) >= 2);
  if (!hasPrimary) return 0.2;

  // Count non-primary terrains scoring ≥2
  const nonPrimaryKeys = Object.keys(terrainMap).filter((k) => !primaryKeys.includes(k));
  const extras = nonPrimaryKeys.filter((k) => (terrainMap[k] ?? 0) >= 2).length;

  return Math.min(1.0, Math.round((0.5 + extras * 0.15) * 100) / 100);
}

// ===== Per-Profile Weights =====

interface ScoreWeights {
  deal: number;
  fit: number;
  versatility: number;
}

const PROFILE_WEIGHTS: Record<string, ScoreWeights> = {
  beginner:                { deal: 0.50, fit: 0.40, versatility: 0.10 },
  intermediate_am_freestyle: { deal: 0.45, fit: 0.30, versatility: 0.25 },
  intermediate_am_freeride:  { deal: 0.45, fit: 0.30, versatility: 0.25 },
  advanced_freestyle:      { deal: 0.35, fit: 0.45, versatility: 0.20 },
  advanced_freeride:       { deal: 0.35, fit: 0.45, versatility: 0.20 },
  advanced_am:             { deal: 0.35, fit: 0.65, versatility: 0.00 },
};

const DEFAULT_WEIGHTS: ScoreWeights = { deal: 0.40, fit: 0.35, versatility: 0.25 };

// ===== Final Score =====

export function calcFinalScore(deal: number, fit: number, versatility: number, ridingProfile?: string): number {
  const w = ridingProfile ? (PROFILE_WEIGHTS[ridingProfile] ?? DEFAULT_WEIGHTS) : DEFAULT_WEIGHTS;
  const score = w.deal * deal + w.fit * fit + w.versatility * versatility;
  return Math.round(score * 100) / 100;
}

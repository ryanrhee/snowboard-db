import {
  CanonicalBoard,
  BoardProfile,
  BoardShape,
  BoardCategory,
} from "./types";

export interface ScoreFactor {
  name: string;
  value: string;
  score: number;
  reason: string;
}

export interface ScoreResult {
  score: number;
  factors: ScoreFactor[];
}

export interface ScoreNotes {
  beginner: { score: number; factors: ScoreFactor[] };
  value: { score: number; factors: ScoreFactor[] };
  final: { score: number; formula: string };
}

export function calcBeginnerScore(board: CanonicalBoard): ScoreResult {
  const factors: ScoreFactor[] = [];
  let total = 0;
  let weights = 0;

  // Flex: softer is better for beginners (weight: 0.3)
  if (board.flex !== null) {
    let flexScore: number;
    let reason: string;
    if (board.flex <= 2) { flexScore = 0.9; reason = "Very soft flex — forgiving but a bit floppy"; }
    else if (board.flex <= 3) { flexScore = 1.0; reason = "Soft flex — very forgiving for beginners"; }
    else if (board.flex <= 4) { flexScore = 0.9; reason = "Soft-medium flex — forgiving and responsive"; }
    else if (board.flex <= 5) { flexScore = 0.7; reason = "Medium flex — decent for beginners"; }
    else if (board.flex <= 6) { flexScore = 0.5; reason = "Medium-stiff — getting harder to control"; }
    else if (board.flex <= 7) { flexScore = 0.3; reason = "Stiff flex — not beginner-friendly"; }
    else { flexScore = 0.1; reason = "Very stiff — advanced riders only"; }

    total += flexScore * 0.3;
    weights += 0.3;
    factors.push({ name: "Flex", value: `${board.flex}/10`, score: flexScore, reason });
  }

  // Profile: rocker/hybrid-rocker most forgiving (weight: 0.25)
  if (board.profile) {
    let profileScore: number;
    let reason: string;
    switch (board.profile) {
      case BoardProfile.ROCKER:
        profileScore = 1.0; reason = "Rocker — most forgiving, easy turn initiation"; break;
      case BoardProfile.HYBRID_ROCKER:
        profileScore = 0.85; reason = "Hybrid rocker — forgiving with some stability"; break;
      case BoardProfile.FLAT:
        profileScore = 0.7; reason = "Flat — decent forgiveness, good for learning"; break;
      case BoardProfile.HYBRID_CAMBER:
        profileScore = 0.5; reason = "Hybrid camber — less forgiving, more catchy"; break;
      case BoardProfile.CAMBER:
        profileScore = 0.3; reason = "Camber — aggressive, can be catchy for beginners"; break;
      default:
        profileScore = 0.5; reason = "Unknown profile";
    }
    total += profileScore * 0.25;
    weights += 0.25;
    factors.push({ name: "Profile", value: board.profile.replace(/_/g, " "), score: profileScore, reason });
  }

  // Shape: twin shapes easier to learn (weight: 0.2)
  if (board.shape) {
    let shapeScore: number;
    let reason: string;
    switch (board.shape) {
      case BoardShape.TRUE_TWIN:
        shapeScore = 0.9; reason = "True twin — symmetrical, easy to ride switch"; break;
      case BoardShape.DIRECTIONAL_TWIN:
        shapeScore = 0.8; reason = "Directional twin — mostly symmetrical, versatile"; break;
      case BoardShape.DIRECTIONAL:
        shapeScore = 0.5; reason = "Directional — one-way focus, less versatile for learning"; break;
      case BoardShape.TAPERED:
        shapeScore = 0.3; reason = "Tapered — specialized shape, not ideal for beginners"; break;
      default:
        shapeScore = 0.5; reason = "Unknown shape";
    }
    total += shapeScore * 0.2;
    weights += 0.2;
    factors.push({ name: "Shape", value: board.shape.replace(/_/g, " "), score: shapeScore, reason });
  }

  // Category: all-mountain best for beginners (weight: 0.25)
  if (board.category) {
    let catScore: number;
    let reason: string;
    switch (board.category) {
      case BoardCategory.ALL_MOUNTAIN:
        catScore = 1.0; reason = "All-mountain — the best category for learning"; break;
      case BoardCategory.FREESTYLE:
        catScore = 0.7; reason = "Freestyle — playful, works for beginners"; break;
      case BoardCategory.PARK:
        catScore = 0.5; reason = "Park — specialized, less ideal for learning basics"; break;
      case BoardCategory.FREERIDE:
        catScore = 0.3; reason = "Freeride — designed for advanced terrain"; break;
      case BoardCategory.POWDER:
        catScore = 0.2; reason = "Powder — very specialized, not for beginners"; break;
      default:
        catScore = 0.5; reason = "Unknown category";
    }
    total += catScore * 0.25;
    weights += 0.25;
    factors.push({ name: "Category", value: board.category.replace(/_/g, " "), score: catScore, reason });
  }

  // If no specs available, give a neutral default
  if (weights === 0) return { score: 0.5, factors: [] };

  const score = Math.round((total / weights) * 100) / 100;
  return { score, factors };
}

export function calcValueScore(board: CanonicalBoard): ScoreResult {
  const factors: ScoreFactor[] = [];
  let total = 0;
  let weights = 0;

  // Discount percentage (weight: 0.5)
  if (board.discountPercent !== null && board.discountPercent > 0) {
    let discountScore: number;
    let reason: string;
    if (board.discountPercent >= 50) { discountScore = 1.0; reason = "Incredible discount — 50%+ off"; }
    else if (board.discountPercent >= 40) { discountScore = 0.9; reason = "Excellent discount — 40%+ off"; }
    else if (board.discountPercent >= 30) { discountScore = 0.75; reason = "Good sale discount"; }
    else if (board.discountPercent >= 20) { discountScore = 0.55; reason = "Moderate discount"; }
    else if (board.discountPercent >= 10) { discountScore = 0.35; reason = "Small discount"; }
    else { discountScore = 0.2; reason = "Minimal discount"; }

    total += discountScore * 0.5;
    weights += 0.5;
    factors.push({ name: "Discount", value: `${board.discountPercent}% off`, score: discountScore, reason });
  }

  // Absolute price: lower is better value (weight: 0.35)
  if (board.salePriceUsd > 0) {
    let priceScore: number;
    let reason: string;
    if (board.salePriceUsd <= 150) { priceScore = 1.0; reason = "Very affordable price point"; }
    else if (board.salePriceUsd <= 250) { priceScore = 0.85; reason = "Budget-friendly price"; }
    else if (board.salePriceUsd <= 350) { priceScore = 0.65; reason = "Mid-range price"; }
    else if (board.salePriceUsd <= 450) { priceScore = 0.45; reason = "Higher price point"; }
    else if (board.salePriceUsd <= 550) { priceScore = 0.3; reason = "Premium price"; }
    else { priceScore = 0.15; reason = "Expensive — lower value score"; }

    total += priceScore * 0.35;
    weights += 0.35;
    factors.push({ name: "Price", value: `$${board.salePriceUsd.toFixed(0)}`, score: priceScore, reason });
  }

  // Year: newer boards lose less value; older clearance = good value (weight: 0.15)
  if (board.year) {
    const currentYear = new Date().getFullYear();
    const age = currentYear - board.year;
    let yearScore: number;
    let reason: string;
    if (age >= 3) { yearScore = 0.9; reason = `${age} years old — deep clearance pricing`; }
    else if (age >= 2) { yearScore = 0.8; reason = `${age} years old — likely clearance`; }
    else if (age >= 1) { yearScore = 0.6; reason = `${age} year old — last season model`; }
    else { yearScore = 0.4; reason = "Current year — less of a deal"; }

    total += yearScore * 0.15;
    weights += 0.15;
    factors.push({ name: "Model Year", value: `${board.year} (${age}yr old)`, score: yearScore, reason });
  }

  if (weights === 0) return { score: 0.3, factors: [] }; // conservative default

  const score = Math.round((total / weights) * 100) / 100;
  return { score, factors };
}

export function calcFinalScore(
  beginnerScore: number,
  valueScore: number
): number {
  return Math.round((0.6 * beginnerScore + 0.4 * valueScore) * 100) / 100;
}

export function scoreBoard(board: CanonicalBoard): CanonicalBoard {
  const beginnerResult = calcBeginnerScore(board);
  const valueResult = calcValueScore(board);
  const finalScore = calcFinalScore(beginnerResult.score, valueResult.score);

  const scoreNotes: ScoreNotes = {
    beginner: { score: beginnerResult.score, factors: beginnerResult.factors },
    value: { score: valueResult.score, factors: valueResult.factors },
    final: { score: finalScore, formula: "60% beginner + 40% value" },
  };

  return {
    ...board,
    beginnerScore: beginnerResult.score,
    valueScore: valueResult.score,
    finalScore,
    scoreNotes: JSON.stringify(scoreNotes),
  };
}

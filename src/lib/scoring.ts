import {
  CanonicalBoard,
  BoardProfile,
  BoardShape,
  BoardCategory,
} from "./types";

export function calcBeginnerScore(board: CanonicalBoard): number {
  const notes: string[] = [];
  let total = 0;
  let weights = 0;

  // Flex: softer is better for beginners (weight: 0.3)
  if (board.flex !== null) {
    // Ideal beginner flex: 2-5 (soft to medium)
    let flexScore: number;
    if (board.flex <= 2) flexScore = 0.9;
    else if (board.flex <= 3) flexScore = 1.0;
    else if (board.flex <= 4) flexScore = 0.9;
    else if (board.flex <= 5) flexScore = 0.7;
    else if (board.flex <= 6) flexScore = 0.5;
    else if (board.flex <= 7) flexScore = 0.3;
    else flexScore = 0.1;

    total += flexScore * 0.3;
    weights += 0.3;
    notes.push(`flex=${board.flex} (${(flexScore * 100).toFixed(0)}%)`);
  }

  // Profile: rocker/hybrid-rocker most forgiving (weight: 0.25)
  if (board.profile) {
    let profileScore: number;
    switch (board.profile) {
      case BoardProfile.ROCKER:
        profileScore = 1.0;
        break;
      case BoardProfile.HYBRID_ROCKER:
        profileScore = 0.85;
        break;
      case BoardProfile.FLAT:
        profileScore = 0.7;
        break;
      case BoardProfile.HYBRID_CAMBER:
        profileScore = 0.5;
        break;
      case BoardProfile.CAMBER:
        profileScore = 0.3;
        break;
      default:
        profileScore = 0.5;
    }
    total += profileScore * 0.25;
    weights += 0.25;
    notes.push(`profile=${board.profile} (${(profileScore * 100).toFixed(0)}%)`);
  }

  // Shape: twin shapes easier to learn (weight: 0.2)
  if (board.shape) {
    let shapeScore: number;
    switch (board.shape) {
      case BoardShape.TRUE_TWIN:
        shapeScore = 0.9;
        break;
      case BoardShape.DIRECTIONAL_TWIN:
        shapeScore = 0.8;
        break;
      case BoardShape.DIRECTIONAL:
        shapeScore = 0.5;
        break;
      case BoardShape.TAPERED:
        shapeScore = 0.3;
        break;
      default:
        shapeScore = 0.5;
    }
    total += shapeScore * 0.2;
    weights += 0.2;
    notes.push(`shape=${board.shape} (${(shapeScore * 100).toFixed(0)}%)`);
  }

  // Category: all-mountain best for beginners (weight: 0.25)
  if (board.category) {
    let catScore: number;
    switch (board.category) {
      case BoardCategory.ALL_MOUNTAIN:
        catScore = 1.0;
        break;
      case BoardCategory.FREESTYLE:
        catScore = 0.7;
        break;
      case BoardCategory.PARK:
        catScore = 0.5;
        break;
      case BoardCategory.FREERIDE:
        catScore = 0.3;
        break;
      case BoardCategory.POWDER:
        catScore = 0.2;
        break;
      default:
        catScore = 0.5;
    }
    total += catScore * 0.25;
    weights += 0.25;
    notes.push(`category=${board.category} (${(catScore * 100).toFixed(0)}%)`);
  }

  // If no specs available, give a neutral default
  if (weights === 0) return 0.5;

  const score = total / weights;
  return Math.round(score * 100) / 100;
}

export function calcValueScore(board: CanonicalBoard): number {
  const notes: string[] = [];
  let total = 0;
  let weights = 0;

  // Discount percentage (weight: 0.5)
  if (board.discountPercent !== null && board.discountPercent > 0) {
    let discountScore: number;
    if (board.discountPercent >= 50) discountScore = 1.0;
    else if (board.discountPercent >= 40) discountScore = 0.9;
    else if (board.discountPercent >= 30) discountScore = 0.75;
    else if (board.discountPercent >= 20) discountScore = 0.55;
    else if (board.discountPercent >= 10) discountScore = 0.35;
    else discountScore = 0.2;

    total += discountScore * 0.5;
    weights += 0.5;
    notes.push(`discount=${board.discountPercent}% (${(discountScore * 100).toFixed(0)}%)`);
  }

  // Absolute price: lower is better value (weight: 0.35)
  if (board.salePriceUsd > 0) {
    let priceScore: number;
    if (board.salePriceUsd <= 150) priceScore = 1.0;
    else if (board.salePriceUsd <= 250) priceScore = 0.85;
    else if (board.salePriceUsd <= 350) priceScore = 0.65;
    else if (board.salePriceUsd <= 450) priceScore = 0.45;
    else if (board.salePriceUsd <= 550) priceScore = 0.3;
    else priceScore = 0.15;

    total += priceScore * 0.35;
    weights += 0.35;
    notes.push(`price=$${board.salePriceUsd} (${(priceScore * 100).toFixed(0)}%)`);
  }

  // Year: newer boards lose less value; older clearance = good value (weight: 0.15)
  if (board.year) {
    const currentYear = new Date().getFullYear();
    const age = currentYear - board.year;
    let yearScore: number;
    if (age >= 3) yearScore = 0.9; // deep clearance
    else if (age >= 2) yearScore = 0.8;
    else if (age >= 1) yearScore = 0.6;
    else yearScore = 0.4; // current year - less "deal"

    total += yearScore * 0.15;
    weights += 0.15;
    notes.push(`year=${board.year} age=${age} (${(yearScore * 100).toFixed(0)}%)`);
  }

  if (weights === 0) return 0.3; // conservative default

  const score = total / weights;
  return Math.round(score * 100) / 100;
}

export function calcFinalScore(
  beginnerScore: number,
  valueScore: number
): number {
  return Math.round((0.6 * beginnerScore + 0.4 * valueScore) * 100) / 100;
}

export function scoreBoard(board: CanonicalBoard): CanonicalBoard {
  const beginnerScore = calcBeginnerScore(board);
  const valueScore = calcValueScore(board);
  const finalScore = calcFinalScore(beginnerScore, valueScore);

  return {
    ...board,
    beginnerScore,
    valueScore,
    finalScore,
  };
}

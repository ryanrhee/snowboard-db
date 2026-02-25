import {
  Board,
  BoardProfile,
  BoardShape,
  BoardCategory,
  TerrainScores,
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

interface BoardSpecs {
  flex: number | null;
  profile: BoardProfile | string | null;
  shape: BoardShape | string | null;
  category: BoardCategory | string | null;
  terrainScores?: TerrainScores;
}

export function calcBeginnerScore(board: BoardSpecs): ScoreResult {
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

  // Terrain scores: park + piste friendly → beginner-friendly; freeride + powder → less (weight: 0.25)
  const ts = board.terrainScores;
  if (ts && (ts.piste !== null || ts.park !== null || ts.freestyle !== null || ts.freeride !== null || ts.powder !== null)) {
    const p = ts.park ?? 2;
    const f = ts.freestyle ?? 2;
    const pi = ts.piste ?? 2;
    const fr = ts.freeride ?? 2;
    const pw = ts.powder ?? 2;
    // Weighted: park*0.3 + piste*0.3 + freestyle*0.2 + freeride*0.1 + powder*0.1, normalized to 0-1
    const raw = (p * 0.3 + pi * 0.3 + f * 0.2 + fr * 0.1 + pw * 0.1) / 3;
    const terrainScore = Math.round(raw * 100) / 100;
    const labels = [`piste:${pi}`, `park:${p}`, `freestyle:${f}`, `freeride:${fr}`, `powder:${pw}`];
    let reason: string;
    if (terrainScore >= 0.8) reason = "High park/piste terrain — great for beginners";
    else if (terrainScore >= 0.6) reason = "Balanced terrain — decent for beginners";
    else reason = "Freeride/powder focused — less beginner-friendly";
    total += terrainScore * 0.25;
    weights += 0.25;
    factors.push({ name: "Terrain", value: labels.join(" "), score: terrainScore, reason });
  } else if (board.category) {
    // Fallback: category-based scoring if no terrain scores available
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

export function calcFinalScore(
  beginnerScore: number,
  valueScore: number
): number {
  return Math.round((0.6 * beginnerScore + 0.4 * valueScore) * 100) / 100;
}

export function calcBeginnerScoreForBoard(board: Board): number {
  return calcBeginnerScore(board).score;
}

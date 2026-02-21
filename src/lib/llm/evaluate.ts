import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";
import { CanonicalBoard } from "../types";
import { calcBeginnerScore, calcFinalScore } from "../scoring";

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!config.anthropicApiKey) return null;
  if (!client) {
    client = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return client;
}

// Simple in-memory cache for LLM evaluations
const evaluationCache = new Map<string, { beginnerScore: number; reasoning: string }>();

export async function llmEvaluateBoard(
  board: CanonicalBoard
): Promise<{ beginnerScore: number; reasoning: string } | null> {
  // Check cache first
  const cached = evaluationCache.get(board.id);
  if (cached) return cached;

  const anthropic = getClient();
  if (!anthropic) return null;

  try {
    const prompt = buildEvaluationPrompt(board);

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    const result = parseEvaluationResponse(text);
    if (result) {
      evaluationCache.set(board.id, result);
    }
    return result;
  } catch (error) {
    console.error(`[llm] Failed to evaluate board ${board.id}:`, error);
    return null;
  }
}

function buildEvaluationPrompt(board: CanonicalBoard): string {
  return `You are evaluating a snowboard for a beginner rider. Rate how suitable this board is for a beginner on a scale of 0.0 to 1.0, where 1.0 is perfectly suited for beginners and 0.0 is completely unsuitable.

Board specs:
- Brand: ${board.brand}
- Model: ${board.model}
- Year: ${board.year || "Unknown"}
- Length: ${board.lengthCm ? `${board.lengthCm}cm` : "Unknown"}
- Flex: ${board.flex ? `${board.flex}/10` : "Unknown"}
- Profile: ${board.profile || "Unknown"}
- Shape: ${board.shape || "Unknown"}
- Category: ${board.category || "Unknown"}
- Price: $${board.salePriceUsd}

${board.description ? `Description: ${board.description.slice(0, 500)}` : ""}

Respond in exactly this format (no other text):
SCORE: <number between 0.0 and 1.0>
REASONING: <one sentence explaining why>`;
}

function parseEvaluationResponse(
  text: string
): { beginnerScore: number; reasoning: string } | null {
  const scoreMatch = text.match(/SCORE:\s*([\d.]+)/i);
  const reasoningMatch = text.match(/REASONING:\s*(.+)/i);

  if (!scoreMatch) return null;

  const score = parseFloat(scoreMatch[1]);
  if (isNaN(score) || score < 0 || score > 1) return null;

  return {
    beginnerScore: Math.round(score * 100) / 100,
    reasoning: reasoningMatch?.[1]?.trim() || "No reasoning provided",
  };
}

/**
 * Score a board using both heuristic and LLM evaluation.
 * Blends 50/50 if LLM is available, falls back to heuristic only.
 */
export async function scoreBoardWithLlm(
  board: CanonicalBoard
): Promise<CanonicalBoard> {
  const heuristicScore = calcBeginnerScore(board);

  const llmResult = await llmEvaluateBoard(board);

  let beginnerScore: number;
  let scoreNotes: string;

  if (llmResult) {
    // Blend 50/50
    beginnerScore =
      Math.round((0.5 * heuristicScore + 0.5 * llmResult.beginnerScore) * 100) / 100;
    scoreNotes = `heuristic=${heuristicScore}, llm=${llmResult.beginnerScore}: ${llmResult.reasoning}`;
  } else {
    beginnerScore = heuristicScore;
    scoreNotes = `heuristic only (llm unavailable)`;
  }

  const finalScore = calcFinalScore(beginnerScore, board.valueScore);

  return {
    ...board,
    beginnerScore,
    finalScore,
    scoreNotes,
  };
}

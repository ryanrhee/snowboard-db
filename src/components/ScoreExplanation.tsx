"use client";

import { ScoreBar } from "./ScoreBar";

interface ScoreFactor {
  name: string;
  value: string;
  score: number;
  reason: string;
}

interface ScoreNotes {
  beginner: { score: number; factors: ScoreFactor[] };
  value: { score: number; factors: ScoreFactor[] };
  final: { score: number; formula: string };
}

interface ScoreExplanationProps {
  scoreNotes: string;
}

function FactorSection({
  title,
  score,
  factors,
}: {
  title: string;
  score: number;
  factors: ScoreFactor[];
}) {
  return (
    <div className="flex-1 min-w-[260px]">
      <div className="flex items-center gap-2 mb-2">
        <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">
          {title}
        </h4>
        <span className="text-xs text-gray-400">
          — {Math.round(score * 100)}%
        </span>
      </div>
      {factors.length === 0 ? (
        <p className="text-xs text-gray-500 italic">
          No specs available — using neutral default (50%)
        </p>
      ) : (
        <div className="space-y-1.5">
          {factors.map((factor) => (
            <div key={factor.name} className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-300 w-20 shrink-0">
                {factor.name}
              </span>
              <span className="text-xs text-gray-500 w-24 shrink-0 truncate">
                {factor.value}
              </span>
              <div className="w-20 shrink-0">
                <ScoreBar score={factor.score} size="sm" />
              </div>
              <span className="text-xs text-gray-500 truncate">
                {factor.reason}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ScoreExplanation({ scoreNotes }: ScoreExplanationProps) {
  let notes: ScoreNotes;
  try {
    notes = JSON.parse(scoreNotes);
  } catch {
    return (
      <div className="text-xs text-gray-500 italic py-2">
        Score breakdown unavailable
      </div>
    );
  }

  return (
    <div className="bg-gray-800/30 rounded px-4 py-3 space-y-3">
      <div className="flex flex-wrap gap-6">
        <FactorSection
          title="Beginner Score"
          score={notes.beginner.score}
          factors={notes.beginner.factors}
        />
        <FactorSection
          title="Value Score"
          score={notes.value.score}
          factors={notes.value.factors}
        />
      </div>
      <div className="border-t border-gray-700/50 pt-2 flex items-center gap-2">
        <span className="text-xs font-semibold text-gray-300">
          Final Score:
        </span>
        <span className="text-xs text-gray-400">
          {notes.final.formula} ={" "}
          <span className="text-gray-200 font-medium">
            {Math.round(notes.final.score * 100)}%
          </span>
        </span>
      </div>
    </div>
  );
}

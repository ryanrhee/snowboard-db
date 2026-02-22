"use client";

import { useState } from "react";
import { ScoreBar } from "./ScoreBar";
import { ScoreExplanation } from "./ScoreExplanation";

interface BoardDetailProps {
  board: BoardData;
  onClose: () => void;
}

export interface BoardData {
  id: string;
  retailer: string;
  region: string;
  url: string;
  imageUrl: string | null;
  brand: string;
  model: string;
  year: number | null;
  lengthCm: number | null;
  widthMm: number | null;
  flex: number | null;
  profile: string | null;
  shape: string | null;
  category: string | null;
  originalPriceUsd: number | null;
  salePriceUsd: number;
  discountPercent: number | null;
  availability: string;
  description: string | null;
  beginnerScore: number;
  valueScore: number;
  finalScore: number;
  scoreNotes: string | null;
  specSources: string | null;
}

interface SpecFieldInfo {
  resolved: string | number | null;
  resolvedSource: string;
  agreement: boolean;
  sources: { source: string; value: string; sourceUrl?: string }[];
  judgment?: {
    chosenValue: string;
    reasoning: string;
  };
}

const SOURCE_LABELS: Record<string, string> = {
  manufacturer: "Mfgr",
  "review-site": "Review",
  llm: "AI",
  judgment: "Judged",
};

function sourceLabel(source: string): string {
  if (source.startsWith("retailer:")) {
    return source.replace("retailer:", "");
  }
  return SOURCE_LABELS[source] || source;
}

function formatSpecValue(field: string, value: string | number | null): string {
  if (value === null) return "unknown";
  const str = String(value);
  if (field === "flex") return `${str}/10`;
  return str.replace(/_/g, " ");
}

function SpecField({
  field,
  displayValue,
  fieldInfo,
}: {
  field: string;
  displayValue: string | number | null;
  fieldInfo: SpecFieldInfo | undefined;
}) {
  const [showJudgment, setShowJudgment] = useState(false);
  const label = field.charAt(0).toUpperCase() + field.slice(1);

  if (!fieldInfo || fieldInfo.sources.length <= 1) {
    // Single source or no source info — show value normally
    if (displayValue === null) return null;
    return (
      <div>
        <span className="text-gray-400">{label}:</span>{" "}
        {formatSpecValue(field, displayValue)}
      </div>
    );
  }

  const resolved = formatSpecValue(field, fieldInfo.resolved);
  const disagreeing = fieldInfo.sources.filter(
    (s) => s.source !== fieldInfo.resolvedSource && s.source !== "judgment" &&
    s.value !== String(fieldInfo.resolved)
  );

  return (
    <div className="col-span-2">
      <div className="flex items-center gap-2">
        <span className="text-gray-400">{label}:</span>{" "}
        <span>{resolved}</span>
        {fieldInfo.judgment && (
          <button
            onClick={() => setShowJudgment(!showJudgment)}
            className="text-xs text-amber-400 hover:text-amber-300 underline"
          >
            (judged)
          </button>
        )}
      </div>
      {!fieldInfo.agreement && disagreeing.length > 0 && (
        <div className="mt-0.5 space-y-0.5">
          {disagreeing.map((s) => (
            <div key={s.source} className="text-xs text-amber-400/70">
              {sourceLabel(s.source)} says {formatSpecValue(field, s.value)}
            </div>
          ))}
        </div>
      )}
      {showJudgment && fieldInfo.judgment && (
        <div className="mt-1 text-xs text-gray-400 bg-gray-800/50 rounded p-2">
          {fieldInfo.judgment.reasoning}
        </div>
      )}
    </div>
  );
}

export function BoardDetail({ board, onClose }: BoardDetailProps) {
  const specSources: Record<string, SpecFieldInfo> | null = board.specSources
    ? JSON.parse(board.specSources)
    : null;

  const hasSpecSourceData = specSources && Object.values(specSources).some(
    (info) => info.sources.length > 0
  );

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold">
            {board.brand} {board.model}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <div className="p-4 space-y-4">
          {board.imageUrl && (
            <img
              src={board.imageUrl}
              alt={`${board.brand} ${board.model}`}
              className="w-full max-h-64 object-contain bg-gray-800 rounded"
            />
          )}

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-gray-400">Retailer:</span>{" "}
              <span className="capitalize">{board.retailer}</span>
            </div>
            <div>
              <span className="text-gray-400">Region:</span> {board.region}
            </div>
            {board.year && (
              <div>
                <span className="text-gray-400">Year:</span> {board.year}
              </div>
            )}
            {board.lengthCm && (
              <div>
                <span className="text-gray-400">Length:</span> {board.lengthCm}cm
              </div>
            )}
            {board.widthMm && (
              <div>
                <span className="text-gray-400">Width:</span> {board.widthMm}mm
              </div>
            )}

            {hasSpecSourceData ? (
              <>
                <SpecField field="flex" displayValue={board.flex} fieldInfo={specSources?.flex} />
                <SpecField field="profile" displayValue={board.profile} fieldInfo={specSources?.profile} />
                <SpecField field="shape" displayValue={board.shape} fieldInfo={specSources?.shape} />
                <SpecField field="category" displayValue={board.category} fieldInfo={specSources?.category} />
              </>
            ) : (
              <>
                {board.flex && (
                  <div>
                    <span className="text-gray-400">Flex:</span> {board.flex}/10
                  </div>
                )}
                {board.profile && (
                  <div>
                    <span className="text-gray-400">Profile:</span>{" "}
                    {board.profile.replace(/_/g, " ")}
                  </div>
                )}
                {board.shape && (
                  <div>
                    <span className="text-gray-400">Shape:</span>{" "}
                    {board.shape.replace(/_/g, " ")}
                  </div>
                )}
                {board.category && (
                  <div>
                    <span className="text-gray-400">Category:</span>{" "}
                    {board.category.replace(/_/g, " ")}
                  </div>
                )}
              </>
            )}

            <div>
              <span className="text-gray-400">Availability:</span>{" "}
              {board.availability.replace(/_/g, " ")}
            </div>
          </div>

          <div className="border-t border-gray-800 pt-3">
            <div className="flex items-baseline gap-3 mb-3">
              <span className="text-2xl font-bold text-green-400">
                ${board.salePriceUsd.toFixed(2)}
              </span>
              {board.originalPriceUsd && (
                <span className="text-gray-500 line-through">
                  ${board.originalPriceUsd.toFixed(2)}
                </span>
              )}
              {board.discountPercent && (
                <span className="text-sm bg-red-900/50 text-red-300 px-2 py-0.5 rounded">
                  -{board.discountPercent}%
                </span>
              )}
            </div>
          </div>

          <div className="border-t border-gray-800 pt-3 space-y-2">
            <h3 className="text-sm font-medium text-gray-300">Scores</h3>
            <ScoreBar score={board.beginnerScore} label="Bgn" size="md" />
            <ScoreBar score={board.valueScore} label="Val" size="md" />
            <ScoreBar score={board.finalScore} label="Tot" size="md" />
          </div>

          {board.scoreNotes && (
            <div className="border-t border-gray-800 pt-3">
              <h3 className="text-sm font-medium text-gray-300 mb-2">
                Score Breakdown
              </h3>
              <ScoreExplanation scoreNotes={board.scoreNotes} />
            </div>
          )}

          {board.description && (
            <div className="border-t border-gray-800 pt-3">
              <h3 className="text-sm font-medium text-gray-300 mb-1">
                Description
              </h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                {board.description}
              </p>
            </div>
          )}

          <div className="border-t border-gray-800 pt-3">
            <a
              href={board.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-sm transition-colors"
            >
              View on {board.retailer}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

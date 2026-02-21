"use client";

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
}

export function BoardDetail({ board, onClose }: BoardDetailProps) {
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

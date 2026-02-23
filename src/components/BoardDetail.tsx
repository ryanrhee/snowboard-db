"use client";

import { useState } from "react";
import { ScoreBar } from "./ScoreBar";

interface Listing {
  id: string;
  retailer: string;
  region: string;
  url: string;
  imageUrl: string | null;
  lengthCm: number | null;
  widthMm: number | null;
  currency: string;
  originalPrice: number | null;
  salePrice: number;
  originalPriceUsd: number | null;
  salePriceUsd: number;
  discountPercent: number | null;
  availability: string;
  scrapedAt: string;
}

export interface BoardData {
  boardKey: string;
  brand: string;
  model: string;
  year: number | null;
  flex: number | null;
  profile: string | null;
  shape: string | null;
  category: string | null;
  abilityLevelMin: string | null;
  abilityLevelMax: string | null;
  msrpUsd: number | null;
  manufacturerUrl: string | null;
  description: string | null;
  beginnerScore: number;
  listings: Listing[];
  bestPrice: number;
  valueScore: number;
  finalScore: number;
  specSources?: Record<string, SpecSourceEntry[]>;
}

interface SpecSourceEntry {
  source: string;
  value: string;
  sourceUrl?: string;
}

interface BoardDetailProps {
  board: BoardData;
  onClose: () => void;
}

function formatAbilityRange(min: string | null, max: string | null): string | null {
  if (!min) return null;
  if (min === max) return min;
  return `${min} - ${max}`;
}

const SOURCE_LABELS: Record<string, string> = {
  manufacturer: "Mfgr",
  "review-site": "Review",
  llm: "AI",
  judgment: "Judged",
};

const SOURCE_COLORS: Record<string, string> = {
  manufacturer: "bg-emerald-900/60 text-emerald-300 border-emerald-700/50",
  "review-site": "bg-blue-900/60 text-blue-300 border-blue-700/50",
  llm: "bg-purple-900/60 text-purple-300 border-purple-700/50",
  judgment: "bg-amber-900/60 text-amber-300 border-amber-700/50",
};

function sourceLabel(source: string): string {
  if (source.startsWith("retailer:")) {
    return source.replace("retailer:", "");
  }
  return SOURCE_LABELS[source] || source;
}

function sourceColor(source: string): string {
  if (source.startsWith("retailer:")) {
    return "bg-gray-800 text-gray-300 border-gray-600/50";
  }
  return SOURCE_COLORS[source] || "bg-gray-800 text-gray-300 border-gray-600/50";
}

function formatSpecValue(field: string, value: string | number | null): string {
  if (value === null) return "unknown";
  const str = String(value);
  if (field === "flex") return `${str}/10`;
  return str.replace(/_/g, " ");
}

function SourceBadge({ source }: { source: string }) {
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${sourceColor(source)}`}>
      {sourceLabel(source)}
    </span>
  );
}

function SpecField({
  field,
  displayValue,
  entries,
}: {
  field: string;
  displayValue: string | number | null;
  entries: SpecSourceEntry[] | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  const label = field === "abilityLevel"
    ? "Ability Level"
    : field.charAt(0).toUpperCase() + field.slice(1);

  if (!entries || entries.length === 0) {
    if (displayValue === null) return null;
    return (
      <div>
        <span className="text-gray-400">{label}:</span>{" "}
        {formatSpecValue(field, displayValue)}
      </div>
    );
  }

  const topSource = entries[0];

  return (
    <div className="col-span-2">
      <div className="flex items-center gap-2">
        <span className="text-gray-400">{label}:</span>
        <span>{formatSpecValue(field, displayValue)}</span>
        <SourceBadge source={topSource.source} />
        {entries.length > 1 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] text-gray-500 hover:text-gray-300"
          >
            {expanded ? "hide" : `${entries.length} sources`}
          </button>
        )}
      </div>

      {expanded && (
        <div className="mt-1.5 ml-4 space-y-1 border-l border-gray-700 pl-3">
          {entries.map((s) => (
            <div key={s.source} className="flex items-center gap-2 text-xs">
              <SourceBadge source={s.source} />
              <span className="text-gray-300">
                {formatSpecValue(field, s.value)}
              </span>
              {s.sourceUrl && (
                <a
                  href={s.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500/70 hover:text-blue-400 truncate max-w-[200px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  {new URL(s.sourceUrl).hostname.replace("www.", "")}
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function specSourceSummary(specSources?: Record<string, SpecSourceEntry[]>): {
  topSource: string;
  sourceCount: number;
  hasDisagreement: boolean;
} {
  if (!specSources) return { topSource: "", sourceCount: 0, hasDisagreement: false };

  const allSources = new Set<string>();
  let bestSource = "none";
  let bestPriority = -1;

  const PRIORITY: Record<string, number> = {
    manufacturer: 4, "review-site": 3, judgment: 3, llm: 1,
  };

  for (const entries of Object.values(specSources)) {
    for (const s of entries) {
      allSources.add(s.source);
      const p = s.source.startsWith("retailer:") ? 2 : (PRIORITY[s.source] ?? 0);
      if (p > bestPriority) { bestPriority = p; bestSource = s.source; }
    }
  }

  return {
    topSource: bestSource,
    sourceCount: allSources.size,
    hasDisagreement: false,
  };
}

const RETAILER_BADGE_COLOR: Record<string, string> = {
  tactics: "bg-teal-900/50 text-teal-300",
  evo: "bg-purple-900/50 text-purple-300",
  backcountry: "bg-blue-900/50 text-blue-300",
  rei: "bg-green-900/50 text-green-300",
  bestsnowboard: "bg-orange-900/50 text-orange-300",
};

export function BoardDetail({ board, onClose }: BoardDetailProps) {
  const specSources = board.specSources;

  const hasSpecSourceData = specSources && Object.values(specSources).some(
    (entries) => entries.length > 0
  );

  // Collect all unique sources for summary
  const allSources = new Set<string>();
  if (specSources) {
    for (const entries of Object.values(specSources)) {
      for (const s of entries) allSources.add(s.source);
    }
  }

  // Get first image from listings
  const imageUrl = board.listings.find(l => l.imageUrl)?.imageUrl;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <div>
            <h2 className="text-lg font-semibold">
              {board.brand} {board.model}
            </h2>
            {board.manufacturerUrl && (
              <a
                href={board.manufacturerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:text-blue-300"
                onClick={(e) => e.stopPropagation()}
              >
                Manufacturer page
              </a>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <div className="p-4 space-y-4">
          {imageUrl && (
            <img
              src={imageUrl}
              alt={`${board.brand} ${board.model}`}
              className="w-full max-h-64 object-contain bg-gray-800 rounded"
            />
          )}

          <div className="grid grid-cols-2 gap-3 text-sm">
            {board.year && (
              <div>
                <span className="text-gray-400">Year:</span> {board.year}
              </div>
            )}
            {board.msrpUsd && (
              <div>
                <span className="text-gray-400">MSRP:</span> ${board.msrpUsd.toFixed(0)}
              </div>
            )}
          </div>

          {/* Specs with source provenance */}
          <div className="border-t border-gray-800 pt-3">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-sm font-medium text-gray-300">Specs</h3>
              {allSources.size > 0 && (
                <div className="flex gap-1">
                  {Array.from(allSources).map((s) => (
                    <SourceBadge key={s} source={s} />
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {hasSpecSourceData ? (
                <>
                  <SpecField field="flex" displayValue={board.flex} entries={specSources?.flex} />
                  <SpecField field="profile" displayValue={board.profile} entries={specSources?.profile} />
                  <SpecField field="shape" displayValue={board.shape} entries={specSources?.shape} />
                  <SpecField field="category" displayValue={board.category} entries={specSources?.category} />
                  <SpecField field="abilityLevel" displayValue={formatAbilityRange(board.abilityLevelMin, board.abilityLevelMax)} entries={specSources?.abilityLevel} />
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
            </div>
          </div>

          {/* Price summary */}
          <div className="border-t border-gray-800 pt-3">
            <div className="flex items-baseline gap-3 mb-3">
              <span className="text-2xl font-bold text-green-400">
                ${board.bestPrice.toFixed(0)}
              </span>
              {board.msrpUsd && board.msrpUsd > board.bestPrice && (
                <>
                  <span className="text-gray-500 line-through">
                    ${board.msrpUsd.toFixed(0)}
                  </span>
                  <span className="text-sm bg-red-900/50 text-red-300 px-2 py-0.5 rounded">
                    -{Math.round(((board.msrpUsd - board.bestPrice) / board.msrpUsd) * 100)}%
                  </span>
                </>
              )}
              <span className="text-xs text-gray-500">
                from {board.listings.length} listing{board.listings.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>

          <div className="border-t border-gray-800 pt-3 space-y-2">
            <h3 className="text-sm font-medium text-gray-300">Scores</h3>
            <ScoreBar score={board.beginnerScore} label="Bgn" size="md" />
            <ScoreBar score={board.valueScore} label="Val" size="md" />
            <ScoreBar score={board.finalScore} label="Tot" size="md" />
          </div>

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

          {/* Listings table */}
          <div className="border-t border-gray-800 pt-3">
            <h3 className="text-sm font-medium text-gray-300 mb-2">Available From</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="px-2 py-1.5 text-left text-xs text-gray-400">Retailer</th>
                  <th className="px-2 py-1.5 text-left text-xs text-gray-400">Size</th>
                  <th className="px-2 py-1.5 text-left text-xs text-gray-400">Price</th>
                  <th className="px-2 py-1.5 text-left text-xs text-gray-400">Off</th>
                  <th className="px-2 py-1.5 text-left text-xs text-gray-400">Status</th>
                </tr>
              </thead>
              <tbody>
                {board.listings.map((listing) => (
                  <tr key={listing.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="px-2 py-1.5">
                      <a
                        href={listing.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className={`text-xs px-1.5 py-0.5 rounded ${RETAILER_BADGE_COLOR[listing.retailer] || "bg-gray-800 text-gray-300"}`}>
                          {listing.retailer}
                        </span>
                      </a>
                    </td>
                    <td className="px-2 py-1.5 text-gray-300">
                      {listing.lengthCm ? `${listing.lengthCm}cm` : "-"}
                      {listing.widthMm ? ` / ${listing.widthMm}mm` : ""}
                    </td>
                    <td className="px-2 py-1.5">
                      <span className="text-green-400">${listing.salePriceUsd.toFixed(0)}</span>
                      {listing.originalPriceUsd && listing.originalPriceUsd > listing.salePriceUsd && (
                        <span className="text-gray-600 line-through text-xs ml-1">
                          ${listing.originalPriceUsd.toFixed(0)}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      {listing.discountPercent ? (
                        <span className="text-red-400 text-xs">-{listing.discountPercent}%</span>
                      ) : "-"}
                    </td>
                    <td className="px-2 py-1.5 text-xs text-gray-400 capitalize">
                      {listing.availability.replace(/_/g, " ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

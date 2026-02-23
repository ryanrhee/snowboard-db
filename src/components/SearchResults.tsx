"use client";

import { useState } from "react";
import { ScoreBar } from "./ScoreBar";
import { BoardDetail, BoardData, specSourceSummary } from "./BoardDetail";

interface SearchResultsProps {
  boards: BoardData[];
}

type SortKey =
  | "finalScore"
  | "beginnerScore"
  | "valueScore"
  | "bestPrice"
  | "brand";

const SOURCE_SHORT: Record<string, string> = {
  manufacturer: "Mfgr",
  "review-site": "Review",
  llm: "AI",
  judgment: "Judged",
  none: "",
};

const SOURCE_DOT_COLOR: Record<string, string> = {
  manufacturer: "text-emerald-400",
  "review-site": "text-blue-400",
  llm: "text-purple-400",
  judgment: "text-amber-400",
};

function specSourceShort(source: string): string {
  if (source.startsWith("retailer:")) return source.replace("retailer:", "");
  return SOURCE_SHORT[source] || source;
}

function specSourceDotColor(source: string): string {
  if (source.startsWith("retailer:")) return "text-gray-400";
  return SOURCE_DOT_COLOR[source] || "text-gray-500";
}

const retailerBadgeColor = (retailer: string) => {
  const colors: Record<string, string> = {
    tactics: "bg-teal-900/50 text-teal-300",
    evo: "bg-purple-900/50 text-purple-300",
    backcountry: "bg-blue-900/50 text-blue-300",
    rei: "bg-green-900/50 text-green-300",
    bestsnowboard: "bg-orange-900/50 text-orange-300",
  };
  return colors[retailer] || "bg-gray-800 text-gray-300";
};

export function SearchResults({ boards }: SearchResultsProps) {
  const [sortKey, setSortKey] = useState<SortKey>("finalScore");
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedBoard, setSelectedBoard] = useState<BoardData | null>(null);

  const hasSpecs = (b: BoardData) =>
    b.flex !== null && b.profile !== null && b.shape !== null && b.category !== null;

  const completeBoards = boards.filter(hasSpecs);
  const incompleteBoards = boards.filter((b) => !hasSpecs(b));

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(key === "brand");
    }
  };

  const sorted = [...completeBoards].sort((a, b) => {
    let cmp: number;
    switch (sortKey) {
      case "brand":
        cmp = `${a.brand} ${a.model}`.localeCompare(`${b.brand} ${b.model}`);
        break;
      case "bestPrice":
        cmp = a.bestPrice - b.bestPrice;
        break;
      default:
        cmp = (a[sortKey] as number) - (b[sortKey] as number);
    }
    return sortAsc ? cmp : -cmp;
  });

  const SortHeader = ({
    label,
    sortKeyVal,
    className = "",
  }: {
    label: string;
    sortKeyVal: SortKey;
    className?: string;
  }) => (
    <th
      className={`px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-200 select-none ${className}`}
      onClick={() => handleSort(sortKeyVal)}
    >
      {label}
      {sortKey === sortKeyVal && (
        <span className="ml-1">{sortAsc ? "\u25B2" : "\u25BC"}</span>
      )}
    </th>
  );

  if (boards.length === 0) {
    return (
      <div className="text-center text-gray-500 py-12">
        No boards found. Try running a search or adjusting your filters.
      </div>
    );
  }

  const sortedIncomplete = [...incompleteBoards].sort((a, b) => a.bestPrice - b.bestPrice);

  // Get unique retailers across all listings for a board
  const getRetailers = (board: BoardData) => {
    const retailers = new Set(board.listings.map(l => l.retailer));
    return Array.from(retailers);
  };

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-900 z-10">
            <tr className="border-b border-gray-800">
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider w-8">
                #
              </th>
              <SortHeader label="Board" sortKeyVal="brand" />
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Year
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Flex
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Profile
              </th>
              <SortHeader label="Best Price" sortKeyVal="bestPrice" />
              <SortHeader label="Beginner" sortKeyVal="beginnerScore" className="min-w-[100px]" />
              <SortHeader label="Value" sortKeyVal="valueScore" className="min-w-[100px]" />
              <SortHeader label="Score" sortKeyVal="finalScore" className="min-w-[100px]" />
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Retailers
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider" title="Spec data source">
                Specs
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((board, idx) => {
              const isHighScore = board.finalScore >= 0.7;
              const summary = specSourceSummary(board.specSources);
              const retailers = getRetailers(board);
              const bestListing = board.listings.reduce((best, l) =>
                l.salePriceUsd < best.salePriceUsd ? l : best, board.listings[0]);
              const discountPercent = bestListing.discountPercent ??
                (board.msrpUsd && board.msrpUsd > board.bestPrice
                  ? Math.round(((board.msrpUsd - board.bestPrice) / board.msrpUsd) * 100)
                  : null);

              return (
                <tr
                  key={board.boardKey}
                  className={`border-b border-gray-800/50 hover:bg-gray-800/50 cursor-pointer transition-colors ${
                    isHighScore ? "bg-green-950/20" : ""
                  }`}
                  onClick={() => setSelectedBoard(board)}
                >
                  <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                  <td className="px-3 py-2">
                    <div>
                      <span className="font-medium">{board.brand}</span>{" "}
                      <span className="text-gray-300">{board.model}</span>
                    </div>
                    {board.manufacturerUrl && (
                      <a
                        href={board.manufacturerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-blue-500/60 hover:text-blue-400"
                        onClick={(e) => e.stopPropagation()}
                      >
                        mfgr
                      </a>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-400">
                    {board.year || "-"}
                  </td>
                  <td className="px-3 py-2 text-gray-300">
                    {board.flex ? `${board.flex}/10` : "-"}
                  </td>
                  <td className="px-3 py-2 text-gray-400 capitalize text-xs">
                    {board.profile?.replace(/_/g, " ") || "-"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-baseline gap-1">
                      <span className="text-green-400 font-medium">
                        ${board.bestPrice.toFixed(0)}
                      </span>
                      {board.msrpUsd && board.msrpUsd > board.bestPrice && (
                        <span className="text-gray-600 line-through text-xs">
                          ${board.msrpUsd.toFixed(0)}
                        </span>
                      )}
                    </div>
                    {discountPercent && discountPercent > 0 && (
                      <span className="text-red-400 text-xs">
                        -{discountPercent}%
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <ScoreBar score={board.beginnerScore} />
                  </td>
                  <td className="px-3 py-2">
                    <ScoreBar score={board.valueScore} />
                  </td>
                  <td className="px-3 py-2">
                    <ScoreBar score={board.finalScore} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {retailers.map((r) => (
                        <span
                          key={r}
                          className={`text-xs px-1.5 py-0.5 rounded ${retailerBadgeColor(r)}`}
                        >
                          {r}
                        </span>
                      ))}
                      {board.listings.length > retailers.length && (
                        <span className="text-[10px] text-gray-500">
                          ({board.listings.length})
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {summary.sourceCount > 0 ? (
                      <span className="flex items-center gap-1" title={`Best source: ${specSourceShort(summary.topSource)}${summary.sourceCount > 1 ? `, ${summary.sourceCount} sources` : ""}`}>
                        <span className={`text-sm ${specSourceDotColor(summary.topSource)}`}>&#9679;</span>
                        <span className="text-[10px] text-gray-400">
                          {specSourceShort(summary.topSource)}
                        </span>
                        {summary.hasDisagreement && (
                          <span className="text-amber-500 text-xs" title="Sources disagree on some specs">!</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-gray-600 text-xs">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {incompleteBoards.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-sm font-medium text-yellow-400/80">
              Missing Spec Data
            </h3>
            <span className="text-xs text-gray-500">
              {incompleteBoards.length} board{incompleteBoards.length !== 1 ? "s" : ""} &mdash; scores may be inaccurate
            </span>
          </div>
          <div className="overflow-x-auto opacity-70">
            <table className="w-full text-sm">
              <thead className="bg-gray-900">
                <tr className="border-b border-gray-800">
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-8">#</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Board</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Year</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Flex</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Profile</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Best Price</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Retailers</th>
                </tr>
              </thead>
              <tbody>
                {sortedIncomplete.map((board, idx) => {
                  const retailers = getRetailers(board);
                  return (
                    <tr
                      key={board.boardKey}
                      className="border-b border-gray-800/50 hover:bg-gray-800/50 cursor-pointer transition-colors"
                      onClick={() => setSelectedBoard(board)}
                    >
                      <td className="px-3 py-2 text-gray-600">{idx + 1}</td>
                      <td className="px-3 py-2">
                        <span className="font-medium">{board.brand}</span>{" "}
                        <span className="text-gray-400">{board.model}</span>
                      </td>
                      <td className="px-3 py-2 text-gray-500">{board.year || "-"}</td>
                      <td className="px-3 py-2 text-gray-400">
                        {board.flex ? `${board.flex}/10` : "-"}
                      </td>
                      <td className="px-3 py-2 text-gray-500 capitalize text-xs">
                        {board.profile?.replace(/_/g, " ") || "-"}
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-green-400/70 font-medium">
                          ${board.bestPrice.toFixed(0)}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {retailers.map((r) => (
                            <span
                              key={r}
                              className={`text-xs px-1.5 py-0.5 rounded ${retailerBadgeColor(r)}`}
                            >
                              {r}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedBoard && (
        <BoardDetail
          board={selectedBoard}
          onClose={() => setSelectedBoard(null)}
        />
      )}
    </>
  );
}

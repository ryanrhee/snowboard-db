"use client";

import { useState } from "react";
import { ScoreBar } from "./ScoreBar";
import { BoardDetail, BoardData } from "./BoardDetail";

interface SearchResultsProps {
  boards: BoardData[];
}

type SortKey =
  | "finalScore"
  | "beginnerScore"
  | "valueScore"
  | "salePriceUsd"
  | "discountPercent"
  | "lengthCm"
  | "brand";

export function SearchResults({ boards }: SearchResultsProps) {
  const [sortKey, setSortKey] = useState<SortKey>("finalScore");
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedBoard, setSelectedBoard] = useState<BoardData | null>(null);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(key === "brand" || key === "lengthCm"); // alpha/length ascending by default
    }
  };

  const sorted = [...boards].sort((a, b) => {
    let cmp: number;
    switch (sortKey) {
      case "brand":
        cmp = `${a.brand} ${a.model}`.localeCompare(`${b.brand} ${b.model}`);
        break;
      case "salePriceUsd":
        cmp = a.salePriceUsd - b.salePriceUsd;
        break;
      case "discountPercent":
        cmp = (a.discountPercent || 0) - (b.discountPercent || 0);
        break;
      case "lengthCm":
        cmp = (a.lengthCm || 0) - (b.lengthCm || 0);
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

  if (boards.length === 0) {
    return (
      <div className="text-center text-gray-500 py-12">
        No boards found. Try running a search or adjusting your filters.
      </div>
    );
  }

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
              <SortHeader label="Length" sortKeyVal="lengthCm" />
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Flex
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Profile
              </th>
              <SortHeader label="Price" sortKeyVal="salePriceUsd" />
              <SortHeader label="Off" sortKeyVal="discountPercent" />
              <SortHeader label="Beginner" sortKeyVal="beginnerScore" className="min-w-[100px]" />
              <SortHeader label="Value" sortKeyVal="valueScore" className="min-w-[100px]" />
              <SortHeader label="Score" sortKeyVal="finalScore" className="min-w-[100px]" />
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Source
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((board, idx) => {
              const isHighScore = board.finalScore >= 0.7;
              return (
                <tr
                  key={board.id}
                  className={`border-b border-gray-800/50 hover:bg-gray-800/50 cursor-pointer transition-colors ${
                    isHighScore ? "bg-green-950/20" : ""
                  }`}
                  onClick={() => setSelectedBoard(board)}
                >
                  <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                  <td className="px-3 py-2">
                    <a
                      href={board.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="font-medium">{board.brand}</span>{" "}
                      <span className="text-gray-300">{board.model}</span>
                    </a>
                  </td>
                  <td className="px-3 py-2 text-gray-400">
                    {board.year || "-"}
                  </td>
                  <td className="px-3 py-2 text-gray-300">
                    {board.lengthCm ? `${board.lengthCm}cm` : "-"}
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
                        ${board.salePriceUsd.toFixed(0)}
                      </span>
                      {board.originalPriceUsd && (
                        <span className="text-gray-600 line-through text-xs">
                          ${board.originalPriceUsd.toFixed(0)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {board.discountPercent ? (
                      <span className="text-red-400 text-xs">
                        -{board.discountPercent}%
                      </span>
                    ) : (
                      "-"
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
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${retailerBadgeColor(
                        board.retailer
                      )}`}
                    >
                      {board.retailer}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedBoard && (
        <BoardDetail
          board={selectedBoard}
          onClose={() => setSelectedBoard(null)}
        />
      )}
    </>
  );
}

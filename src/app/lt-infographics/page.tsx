"use client";

import { useState, useEffect } from "react";

interface BarAnalysis {
  themeColor: [number, number, number];
  colorFamily: string;
  colorStartPct: number;
  colorEndPct: number;
  fitError: number;
}

interface InfographicAnalysis {
  terrain: BarAnalysis;
  riderLevel: BarAnalysis;
  flex: BarAnalysis;
}

interface InfographicEntry {
  boardName: string;
  imgUrl: string;
  abilityLevel: string | null;
  analysis: InfographicAnalysis | null;
}

const LEVEL_COLORS: Record<string, string> = {
  "beginner-intermediate": "bg-green-800 text-green-200",
  "beginner-advanced": "bg-blue-800 text-blue-200",
  "intermediate-advanced": "bg-orange-800 text-orange-200",
};

const GRAY_BASE = [148, 149, 152];

/** Render a single gradient bar as a CSS linear-gradient reconstruction. */
function ReconstructedBar({
  bar,
  label,
  labels,
}: {
  bar: BarAnalysis;
  label: string;
  labels: [string, string, string];
}) {
  const [r, g, b] = bar.themeColor;
  const [gr, gg, gb] = GRAY_BASE;
  const colorStr = `rgb(${r},${g},${b})`;
  const grayStr = `rgb(${gr},${gg},${gb})`;

  // Build CSS linear-gradient matching the fitted trapezoidal model
  const gradient = `linear-gradient(to right, ${grayStr} 0%, ${grayStr} ${Math.max(0, bar.colorStartPct - 15)}%, ${colorStr} ${bar.colorStartPct}%, ${colorStr} ${bar.colorEndPct}%, ${grayStr} ${Math.min(100, bar.colorEndPct + 15)}%, ${grayStr} 100%)`;

  return (
    <div className="mb-2">
      <div className="text-xs text-gray-500 mb-0.5 font-medium">{label}</div>
      <div
        className="h-5 rounded relative"
        style={{ background: gradient }}
      >
        {/* Label positions */}
        <span className="absolute left-1 top-0 text-[9px] font-bold text-black/70 leading-5">
          {labels[0]}
        </span>
        <span className="absolute left-1/2 -translate-x-1/2 top-0 text-[9px] font-bold text-black/70 leading-5">
          {labels[1]}
        </span>
        <span className="absolute right-1 top-0 text-[9px] font-bold text-black/70 leading-5">
          {labels[2]}
        </span>
      </div>
      <div className="text-[10px] text-gray-500 mt-0.5 tabular-nums">
        {bar.colorFamily} | {bar.colorStartPct}–{bar.colorEndPct}% | err {bar.fitError}
      </div>
    </div>
  );
}

export default function LtInfographicsPage() {
  const [entries, setEntries] = useState<InfographicEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"name" | "riderStart" | "riderEnd">(
    "riderStart"
  );

  useEffect(() => {
    fetch("/api/lt-infographics")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => setEntries(data.results))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const sorted = [...entries].sort((a, b) => {
    if (sortBy === "riderStart") {
      const aS = a.analysis?.riderLevel.colorStartPct ?? 50;
      const bS = b.analysis?.riderLevel.colorStartPct ?? 50;
      return aS - bS;
    }
    if (sortBy === "riderEnd") {
      const aE = a.analysis?.riderLevel.colorEndPct ?? 50;
      const bE = b.analysis?.riderLevel.colorEndPct ?? 50;
      return aE - bE;
    }
    return a.boardName.localeCompare(b.boardName);
  });

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-[1600px] mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold mb-1">
          Lib Tech Infographic Audit
        </h1>
        <p className="text-gray-400 text-sm">
          Each infographic bar is a linear blend from gray (148,149,153) to a
          theme color. The &ldquo;Reconstructed&rdquo; column shows the fitted
          gradient and the range where the color is at full intensity.
        </p>
      </header>

      {loading && (
        <p className="text-gray-400">
          Loading (fetching + analyzing images)...
        </p>
      )}
      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded text-red-300 text-sm">
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="flex gap-3 mb-4 text-sm">
            <span className="text-gray-400">Sort by:</span>
            {(
              [
                ["riderStart", "Rider color start"],
                ["riderEnd", "Rider color end"],
                ["name", "Name"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSortBy(key)}
                className={`px-2 py-0.5 rounded ${sortBy === key ? "bg-blue-700 text-white" : "bg-gray-700 text-gray-300"}`}
              >
                {label}
              </button>
            ))}
          </div>

          <p className="text-gray-400 text-sm mb-4">
            {entries.length} boards
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-700 text-left text-gray-400">
                  <th className="py-2 pr-4 w-44">Board</th>
                  <th className="py-2 pr-4 w-48">Original</th>
                  <th className="py-2 pr-4 w-64">Reconstructed</th>
                  <th className="py-2 w-28">Mapped Level</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((entry) => (
                  <tr
                    key={entry.imgUrl}
                    className="border-b border-gray-800 hover:bg-gray-800/50 align-top"
                  >
                    <td className="py-3 pr-4 font-medium">
                      {entry.boardName}
                    </td>
                    <td className="py-3 pr-4">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={entry.imgUrl}
                        alt={`${entry.boardName} infographic`}
                        className="h-28 w-auto"
                        loading="lazy"
                      />
                    </td>
                    <td className="py-3 pr-4">
                      {entry.analysis ? (
                        <div className="w-56">
                          <ReconstructedBar
                            bar={entry.analysis.terrain}
                            label="TERRAIN"
                            labels={["PARK", "RESORT", "BACKCOUNTRY"]}
                          />
                          <ReconstructedBar
                            bar={entry.analysis.riderLevel}
                            label="RIDER LEVEL"
                            labels={["DAY 1", "INTERMEDIATE", "ADVANCED"]}
                          />
                          <ReconstructedBar
                            bar={entry.analysis.flex}
                            label="FLEX"
                            labels={["SOFT", "MEDIUM", "FIRM"]}
                          />
                        </div>
                      ) : (
                        <span className="text-gray-500 text-xs">
                          no analysis
                        </span>
                      )}
                    </td>
                    <td className="py-3">
                      {entry.abilityLevel ? (
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${LEVEL_COLORS[entry.abilityLevel] || "bg-gray-700 text-gray-300"}`}
                        >
                          {entry.abilityLevel}
                        </span>
                      ) : (
                        <span className="px-2 py-1 rounded text-xs font-medium bg-red-900/50 text-red-300 border border-red-700">
                          unmapped
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

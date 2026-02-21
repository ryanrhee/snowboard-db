"use client";

interface RunHistoryProps {
  runs: RunSummary[];
  currentRunId: string | null;
  onSelectRun: (runId: string) => void;
}

export interface RunSummary {
  id: string;
  timestamp: string;
  boardCount: number;
  retailersQueried: string;
}

export function RunHistory({ runs, currentRunId, onSelectRun }: RunHistoryProps) {
  if (runs.length === 0) return null;

  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">Past Runs</label>
      <select
        value={currentRunId || ""}
        onChange={(e) => onSelectRun(e.target.value)}
        className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500 max-w-xs"
      >
        {runs.map((run) => (
          <option key={run.id} value={run.id}>
            {new Date(run.timestamp).toLocaleString()} — {run.boardCount} boards (
            {run.retailersQueried})
          </option>
        ))}
      </select>
    </div>
  );
}

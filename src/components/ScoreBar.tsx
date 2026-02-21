"use client";

interface ScoreBarProps {
  score: number; // 0-1
  label?: string;
  size?: "sm" | "md";
}

export function ScoreBar({ score, label, size = "sm" }: ScoreBarProps) {
  const percentage = Math.round(score * 100);

  let color: string;
  if (score >= 0.7) color = "bg-green-500";
  else if (score >= 0.5) color = "bg-yellow-500";
  else if (score >= 0.3) color = "bg-orange-500";
  else color = "bg-red-500";

  const height = size === "sm" ? "h-2" : "h-3";

  return (
    <div className="flex items-center gap-1.5">
      {label && (
        <span className="text-xs text-gray-400 w-6 text-right shrink-0">
          {label}
        </span>
      )}
      <div className={`flex-1 ${height} bg-gray-700 rounded-full overflow-hidden min-w-[40px]`}>
        <div
          className={`${height} ${color} rounded-full transition-all`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-xs text-gray-300 w-8 text-right shrink-0">
        {percentage}
      </span>
    </div>
  );
}

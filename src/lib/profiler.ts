/**
 * Lightweight profiling for pipeline runs.
 * Records phase name + elapsed ms, then prints a summary table.
 */

interface TimerEntry {
  label: string;
  startMs: number;
  endMs?: number;
  meta?: Record<string, number | string>;
}

class PipelineProfiler {
  private timers: TimerEntry[] = [];
  private active = new Map<string, TimerEntry>();

  start(label: string): void {
    const entry: TimerEntry = { label, startMs: Date.now() };
    this.active.set(label, entry);
    this.timers.push(entry);
  }

  stop(label: string, meta?: Record<string, number | string>): number {
    const entry = this.active.get(label);
    if (!entry) {
      console.warn(`[profiler] No active timer for "${label}"`);
      return 0;
    }
    entry.endMs = Date.now();
    if (meta) entry.meta = { ...entry.meta, ...meta };
    this.active.delete(label);
    return entry.endMs - entry.startMs;
  }

  /** Wrap an async operation with timing */
  async time<T>(label: string, fn: () => Promise<T>, meta?: Record<string, number | string>): Promise<T> {
    this.start(label);
    try {
      const result = await fn();
      this.stop(label, meta);
      return result;
    } catch (err) {
      this.stop(label, { error: "failed" });
      throw err;
    }
  }

  /** Wrap a sync operation with timing */
  timeSync<T>(label: string, fn: () => T, meta?: Record<string, number | string>): T {
    this.start(label);
    try {
      const result = fn();
      this.stop(label, meta);
      return result;
    } catch (err) {
      this.stop(label, { error: "failed" });
      throw err;
    }
  }

  /** Print summary sorted by duration, with indentation for sub-phases */
  printSummary(): void {
    const completed = this.timers
      .filter((t) => t.endMs !== undefined)
      .map((t) => ({
        label: t.label,
        durationMs: t.endMs! - t.startMs,
        meta: t.meta,
      }));

    if (completed.length === 0) return;

    // Build tree structure based on label prefixes
    const topLevel = completed.filter((t) => !t.label.includes(":") || isTopLevel(t.label));

    console.log("\n=== Pipeline Profile ===");

    // Sort top-level by duration descending
    const pipelineEntries = completed.filter((t) => t.label.startsWith("pipeline:"));
    const scraperEntries = completed.filter((t) => t.label.startsWith("scraper:"));
    const coalesceEntries = completed.filter((t) => t.label.startsWith("coalesce:"));
    const resolveEntries = completed.filter((t) => t.label.startsWith("resolve:"));
    const reviewEntries = completed.filter((t) => t.label.startsWith("review:"));
    const dbEntries = completed.filter((t) => t.label.startsWith("db:"));

    // Print pipeline phases, sorted by duration
    const allTopLevel = [
      ...pipelineEntries,
    ].sort((a, b) => b.durationMs - a.durationMs);

    for (const entry of allTopLevel) {
      printEntry(entry, 0);

      // Print sub-phases for specific top-level entries
      if (entry.label === "pipeline:scrape") {
        // Group scrapers: scraper:<name>:total
        const scraperTotals = scraperEntries
          .filter((s) => s.label.endsWith(":total"))
          .sort((a, b) => b.durationMs - a.durationMs);

        for (const scraper of scraperTotals) {
          printEntry(scraper, 1);
          // Sub-phases for this scraper
          const prefix = scraper.label.replace(":total", ":");
          const subPhases = scraperEntries
            .filter((s) => s.label.startsWith(prefix) && !s.label.endsWith(":total"))
            .sort((a, b) => b.durationMs - a.durationMs);
          for (const sub of subPhases) {
            printEntry(sub, 2);
          }
        }
      } else if (entry.label === "pipeline:coalesce") {
        for (const sub of coalesceEntries.sort((a, b) => b.durationMs - a.durationMs)) {
          printEntry(sub, 1);
        }
      } else if (entry.label === "pipeline:resolve") {
        for (const sub of resolveEntries.sort((a, b) => b.durationMs - a.durationMs)) {
          printEntry(sub, 1);
        }
      } else if (entry.label === "pipeline:review-enrich") {
        for (const sub of reviewEntries.sort((a, b) => b.durationMs - a.durationMs).slice(0, 10)) {
          printEntry(sub, 1);
        }
        const remaining = reviewEntries.length - 10;
        if (remaining > 0) {
          console.log(`    ... and ${remaining} more`);
        }
      } else if (entry.label === "pipeline:db-write") {
        for (const sub of dbEntries.sort((a, b) => b.durationMs - a.durationMs)) {
          printEntry(sub, 1);
        }
      }
    }

    console.log("");
  }

  reset(): void {
    this.timers = [];
    this.active.clear();
  }
}

function isTopLevel(label: string): boolean {
  return label.startsWith("pipeline:");
}

function printEntry(
  entry: { label: string; durationMs: number; meta?: Record<string, number | string> },
  indent: number
): void {
  const pad = "  ".repeat(indent);
  const label = entry.label.padEnd(45 - indent * 2);
  const duration = `${entry.durationMs}ms`.padStart(8);
  const metaStr = entry.meta
    ? "  " + Object.entries(entry.meta).map(([k, v]) => `${k}=${v}`).join(", ")
    : "";
  console.log(`${pad}${label} ${duration}${metaStr}`);
}

// Singleton profiler instance
export const profiler = new PipelineProfiler();

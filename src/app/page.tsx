"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { SearchResults } from "@/components/SearchResults";
import { Filters, FilterState, DEFAULT_FILTERS } from "@/components/Filters";
import { RunHistory, RunSummary } from "@/components/RunHistory";
import { BoardData } from "@/components/BoardDetail";

interface SearchRunData {
  id: string;
  timestamp: string;
  boardCount: number;
  retailersQueried: string;
  durationMs: number;
}

interface ProfileData {
  id: number;
  name: string;
  genderFilter: string;
  ridingProfile: string;
  filterDefaults: {
    gender: string;
    abilityLevel: string;
  };
}

export default function Home() {
  const [boards, setBoards] = useState<BoardData[]>([]);
  const [currentRun, setCurrentRun] = useState<SearchRunData | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [profiles, setProfiles] = useState<ProfileData[]>([]);
  const profilesRef = useRef<ProfileData[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadResults = useCallback(
    async (runId?: string) => {
      try {
        const params = new URLSearchParams();
        if (runId) params.set("runId", runId);
        if (filters.region) params.set("region", filters.region);
        if (filters.maxPrice) params.set("maxPrice", filters.maxPrice);
        if (filters.minLength) params.set("minLength", filters.minLength);
        if (filters.maxLength) params.set("maxLength", filters.maxLength);
        if (filters.gender) params.set("gender", filters.gender);
        if (filters.abilityLevel) params.set("abilityLevel", filters.abilityLevel);
        if (activeProfileId !== null) {
          const activeProfile = profilesRef.current.find(p => p.id === activeProfileId);
          if (activeProfile) params.set("profile", activeProfile.ridingProfile);
        }

        const res = await fetch(`/api/boards?${params}`);
        const data = await res.json();

        if (data.error) {
          setError(data.error);
          return;
        }

        setBoards(data.boards || []);
        setCurrentRun(data.run || null);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load results");
      }
    },
    [filters, activeProfileId]
  );

  const loadRuns = async () => {
    try {
      const res = await fetch("/api/boards?listRuns=true");
      const data = await res.json();
      setRuns(data.runs || []);
    } catch {
      // silent fail for run history
    }
  };

  const loadProfiles = async () => {
    try {
      const res = await fetch("/api/profiles");
      const data = await res.json();
      const loaded = data.profiles || [];
      profilesRef.current = loaded;
      setProfiles(loaded);
    } catch {
      // silent fail for profiles
    }
  };

  useEffect(() => {
    loadResults();
    loadRuns();
    loadProfiles();
  }, [loadResults]);

  const handleSearch = async () => {
    setSearching(true);
    setError(null);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();

      if (data.error) {
        setError(data.error);
        return;
      }

      setBoards(data.boards || []);
      setCurrentRun(data.run || null);

      if (data.errors?.length > 0) {
        const errMsgs = data.errors
          .map((e: { retailer: string; error: string }) => `${e.retailer}: ${e.error}`)
          .join("; ");
        setError(`Partial results. Errors: ${errMsgs}`);
      }

      await loadRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  };

  const handleRefresh = async () => {
    if (!currentRun) return;
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: currentRun.id }),
      });
      const data = await res.json();

      if (data.error) {
        setError(data.error);
        return;
      }

      setBoards(data.boards || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  const handleSelectRun = (runId: string) => {
    loadResults(runId);
  };

  const handleFilterChange = (newFilters: FilterState) => {
    setFilters(newFilters);
    setActiveProfileId(null);
  };

  const handleSelectProfile = (profile: ProfileData) => {
    setActiveProfileId(profile.id);
    setFilters({
      ...filters,
      gender: profile.filterDefaults.gender,
      abilityLevel: profile.filterDefaults.abilityLevel,
    });
  };

  const handleClearProfile = () => {
    setActiveProfileId(null);
    setFilters(DEFAULT_FILTERS);
  };

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-[1400px] mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold mb-1">Snowboard Deal Finder</h1>
        <p className="text-gray-400 text-sm">
          Find the best beginner snowboard deals across retailers
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <button
          onClick={handleSearch}
          disabled={searching}
          className="bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:text-gray-400 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
        >
          {searching ? "Searching..." : "Run Search"}
        </button>

        <button
          onClick={handleRefresh}
          disabled={refreshing || !currentRun}
          className="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
        >
          {refreshing ? "Refreshing..." : "Refresh Prices"}
        </button>

        {runs.length > 0 && (
          <RunHistory
            runs={runs}
            currentRunId={currentRun?.id || null}
            onSelectRun={handleSelectRun}
          />
        )}

        {currentRun && (
          <span className="text-xs text-gray-500 ml-auto">
            {boards.length} boards &middot;{" "}
            {new Date(currentRun.timestamp).toLocaleString()} &middot;{" "}
            {currentRun.durationMs}ms
          </span>
        )}
      </div>

      {profiles.length > 0 && (
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-gray-400">Rider:</span>
          <button
            onClick={handleClearProfile}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              activeProfileId === null
                ? "bg-blue-600 text-white"
                : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            }`}
          >
            All
          </button>
          {profiles.map((profile) => (
            <button
              key={profile.id}
              onClick={() => handleSelectProfile(profile)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                activeProfileId === profile.id
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700"
              }`}
            >
              {profile.name}
            </button>
          ))}
        </div>
      )}

      <div className="mb-4">
        <Filters filters={filters} onFilterChange={handleFilterChange} />
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded text-red-300 text-sm">
          {error}
        </div>
      )}

      <SearchResults boards={boards} />
    </div>
  );
}

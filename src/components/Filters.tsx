"use client";

interface FiltersProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
}

export interface FilterState {
  region: string;
  maxPrice: string;
  minLength: string;
  maxLength: string;
  gender: string;
  abilityLevel: string;
}

export const DEFAULT_FILTERS: FilterState = {
  region: "",
  maxPrice: "",
  minLength: "",
  maxLength: "",
  gender: "",
  abilityLevel: "",
};

export function Filters({ filters, onFilterChange }: FiltersProps) {
  const updateFilter = (key: keyof FilterState, value: string) => {
    const newFilters = { ...filters, [key]: value };
    onFilterChange(newFilters);
  };

  const resetFilters = () => {
    onFilterChange(DEFAULT_FILTERS);
  };

  const hasActiveFilters = Object.values(filters).some((v) => v !== "");

  return (
    <div className="flex flex-wrap items-end gap-3 p-4 bg-gray-900 rounded-lg border border-gray-800">
      <div>
        <label className="block text-xs text-gray-400 mb-1">Region</label>
        <select
          value={filters.region}
          onChange={(e) => updateFilter("region", e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
        >
          <option value="">All</option>
          <option value="US">US</option>
          <option value="KR">KR</option>
        </select>
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1">Max Price ($)</label>
        <input
          type="number"
          placeholder="650"
          value={filters.maxPrice}
          onChange={(e) => updateFilter("maxPrice", e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200 w-24 focus:outline-none focus:border-blue-500"
        />
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1">Min Length (cm)</label>
        <input
          type="number"
          placeholder="155"
          value={filters.minLength}
          onChange={(e) => updateFilter("minLength", e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200 w-24 focus:outline-none focus:border-blue-500"
        />
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1">Max Length (cm)</label>
        <input
          type="number"
          placeholder="161"
          value={filters.maxLength}
          onChange={(e) => updateFilter("maxLength", e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200 w-24 focus:outline-none focus:border-blue-500"
        />
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1">Gender</label>
        <select
          value={filters.gender}
          onChange={(e) => updateFilter("gender", e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
        >
          <option value="">All Genders</option>
          <option value="unisex+womens">Unisex + Women&apos;s</option>
          <option value="womens">Women&apos;s</option>
          <option value="kids">Kids&apos;</option>
        </select>
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1">Ability Level</label>
        <select
          value={filters.abilityLevel}
          onChange={(e) => updateFilter("abilityLevel", e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
        >
          <option value="">All Levels</option>
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced / Expert</option>
        </select>
      </div>

      {hasActiveFilters && (
        <button
          onClick={resetFilters}
          className="text-xs text-gray-400 hover:text-gray-200 underline py-1.5"
        >
          Reset
        </button>
      )}
    </div>
  );
}

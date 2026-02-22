import { Region } from "../types";
import { RetailerModule } from "./types";
import { tactics } from "./tactics";
import { evo } from "./evo";
import { backcountry } from "./backcountry";
import { rei } from "./rei";
import { bestsnowboard } from "./bestsnowboard";

const ALL_RETAILERS: RetailerModule[] = [tactics, evo, backcountry, rei, bestsnowboard];

// Retailers that are actually working (not blocked by Cloudflare/bot protection)
// bestsnowboard is blocked by Cloudflare — kept for future Playwright support
const ACTIVE_RETAILERS = new Set(["tactics", "evo", "backcountry", "rei"]);

export function getRetailers(regions?: Region[] | null, retailers?: string[] | null): RetailerModule[] {
  let result = ALL_RETAILERS.filter((r) => ACTIVE_RETAILERS.has(r.name));

  if (retailers && retailers.length > 0) {
    result = result.filter((r) => retailers.includes(r.name));
  }

  if (regions && regions.length > 0) {
    result = result.filter((r) => regions.includes(r.region));
  }

  return result;
}

export function getAllRetailerNames(): string[] {
  return ALL_RETAILERS.map((r) => r.name);
}

export function getActiveRetailerNames(): string[] {
  return ALL_RETAILERS.filter((r) => ACTIVE_RETAILERS.has(r.name)).map(
    (r) => r.name
  );
}

import { Region } from "../types";
import { RetailerModule } from "./types";
import { tactics } from "./tactics";
import { evo } from "./evo";
import { backcountry } from "./backcountry";
import { rei } from "./rei";
import { bestsnowboard } from "./bestsnowboard";

const ALL_RETAILERS: RetailerModule[] = [tactics, evo, backcountry, rei, bestsnowboard];

// Retailers that are actually working (not blocked by Cloudflare/bot protection)
// evo, backcountry, rei are blocked by Cloudflare — kept for future Playwright support
const ACTIVE_RETAILERS = new Set(["tactics"]);

export function getRetailers(regions?: Region[] | null): RetailerModule[] {
  let retailers = ALL_RETAILERS.filter((r) => ACTIVE_RETAILERS.has(r.name));

  if (regions && regions.length > 0) {
    retailers = retailers.filter((r) => regions.includes(r.region));
  }

  return retailers;
}

export function getAllRetailerNames(): string[] {
  return ALL_RETAILERS.map((r) => r.name);
}

export function getActiveRetailerNames(): string[] {
  return ALL_RETAILERS.filter((r) => ACTIVE_RETAILERS.has(r.name)).map(
    (r) => r.name
  );
}

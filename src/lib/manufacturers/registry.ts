import { ManufacturerModule } from "./types";
import { burton } from "./burton";
import { libTech } from "./lib-tech";
import { capita } from "./capita";

const ALL_MANUFACTURERS: ManufacturerModule[] = [burton, libTech, capita];

export function getManufacturers(brands?: string[]): ManufacturerModule[] {
  if (!brands || brands.length === 0) return ALL_MANUFACTURERS;

  const lower = new Set(brands.map((b) => b.toLowerCase()));
  return ALL_MANUFACTURERS.filter((m) => lower.has(m.brand.toLowerCase()));
}

export function getAllManufacturerBrands(): string[] {
  return ALL_MANUFACTURERS.map((m) => m.brand);
}

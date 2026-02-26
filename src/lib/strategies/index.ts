import { BoardIdentificationStrategy } from "./types";
import { BurtonStrategy } from "./burton";
import { MervinStrategy } from "./mervin";
import { DefaultStrategy } from "./default";

export { BrandIdentifier } from "./brand-identifier";
export type { BoardSignal, BoardIdentity, BoardIdentificationStrategy } from "./types";

const burtonStrategy = new BurtonStrategy();
const mervinStrategy = new MervinStrategy();
const defaultStrategy = new DefaultStrategy();

/**
 * Get the appropriate board identification strategy for a manufacturer group.
 */
export function getStrategy(manufacturer: string): BoardIdentificationStrategy {
  switch (manufacturer) {
    case "burton":
      return burtonStrategy;
    case "mervin":
      return mervinStrategy;
    default:
      return defaultStrategy;
  }
}

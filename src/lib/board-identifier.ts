import { ListingCondition, GenderTarget } from "./types";
import {
  detectCondition,
  detectGender,
  normalizeConditionString,
  inferYear,
} from "./normalization";
import { BrandIdentifier } from "./strategies/brand-identifier";
import { getStrategy } from "./strategies";
import type { BoardSignal } from "./strategies/types";

export class BoardIdentifier {
  readonly rawModel: string;
  readonly rawBrand: string;
  readonly url: string | undefined;
  private readonly conditionHint: string | undefined;
  private readonly genderHint: string | undefined;
  private readonly yearHint: number | undefined;

  readonly brandId: BrandIdentifier;
  private _model?: string;
  private _condition?: ListingCondition;
  private _gender?: GenderTarget;
  private _year?: number | null;
  private _yearComputed = false;

  constructor(input: {
    rawModel: string;
    rawBrand: string;
    brandId?: BrandIdentifier;
    url?: string;
    conditionHint?: string;
    genderHint?: string;
    yearHint?: number;
  }) {
    this.rawModel = input.rawModel;
    this.rawBrand = input.rawBrand;
    this.url = input.url;
    this.conditionHint = input.conditionHint;
    this.genderHint = input.genderHint;
    this.yearHint = input.yearHint;
    this.brandId = input.brandId ?? new BrandIdentifier(this.rawBrand);
  }

  get brand(): string {
    return this.brandId.canonical || "Unknown";
  }

  get model(): string {
    if (this._model === undefined) {
      const signal: BoardSignal = {
        rawModel: this.rawModel,
        brand: this.brand,
        manufacturer: this.brandId.manufacturer,
        source: "",
        sourceUrl: this.url || "",
      };
      const strategy = getStrategy(this.brandId.manufacturer);
      this._model = strategy.identify(signal).model;
    }
    return this._model;
  }

  get condition(): ListingCondition {
    return (this._condition ??= this.conditionHint
      ? normalizeConditionString(this.conditionHint)
      : detectCondition(this.rawModel, this.url));
  }

  get gender(): GenderTarget {
    return (this._gender ??= this.genderHint
      ? detectGender(this.genderHint)
      : detectGender(this.rawModel, this.url));
  }

  get year(): number | null {
    if (!this._yearComputed) {
      this._year = this.yearHint ?? inferYear(this.rawModel);
      this._yearComputed = true;
    }
    return this._year!;
  }
}

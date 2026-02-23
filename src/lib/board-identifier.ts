import { ListingCondition, GenderTarget } from "./types";
import {
  detectCondition,
  detectGender,
  normalizeConditionString,
  normalizeModel,
  inferYear,
} from "./normalization";
import { normalizeBrand } from "./scraping/utils";

export class BoardIdentifier {
  readonly rawModel: string;
  readonly rawBrand: string;
  readonly url: string | undefined;
  private readonly conditionHint: string | undefined;
  private readonly genderHint: string | undefined;
  private readonly yearHint: number | undefined;

  private _brand?: string;
  private _model?: string;
  private _condition?: ListingCondition;
  private _gender?: GenderTarget;
  private _year?: number | null;
  private _yearComputed = false;

  constructor(input: {
    rawModel: string;
    rawBrand: string;
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
  }

  get brand(): string {
    return (this._brand ??= normalizeBrand(this.rawBrand));
  }

  get model(): string {
    return (this._model ??= normalizeModel(this.rawModel, this.brand));
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

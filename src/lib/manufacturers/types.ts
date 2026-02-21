export interface ManufacturerSpec {
  brand: string;
  model: string;
  year: number | null;
  flex: string | null;      // raw, normalized by ingest layer
  profile: string | null;
  shape: string | null;
  category: string | null;
  msrpUsd: number | null;
  sourceUrl: string;
}

export interface ManufacturerModule {
  brand: string;
  baseUrl: string;
  scrapeSpecs(): Promise<ManufacturerSpec[]>;
}

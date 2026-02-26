/**
 * Shared normalization utilities — truly brand-agnostic transforms.
 * Composed by each strategy; none of these depend on brand context.
 */

/** Strip zero-width unicode characters */
export function stripUnicode(m: string): string {
  return m.replace(/[\u200b\u200c\u200d\ufeff\u00ad]/g, "");
}

/** Replace pipe char with space */
export function stripPipe(m: string): string {
  return m.replace(/\s*\|\s*/g, " ");
}

/** Strip combo/binding info (+ ... or w/ ...) AND "& Bindings" / "& Binding" patterns */
export function stripCombo(m: string): string {
  m = m.replace(/\s*\+\s.*$/, "");
  m = m.replace(/\s+w\/\s.*$/i, "");
  m = m.replace(/\s+&\s+Bindings?\b.*$/i, "");
  return m;
}

/** Strip retail tags like (Closeout), - Blem, (Sale) */
export function stripRetailTags(m: string): string {
  m = m.replace(/\s*\((?:Closeout|Blem|Sale)\)/gi, "");
  m = m.replace(/\s*-\s*(?:Closeout|Blem|Sale)\b/gi, "");
  return m;
}

/** Strip "Snowboard" suffix */
export function stripSnowboard(m: string): string {
  return m.replace(/\s+Snowboard\b/gi, "");
}

/** Strip 4-digit and range years */
export function stripYear(m: string): string {
  m = m.replace(/\s*-?\s*\b20[1-2]\d\s*\/\s*20[1-2]\d\b/g, "");
  m = m.replace(/\s*-?\s*\b20[1-2]\d\b/g, "");
  return m;
}

/** Strip season suffix like "2627 EARLY RELEASE" */
export function stripSeasonSuffix(m: string): string {
  return m.replace(/\s*-?\s*\d{4}\s+early\s+release\b/gi, "");
}

/** Strip trailing 3-digit board sizes */
export function stripTrailingSize(m: string): string {
  return m.replace(/\s+\b(1[3-9]\d|2[0-2]\d)\b/g, "");
}

/** Strip trailing gender suffix like "- Women's" */
export function stripGenderSuffix(m: string): string {
  return m.replace(/\s*-\s*(?:Men's|Women's|Kids'|Boys'|Girls')$/i, "");
}

/** Strip leading gender prefix like "Women's " */
export function stripGenderPrefix(m: string): string {
  return m.replace(/^(?:Women's|Men's|Kids'|Boys'|Girls')\s+/i, "");
}

/** Strip brand name prefix from model */
export function stripBrandPrefix(m: string, brand: string | undefined): string {
  if (!brand) return m;
  const brandLower = brand.toLowerCase();
  const modelLower = m.toLowerCase();
  if (modelLower.startsWith(brandLower + " ")) {
    return m.slice(brand.length).trimStart();
  }
  return m;
}

/** Strip leading "the " */
export function stripLeadingThe(m: string): string {
  return m.replace(/^the\s+/i, "");
}

/** Replace " - " with " " */
export function replaceSpaceDashSpace(m: string): string {
  return m.replace(/\s+-\s+/g, " ");
}

/** Strip periods from acronyms (D.O.A. → DOA) while preserving version numbers (2.0) */
export function stripAcronymPeriods(m: string): string {
  m = m.replace(/\.(?=[a-zA-Z])/g, "");
  m = m.replace(/(?<=[a-zA-Z]{2})\.(?=\s|$)/g, "");
  return m;
}

/** Replace hyphens with spaces */
export function replaceHyphens(m: string): string {
  return m.replace(/-/g, " ");
}

/**
 * Strip package-specific keywords from model names.
 * E.g. "After School Special Package" → "After School Special"
 */
export function stripPackage(m: string): string {
  return m.replace(/\s+Package\b/gi, "");
}

/** Clean whitespace, trailing slashes, leading/trailing dashes */
export function cleanWhitespace(m: string): string {
  m = m.replace(/\/+$/, "");
  m = m.replace(/^\s*[-/]\s*/, "").replace(/\s*[-/]\s*$/, "");
  m = m.replace(/\s{2,}/g, " ").trim();
  return m;
}

/**
 * Run the shared (brand-agnostic) normalization pipeline.
 * Each strategy composes this with its own brand-specific steps.
 */
export function sharedNormalize(m: string, brand: string | undefined): string {
  m = stripUnicode(m);
  m = stripPipe(m);
  m = stripCombo(m);
  m = stripRetailTags(m);
  m = stripSnowboard(m);
  m = stripYear(m);
  m = stripSeasonSuffix(m);
  m = stripTrailingSize(m);
  m = stripGenderSuffix(m);
  m = stripGenderPrefix(m);
  m = stripBrandPrefix(m, brand);
  return m;
}

/**
 * Post-normalization shared steps — run after brand-specific logic.
 */
export function sharedPostNormalize(m: string): string {
  m = stripLeadingThe(m);
  m = replaceSpaceDashSpace(m);
  m = stripAcronymPeriods(m);
  m = replaceHyphens(m);
  m = stripPackage(m);
  m = cleanWhitespace(m);
  return m;
}

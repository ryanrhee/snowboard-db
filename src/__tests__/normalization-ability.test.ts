import { describe, it, expect } from "vitest";
import {
  normalizeAbilityRange,
  normalizeAbilityLevel,
} from "../lib/normalization";

describe("normalizeAbilityRange", () => {
  // Single levels
  it('parses "beginner" as beginner-beginner', () => {
    expect(normalizeAbilityRange("beginner")).toEqual({
      min: "beginner",
      max: "beginner",
    });
  });

  it('parses "intermediate" as intermediate-intermediate', () => {
    expect(normalizeAbilityRange("intermediate")).toEqual({
      min: "intermediate",
      max: "intermediate",
    });
  });

  it('parses "advanced" as advanced-advanced', () => {
    expect(normalizeAbilityRange("advanced")).toEqual({
      min: "advanced",
      max: "advanced",
    });
  });

  it('parses "expert" as expert-expert', () => {
    expect(normalizeAbilityRange("expert")).toEqual({
      min: "expert",
      max: "expert",
    });
  });

  // Compound ranges
  it('parses "beginner-intermediate" as beginner-intermediate', () => {
    expect(normalizeAbilityRange("beginner-intermediate")).toEqual({
      min: "beginner",
      max: "intermediate",
    });
  });

  it('parses "intermediate-advanced" as intermediate-advanced', () => {
    expect(normalizeAbilityRange("intermediate-advanced")).toEqual({
      min: "intermediate",
      max: "advanced",
    });
  });

  it('parses "advanced-expert" as advanced-expert', () => {
    expect(normalizeAbilityRange("advanced-expert")).toEqual({
      min: "advanced",
      max: "expert",
    });
  });

  it('parses "beginner-advanced" as beginner-advanced', () => {
    expect(normalizeAbilityRange("beginner-advanced")).toEqual({
      min: "beginner",
      max: "advanced",
    });
  });

  it('parses "beginner-expert" as beginner-expert', () => {
    expect(normalizeAbilityRange("beginner-expert")).toEqual({
      min: "beginner",
      max: "expert",
    });
  });

  // Aliases
  it('resolves "novice" alias to beginner', () => {
    expect(normalizeAbilityRange("novice")).toEqual({
      min: "beginner",
      max: "beginner",
    });
  });

  it('resolves "pro" alias to expert', () => {
    expect(normalizeAbilityRange("pro")).toEqual({
      min: "expert",
      max: "expert",
    });
  });

  it('resolves "entry level" alias to beginner', () => {
    expect(normalizeAbilityRange("entry level")).toEqual({
      min: "beginner",
      max: "beginner",
    });
  });

  it('resolves "entry-level" alias to beginner', () => {
    expect(normalizeAbilityRange("entry-level")).toEqual({
      min: "beginner",
      max: "beginner",
    });
  });

  it('resolves "day 1" alias to beginner', () => {
    expect(normalizeAbilityRange("day 1")).toEqual({
      min: "beginner",
      max: "beginner",
    });
  });

  it('resolves "pro level" alias to expert', () => {
    expect(normalizeAbilityRange("pro level")).toEqual({
      min: "expert",
      max: "expert",
    });
  });

  // Edge cases
  it("returns nulls for undefined input", () => {
    expect(normalizeAbilityRange(undefined)).toEqual({
      min: null,
      max: null,
    });
  });

  it("returns nulls for empty string", () => {
    expect(normalizeAbilityRange("")).toEqual({
      min: null,
      max: null,
    });
  });

  it("returns nulls for unrecognized input", () => {
    expect(normalizeAbilityRange("unrecognized garbage")).toEqual({
      min: null,
      max: null,
    });
  });
});

describe("normalizeAbilityLevel", () => {
  it('returns "beginner" for single level input', () => {
    expect(normalizeAbilityLevel("beginner")).toBe("beginner");
  });

  it('returns "beginner-intermediate" for compound range', () => {
    expect(normalizeAbilityLevel("beginner-intermediate")).toBe(
      "beginner-intermediate"
    );
  });

  it('returns "intermediate-advanced" for compound range', () => {
    expect(normalizeAbilityLevel("intermediate-advanced")).toBe(
      "intermediate-advanced"
    );
  });

  it('resolves "novice" alias to "beginner"', () => {
    expect(normalizeAbilityLevel("novice")).toBe("beginner");
  });

  it("returns null for undefined input", () => {
    expect(normalizeAbilityLevel(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(normalizeAbilityLevel("")).toBeNull();
  });

  it("returns null for unrecognized input", () => {
    expect(normalizeAbilityLevel("unknown")).toBeNull();
  });
});

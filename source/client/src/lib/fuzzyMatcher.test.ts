import { describe, expect, it } from "vitest";
import {
  doubleMetaphone,
  doubleMetaphoneSimilarity,
  jaroWinklerSimilarity,
  levenshteinSimilarity,
  calculateConfidence,
} from "./fuzzyMatcher";

describe("fuzzyMatcher — Double Metaphone & Jaro-Winkler Enhancements", () => {
  it("computes Double Metaphone primary and secondary keys for Irish/regional names", () => {
    const [primaryMcGarry, secMcGarry] = doubleMetaphone("McGarry");
    const [primaryMaghery, secMaghery] = doubleMetaphone("Maghery");

    expect(primaryMcGarry).toBeTruthy();
    expect(primaryMaghery).toBeTruthy();
    expect(doubleMetaphoneSimilarity("McGarry", "Maghery")).toBeGreaterThanOrEqual(0.75);
  });

  it("handles Mc and Mac prefix normalization identically in Double Metaphone", () => {
    const [p1] = doubleMetaphone("McGowan");
    const [p2] = doubleMetaphone("MacGowan");
    expect(p1).toBe(p2);
  });

  it("handles phonetic similarity between name variants (Smyth vs Smith)", () => {
    const sim = doubleMetaphoneSimilarity("Smyth", "Smith");
    expect(sim).toBeGreaterThanOrEqual(0.85);
  });

  it("calculates Jaro-Winkler distance prioritizing prefix alignment", () => {
    const jwHigh = jaroWinklerSimilarity("Patrick", "Patrik");
    const jwLow = jaroWinklerSimilarity("Patrick", "Stephen");

    expect(jwHigh).toBeGreaterThan(0.9);
    expect(jwLow).toBeLessThan(0.5);
  });

  it("blends metrics into calculateConfidence", () => {
    const exactConf = calculateConfidence("Maghery", "Maghery", true);
    expect(exactConf).toBe(1.0);

    const fuzzyConf = calculateConfidence("McBride", "MacBride");
    expect(fuzzyConf).toBeGreaterThan(0.85);
  });
});

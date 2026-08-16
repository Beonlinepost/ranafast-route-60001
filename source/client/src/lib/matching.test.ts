import { describe, it, expect } from "vitest";
import {
  matchStop,
  matchStops,
  matchesQuery,
  resolveSpokenName,
  normalise,
  splitPipe,
  isPrimaryEntityMatch,
  rankMatchResults,
  countPrimaryEntityMatches,
} from "./matching";
import type { Stop } from "../../../drizzle/schema";

function makeStop(overrides: Partial<Stop> = {}): Stop {
  return {
    id: 1,
    sectionId: 1,
    routeId: 1,
    stopOrder: 1,
    propertyType: "Residential",
    side: "Right",
    road: "Quay Road",
    houseName: null,
    businessName: null,
    houseNumber: "4",
    eircode: "F94 X6W4",
    residents: "James McCullagh | Fr. Michael McCullagh",
    aliases: "MacCullagh | McCullah | Macula | McCoolagh",
    searchTags: null,
    hasDog: false,
    safePlace: null,
    notes: null,
    lat: null,
    lng: null,
    ...overrides,
  };
}

describe("normalise", () => {
  it("lowercases and strips diacritics", () => {
    expect(normalise("Máire")).toBe("maire");
    expect(normalise("McCullagh")).toBe("mccullagh");
  });
  it("strips apostrophes", () => {
    expect(normalise("O'Brien")).toBe("obrien");
  });
});

describe("splitPipe", () => {
  it("splits pipe-separated values", () => {
    expect(splitPipe("A | B | C")).toEqual(["A", "B", "C"]);
  });
  it("returns empty array for null/undefined", () => {
    expect(splitPipe(null)).toEqual([]);
    expect(splitPipe(undefined)).toEqual([]);
  });
});

describe("matchStop — business name matching", () => {
  const bizStop = makeStop({
    propertyType: "Business",
    businessName: "Kelly's Pharmacy",
    residents: "Mary Kelly | John Kelly",
    aliases: "Kellys | Kelly Pharmacy",
  });

  it("matches on business name", () => {
    const r = matchStop(bizStop, "Kelly's Pharmacy");
    expect(r.matched).toBe(true);
    expect(r.kind).toBe("business");
  });

  it("partial business name match", () => {
    const r = matchStop(bizStop, "Kellys");
    expect(r.matched).toBe(true);
  });

  it("still matches on resident name for business stop", () => {
    const r = matchStop(bizStop, "Mary Kelly");
    expect(r.matched).toBe(true);
  });

  it("resolveSpokenName returns business name for business stop", () => {
    const r = matchStop(bizStop, "Kelly's Pharmacy");
    const spoken = resolveSpokenName(bizStop, r);
    expect(spoken).toBe("Kelly's Pharmacy");
  });

  it("resolveSpokenName returns business name even on alias match", () => {
    const r = matchStop(bizStop, "Kellys");
    const spoken = resolveSpokenName(bizStop, r);
    expect(spoken).toBe("Kelly's Pharmacy");
  });
});

describe("matchStop — alias-first matching", () => {
  const stop = makeStop();

  it("matches an exact alias token", () => {
    const result = matchStop(stop, "MacCullagh");
    expect(result.matched).toBe(true);
    expect(result.kind).toBe("alias");
    expect(result.aliasToken).toBe("MacCullagh");
  });

  it("matches a partial alias token (Macula → MacCullagh)", () => {
    const result = matchStop(stop, "Macula");
    expect(result.matched).toBe(true);
    expect(result.kind).toBe("alias");
  });

  it("matches a phonetic misfire alias (McCoolagh)", () => {
    const result = matchStop(stop, "McCoolagh");
    expect(result.matched).toBe(true);
    expect(result.kind).toBe("alias");
  });

  it("resolves canonical resident on alias match", () => {
    const result = matchStop(stop, "MacCullagh");
    expect(result.canonicalResident).toBe("James McCullagh");
  });

  it("falls through to resident match when no alias matches", () => {
    const result = matchStop(stop, "Michael");
    expect(result.matched).toBe(true);
    expect(result.kind).toBe("resident");
    expect(result.matchedResident).toBe("Fr. Michael McCullagh");
  });

  it("falls through to fallback for road match", () => {
    const result = matchStop(stop, "Quay");
    expect(result.matched).toBe(true);
    expect(result.kind).toBe("fallback");
  });

  it("returns no match for unrelated query", () => {
    const result = matchStop(stop, "Gallagher");
    expect(result.matched).toBe(false);
    expect(result.kind).toBe("none");
  });

  it("returns matched=true for empty query", () => {
    const result = matchStop(stop, "");
    expect(result.matched).toBe(true);
  });
});

describe("matchesQuery", () => {
  const stop = makeStop();

  it("returns true for alias match", () => {
    expect(matchesQuery(stop, "McCullah")).toBe(true);
  });

  it("returns false for no match", () => {
    expect(matchesQuery(stop, "Doherty")).toBe(false);
  });
});

describe("resolveSpokenName", () => {
  const stop = makeStop();

  it("returns canonical resident for alias match", () => {
    const result = matchStop(stop, "MacCullagh");
    expect(resolveSpokenName(stop, result)).toBe("James McCullagh");
  });

  it("returns matched resident for resident match", () => {
    const result = matchStop(stop, "Michael");
    expect(resolveSpokenName(stop, result)).toBe("Fr. Michael McCullagh");
  });

  it("returns primary resident for fallback match", () => {
    const result = matchStop(stop, "Quay");
    expect(resolveSpokenName(stop, result)).toBe("James McCullagh");
  });
});

describe("matchStop — multi-word precision mode", () => {
  // Simulate a section with multiple Gallagher households
  const patGallagher = makeStop({
    id: 10,
    residents: "Pat Gallagher | Patricia Gallagher",
    aliases: null,
    road: "Main Street",
  });
  const oneyGallagher = makeStop({
    id: 11,
    residents: "Oney Gallagher",
    aliases: null,
    road: "Main Street",
  });
  const hughGallagher = makeStop({
    id: 12,
    residents: "Hugh Gallagher",
    aliases: null,
    road: "Main Street",
  });

  it("multi-word 'Pat Gallagher' matches Pat but NOT Oney or Hugh", () => {
    expect(matchesQuery(patGallagher, "Pat Gallagher")).toBe(true);
    expect(matchesQuery(oneyGallagher, "Pat Gallagher")).toBe(false);
    expect(matchesQuery(hughGallagher, "Pat Gallagher")).toBe(false);
  });

  it("single-word 'Gallagher' matches all three (broad mode)", () => {
    expect(matchesQuery(patGallagher, "Gallagher")).toBe(true);
    expect(matchesQuery(oneyGallagher, "Gallagher")).toBe(true);
    expect(matchesQuery(hughGallagher, "Gallagher")).toBe(true);
  });

  it("multi-word 'Patricia Gallagher' matches Pat stop (secondary resident)", () => {
    expect(matchesQuery(patGallagher, "Patricia Gallagher")).toBe(true);
    expect(matchesQuery(oneyGallagher, "Patricia Gallagher")).toBe(false);
  });

  it("multi-word query does NOT fall back to road/tags", () => {
    // "Main Street" is the road — multi-word should not match via fallback
    const roadOnlyStop = makeStop({
      id: 13,
      residents: "Someone Else",
      aliases: null,
      road: "Main Street",
    });
    // "Main Street" is 2 words — precision mode, no fallback
    expect(matchesQuery(roadOnlyStop, "Main Street")).toBe(false);
  });

  it("multi-word alias match still works", () => {
    const aliasStop = makeStop({
      id: 14,
      residents: "James McCullagh",
      aliases: "Mac Cullagh | McCoolagh",
      road: "Quay Road",
    });
    // "Mac Cullagh" is 2 words — should match via alias precision
    expect(matchesQuery(aliasStop, "Mac Cullagh")).toBe(true);
    // "Oney Gallagher" should NOT match
    expect(matchesQuery(oneyGallagher, "Mac Cullagh")).toBe(false);
  });
});

// ── Round 15: Strict phrase-first hierarchy tests ─────────────────────────────

describe("matchStops — strict 3-level hierarchy (Round 15)", () => {
  // Ward family scenario: multiple Ward households
  const johnWard = makeStop({
    id: 20,
    residents: "John Ward",
    aliases: null,
    road: "Shore Road",
  });
  const jamesWard = makeStop({
    id: 21,
    residents: "James Ward",
    aliases: null,
    road: "Shore Road",
  });
  const hughWard = makeStop({
    id: 22,
    residents: "Hugh Ward",
    aliases: null,
    road: "Shore Road",
  });
  const maryWard = makeStop({
    id: 23,
    residents: "Mary Ward | Patrick Ward",
    aliases: null,
    road: "Shore Road",
  });

  const wardPool = [johnWard, jamesWard, hughWard, maryWard];

  it("'John Ward' returns ONLY the John Ward stop (level 1)", () => {
    const { level, results } = matchStops(wardPool, "John Ward");
    expect(level).toBe(1);
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe(20);
  });

  it("'John Ward' does NOT return James Ward", () => {
    const { results } = matchStops(wardPool, "John Ward");
    expect(results.every(s => s.id !== 21)).toBe(true);
  });

  it("'John Ward' does NOT return Hugh Ward", () => {
    const { results } = matchStops(wardPool, "John Ward");
    expect(results.every(s => s.id !== 22)).toBe(true);
  });

  it("'James Ward' returns ONLY the James Ward stop (level 1)", () => {
    const { level, results } = matchStops(wardPool, "James Ward");
    expect(level).toBe(1);
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe(21);
  });

  it("single-word 'Ward' returns all Ward stops (level 3 broad)", () => {
    const { level, results } = matchStops(wardPool, "Ward");
    expect(level).toBe(3);
    expect(results).toHaveLength(4);
  });

  it("'Patrick Ward' returns the Mary/Patrick stop (level 1)", () => {
    const { level, results } = matchStops(wardPool, "Patrick Ward");
    expect(level).toBe(1);
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe(23);
  });
});

describe("matchStops — level 2 alias phrase match", () => {
  const johnWardWithAlias = makeStop({
    id: 30,
    residents: "John Ward",
    aliases: "Johnny Ward | J Ward",
    road: "Shore Road",
  });
  const jamesWard = makeStop({
    id: 31,
    residents: "James Ward",
    aliases: null,
    road: "Shore Road",
  });

  const pool = [johnWardWithAlias, jamesWard];

  it("'Johnny Ward' matches via alias (level 2), not James Ward", () => {
    const { level, results } = matchStops(pool, "Johnny Ward");
    expect(level).toBe(2);
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe(30);
  });

  it("'J Ward' matches via alias (level 2)", () => {
    const { level, results } = matchStops(pool, "J Ward");
    expect(level).toBe(2);
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe(30);
  });

  it("level 2 does NOT fire when level 1 already has results", () => {
    // "John Ward" is a level 1 match — level 2 alias should NOT run
    const { level, results } = matchStops(pool, "John Ward");
    expect(level).toBe(1);
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe(30);
  });
});

describe("matchStops — multi-word strict intent: NO broad fallback (Round 16)", () => {
  const johnWard = makeStop({
    id: 40,
    residents: "John Ward",
    aliases: null,
    road: "Shore Road",
  });
  const jamesWard = makeStop({
    id: 41,
    residents: "James Ward",
    aliases: null,
    road: "Shore Road",
  });
  const onyGallagher = makeStop({
    id: 42,
    residents: "Ony Gallagher",
    aliases: null,
    road: "Main Street",
  });
  const patGallagher = makeStop({
    id: 43,
    residents: "Pat Gallagher",
    aliases: null,
    road: "Main Street",
  });

  const pool = [johnWard, jamesWard, onyGallagher, patGallagher];

  it("'John Ward' does NOT trigger level 3 broad fallback", () => {
    const { level } = matchStops(pool, "John Ward");
    expect(level).toBe(1); // Must stop at level 1
    expect(level).not.toBe(3);
  });

  it("'Seamus Ward' — multi-word no exact match — returns ZERO results (no broad fallback)", () => {
    const { level, results } = matchStops(pool, "Seamus Ward");
    expect(level).toBe(0);
    expect(results).toHaveLength(0);
  });

  it("'John Gallagher' — no exact match — returns ZERO results, NOT all Gallagher cards", () => {
    const { level, results } = matchStops(pool, "John Gallagher");
    expect(level).toBe(0);
    expect(results).toHaveLength(0);
  });

  it("'Pat Bonner' — no exact match — returns ZERO results", () => {
    const { results } = matchStops(pool, "Pat Bonner");
    expect(results).toHaveLength(0);
  });

  it("'Gavin Ward' — no exact match — returns ZERO results, NOT James or John Ward", () => {
    const { results } = matchStops(pool, "Gavin Ward");
    expect(results).toHaveLength(0);
  });

  it("single-word 'Ward' still returns all Ward stops (broad allowed for single word)", () => {
    const { level, results } = matchStops(pool, "Ward");
    expect(level).toBe(3);
    expect(results).toHaveLength(2); // John Ward + James Ward
  });

  it("single-word 'Gallagher' still returns all Gallagher stops (broad allowed)", () => {
    const { level, results } = matchStops(pool, "Gallagher");
    expect(level).toBe(3);
    expect(results).toHaveLength(2); // Ony + Pat Gallagher
  });

  it("completely unknown multi-word name returns empty results", () => {
    const { results } = matchStops(pool, "Doherty Murphy");
    expect(results).toHaveLength(0);
  });
});

describe("matchStops — empty query returns all stops at level 0", () => {
  const pool = [
    makeStop({ id: 50, residents: "Alice Smith" }),
    makeStop({ id: 51, residents: "Bob Jones" }),
  ];

  it("empty query returns all stops at level 0", () => {
    const { level, results } = matchStops(pool, "");
    expect(level).toBe(0);
    expect(results).toHaveLength(2);
  });
});

// ── Round 20: Primary-entity ranking ─────────────────────────────────────────

describe("isPrimaryEntityMatch", () => {
  it("residential stop: returns true when query matches the promoted resident", () => {
    const stop = makeStop({ id: 60, residents: "Kieran Gallagher | Pat Gallagher" });
    expect(isPrimaryEntityMatch(stop, "Kieran Gallagher")).toBe(true);
  });

  it("residential stop: returns false when query matches a secondary resident only", () => {
    // A business stop where Kieran Gallagher is in the resident list but the
    // primary entity is the business name
    const stop = makeStop({
      id: 61,
      propertyType: "Business",
      businessName: "Gallagher's Shop",
      residents: "Pat Gallagher | Kieran Gallagher",
    });
    // "Kieran Gallagher" does NOT match the business name → not a primary entity match
    expect(isPrimaryEntityMatch(stop, "Kieran Gallagher")).toBe(false);
  });

  it("business stop: returns true when query matches the business name", () => {
    const stop = makeStop({
      id: 62,
      propertyType: "Business",
      businessName: "Kelly's Pharmacy",
      residents: "Mary Kelly",
    });
    expect(isPrimaryEntityMatch(stop, "Kelly's Pharmacy")).toBe(true);
  });

  it("business stop: returns false when query matches a resident but not the business name", () => {
    const stop = makeStop({
      id: 63,
      propertyType: "Business",
      businessName: "Gallagher's Shop",
      residents: "Kieran Gallagher | Pat Gallagher",
    });
    expect(isPrimaryEntityMatch(stop, "Kieran Gallagher")).toBe(false);
  });
});

describe("rankMatchResults", () => {
  const kieranResidential = makeStop({
    id: 70,
    propertyType: "Residential",
    residents: "Kieran Gallagher",
    businessName: null,
  });
  const businessWithKieran = makeStop({
    id: 71,
    propertyType: "Business",
    businessName: "Gallagher's Shop",
    residents: "Pat Gallagher | Kieran Gallagher",
  });

  it("primary-entity match ranks before secondary-list inclusion", () => {
    // Simulate matchStops returning business stop first, residential second
    const results = [businessWithKieran, kieranResidential];
    const ranked = rankMatchResults(results, "Kieran Gallagher");
    expect(ranked[0]!.id).toBe(70); // Kieran's own stop must be first
    expect(ranked[1]!.id).toBe(71); // Business stop with Kieran in list is second
  });

  it("preserves order when all results have the same rank tier", () => {
    const a = makeStop({ id: 80, residents: "Kieran Gallagher" });
    const b = makeStop({ id: 81, residents: "Kieran Gallagher" });
    const ranked = rankMatchResults([a, b], "Kieran Gallagher");
    expect(ranked[0]!.id).toBe(80);
    expect(ranked[1]!.id).toBe(81);
  });
});

describe("countPrimaryEntityMatches", () => {
  it("counts only primary-entity matches, not secondary-list inclusions", () => {
    const kieranResidential = makeStop({
      id: 90,
      propertyType: "Residential",
      residents: "Kieran Gallagher",
      businessName: null,
    });
    const businessWithKieran = makeStop({
      id: 91,
      propertyType: "Business",
      businessName: "Gallagher's Shop",
      residents: "Pat Gallagher | Kieran Gallagher",
    });
    const count = countPrimaryEntityMatches([kieranResidential, businessWithKieran], "Kieran Gallagher");
    expect(count).toBe(1); // Only the residential stop is a primary-entity match
  });

  it("returns 2 when two residential stops both have the same name as primary", () => {
    const a = makeStop({ id: 92, residents: "Kieran Gallagher" });
    const b = makeStop({ id: 93, residents: "Kieran Gallagher" });
    expect(countPrimaryEntityMatches([a, b], "Kieran Gallagher")).toBe(2);
  });
});

describe("isPrimaryEntityMatch — exact equality edge cases", () => {
  it("does NOT count 'Kieran Gallagher Carpentry' as primary match for 'Kieran Gallagher'", () => {
    const stop = makeStop({
      id: 100,
      propertyType: "Business",
      businessName: "Kieran Gallagher Carpentry",
      residents: "Kieran Gallagher",
    });
    // The business name is longer than the query — not an exact match
    expect(isPrimaryEntityMatch(stop, "Kieran Gallagher")).toBe(false);
  });

  it("counts 'Kieran Gallagher' business stop as primary match for exact query", () => {
    const stop = makeStop({
      id: 101,
      propertyType: "Business",
      businessName: "Kieran Gallagher",
      residents: null,
    });
    expect(isPrimaryEntityMatch(stop, "Kieran Gallagher")).toBe(true);
  });

  it("does NOT count 'Kieran Gallagher Jr' residential stop as primary match for 'Kieran Gallagher'", () => {
    const stop = makeStop({
      id: 102,
      propertyType: "Residential",
      residents: "Kieran Gallagher Jr",
      businessName: null,
    });
    expect(isPrimaryEntityMatch(stop, "Kieran Gallagher")).toBe(false);
  });

  it("callback selection: 1 primary + 1 secondary → count is 1 (speak full callback)", () => {
    const kieranResidential = makeStop({
      id: 103,
      propertyType: "Residential",
      residents: "Kieran Gallagher",
      businessName: null,
    });
    const businessWithKieran = makeStop({
      id: 104,
      propertyType: "Business",
      businessName: "Gallagher's Shop",
      residents: "Pat Gallagher | Kieran Gallagher",
    });
    const count = countPrimaryEntityMatches([kieranResidential, businessWithKieran], "Kieran Gallagher");
    expect(count).toBe(1);
  });

  it("callback selection: 0 primary (name only in business resident list) → count is 0", () => {
    const businessWithKieran = makeStop({
      id: 105,
      propertyType: "Business",
      businessName: "Gallagher's Shop",
      residents: "Pat Gallagher | Kieran Gallagher",
    });
    const count = countPrimaryEntityMatches([businessWithKieran], "Kieran Gallagher");
    expect(count).toBe(0);
  });
});

// ── Round 21: First-name priority in multi-word matching ─────────────────────

describe("Round 21 — multi-word first-name + surname both required", () => {
  // Pool that mirrors the reported failing cases
  const stevieStop = makeStop({
    id: 200,
    residents: "Stevie Mc Gowan",
    aliases: "McGowan | Mc Gowan",
  });
  const patrickStop = makeStop({
    id: 201,
    residents: "Patrick McGowan",
    aliases: null,
  });
  const sylviaStop = makeStop({
    id: 202,
    residents: "Sylvia Doran",
    aliases: "Doran",
  });
  const seanStop = makeStop({
    id: 203,
    residents: "Sean Doran",
    aliases: null,
  });
  const charleneStop = makeStop({
    id: 204,
    residents: "Charlene Boyle",
    aliases: null,
  });
  const otherBoyleStop = makeStop({
    id: 205,
    residents: "Michael Boyle | Mary Boyle",
    aliases: "Boyle",
  });
  const tanyaStop = makeStop({
    id: 206,
    residents: "Tanya Boyle",
    aliases: null,
  });

  const pool = [stevieStop, patrickStop, sylviaStop, seanStop, charleneStop, otherBoyleStop, tanyaStop];

  it("'Patrick McGowan' returns ONLY Patrick McGowan — NOT Stevie Mc Gowan", () => {
    const { results } = matchStops(pool, "Patrick McGowan");
    const ids = results.map(r => r.id);
    expect(ids).toContain(201);
    expect(ids).not.toContain(200); // Stevie must NOT appear
  });

  it("'Sean Doran' returns ONLY Sean Doran — NOT Sylvia Doran", () => {
    const { results } = matchStops(pool, "Sean Doran");
    const ids = results.map(r => r.id);
    expect(ids).toContain(203);
    expect(ids).not.toContain(202); // Sylvia must NOT appear
  });

  it("'Charlene Boyle' returns ONLY Charlene Boyle — NOT Michael/Mary Boyle household", () => {
    const { results } = matchStops(pool, "Charlene Boyle");
    const ids = results.map(r => r.id);
    expect(ids).toContain(204);
    expect(ids).not.toContain(205); // Michael/Mary Boyle must NOT appear
  });

  it("'Tanya Boyle' returns ONLY Tanya Boyle — NOT Michael/Mary Boyle household", () => {
    const { results } = matchStops(pool, "Tanya Boyle");
    const ids = results.map(r => r.id);
    expect(ids).toContain(206);
    expect(ids).not.toContain(205); // Michael/Mary Boyle must NOT appear
  });

  it("surname alias 'Doran' on Sylvia's stop does NOT match query 'Sean Doran'", () => {
    // Sylvia Doran has alias "Doran". "Sean Doran" query must NOT match via alias.
    const result = matchStop(sylviaStop, "Sean Doran");
    expect(result.matched).toBe(false);
  });

  it("surname alias 'McGowan' on Stevie's stop does NOT match query 'Patrick McGowan'", () => {
    // Stevie Mc Gowan has alias "McGowan". "Patrick McGowan" query must NOT match via alias.
    const result = matchStop(stevieStop, "Patrick McGowan");
    expect(result.matched).toBe(false);
  });

  it("surname alias 'Boyle' on other household does NOT match query 'Charlene Boyle'", () => {
    const result = matchStop(otherBoyleStop, "Charlene Boyle");
    expect(result.matched).toBe(false);
  });

  it("spacing variant 'Patrick Mc Gowan' still matches query 'Patrick McGowan' (all tokens present)", () => {
    const mcGowanSpaced = makeStop({
      id: 210,
      residents: "Patrick Mc Gowan",
      aliases: null,
    });
    const result = matchStop(mcGowanSpaced, "Patrick McGowan");
    expect(result.matched).toBe(true);
  });

  it("single-word 'Boyle' still returns all Boyle stops (broad fallback allowed)", () => {
    const { level, results } = matchStops(pool, "Boyle");
    expect(level).toBe(3);
    const ids = results.map(r => r.id);
    expect(ids).toContain(204); // Charlene Boyle
    expect(ids).toContain(205); // Michael/Mary Boyle
    expect(ids).toContain(206); // Tanya Boyle
  });

  it("single-word 'McGowan' still returns all McGowan stops", () => {
    const { level, results } = matchStops(pool, "McGowan");
    expect(level).toBe(3);
    const ids = results.map(r => r.id);
    expect(ids).toContain(200); // Stevie Mc Gowan (via alias)
    expect(ids).toContain(201); // Patrick McGowan
  });

});

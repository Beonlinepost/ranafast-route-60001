import { describe, it, expect, vi, beforeAll } from "vitest";
import RouteIntelligenceMultiIndex from "./routeIntelligenceMultiIndex";
import type { Stop } from "../../../drizzle/schema";
import realStops from "../../../data/stops.json";

// No learned corrections — exercise the index search only.
vi.mock("./routeIntelligencePersistentLearning", () => ({
  recordCorrection: vi.fn(),
  lookupLearnedMapping: vi.fn().mockResolvedValue(null),
  getAllLearnedMappingsForRoute: vi.fn().mockResolvedValue([]),
}));

const ROUTE_ID = 60001;
const CARA_GREENE_STOP = 1110493; // "John Greene | ... | Cara Greene | ..."
const MEAVE_ODONNELL_STOP = 1110011; // "John Odonnell | Meave Odonnell"
const MCFADDEN_GARAGE_STOP = 1110386; // "Kathleen McFadden | ... | MacFadden Garage | ..."

describe("RouteIntelligenceMultiIndex phonetic matching (real route 60001 data)", () => {
  const engine = new RouteIntelligenceMultiIndex(ROUTE_ID);
  const stops = (realStops as unknown as Stop[]).filter((s) => s.routeId === ROUTE_ID);
  const residentsOf = (id: number) => stops.find((s) => s.id === id)?.residents ?? "";

  beforeAll(() => {
    vi.spyOn(console, "time").mockImplementation(() => {});
    vi.spyOn(console, "timeEnd").mockImplementation(() => {});
    vi.spyOn(console, "debug").mockImplementation(() => {});
    engine.buildDictionary(stops);
  });

  it("uses the real Cara Greene stop", () => {
    expect(residentsOf(CARA_GREENE_STOP)).toContain("Cara Greene");
  });

  it('does not match "Kharghar" to Cara Greene despite identical Double Metaphone codes (KRKR)', async () => {
    const results = await engine.search("Kharghar");
    expect(results.map((r) => r.stopId)).not.toContain(CARA_GREENE_STOP);
  });

  it('still matches "Gallaher" to Gallagher stops', async () => {
    const results = await engine.search("Gallaher");
    expect(results.length).toBeGreaterThan(0);
    expect(residentsOf(results[0]!.stopId)).toContain("Gallagher");
  });

  it('still matches "Mac Fatten" to McFadden stops via the phonetic branch', async () => {
    const results = await engine.search("Mac Fatten");
    expect(results.length).toBeGreaterThan(0);
    expect(residentsOf(results[0]!.stopId)).toContain("McFadden");
    expect(results.some((r) => r.matchType === "phonetic")).toBe(true);
  });

  it('ranks the closest name first for "Mac Fatten", not Meave Odonnell or a weaker McFadden key', async () => {
    // "meaveodonnell" and "macfaddengarage" both share the MFTN code; previously
    // every phonetic hit tied at 0.90, so Meave Odonnell (1110011) came first
    // and stop 1110386 ranked on its weaker "macfaddengarage" key.
    const results = await engine.search("Mac Fatten");
    expect(results[0]!.stopId).not.toBe(MEAVE_ODONNELL_STOP);
    expect(results[0]).toMatchObject({ matchType: "phonetic", term: "macfadden" });
    expect(residentsOf(results[0]!.stopId)).toContain("McFadden");

    // Confidence reflects closeness instead of every phonetic hit sitting at the cap.
    expect(results[0]!.confidence).toBeLessThan(0.9);

    // Stop 1110386 has both "MacFadden Garage" and surname "McFadden"; it must be
    // scored on its closer key, not whichever index happened to be scanned first.
    expect(results.find((r) => r.stopId === MCFADDEN_GARAGE_STOP)).toMatchObject({
      term: "macfadden",
    });
  });

  it("scores the same regardless of transcript capitalisation", async () => {
    const strip = (rs: Awaited<ReturnType<typeof engine.search>>) =>
      rs.map(({ stopId, confidence, matchType }) => ({ stopId, confidence, matchType }));
    const lower = strip(await engine.search("mac fatten"));
    expect(strip(await engine.search("Mac Fatten"))).toEqual(lower);
    expect(strip(await engine.search("MAC FATTEN"))).toEqual(lower);
  });

  it("keeps exact matches unchanged", async () => {
    const results = await engine.search("Cara Greene");
    expect(results[0]).toMatchObject({ stopId: CARA_GREENE_STOP, matchType: "exact", confidence: 0.98 });
  });
});

import { describe, it, expect } from "vitest";
import {
  detectCorrection,
  normalizeTranscript,
  createVoiceSearchContext,
  isWithinCorrectionWindow,
  type VoiceSearchContext,
} from "./correctionDetection";
import type { Stop } from "../../../drizzle/schema";

// Mock stop for testing
const mockStop = (id: number, name: string): Stop => ({
  id,
  sectionId: 1,
  stopOrder: id,
  side: "L",
  residents: name,
  businessName: null,
  aliases: null,
  propertyType: "Residential",
  address: `${id} Main St`,
  road: "Main Road",
  notes: null,
  dogWarning: false,
  parcelDropOff: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe("correctionDetection (Refined)", () => {
  describe("normalizeTranscript", () => {
    it("should lowercase and trim", () => {
      expect(normalizeTranscript("  MICHAEL  ")).toBe("michael");
    });

    it("should remove extra spaces", () => {
      expect(normalizeTranscript("Michael    Gallagher")).toBe("michael gallagher");
    });

    it("should handle mixed case", () => {
      expect(normalizeTranscript("PaTrIcK")).toBe("patrick");
    });

    it("should handle empty string", () => {
      expect(normalizeTranscript("")).toBe("");
    });

    it("should handle speech engine quirks like 'Mac Fatten' for 'McFadden'", () => {
      expect(normalizeTranscript("Mac Fatten")).toBe("mac fatten");
    });
  });

  describe("createVoiceSearchContext", () => {
    it("should create context with single-word query", () => {
      const context = createVoiceSearchContext("Michael", 1, [mockStop(1, "Michael")]);

      expect(context.transcript).toBe("Michael");
      expect(context.normalizedTranscript).toBe("michael");
      expect(context.matchLevel).toBe(1);
      expect(context.isMultiWord).toBe(false);
      expect(context.timestamp).toBeGreaterThan(0);
    });

    it("should create context with multi-word query", () => {
      const context = createVoiceSearchContext(
        "Michael Gallagher",
        2,
        [mockStop(1, "Michael Gallagher")]
      );

      expect(context.isMultiWord).toBe(true);
    });

    it("should handle no results", () => {
      const context = createVoiceSearchContext("Nonexistent", 0, []);

      expect(context.matchLevel).toBe(0);
      expect(context.matchResults.length).toBe(0);
    });

    it("should preserve actual speech engine transcript", () => {
      const context = createVoiceSearchContext("Mac Fatten", 0, []);

      expect(context.transcript).toBe("Mac Fatten");
      expect(context.normalizedTranscript).toBe("mac fatten");
    });
  });

  describe("detectCorrection (Refined: Learn on ANY manual selection)", () => {
    it("should not record when no voice context", () => {
      const result = detectCorrection(null, mockStop(1, "Michael"));

      expect(result.shouldRecord).toBe(false);
      expect(result.reason).toBe("No voice search context");
    });

    it("should RECORD when exact match found (level 1) and user selects", () => {
      const context = createVoiceSearchContext("Michael", 1, [mockStop(1, "Michael")]);
      const result = detectCorrection(context, mockStop(1, "Michael"));

      // REFINED: Now we learn on ANY manual selection
      expect(result.shouldRecord).toBe(true);
      expect(result.reason).toContain("manually selected stop after voice search");
    });

    it("should RECORD when alias match found (level 2) and user selects", () => {
      const context = createVoiceSearchContext("Mike", 2, [mockStop(1, "Michael")]);
      const result = detectCorrection(context, mockStop(1, "Michael"));

      expect(result.shouldRecord).toBe(true);
    });

    it("should RECORD when no match found (level 0) and user selects", () => {
      const context = createVoiceSearchContext("Nonexistent", 0, []);
      const result = detectCorrection(context, mockStop(1, "Michael"));

      expect(result.shouldRecord).toBe(true);
      expect(result.transcript).toBe("Nonexistent");
      expect(result.normalizedTranscript).toBe("nonexistent");
    });

    it("should RECORD when broad fallback (level 3) and user selects", () => {
      const context = createVoiceSearchContext(
        "Michael",
        3,
        [mockStop(1, "Michael"), mockStop(2, "Mike")]
      );
      const result = detectCorrection(context, mockStop(1, "Michael"));

      expect(result.shouldRecord).toBe(true);
    });

    it("should RECORD when empty results (level 0)", () => {
      const context = createVoiceSearchContext("Xyz", 0, []);
      const result = detectCorrection(context, mockStop(1, "Michael"));

      expect(result.shouldRecord).toBe(true);
    });

    it("should preserve original transcript (actual speech engine output)", () => {
      const context = createVoiceSearchContext("  MICHAEL  ", 3, [mockStop(1, "Michael")]);
      const result = detectCorrection(context, mockStop(1, "Michael"));

      expect(result.transcript).toBe("  MICHAEL  ");
      expect(result.normalizedTranscript).toBe("michael");
    });

    it("should learn speech engine quirks: 'Mac Fatten' → McFadden", () => {
      const context = createVoiceSearchContext("Mac Fatten", 0, []);
      const result = detectCorrection(context, mockStop(1, "McFadden"));

      expect(result.shouldRecord).toBe(true);
      expect(result.transcript).toBe("Mac Fatten");
      expect(result.normalizedTranscript).toBe("mac fatten");
    });

    it("should learn wrong match correction: user selects different stop", () => {
      // Engine returned Michael Gallagher, but user selected Michael Doherty
      const context = createVoiceSearchContext(
        "Michael",
        1,
        [mockStop(1, "Michael Gallagher")]
      );
      const result = detectCorrection(context, mockStop(2, "Michael Doherty"));

      expect(result.shouldRecord).toBe(true);
      expect(result.transcript).toBe("Michael");
    });

    it("should learn multiple suggestions: user chooses one", () => {
      const context = createVoiceSearchContext(
        "Michael",
        3,
        [
          mockStop(1, "Michael O'Neill"),
          mockStop(2, "Michael Gallagher"),
          mockStop(3, "Michael Boyle"),
        ]
      );
      const result = detectCorrection(context, mockStop(2, "Michael Gallagher"));

      expect(result.shouldRecord).toBe(true);
      expect(result.normalizedTranscript).toBe("michael");
    });
  });

  describe("isWithinCorrectionWindow", () => {
    it("should accept tap immediately after search", () => {
      const context = createVoiceSearchContext("Michael", 0, []);
      const tapTime = context.timestamp + 100; // 100ms later

      expect(isWithinCorrectionWindow(context, tapTime)).toBe(true);
    });

    it("should accept tap within default window (10s)", () => {
      const context = createVoiceSearchContext("Michael", 0, []);
      const tapTime = context.timestamp + 5000; // 5s later

      expect(isWithinCorrectionWindow(context, tapTime)).toBe(true);
    });

    it("should reject tap outside default window", () => {
      const context = createVoiceSearchContext("Michael", 0, []);
      const tapTime = context.timestamp + 15000; // 15s later

      expect(isWithinCorrectionWindow(context, tapTime)).toBe(false);
    });

    it("should reject tap before search", () => {
      const context = createVoiceSearchContext("Michael", 0, []);
      const tapTime = context.timestamp - 1000; // 1s before

      expect(isWithinCorrectionWindow(context, tapTime)).toBe(false);
    });

    it("should respect custom window size", () => {
      const context = createVoiceSearchContext("Michael", 0, []);
      const tapTime = context.timestamp + 3000; // 3s later

      expect(isWithinCorrectionWindow(context, tapTime, 2000)).toBe(false);
      expect(isWithinCorrectionWindow(context, tapTime, 5000)).toBe(true);
    });

    it("should accept tap at window boundary", () => {
      const context = createVoiceSearchContext("Michael", 0, []);
      const tapTime = context.timestamp + 10000; // Exactly 10s later

      expect(isWithinCorrectionWindow(context, tapTime, 10000)).toBe(true);
    });
  });

  describe("Integration: Refined Correction Detection Pipeline", () => {
    it("Scenario 1: No match → user selects correct stop → learn", () => {
      const context = createVoiceSearchContext("Michael", 0, []);
      const result = detectCorrection(context, mockStop(1, "Michael"));

      expect(result.shouldRecord).toBe(true);
      expect(result.transcript).toBe("Michael");
    });

    it("Scenario 2: Wrong match → user selects different stop → learn", () => {
      const context = createVoiceSearchContext(
        "Michael",
        1,
        [mockStop(1, "Michael Gallagher")]
      );
      const result = detectCorrection(context, mockStop(2, "Michael Doherty"));

      expect(result.shouldRecord).toBe(true);
      expect(result.transcript).toBe("Michael");
    });

    it("Scenario 3: Multiple suggestions → user chooses one → learn", () => {
      const context = createVoiceSearchContext(
        "Michael",
        3,
        [
          mockStop(1, "Michael O'Neill"),
          mockStop(2, "Michael Gallagher"),
          mockStop(3, "Michael Boyle"),
        ]
      );
      const result = detectCorrection(context, mockStop(2, "Michael Gallagher"));

      expect(result.shouldRecord).toBe(true);
    });

    it("Scenario 4: Speech engine quirk → user selects → learn quirk", () => {
      // User says "McFadden" but engine hears "Mac Fatten"
      const context = createVoiceSearchContext("Mac Fatten", 0, []);
      const result = detectCorrection(context, mockStop(1, "McFadden"));

      expect(result.shouldRecord).toBe(true);
      expect(result.transcript).toBe("Mac Fatten");
      expect(result.normalizedTranscript).toBe("mac fatten");
    });

    it("Scenario 5: Multi-word correction", () => {
      const context = createVoiceSearchContext(
        "Michael Gallagher",
        0,
        []
      );
      const result = detectCorrection(context, mockStop(1, "Michael Gallagher"));

      expect(result.shouldRecord).toBe(true);
      expect(context.isMultiWord).toBe(true);
      expect(result.normalizedTranscript).toBe("michael gallagher");
    });
  });
});

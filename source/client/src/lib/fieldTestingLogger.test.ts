import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  recordSearchEvent,
  getSearchEventsForRoute,
  calculateStats,
  exportAsJSON,
  exportAsCSV,
  type SearchEvent,
} from "./fieldTestingLogger";

// Mock search event
const createMockSearchEvent = (overrides?: Partial<SearchEvent>): SearchEvent => ({
  id: `event-${Date.now()}`,
  timestamp: Date.now(),
  routeId: 1,
  originalTranscript: "Michael",
  normalizedTranscript: "michael",
  learnedMappingUsed: false,
  fuzzyMatchingUsed: false,
  topCandidates: [
    {
      stopId: 1,
      stopName: "Michael Gallagher",
      confidence: 0.95,
      matchType: "exact",
    },
  ],
  selectedStopId: 1,
  selectedStopName: "Michael Gallagher",
  responseTimeMs: 450,
  manualCorrectionMade: false,
  appMode: "delivery",
  ...overrides,
});

describe("fieldTestingLogger", () => {
  describe("calculateStats", () => {
    it("should calculate stats for empty events", () => {
      const stats = calculateStats([]);

      expect(stats.totalSearches).toBe(0);
      expect(stats.successfulFirstTimeMatches).toBe(0);
      expect(stats.searchesRequiringManualCorrection).toBe(0);
      expect(stats.averageResponseTimeMs).toBe(0);
    });

    it("should count successful first-time matches with exact match", () => {
      const events = [
        createMockSearchEvent({
          topCandidates: [
            {
              stopId: 1,
              stopName: "Michael",
              confidence: 0.95,
              matchType: "exact",
            },
          ],
        }),
      ];

      const stats = calculateStats(events);

      expect(stats.totalSearches).toBe(1);
      expect(stats.successfulFirstTimeMatches).toBe(1);
    });

    it("should count successful first-time matches with learned mapping", () => {
      const events = [
        createMockSearchEvent({
          learnedMappingUsed: true,
        }),
      ];

      const stats = calculateStats(events);

      expect(stats.successfulFirstTimeMatches).toBe(1);
      expect(stats.learnedMappingsUsedCount).toBe(1);
    });

    it("should count manual corrections", () => {
      const events = [
        createMockSearchEvent({
          manualCorrectionMade: true,
          correctionFromStopId: 1,
          correctionToStopId: 2,
        }),
      ];

      const stats = calculateStats(events);

      expect(stats.searchesRequiringManualCorrection).toBe(1);
      expect(stats.newLearnedMappingsCreated).toBe(1);
    });

    it("should calculate average response time", () => {
      const events = [
        createMockSearchEvent({ responseTimeMs: 400 }),
        createMockSearchEvent({ responseTimeMs: 500 }),
        createMockSearchEvent({ responseTimeMs: 600 }),
      ];

      const stats = calculateStats(events);

      expect(stats.averageResponseTimeMs).toBe(500);
    });

    it("should track fuzzy matching usage", () => {
      const events = [
        createMockSearchEvent({ fuzzyMatchingUsed: true }),
        createMockSearchEvent({ fuzzyMatchingUsed: false }),
      ];

      const stats = calculateStats(events);

      expect(stats.fuzzyMatchingUsedCount).toBe(1);
    });

    it("should identify common speech errors", () => {
      const events = [
        createMockSearchEvent({ normalizedTranscript: "michael" }),
        createMockSearchEvent({ normalizedTranscript: "michael" }),
        createMockSearchEvent({ normalizedTranscript: "patrick" }),
      ];

      const stats = calculateStats(events);

      expect(stats.commonSpeechErrors.get("michael")).toBe(2);
      expect(stats.commonSpeechErrors.get("patrick")).toBe(1);
    });

    it("should calculate success rate percentage", () => {
      const events = [
        createMockSearchEvent({
          topCandidates: [
            {
              stopId: 1,
              stopName: "Michael",
              confidence: 0.95,
              matchType: "exact",
            },
          ],
        }),
        createMockSearchEvent({
          fuzzyMatchingUsed: true,
          manualCorrectionMade: true,
          topCandidates: [
            {
              stopId: 2,
              stopName: "Patrick",
              confidence: 0.65,
              matchType: "fuzzy",
            },
          ],
        }),
      ];

      const stats = calculateStats(events);

      expect(stats.totalSearches).toBe(2);
      expect(stats.successfulFirstTimeMatches).toBe(1);
      expect(stats.searchesRequiringManualCorrection).toBe(1);
    });
  });

  describe("exportAsJSON", () => {
    it("should export events as valid JSON", () => {
      const events = [
        createMockSearchEvent(),
        createMockSearchEvent(),
      ];

      const json = exportAsJSON(events);
      const parsed = JSON.parse(json);

      expect(parsed.totalEvents).toBe(2);
      expect(parsed.events.length).toBe(2);
      expect(parsed.exportedAt).toBeDefined();
    });

    it("should include all event fields in JSON export", () => {
      const event = createMockSearchEvent({
        originalTranscript: "Mac Fatten",
        normalizedTranscript: "mac fatten",
        learnedMappingUsed: true,
        fuzzyMatchingUsed: false,
      });

      const json = exportAsJSON([event]);
      const parsed = JSON.parse(json);

      expect(parsed.events[0].originalTranscript).toBe("Mac Fatten");
      expect(parsed.events[0].normalizedTranscript).toBe("mac fatten");
      expect(parsed.events[0].learnedMappingUsed).toBe(true);
    });
  });

  describe("exportAsCSV", () => {
    it("should export events as CSV with headers", () => {
      const events = [createMockSearchEvent()];

      const csv = exportAsCSV(events);
      const lines = csv.split("\n");

      expect(lines[0]).toContain("Timestamp");
      expect(lines[0]).toContain("Original Transcript");
      expect(lines[0]).toContain("Normalized Transcript");
      expect(lines[0]).toContain("Response Time");
      expect(lines.length).toBe(2); // Header + 1 event
    });

    it("should include all event data in CSV rows", () => {
      const event = createMockSearchEvent({
        originalTranscript: "Michael Gallagher",
        selectedStopName: "Michael Gallagher",
        responseTimeMs: 450,
        manualCorrectionMade: false,
      });

      const csv = exportAsCSV([event]);
      const lines = csv.split("\n");

      expect(lines[1]).toContain("Michael Gallagher");
      expect(lines[1]).toContain("450");
      expect(lines[1]).toContain("No");
    });

    it("should handle multiple events in CSV", () => {
      const events = [
        createMockSearchEvent(),
        createMockSearchEvent(),
        createMockSearchEvent(),
      ];

      const csv = exportAsCSV(events);
      const lines = csv.split("\n");

      expect(lines.length).toBe(4); // Header + 3 events
    });

    it("should escape quotes in CSV fields", () => {
      const event = createMockSearchEvent({
        originalTranscript: 'O"Brien',
        selectedStopName: 'O"Brien',
      });

      const csv = exportAsCSV([event]);

      // CSV escaping: quotes are doubled, then wrapped in quotes
      expect(csv).toContain('"O""Brien"');
    });
  });

  describe("Integration: Field Testing Workflow", () => {
    it("should track successful search workflow", () => {
      const events = [
        createMockSearchEvent({
          originalTranscript: "Michael",
          normalizedTranscript: "michael",
          topCandidates: [
            {
              stopId: 1,
              stopName: "Michael Gallagher",
              confidence: 0.95,
              matchType: "exact",
            },
          ],
          selectedStopId: 1,
          selectedStopName: "Michael Gallagher",
          responseTimeMs: 450,
          manualCorrectionMade: false,
        }),
      ];

      const stats = calculateStats(events);

      expect(stats.totalSearches).toBe(1);
      expect(stats.successfulFirstTimeMatches).toBe(1);
      expect(stats.searchesRequiringManualCorrection).toBe(0);
      expect(stats.averageResponseTimeMs).toBe(450);
    });

    it("should track correction workflow", () => {
      const events = [
        createMockSearchEvent({
          originalTranscript: "Michael",
          topCandidates: [
            {
              stopId: 1,
              stopName: "Michael Gallagher",
              confidence: 0.85,
              matchType: "fuzzy",
            },
          ],
          selectedStopId: 1,
          selectedStopName: "Michael Gallagher",
          manualCorrectionMade: true,
          correctionFromStopId: 1,
          correctionToStopId: 2,
        }),
      ];

      const stats = calculateStats(events);

      expect(stats.totalSearches).toBe(1);
      expect(stats.searchesRequiringManualCorrection).toBe(1);
      expect(stats.newLearnedMappingsCreated).toBe(1);
    });

    it("should track learned mapping usage workflow", () => {
      const events = [
        createMockSearchEvent({
          originalTranscript: "Mac Fatten",
          normalizedTranscript: "mac fatten",
          learnedMappingUsed: true,
          topCandidates: [
            {
              stopId: 1,
              stopName: "McFadden",
              confidence: 0.75,
              matchType: "persistent-learned",
            },
          ],
          selectedStopId: 1,
          selectedStopName: "McFadden",
          responseTimeMs: 200,
        }),
      ];

      const stats = calculateStats(events);

      expect(stats.learnedMappingsUsedCount).toBe(1);
      expect(stats.successfulFirstTimeMatches).toBe(1);
      expect(stats.averageResponseTimeMs).toBe(200);
    });

    it("should generate comprehensive summary", () => {
      const events = [
        createMockSearchEvent({
          topCandidates: [
            {
              stopId: 1,
              stopName: "Michael",
              confidence: 0.95,
              matchType: "exact",
            },
          ],
        }),
        createMockSearchEvent({
          manualCorrectionMade: true,
          correctionFromStopId: 1,
          correctionToStopId: 2,
          topCandidates: [
            {
              stopId: 1,
              stopName: "Michael",
              confidence: 0.75,
              matchType: "fuzzy",
            },
          ],
        }),
        createMockSearchEvent({
          learnedMappingUsed: true,
        }),
      ];

      const stats = calculateStats(events);

      expect(stats.totalSearches).toBe(3);
      expect(stats.successfulFirstTimeMatches).toBe(2); // Exact match + learned mapping
      expect(stats.searchesRequiringManualCorrection).toBe(1); // Manual correction is NOT a first-time match
      expect(stats.newLearnedMappingsCreated).toBe(1);
    });
  });
});

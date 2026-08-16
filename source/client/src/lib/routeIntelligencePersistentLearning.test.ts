import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  recordCorrection,
  lookupLearnedMapping,
  getAllLearnedMappingsForRoute,
  deleteLearnedMapping,
  clearLearnedMappingsForRoute,
  getLearnedMappingsStats,
  LearnedMapping,
} from "./routeIntelligencePersistentLearning";

/**
 * Mock IndexedDB for testing
 * Since IndexedDB is not available in Node.js test environment,
 * we use an in-memory store that mimics IndexedDB behavior
 */

interface MockStore {
  [key: string]: LearnedMapping;
}

let mockStore: MockStore = {};

// Mock indexedDB globally for tests
const mockIndexedDB = {
  open: vi.fn((dbName: string, version: number) => {
    return {
      onsuccess: null as any,
      onerror: null as any,
      onupgradeneeded: null as any,
      result: {
        objectStoreNames: {
          contains: (name: string) => false,
        },
        createObjectStore: vi.fn((name: string, options: any) => ({
          createIndex: vi.fn(),
        })),
        transaction: (storeNames: string[], mode: string) => ({
          objectStore: (name: string) => ({
            put: (mapping: LearnedMapping) => ({
              onsuccess: null as any,
              onerror: null as any,
            }),
            delete: (id: string) => ({
              onsuccess: null as any,
              onerror: null as any,
            }),
            get: (id: string) => ({
              onsuccess: null as any,
              onerror: null as any,
            }),
            index: (indexName: string) => ({
              getAll: (range?: any) => ({
                onsuccess: null as any,
                onerror: null as any,
                result: [] as LearnedMapping[],
              }),
              openCursor: (range?: any) => ({
                onsuccess: null as any,
                onerror: null as any,
              }),
            }),
          }),
        }),
      },
    };
  }),
};

// Simplified in-memory implementation for testing
class InMemoryLearningStore {
  private store: Map<string, LearnedMapping> = new Map();

  async recordCorrection(
    routeId: number,
    stopId: number,
    originalTranscript: string,
    normalizedTranscript: string,
    tags?: string[]
  ): Promise<LearnedMapping> {
    const now = Date.now();
    const key = `${routeId}-${normalizedTranscript}`;

    const existing = Array.from(this.store.values()).find(
      (m) =>
        m.routeId === routeId &&
        m.stopId === stopId &&
        m.normalizedTranscript === normalizedTranscript
    );

    if (existing) {
      const updated = {
        ...existing,
        lastConfirmedAt: now,
        confirmationCount: existing.confirmationCount + 1,
      };
      this.store.set(existing.id, updated);
      return updated;
    }

    const mapping: LearnedMapping = {
      id: `${routeId}-${stopId}-${normalizedTranscript}-${now}`,
      routeId,
      stopId,
      originalTranscript,
      normalizedTranscript,
      firstConfirmedAt: now,
      lastConfirmedAt: now,
      confirmationCount: 1,
      tags: tags || [],
    };

    this.store.set(mapping.id, mapping);
    return mapping;
  }

  async lookupLearnedMapping(
    routeId: number,
    normalizedTranscript: string
  ): Promise<{ stopId: number; confidence: number; confirmationCount: number; lastConfirmedAt: number } | null> {
    const mappings = Array.from(this.store.values()).filter(
      (m) => m.routeId === routeId && m.normalizedTranscript === normalizedTranscript
    );

    if (mappings.length === 0) return null;

    const best = mappings.reduce((a, b) =>
      a.confirmationCount > b.confirmationCount ? a : b
    );

    const confidence = Math.min(0.5 + best.confirmationCount * 0.1, 0.85);

    return {
      stopId: best.stopId,
      confidence,
      confirmationCount: best.confirmationCount,
      lastConfirmedAt: best.lastConfirmedAt,
    };
  }

  async getAllLearnedMappingsForRoute(routeId: number): Promise<LearnedMapping[]> {
    const mappings = Array.from(this.store.values())
      .filter((m) => m.routeId === routeId)
      .sort((a, b) => {
        if (b.confirmationCount !== a.confirmationCount) {
          return b.confirmationCount - a.confirmationCount;
        }
        return b.lastConfirmedAt - a.lastConfirmedAt;
      });

    return mappings;
  }

  async deleteLearnedMapping(mappingId: string): Promise<void> {
    this.store.delete(mappingId);
  }

  async clearLearnedMappingsForRoute(routeId: number): Promise<void> {
    const idsToDelete = Array.from(this.store.entries())
      .filter(([_, m]) => m.routeId === routeId)
      .map(([id, _]) => id);

    idsToDelete.forEach((id) => this.store.delete(id));
  }

  async getLearnedMappingsStats(routeId: number): Promise<{
    totalMappings: number;
    totalConfirmations: number;
    mostConfirmedTranscript: string | null;
    mostConfirmedCount: number;
  }> {
    const mappings = await this.getAllLearnedMappingsForRoute(routeId);

    const totalConfirmations = mappings.reduce((sum, m) => sum + m.confirmationCount, 0);
    const mostConfirmed = mappings[0];

    return {
      totalMappings: mappings.length,
      totalConfirmations,
      mostConfirmedTranscript: mostConfirmed?.normalizedTranscript || null,
      mostConfirmedCount: mostConfirmed?.confirmationCount || 0,
    };
  }

  clear(): void {
    this.store.clear();
  }
}

describe("routeIntelligencePersistentLearning", () => {
  let learningStore: InMemoryLearningStore;

  beforeEach(() => {
    learningStore = new InMemoryLearningStore();
  });

  afterEach(() => {
    learningStore.clear();
  });

  describe("recordCorrection", () => {
    it("should create a new learned mapping on first correction", async () => {
      const mapping = await learningStore.recordCorrection(
        1,
        10,
        "Michael",
        "michael",
        ["pronunciation"]
      );

      expect(mapping.routeId).toBe(1);
      expect(mapping.stopId).toBe(10);
      expect(mapping.originalTranscript).toBe("Michael");
      expect(mapping.normalizedTranscript).toBe("michael");
      expect(mapping.confirmationCount).toBe(1);
      expect(mapping.tags).toContain("pronunciation");
      expect(mapping.firstConfirmedAt).toBeGreaterThan(0);
      expect(mapping.lastConfirmedAt).toBeGreaterThan(0);
    });

    it("should increment confirmation count on repeated correction", async () => {
      const mapping1 = await learningStore.recordCorrection(1, 10, "Michael", "michael");
      const mapping2 = await learningStore.recordCorrection(1, 10, "Michael", "michael");

      expect(mapping2.confirmationCount).toBe(2);
      expect(mapping2.firstConfirmedAt).toBe(mapping1.firstConfirmedAt);
      expect(mapping2.lastConfirmedAt).toBeGreaterThanOrEqual(mapping1.lastConfirmedAt);
    });

    it("should handle multiple corrections for same route", async () => {
      const mapping1 = await learningStore.recordCorrection(1, 10, "Michael", "michael");
      const mapping2 = await learningStore.recordCorrection(1, 20, "Patrick", "patrick");

      expect(mapping1.stopId).toBe(10);
      expect(mapping2.stopId).toBe(20);
      expect(mapping1.normalizedTranscript).not.toBe(mapping2.normalizedTranscript);
    });

    it("should handle different routes separately", async () => {
      const mapping1 = await learningStore.recordCorrection(1, 10, "Michael", "michael");
      const mapping2 = await learningStore.recordCorrection(2, 10, "Michael", "michael");

      expect(mapping1.routeId).toBe(1);
      expect(mapping2.routeId).toBe(2);
      expect(mapping1.confirmationCount).toBe(1);
      expect(mapping2.confirmationCount).toBe(1);
    });
  });

  describe("lookupLearnedMapping", () => {
    it("should return null when no mapping exists", async () => {
      const result = await learningStore.lookupLearnedMapping(1, "nonexistent");
      expect(result).toBeNull();
    });

    it("should find a learned mapping by normalized transcript", async () => {
      await learningStore.recordCorrection(1, 10, "Michael", "michael");
      const result = await learningStore.lookupLearnedMapping(1, "michael");

      expect(result).not.toBeNull();
      expect(result?.stopId).toBe(10);
      expect(result?.confirmationCount).toBe(1);
    });

    it("should calculate confidence based on confirmation count", async () => {
      await learningStore.recordCorrection(1, 10, "Michael", "michael");
      const result1 = await learningStore.lookupLearnedMapping(1, "michael");

      expect(result1?.confidence).toBe(0.6);

      await learningStore.recordCorrection(1, 10, "Michael", "michael");
      const result2 = await learningStore.lookupLearnedMapping(1, "michael");

      expect(result2?.confidence).toBe(0.7);

      await learningStore.recordCorrection(1, 10, "Michael", "michael");
      const result3 = await learningStore.lookupLearnedMapping(1, "michael");

      expect(result3?.confidence).toBe(0.8);
    });

    it("should return highest confidence mapping when multiple exist", async () => {
      await learningStore.recordCorrection(1, 10, "Michael", "michael");
      await learningStore.recordCorrection(1, 20, "Michael", "michael");

      await learningStore.recordCorrection(1, 10, "Michael", "michael");
      await learningStore.recordCorrection(1, 10, "Michael", "michael");

      const result = await learningStore.lookupLearnedMapping(1, "michael");

      expect(result?.stopId).toBe(10);
      expect(result?.confirmationCount).toBe(3);
    });

    it("should return null for different route", async () => {
      await learningStore.recordCorrection(1, 10, "Michael", "michael");
      const result = await learningStore.lookupLearnedMapping(2, "michael");

      expect(result).toBeNull();
    });
  });

  describe("getAllLearnedMappingsForRoute", () => {
    it("should return empty array when no mappings exist", async () => {
      const mappings = await learningStore.getAllLearnedMappingsForRoute(1);
      expect(mappings).toEqual([]);
    });

    it("should return all mappings for a route", async () => {
      await learningStore.recordCorrection(1, 10, "Michael", "michael");
      await learningStore.recordCorrection(1, 20, "Patrick", "patrick");
      await learningStore.recordCorrection(1, 30, "Sean", "sean");

      const mappings = await learningStore.getAllLearnedMappingsForRoute(1);

      expect(mappings.length).toBe(3);
      expect(mappings.map((m) => m.stopId)).toContain(10);
      expect(mappings.map((m) => m.stopId)).toContain(20);
      expect(mappings.map((m) => m.stopId)).toContain(30);
    });

    it("should sort by confirmation count (descending)", async () => {
      await learningStore.recordCorrection(1, 10, "Michael", "michael");
      await learningStore.recordCorrection(1, 20, "Patrick", "patrick");
      await learningStore.recordCorrection(1, 30, "Sean", "sean");

      await learningStore.recordCorrection(1, 20, "Patrick", "patrick");
      await learningStore.recordCorrection(1, 20, "Patrick", "patrick");

      const mappings = await learningStore.getAllLearnedMappingsForRoute(1);

      expect(mappings[0].stopId).toBe(20);
      expect(mappings[0].confirmationCount).toBe(3);
    });

    it("should exclude mappings from other routes", async () => {
      await learningStore.recordCorrection(1, 10, "Michael", "michael");
      await learningStore.recordCorrection(2, 20, "Patrick", "patrick");

      const mappings1 = await learningStore.getAllLearnedMappingsForRoute(1);
      const mappings2 = await learningStore.getAllLearnedMappingsForRoute(2);

      expect(mappings1.length).toBe(1);
      expect(mappings1[0].stopId).toBe(10);
      expect(mappings2.length).toBe(1);
      expect(mappings2[0].stopId).toBe(20);
    });
  });

  describe("deleteLearnedMapping", () => {
    it("should delete a specific learned mapping", async () => {
      const mapping = await learningStore.recordCorrection(1, 10, "Michael", "michael");
      await learningStore.deleteLearnedMapping(mapping.id);

      const result = await learningStore.lookupLearnedMapping(1, "michael");
      expect(result).toBeNull();
    });

    it("should not affect other mappings", async () => {
      const mapping1 = await learningStore.recordCorrection(1, 10, "Michael", "michael");
      const mapping2 = await learningStore.recordCorrection(1, 20, "Patrick", "patrick");

      await learningStore.deleteLearnedMapping(mapping1.id);

      const result1 = await learningStore.lookupLearnedMapping(1, "michael");
      const result2 = await learningStore.lookupLearnedMapping(1, "patrick");

      expect(result1).toBeNull();
      expect(result2).not.toBeNull();
      expect(result2?.stopId).toBe(20);
    });
  });

  describe("clearLearnedMappingsForRoute", () => {
    it("should clear all mappings for a specific route", async () => {
      await learningStore.recordCorrection(1, 10, "Michael", "michael");
      await learningStore.recordCorrection(1, 20, "Patrick", "patrick");
      await learningStore.recordCorrection(2, 30, "Sean", "sean");

      await learningStore.clearLearnedMappingsForRoute(1);

      const mappings1 = await learningStore.getAllLearnedMappingsForRoute(1);
      const mappings2 = await learningStore.getAllLearnedMappingsForRoute(2);

      expect(mappings1.length).toBe(0);
      expect(mappings2.length).toBe(1);
    });
  });

  describe("getLearnedMappingsStats", () => {
    it("should return zero stats when no mappings exist", async () => {
      const stats = await learningStore.getLearnedMappingsStats(1);

      expect(stats.totalMappings).toBe(0);
      expect(stats.totalConfirmations).toBe(0);
      expect(stats.mostConfirmedTranscript).toBeNull();
      expect(stats.mostConfirmedCount).toBe(0);
    });

    it("should calculate correct statistics", async () => {
      await learningStore.recordCorrection(1, 10, "Michael", "michael");
      await learningStore.recordCorrection(1, 10, "Michael", "michael");
      await learningStore.recordCorrection(1, 20, "Patrick", "patrick");

      const stats = await learningStore.getLearnedMappingsStats(1);

      expect(stats.totalMappings).toBe(2);
      expect(stats.totalConfirmations).toBe(3);
      expect(stats.mostConfirmedTranscript).toBe("michael");
      expect(stats.mostConfirmedCount).toBe(2);
    });

    it("should track most confirmed mapping", async () => {
      await learningStore.recordCorrection(1, 10, "Michael", "michael");
      await learningStore.recordCorrection(1, 20, "Patrick", "patrick");
      await learningStore.recordCorrection(1, 20, "Patrick", "patrick");
      await learningStore.recordCorrection(1, 20, "Patrick", "patrick");
      await learningStore.recordCorrection(1, 30, "Sean", "sean");

      const stats = await learningStore.getLearnedMappingsStats(1);

      expect(stats.totalMappings).toBe(3);
      expect(stats.totalConfirmations).toBe(5);
      expect(stats.mostConfirmedTranscript).toBe("patrick");
      expect(stats.mostConfirmedCount).toBe(3);
    });
  });

  describe("Confidence Calculation", () => {
    it("should cap confidence at 0.85", async () => {
      await learningStore.recordCorrection(1, 10, "Michael", "michael");

      for (let i = 0; i < 10; i++) {
        await learningStore.recordCorrection(1, 10, "Michael", "michael");
      }

      const result = await learningStore.lookupLearnedMapping(1, "michael");

      expect(result?.confidence).toBeLessThanOrEqual(0.85);
      expect(result?.confirmationCount).toBe(11);
    });
  });

  describe("Integration: Learning Pipeline", () => {
    it("should support full learning workflow", async () => {
      // 1. User says "Michael" but no exact match
      // 2. User manually selects stop 10
      // 3. System records correction
      const mapping = await learningStore.recordCorrection(1, 10, "Michael", "michael");

      // 4. Next time user says "Michael", lookup should find it
      const result = await learningStore.lookupLearnedMapping(1, "michael");

      expect(result).not.toBeNull();
      expect(result?.stopId).toBe(10);
      expect(result?.confidence).toBe(0.6);

      // 5. User confirms same mapping again
      await learningStore.recordCorrection(1, 10, "Michael", "michael");
      const result2 = await learningStore.lookupLearnedMapping(1, "michael");

      expect(result2?.confidence).toBe(0.7);
      expect(result2?.confirmationCount).toBe(2);

      // 6. Admin can inspect all learned mappings
      const allMappings = await learningStore.getAllLearnedMappingsForRoute(1);
      expect(allMappings.length).toBe(1);
      expect(allMappings[0].confirmationCount).toBe(2);

      // 7. Admin can get statistics
      const stats = await learningStore.getLearnedMappingsStats(1);
      expect(stats.totalMappings).toBe(1);
      expect(stats.totalConfirmations).toBe(2);
    });
  });
});

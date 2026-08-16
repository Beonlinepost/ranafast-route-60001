/**
 * Route Intelligence Multi-Index Engine
 * 
 * Pre-computes multiple specialized indexes at route load time.
 * Voice search is instant: normalize → search indexes → rank → return.
 * 
 * Indexes built once and never rebuilt:
 * - Full names index
 * - Surnames index
 * - First names index
 * - Addresses index (house number + house name)
 * - Roads index
 * - Aliases index
 * - Search tags index
 * 
 * Each index stores:
 * - Normalized version of the term
 * - Phonetic version of the term
 * - List of stop IDs that match
 */

import FuzzyMatcher from "./fuzzyMatcher";
import LearningHistory from "./routeIntelligenceLearning";
import {
  recordCorrection,
  lookupLearnedMapping,
  getAllLearnedMappingsForRoute,
  type LearnedMappingLookupResult,
} from "./routeIntelligencePersistentLearning";
import { normalizeTranscript } from "./correctionDetection";
import type { Stop } from "../../../drizzle/schema";

export interface IndexEntry {
  normalized: string;
  phonetic: string;
  stopIds: number[];
  source: "fullname" | "surname" | "firstname" | "address" | "road" | "alias" | "tag";
}

export interface MultiIndex {
  fullNames: Map<string, IndexEntry>;
  surnames: Map<string, IndexEntry>;
  firstNames: Map<string, IndexEntry>;
  addresses: Map<string, IndexEntry>;
  roads: Map<string, IndexEntry>;
  aliases: Map<string, IndexEntry>;
  tags: Map<string, IndexEntry>;
  // Reverse lookup: stop ID → all indexed terms for that stop
  stopTerms: Map<number, string[]>;
}

export interface SearchResult {
  stopId: number;
  confidence: number;
  matchType: "exact" | "phonetic" | "fuzzy" | "learned" | "persistent-learned";
  indexSource: string;
  term: string;
}

export class RouteIntelligenceMultiIndex {
  private routeId: number;
  private stops: Map<number, Stop> = new Map();
  private index: MultiIndex = {
    fullNames: new Map(),
    surnames: new Map(),
    firstNames: new Map(),
    addresses: new Map(),
    roads: new Map(),
    aliases: new Map(),
    tags: new Map(),
    stopTerms: new Map(),
  };
  private learning = new LearningHistory(0);
  private persistentLearningCache: Map<string, LearnedMappingLookupResult> = new Map();
  private builtAt: number = 0;

  constructor(routeId: number) {
    this.routeId = routeId;
    this.learning = new LearningHistory(routeId);
  }

  /**
   * Build all indexes once on route load.
   * Pre-computes normalized and phonetic versions of every searchable term.
   */
  buildDictionary(stops: Stop[]): void {
    console.time("[RI] Multi-index build");

    // Clear existing indexes
    this.stops.clear();
    this.index.fullNames.clear();
    this.index.surnames.clear();
    this.index.firstNames.clear();
    this.index.addresses.clear();
    this.index.roads.clear();
    this.index.aliases.clear();
    this.index.tags.clear();
    this.index.stopTerms.clear();

    // Index all stops
    stops.forEach((stop) => {
      this.stops.set(stop.id, stop);
      this.indexStop(stop);
    });

    this.builtAt = Date.now();
    console.timeEnd("[RI] Multi-index build");

    const stats = this.getDictionaryStats();
    console.debug("[RI] Dictionary ready:", stats);
  }

  /**
   * Index a single stop across all index types
   */
  private indexStop(stop: Stop): void {
    const allTerms: string[] = [];

    // 1. Full names (residents field contains pipe-separated names)
    if (stop.residents) {
      const names = stop.residents.split("|").map((n) => n.trim());
      names.forEach((fullName) => {
        if (fullName) {
          this.addToIndex(
            fullName,
            stop.id,
            "fullname",
            this.index.fullNames
          );
          allTerms.push(fullName);

          // Extract surname and first name from full name
          const parts = fullName.split(/\s+/);
          if (parts.length >= 2) {
            const surname = parts[parts.length - 1];
            const firstName = parts[0];

            this.addToIndex(
              surname,
              stop.id,
              "surname",
              this.index.surnames
            );
            allTerms.push(surname);

            this.addToIndex(
              firstName,
              stop.id,
              "firstname",
              this.index.firstNames
            );
            allTerms.push(firstName);
          }
        }
      });
    }

    // 2. Business name
    if (stop.businessName) {
      this.addToIndex(
        stop.businessName,
        stop.id,
        "fullname",
        this.index.fullNames
      );
      allTerms.push(stop.businessName);
    }

    // 3. Address (house number + house name)
    if (stop.houseNumber || stop.houseName) {
      const address = [stop.houseNumber, stop.houseName]
        .filter(Boolean)
        .join(" ");
      if (address) {
        this.addToIndex(address, stop.id, "address", this.index.addresses);
        allTerms.push(address);

        // Also index individual parts
        if (stop.houseNumber) {
          this.addToIndex(
            stop.houseNumber,
            stop.id,
            "address",
            this.index.addresses
          );
          allTerms.push(stop.houseNumber);
        }
        if (stop.houseName) {
          this.addToIndex(
            stop.houseName,
            stop.id,
            "address",
            this.index.addresses
          );
          allTerms.push(stop.houseName);
        }
      }
    }

    // 4. Road (route reference)
    if (stop.road) {
      this.addToIndex(stop.road, stop.id, "road", this.index.roads);
      allTerms.push(stop.road);
    }

    // 5. Aliases (pipe-separated)
    if (stop.aliases) {
      const aliasList = stop.aliases.split("|").map((a) => a.trim());
      aliasList.forEach((alias) => {
        if (alias) {
          this.addToIndex(alias, stop.id, "alias", this.index.aliases);
          allTerms.push(alias);
        }
      });
    }

    // 6. Search tags (pipe-separated)
    if (stop.searchTags) {
      const tagList = stop.searchTags.split("|").map((t) => t.trim());
      tagList.forEach((tag) => {
        if (tag) {
          this.addToIndex(tag, stop.id, "tag", this.index.tags);
          allTerms.push(tag);
        }
      });
    }

    // Store all terms for this stop (for reverse lookup)
    const uniqueTerms = Array.from(new Set(allTerms));
    this.index.stopTerms.set(stop.id, uniqueTerms);
  }

  /**
   * Add a term to an index with pre-computed normalized and phonetic versions
   */
  private addToIndex(
    term: string,
    stopId: number,
    source: "fullname" | "surname" | "firstname" | "address" | "road" | "alias" | "tag",
    indexMap: Map<string, IndexEntry>
  ): void {
    const normalized = this.normalizeSearchTerm(term);
    if (!normalized) return;

    const [phoneticPrimary] = FuzzyMatcher.doubleMetaphone(term);

    // Use normalized as the key
    const key = normalized;
    if (!indexMap.has(key)) {
      indexMap.set(key, {
        normalized,
        phonetic: phoneticPrimary || FuzzyMatcher.phoneticEncode(normalized),
        stopIds: [],
        source,
      });
    }

    const entry = indexMap.get(key)!;
    if (!entry.stopIds.includes(stopId)) {
      entry.stopIds.push(stopId);
    }
  }

  /**
   * Normalize a search term
   */
  private normalizeSearchTerm(term: string): string {
    if (!term) return "";

    return (
      term
        .toLowerCase()
        // Remove common filler words
        .split(/\s+/)
        .filter(
          (word) =>
            ![
              "ah",
              "right",
              "ok",
              "okay",
              "for",
              "the",
              "a",
              "and",
              "or",
              "but",
              "hold",
              "on",
              "just",
              "sake",
              "god",
              "gods",
            ].includes(word)
        )
        .join("")
        // Mc → Mac
        .replace(/^mc/i, "mac")
        // Remove apostrophes, hyphens, spaces
        .replace(/['\-\s]/g, "")
    );
  }

  /**
   * Search all indexes instantly
   * Returns ranked results
   * Now async to check persistent learned mappings from IndexedDB
   */
  async search(spokenTerm: string, threshold: number = 0.65): Promise<SearchResult[]> {
    const normalized = this.normalizeSearchTerm(spokenTerm);
    if (!normalized) return [];

    const results: Map<number, SearchResult> = new Map();

    // 1. Check persistent learned mappings first (highest priority)
    // These are explicit user corrections stored in IndexedDB
    const normalizedTranscript = normalizeTranscript(spokenTerm);
    const persistentLearned = await lookupLearnedMapping(
      this.routeId,
      normalizedTranscript
    );
    if (persistentLearned) {
      results.set(persistentLearned.stopId, {
        stopId: persistentLearned.stopId,
        confidence: persistentLearned.confidence,
        matchType: "persistent-learned",
        indexSource: "persistent-learned",
        term: spokenTerm,
      });
      // Return immediately with learned mapping (highest confidence)
      return Array.from(results.values()).sort(
        (a, b) => b.confidence - a.confidence
      );
    }

    // 2. Check legacy learned mappings (for backward compatibility)
    const learnedEntries = this.learning.getEntries().filter(
      (e) => e.spokenTerm.toLowerCase() === spokenTerm.toLowerCase()
    );
    if (learnedEntries.length > 0) {
      const selectionCounts = new Map<number, number>();
      learnedEntries.forEach((entry) => {
        selectionCounts.set(
          entry.stopId,
          (selectionCounts.get(entry.stopId) || 0) + 1
        );
      });
      const mostCommonStopId = Array.from(selectionCounts.entries()).sort(
        (a, b) => b[1] - a[1]
      )[0]?.[0];
      if (mostCommonStopId) {
        results.set(mostCommonStopId, {
          stopId: mostCommonStopId,
          confidence: 0.99,
          matchType: "learned",
          indexSource: "learned",
          term: spokenTerm,
        });
      }
    }

    // 3. Search each index
    const indexes = [
      { map: this.index.fullNames, name: "fullNames", priority: 0.95 },
      { map: this.index.surnames, name: "surnames", priority: 0.93 },
      { map: this.index.firstNames, name: "firstNames", priority: 0.90 },
      { map: this.index.addresses, name: "addresses", priority: 0.85 },
      { map: this.index.roads, name: "roads", priority: 0.80 },
      { map: this.index.aliases, name: "aliases", priority: 0.92 },
      { map: this.index.tags, name: "tags", priority: 0.75 },
    ];

    const [spokenPrimary] = FuzzyMatcher.doubleMetaphone(spokenTerm);

    indexes.forEach(({ map, name, priority }) => {
      map.forEach((entry, key) => {
        // Exact match on normalized term
        if (key === normalized) {
          entry.stopIds.forEach((stopId) => {
            if (!results.has(stopId)) {
              results.set(stopId, {
                stopId,
                confidence: 0.98,
                matchType: "exact",
                indexSource: name,
                term: key,
              });
            }
          });
          return;
        }

        // Double Metaphone Phonetic match
        const doubleMetaphoneSim = FuzzyMatcher.doubleMetaphoneSimilarity(spokenTerm, key);
        if (doubleMetaphoneSim >= 0.85 || (spokenPrimary && entry.phonetic && spokenPrimary === entry.phonetic)) {
          entry.stopIds.forEach((stopId) => {
            if (!results.has(stopId)) {
              results.set(stopId, {
                stopId,
                confidence: Math.min(0.90, doubleMetaphoneSim * priority),
                matchType: "phonetic",
                indexSource: name,
                term: key,
              });
            }
          });
          return;
        }

        // Combined Fuzzy match (Jaro-Winkler + Levenshtein + Phonetic)
        const confidence = FuzzyMatcher.calculateConfidence(spokenTerm, key);
        if (confidence >= threshold) {
          entry.stopIds.forEach((stopId) => {
            if (!results.has(stopId)) {
              results.set(stopId, {
                stopId,
                confidence: confidence * priority,
                matchType: "fuzzy",
                indexSource: name,
                term: key,
              });
            }
          });
        }
      });
    });

    // Sort by confidence descending
    return Array.from(results.values()).sort(
      (a, b) => b.confidence - a.confidence
    );
  }

  /**
   * Record a user selection for learning (legacy)
   */
  recordSelection(
    spokenTerm: string,
    selectedStopId: number,
    confidence: number = 0.9,
    matchType: string = "user-selected"
  ): void {
    const stop = this.stops.get(selectedStopId);
    if (stop) {
      this.learning.recordSelection(
        spokenTerm,
        selectedStopId,
        confidence,
        matchType
      );
    }
  }

  /**
   * Record a permanent correction (explicit user confirmation)
   * This is called when user manually selects a stop after no exact match
   */
  async recordPersistentCorrection(
    originalTranscript: string,
    selectedStopId: number,
    tags?: string[]
  ): Promise<void> {
    const normalizedTranscript = normalizeTranscript(originalTranscript);
    await recordCorrection(
      this.routeId,
      selectedStopId,
      originalTranscript,
      normalizedTranscript,
      tags
    );
    // Clear cache so next search picks up the new mapping
    this.persistentLearningCache.delete(normalizedTranscript);
  }

  /**
   * Get all persistent learned mappings for this route
   */
  async getPersistentLearnedMappings() {
    return await getAllLearnedMappingsForRoute(this.routeId);
  }

  /**
   * Get learning statistics
   */
  getLearningStats() {
    return this.learning.getStats();
  }

  /**
   * Get dictionary statistics
   */
  getDictionaryStats() {
    return {
      routeId: this.routeId,
      builtAt: new Date(this.builtAt).toISOString(),
      totalStops: this.stops.size,
      indexes: {
        fullNames: this.index.fullNames.size,
        surnames: this.index.surnames.size,
        firstNames: this.index.firstNames.size,
        addresses: this.index.addresses.size,
        roads: this.index.roads.size,
        aliases: this.index.aliases.size,
        tags: this.index.tags.size,
      },
      totalIndexEntries:
        this.index.fullNames.size +
        this.index.surnames.size +
        this.index.firstNames.size +
        this.index.addresses.size +
        this.index.roads.size +
        this.index.aliases.size +
        this.index.tags.size,
    };
  }

  /**
   * Export dictionary for debugging
   */
  exportDictionary() {
    return {
      stats: this.getDictionaryStats(),
      learning: this.learning.getStats(),
      indexes: {
        fullNames: Object.fromEntries(this.index.fullNames),
        surnames: Object.fromEntries(this.index.surnames),
        firstNames: Object.fromEntries(this.index.firstNames),
        addresses: Object.fromEntries(this.index.addresses),
        roads: Object.fromEntries(this.index.roads),
        aliases: Object.fromEntries(this.index.aliases),
        tags: Object.fromEntries(this.index.tags),
      },
    };
  }
}

export default RouteIntelligenceMultiIndex;

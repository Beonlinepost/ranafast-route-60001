/**
 * Route Intelligence Integration
 * 
 * Bridges Route Intelligence engine with the existing voice search system.
 * Provides a drop-in replacement for matchStops that uses fuzzy matching,
 * confidence ranking, and learning.
 */

import RouteIntelligence, { normalizeSearchTerm } from "./routeIntelligence";
import { findMatches, type MatchResult } from "./fuzzyMatcher";
import { makeDecision, DEFAULT_THRESHOLDS, type ConfidenceThresholds } from "./routeIntelligenceDecision";
import LearningHistory from "./routeIntelligenceLearning";
import type { Stop } from "./routeIntelligence";

/**
 * Route Intelligence search result
 */
export interface RouteIntelligenceResult {
  action: "auto-select" | "show-choice" | "no-match";
  selectedStop?: Stop;
  choices?: Stop[];
  confidence?: number;
  reason: string;
  matches?: MatchResult[];
}

/**
 * Integration manager
 */
export class RouteIntelligenceIntegration {
  private routeId: number;
  private intelligence: RouteIntelligence;
  private learning: LearningHistory;
  private thresholds: ConfidenceThresholds;
  private initialized: boolean = false;
  
  constructor(routeId: number, thresholds?: Partial<ConfidenceThresholds>) {
    this.routeId = routeId;
    this.intelligence = new RouteIntelligence(routeId);
    this.learning = new LearningHistory(routeId);
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }
  
  /**
   * Initialize the engine with stops from the route
   */
  initialize(stops: Stop[]): void {
    this.intelligence.buildDictionary(stops);
    this.initialized = true;
  }
  
  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
  
  /**
   * Search for a spoken term
   */
  search(spokenTerm: string, searchPool?: Stop[]): RouteIntelligenceResult {
    if (!this.initialized) {
      return {
        action: "no-match",
        reason: "Route Intelligence not initialized",
      };
    }
    
    const normalized = normalizeSearchTerm(spokenTerm);
    if (!normalized) {
      return {
        action: "no-match",
        reason: "Search term is empty after normalization",
      };
    }
    
    // Get all dictionary terms and their stop IDs
    const dictionaryTerms = new Map<string, number[]>();
    this.intelligence.getDictionaryEntries().forEach(entry => {
      dictionaryTerms.set(entry.term, entry.stopIds);
    });
    
    // If a search pool is provided (e.g., for delivery mode scoping),
    // filter dictionary to only include stops in that pool
    let filteredDictionary = dictionaryTerms;
    if (searchPool && searchPool.length > 0) {
      const poolIds = new Set(searchPool.map(s => s.id));
      filteredDictionary = new Map();
      dictionaryTerms.forEach((stopIds, term) => {
        const filtered = stopIds.filter(id => poolIds.has(id));
        if (filtered.length > 0) {
          filteredDictionary.set(term, filtered);
        }
      });
    }
    
    // Find matches using fuzzy matching
    const learningMappings = getLearningMappings(this.learning);
    const matches = findMatches(
      normalized,
      filteredDictionary,
      learningMappings,
      this.thresholds.noMatch
    );
    
    // Make a decision based on confidence
    const decision = makeDecision(matches, this.thresholds);
    
    // Get the full stop objects
    const allStops = this.intelligence.getAllStops();
    const stopsMap = new Map(allStops.map(s => [s.id, s]));
    
    const result: RouteIntelligenceResult = {
      action: decision.action,
      confidence: decision.topConfidence,
      reason: decision.reason,
      matches,
    };
    
    if (decision.action === "auto-select" && decision.selectedStopId) {
      result.selectedStop = stopsMap.get(decision.selectedStopId);
    } else if (decision.action === "show-choice" && decision.choices) {
      result.choices = decision.choices
        .map(m => stopsMap.get(m.stopId))
        .filter((s): s is Stop => s !== undefined);
    }
    
    return result;
  }
  
  /**
   * Record a user selection for learning
   */
  recordSelection(
    spokenTerm: string,
    selectedStopId: number,
    confidence: number,
    matchType: string,
    corrected: boolean = false
  ): void {
    this.learning.recordSelection(
      spokenTerm,
      selectedStopId,
      confidence,
      matchType,
      corrected
    );
  }
  
  /**
   * Get learning statistics
   */
  getLearningStats() {
    return this.learning.getStats();
  }
  
  /**
   * Get learning history
   */
  getLearningHistory() {
    return this.learning.getEntries();
  }
  
  /**
   * Clear learning data
   */
  clearLearning(): void {
    this.learning.clear();
  }
  
  /**
   * Update confidence thresholds
   */
  updateThresholds(updates: Partial<ConfidenceThresholds>): void {
    this.thresholds = { ...this.thresholds, ...updates };
  }
  
  /**
   * Get current thresholds
   */
  getThresholds(): ConfidenceThresholds {
    return { ...this.thresholds };
  }
  
  /**
   * Export learning data
   */
  exportLearning(): string {
    return this.learning.export();
  }
  
  /**
   * Import learning data
   */
  importLearning(jsonData: string): boolean {
    return this.learning.import(jsonData);
  }
}

/**
 * Get learning mappings for internal use
 */
export function getLearningMappings(learning: LearningHistory): Map<string, number> {
  const mappings = new Map<string, number>();
  const entries = learning.getEntries();
  const seenTerms = new Set<string>();
  
  entries.forEach(entry => {
    const normalizedTerm = normalizeSearchTerm(entry.spokenTerm);
    if (!seenTerms.has(normalizedTerm)) {
      const mostCommon = learning.getMostCommonSelection(entry.spokenTerm);
      if (mostCommon) {
        mappings.set(normalizedTerm, mostCommon);
        seenTerms.add(normalizedTerm);
      }
    }
  });
  return mappings;
}

export default RouteIntelligenceIntegration;

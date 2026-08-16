/**
 * Route Intelligence Learning System
 * 
 * Records user corrections and learns from them:
 * - When user selects a stop after speaking a term, record the mapping
 * - Use learned mappings to improve future matches
 * - Store in browser local storage per route
 * - Can be exported/imported for sync or backup
 */

/**
 * Learning entry: what the user said → which stop they selected
 */
export interface LearningEntry {
  spokenTerm: string;
  stopId: number;
  timestamp: number;
  confidence: number; // confidence of the original match
  matchType: string;  // "exact", "fuzzy", "phonetic", "alias"
  corrected: boolean; // true if user had to choose from multiple options
}

/**
 * Learning statistics for a route
 */
export interface LearningStats {
  totalLearned: number;
  totalCorrected: number;
  learningAccuracy: number; // (total - corrected) / total
  lastUpdated: number;
}

/**
 * Learning history manager
 */
export class LearningHistory {
  private routeId: number;
  private entries: LearningEntry[] = [];
  private storageKey: string;
  
  constructor(routeId: number) {
    this.routeId = routeId;
    this.storageKey = `route-intelligence-learning-${routeId}`;
    this.loadFromStorage();
  }
  
  /**
   * Record a user selection
   */
  recordSelection(
    spokenTerm: string,
    stopId: number,
    confidence: number,
    matchType: string,
    corrected: boolean = false
  ): void {
    const entry: LearningEntry = {
      spokenTerm,
      stopId,
      timestamp: Date.now(),
      confidence,
      matchType,
      corrected,
    };
    
    this.entries.push(entry);
    this.saveToStorage();
  }
  
  /**
   * Get all learning entries
   */
  getEntries(): LearningEntry[] {
    return [...this.entries];
  }
  
  /**
   * Get learning statistics
   */
  getStats(): LearningStats {
    const total = this.entries.length;
    const corrected = this.entries.filter(e => e.corrected).length;
    
    return {
      totalLearned: total,
      totalCorrected: corrected,
      learningAccuracy: total > 0 ? (total - corrected) / total : 0,
      lastUpdated: this.entries.length > 0 
        ? Math.max(...this.entries.map(e => e.timestamp))
        : 0,
    };
  }
  
  /**
   * Get most common selections for a spoken term
   */
  getMostCommonSelection(spokenTerm: string): number | undefined {
    const matches = this.entries.filter(e => e.spokenTerm === spokenTerm);
    if (matches.length === 0) return undefined;
    
    // Count by stop ID
    const counts = new Map<number, number>();
    matches.forEach(m => {
      counts.set(m.stopId, (counts.get(m.stopId) || 0) + 1);
    });
    
    // Return most common
    let maxCount = 0;
    let mostCommon: number | undefined;
    counts.forEach((count: number, stopId: number) => {
      if (count > maxCount) {
        maxCount = count;
        mostCommon = stopId;
      }
    });
    
    return mostCommon;
  }
  
  /**
   * Get learning confidence for a term
   * (how consistently does the user select the same stop?)
   */
  getLearningConfidence(spokenTerm: string): number {
    const matches = this.entries.filter(e => e.spokenTerm === spokenTerm);
    if (matches.length === 0) return 0;
    
    // Count by stop ID
    const counts = new Map<number, number>();
    matches.forEach(m => {
      counts.set(m.stopId, (counts.get(m.stopId) || 0) + 1);
    });
    
    // Confidence = (most common count) / (total matches)
    const countsArray = Array.from(counts.values());
    const maxCount = countsArray.length > 0 ? Math.max(...countsArray) : 0;
    return maxCount / matches.length;
  }
  
  /**
   * Clear all learning data for this route
   */
  clear(): void {
    this.entries = [];
    this.saveToStorage();
  }
  
  /**
   * Export learning data (for backup/sync)
   */
  export(): string {
    return JSON.stringify({
      routeId: this.routeId,
      entries: this.entries,
      exportedAt: new Date().toISOString(),
    });
  }
  
  /**
   * Import learning data (from backup/sync)
   */
  import(jsonData: string): boolean {
    try {
      const data = JSON.parse(jsonData);
      if (data.routeId !== this.routeId) {
        console.warn(`[LearningHistory] Route ID mismatch: ${data.routeId} vs ${this.routeId}`);
        return false;
      }
      this.entries = data.entries || [];
      this.saveToStorage();
      return true;
    } catch (e) {
      console.error("[LearningHistory] Failed to import data", e);
      return false;
    }
  }
  
  /**
   * Save to browser local storage
   */
  private saveToStorage(): void {
    if (typeof localStorage === 'undefined') return; // Skip in tests
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.entries));
    } catch (e) {
      console.warn("[LearningHistory] Failed to save to storage", e);
    }
  }
  
  /**
   * Load from browser local storage
   */
  private loadFromStorage(): void {
    if (typeof localStorage === 'undefined') return; // Skip in tests
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        this.entries = JSON.parse(stored);
      }
    } catch (e) {
      console.warn("[LearningHistory] Failed to load from storage", e);
    }
  }
}

export default LearningHistory;

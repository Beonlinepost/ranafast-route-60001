/**
 * Route Intelligence Debug Logger
 * 
 * Logs every search decision with full transparency:
 * - What the speech engine heard
 * - Confidence scores
 * - Why each match was chosen
 * - Fallback decisions
 */

export interface DebugLog {
  timestamp: number;
  spokenTerm: string;
  normalized: string;
  results: Array<{
    stopId: number;
    confidence: number;
    matchType: string;
    indexSource: string;
  }>;
  decision: "auto-select" | "show-choice" | "no-match" | "fallback";
  selectedStopId?: number;
  reason: string;
}

export class RouteIntelligenceDebugger {
  private logs: DebugLog[] = [];
  private maxLogs: number = 1000;
  private enabled: boolean = false;

  constructor(enabled: boolean = false) {
    this.enabled = enabled;
  }

  /**
   * Enable/disable debug logging
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) {
      console.log("[RI Debug] Enabled");
    }
  }

  /**
   * Log a search operation
   */
  logSearch(
    spokenTerm: string,
    normalized: string,
    results: Array<{
      stopId: number;
      confidence: number;
      matchType: string;
      indexSource: string;
    }>,
    decision: "auto-select" | "show-choice" | "no-match" | "fallback",
    reason: string,
    selectedStopId?: number
  ): void {
    if (!this.enabled) return;

    const log: DebugLog = {
      timestamp: Date.now(),
      spokenTerm,
      normalized,
      results,
      decision,
      selectedStopId,
      reason,
    };

    this.logs.push(log);

    // Keep only recent logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Console output
    console.group(`[RI] "${spokenTerm}" → ${decision}`);
    console.log("Normalized:", normalized);
    console.log("Results:", results.slice(0, 3)); // Show top 3
    console.log("Reason:", reason);
    if (selectedStopId) {
      console.log("Selected Stop ID:", selectedStopId);
    }
    console.groupEnd();
  }

  /**
   * Get all debug logs
   */
  getLogs(): DebugLog[] {
    return [...this.logs];
  }

  /**
   * Get recent logs (last N entries)
   */
  getRecentLogs(count: number = 20): DebugLog[] {
    return this.logs.slice(-count);
  }

  /**
   * Clear all logs
   */
  clearLogs(): void {
    this.logs = [];
  }

  /**
   * Export logs as JSON
   */
  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  /**
   * Get statistics from logs
   */
  getStats() {
    const stats = {
      totalSearches: this.logs.length,
      decisions: {
        autoSelect: 0,
        showChoice: 0,
        noMatch: 0,
        fallback: 0,
      },
      avgTopConfidence: 0,
      avgTopThreeConfidence: 0,
    };

    let totalTopConfidence = 0;
    let totalTopThreeConfidence = 0;

    this.logs.forEach((log) => {
      const decisionKey = log.decision.replace(/-/g, "") as keyof typeof stats.decisions;
      stats.decisions[decisionKey]++;

      if (log.results.length > 0) {
        totalTopConfidence += log.results[0].confidence;
        const topThree = log.results.slice(0, 3);
        const avgThree =
          topThree.reduce((sum, r) => sum + r.confidence, 0) / topThree.length;
        totalTopThreeConfidence += avgThree;
      }
    });

    if (this.logs.length > 0) {
      stats.avgTopConfidence = totalTopConfidence / this.logs.length;
      stats.avgTopThreeConfidence = totalTopThreeConfidence / this.logs.length;
    }

    return stats;
  }
}

export default RouteIntelligenceDebugger;

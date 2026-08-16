/**
 * Route Intelligence Feature Flag & Logging
 * 
 * Controls:
 * - Whether Route Intelligence is enabled
 * - Logging of matches and decisions
 * - Fallback behavior
 */

/**
 * Route Intelligence log entry
 */
export interface RouteIntelligenceLogEntry {
  timestamp: number;
  spokenTerm: string;
  normalizedTerm: string;
  action: "auto-select" | "show-choice" | "no-match" | "fallback";
  selectedStopId?: number;
  selectedStopName?: string;
  confidence?: number;
  reason: string;
  matchType?: string;
  fallbackReason?: string;
  mode: "sorting" | "delivery" | "parcel";
}

/**
 * Feature flag manager
 */
export class RouteIntelligenceFeatureFlag {
  private enabled: boolean = true; // Enabled by default
  private logs: RouteIntelligenceLogEntry[] = [];
  private maxLogs: number = 100;
  
  /**
   * Enable Route Intelligence
   */
  enable(): void {
    this.enabled = true;
    this.log({
      timestamp: Date.now(),
      spokenTerm: "[SYSTEM]",
      normalizedTerm: "[SYSTEM]",
      action: "auto-select",
      reason: "Route Intelligence enabled",
      mode: "sorting",
    });
  }
  
  /**
   * Disable Route Intelligence (use fallback only)
   */
  disable(): void {
    this.enabled = false;
    this.log({
      timestamp: Date.now(),
      spokenTerm: "[SYSTEM]",
      normalizedTerm: "[SYSTEM]",
      action: "fallback",
      reason: "Route Intelligence disabled",
      mode: "sorting",
    });
  }
  
  /**
   * Check if enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
  
  /**
   * Log a match result
   */
  log(entry: RouteIntelligenceLogEntry): void {
    this.logs.push(entry);
    
    // Keep logs under max size
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
    
    // Also log to console for debugging
    const logMessage = `[RI] ${entry.spokenTerm} → ${entry.action} (${entry.confidence ? (entry.confidence * 100).toFixed(0) + '%' : 'N/A'}) | ${entry.reason}`;
    console.debug(logMessage);
  }
  
  /**
   * Get all logs
   */
  getLogs(): RouteIntelligenceLogEntry[] {
    return [...this.logs];
  }
  
  /**
   * Get recent logs
   */
  getRecentLogs(count: number = 10): RouteIntelligenceLogEntry[] {
    return this.logs.slice(-count);
  }
  
  /**
   * Clear logs
   */
  clearLogs(): void {
    this.logs = [];
  }
  
  /**
   * Export logs as JSON
   */
  exportLogs(): string {
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      enabled: this.enabled,
      logs: this.logs,
    }, null, 2);
  }
  
  /**
   * Get statistics from logs
   */
  getStats() {
    const stats = {
      totalMatches: this.logs.length,
      autoSelects: 0,
      choices: 0,
      noMatches: 0,
      fallbacks: 0,
      avgConfidence: 0,
      byMode: {
        sorting: 0,
        delivery: 0,
        parcel: 0,
      },
    };
    
    let totalConfidence = 0;
    let confidenceCount = 0;
    
    this.logs.forEach(log => {
      if (log.action === "auto-select") stats.autoSelects++;
      if (log.action === "show-choice") stats.choices++;
      if (log.action === "no-match") stats.noMatches++;
      if (log.action === "fallback") stats.fallbacks++;
      
      if (log.confidence !== undefined) {
        totalConfidence += log.confidence;
        confidenceCount++;
      }
      
      stats.byMode[log.mode]++;
    });
    
    if (confidenceCount > 0) {
      stats.avgConfidence = totalConfidence / confidenceCount;
    }
    
    return stats;
  }
}

// Global instance
export const riFeatureFlag = new RouteIntelligenceFeatureFlag();

export default riFeatureFlag;

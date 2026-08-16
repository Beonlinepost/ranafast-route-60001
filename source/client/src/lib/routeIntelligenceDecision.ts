/**
 * Route Intelligence Decision Logic
 * 
 * Determines:
 * - Auto-select if confidence is high enough
 * - Show choice if multiple close matches
 * - Say "no match" if confidence too low
 */

import type { MatchResult } from "./fuzzyMatcher";

/**
 * Confidence thresholds (sensible defaults)
 */
export interface ConfidenceThresholds {
  autoSelect: number;      // >= this: auto-select (default: 0.85)
  showChoice: number;      // >= this: show choice UI (default: 0.65)
  noMatch: number;         // < this: say "no match" (default: 0.65)
  closeMatchGap: number;   // if top 2 results differ by < this, show choice (default: 0.10)
}

export const DEFAULT_THRESHOLDS: ConfidenceThresholds = {
  autoSelect: 0.85,
  showChoice: 0.65,
  noMatch: 0.65,
  closeMatchGap: 0.10,
};

/**
 * Decision result from confidence ranking
 */
export interface DecisionResult {
  action: "auto-select" | "show-choice" | "no-match";
  selectedStopId?: number;
  choices?: MatchResult[];
  topConfidence?: number;
  reason: string;
}

/**
 * Make a decision based on match results and thresholds
 */
export function makeDecision(
  matches: MatchResult[],
  thresholds: ConfidenceThresholds = DEFAULT_THRESHOLDS
): DecisionResult {
  if (matches.length === 0) {
    return {
      action: "no-match",
      reason: "No matches found in dictionary",
    };
  }
  
  const topMatch = matches[0];
  const topConfidence = topMatch.confidence;
  
  // Check auto-select threshold
  if (topConfidence >= thresholds.autoSelect) {
    return {
      action: "auto-select",
      selectedStopId: topMatch.stopId,
      topConfidence,
      reason: `High confidence match: ${(topConfidence * 100).toFixed(0)}%`,
    };
  }
  
  // Check if below minimum threshold
  if (topConfidence < thresholds.noMatch) {
    return {
      action: "no-match",
      topConfidence,
      reason: `Confidence too low: ${(topConfidence * 100).toFixed(0)}% < ${(thresholds.noMatch * 100).toFixed(0)}%`,
    };
  }
  
  // Check for close matches (multiple results with similar confidence)
  const closeMatches = matches.filter(m => 
    (topConfidence - m.confidence) <= thresholds.closeMatchGap
  );
  
  if (closeMatches.length > 1) {
    return {
      action: "show-choice",
      choices: closeMatches.slice(0, 3), // Show top 3 choices
      topConfidence,
      reason: `Multiple close matches (gap: ${((topConfidence - closeMatches[1].confidence) * 100).toFixed(0)}%)`,
    };
  }
  
  // Single match above minimum threshold
  if (topConfidence >= thresholds.showChoice) {
    return {
      action: "auto-select",
      selectedStopId: topMatch.stopId,
      topConfidence,
      reason: `Acceptable confidence: ${(topConfidence * 100).toFixed(0)}%`,
    };
  }
  
  // Fallback: show choice
  return {
    action: "show-choice",
    choices: matches.slice(0, 3),
    topConfidence,
    reason: `Moderate confidence, showing choices`,
  };
}

/**
 * Get human-readable explanation of a decision
 */
export function explainDecision(decision: DecisionResult): string {
  return decision.reason;
}

/**
 * Update thresholds (for future admin panel)
 */
export function updateThresholds(
  current: ConfidenceThresholds,
  updates: Partial<ConfidenceThresholds>
): ConfidenceThresholds {
  return { ...current, ...updates };
}

export default {
  DEFAULT_THRESHOLDS,
  makeDecision,
  explainDecision,
  updateThresholds,
};

/**
 * Correction Detection System (Refined)
 * 
 * Detects when a user manually selects a stop after voice search.
 * This is the trigger for recording a permanent learning correction.
 * 
 * Learning is recorded whenever:
 * 1. User performed a voice search (not text search)
 * 2. User manually tapped a stop from the results (ANY result, not just no-match)
 * 3. The tap happens within the correction window (10 seconds)
 * 
 * This captures:
 * - No match → user selects correct stop → learn
 * - Wrong match → user selects different stop → learn
 * - Multiple suggestions → user chooses one → learn
 * 
 * The system learns the ACTUAL SPEECH TRANSCRIPT (what the engine heard),
 * not the normalized version. This allows learning speech engine quirks.
 * 
 * Example:
 * - User says: "McFadden"
 * - Engine hears: "Mac Fatten"
 * - User selects: McFadden (stop)
 * - System learns: "Mac Fatten" → McFadden
 */

import type { Stop } from "../../../drizzle/schema";

export interface VoiceSearchContext {
  transcript: string; // Raw speech-to-text output (ACTUAL speech engine transcript)
  normalizedTranscript: string; // Normalized for comparison
  matchLevel: number; // 0 = no match, 1 = exact phrase, 2 = alias phrase, 3 = broad fallback
  matchResults: Stop[]; // Results returned by the search
  isMultiWord: boolean; // Whether query was multi-word
  timestamp: number; // When the search was performed
}

export interface CorrectionDetectionResult {
  shouldRecord: boolean; // True if this tap should trigger learning
  reason: string; // Why or why not
  transcript: string; // The transcript to record (ACTUAL speech engine output)
  normalizedTranscript: string; // Normalized transcript
}

/**
 * Detect if a stop tap should trigger a learning correction
 * 
 * REFINED BEHAVIOR: Learn on ANY manual selection after voice search
 * 
 * @param voiceContext - The context of the voice search that just happened
 * @param selectedStop - The stop the user just tapped
 * @returns CorrectionDetectionResult with decision and reason
 */
export function detectCorrection(
  voiceContext: VoiceSearchContext | null,
  selectedStop: Stop
): CorrectionDetectionResult {
  // No voice context = text search or manual tap without prior search
  if (!voiceContext) {
    return {
      shouldRecord: false,
      reason: "No voice search context",
      transcript: "",
      normalizedTranscript: "",
    };
  }

  // ANY voice search followed by manual selection = learning opportunity
  // This includes:
  // - No match (level 0) → user selects correct stop
  // - Wrong match (level 1/2) → user selects different stop
  // - Multiple suggestions (level 3) → user chooses one
  
  // We learn the ACTUAL speech transcript (what the engine heard)
  // This captures speech engine quirks and pronunciation variations
  return {
    shouldRecord: true,
    reason: "User manually selected stop after voice search — learning speech engine transcript",
    transcript: voiceContext.transcript, // ACTUAL speech engine output
    normalizedTranscript: voiceContext.normalizedTranscript,
  };
}

/**
 * Normalize a voice transcript for comparison and storage
 * 
 * @param transcript - Raw speech-to-text output
 * @returns Normalized transcript (lowercase, trimmed, extra spaces removed)
 */
export function normalizeTranscript(transcript: string): string {
  return transcript
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Create a voice search context from voice search parameters
 * 
 * @param transcript - Raw speech-to-text output (ACTUAL speech engine transcript)
 * @param matchLevel - Result of matchStops (0, 1, 2, or 3)
 * @param matchResults - Results returned by matchStops
 * @returns VoiceSearchContext
 */
export function createVoiceSearchContext(
  transcript: string,
  matchLevel: number,
  matchResults: Stop[]
): VoiceSearchContext {
  const isMultiWord = transcript.trim().split(/\s+/).filter(Boolean).length >= 2;

  return {
    transcript, // ACTUAL speech engine output
    normalizedTranscript: normalizeTranscript(transcript),
    matchLevel,
    matchResults,
    isMultiWord,
    timestamp: Date.now(),
  };
}

/**
 * Check if a tap happened within a reasonable time window of the voice search
 * (to avoid recording corrections for unrelated taps)
 * 
 * @param voiceContext - The voice search context
 * @param tapTimestamp - When the user tapped the stop
 * @param windowMs - Time window in milliseconds (default: 10 seconds)
 * @returns True if tap is within the window
 */
export function isWithinCorrectionWindow(
  voiceContext: VoiceSearchContext,
  tapTimestamp: number,
  windowMs: number = 10000
): boolean {
  const timeSinceSearch = tapTimestamp - voiceContext.timestamp;
  return timeSinceSearch >= 0 && timeSinceSearch <= windowMs;
}

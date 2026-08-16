/**
 * Field Testing Logger
 * 
 * Captures comprehensive metrics for each voice search during field testing.
 * Used to evaluate Route Intelligence performance before marking as production-ready.
 * 
 * Metrics captured per search:
 * - Original speech transcript (what speech engine heard)
 * - Normalized search term
 * - Whether learned mapping was used
 * - Whether fuzzy matching was used
 * - Top candidate matches with confidence scores
 * - Final selected stop
 * - Response time (speech recognition to result)
 * - Whether user manually corrected the result
 * 
 * All data stored in IndexedDB for persistence across sessions.
 */

import type { Stop } from "../../../drizzle/schema";

export interface SearchCandidate {
  stopId: number;
  stopName: string;
  confidence: number;
  matchType: "exact" | "phonetic" | "fuzzy" | "learned" | "persistent-learned";
}

export interface SearchEvent {
  id: string; // UUID
  timestamp: number; // Unix timestamp (ms)
  routeId: number;
  
  // Input
  originalTranscript: string; // Exactly what speech engine heard
  normalizedTranscript: string; // Normalized for search
  
  // Search process
  learnedMappingUsed: boolean; // Was a learned mapping found?
  fuzzyMatchingUsed: boolean; // Was fuzzy matching needed?
  topCandidates: SearchCandidate[]; // Top 5 candidates with scores
  
  // Result
  selectedStopId: number;
  selectedStopName: string;
  
  // Performance
  responseTimeMs: number; // Time from speech recognition to result
  
  // User action
  manualCorrectionMade: boolean; // Did user manually select different stop?
  correctionFromStopId?: number; // If correction, what was originally selected?
  correctionToStopId?: number; // If correction, what did user select?
  
  // Metadata
  appMode: "parcel" | "sorting" | "delivery";
  sectionId?: number;
}

export interface FieldTestingStats {
  totalSearches: number;
  successfulFirstTimeMatches: number; // Learned or exact match used
  searchesRequiringManualCorrection: number;
  newLearnedMappingsCreated: number;
  averageResponseTimeMs: number;
  commonSpeechErrors: Map<string, number>; // Normalized transcript → error count
  learnedMappingsUsedCount: number;
  fuzzyMatchingUsedCount: number;
}

const DB_NAME = "FieldTestingDB";
const STORE_NAME = "SearchEvents";
const DB_VERSION = 1;

let db: IDBDatabase | null = null;

/**
 * Initialize IndexedDB for field testing
 */
async function initDB(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("timestamp", "timestamp", { unique: false });
        store.createIndex("routeId", "routeId", { unique: false });
        store.createIndex("manualCorrectionMade", "manualCorrectionMade", { unique: false });
      }
    };
  });
}

/**
 * Record a search event
 */
export async function recordSearchEvent(event: SearchEvent): Promise<void> {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.add(event);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * Get all search events for a route
 */
export async function getSearchEventsForRoute(routeId: number): Promise<SearchEvent[]> {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index("routeId");
    const request = index.getAll(routeId);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

/**
 * Get search events from the last N hours
 */
export async function getRecentSearchEvents(
  routeId: number,
  hoursAgo: number = 24
): Promise<SearchEvent[]> {
  const database = await initDB();
  const cutoffTime = Date.now() - hoursAgo * 60 * 60 * 1000;

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index("routeId");
    const request = index.getAll(routeId);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const events = request.result.filter(e => e.timestamp >= cutoffTime);
      resolve(events);
    };
  });
}

/**
 * Calculate field testing statistics
 */
export function calculateStats(events: SearchEvent[]): FieldTestingStats {
  const stats: FieldTestingStats = {
    totalSearches: events.length,
    successfulFirstTimeMatches: 0,
    searchesRequiringManualCorrection: 0,
    newLearnedMappingsCreated: 0,
    averageResponseTimeMs: 0,
    commonSpeechErrors: new Map(),
    learnedMappingsUsedCount: 0,
    fuzzyMatchingUsedCount: 0,
  };

  if (events.length === 0) return stats;

  let totalResponseTime = 0;

  events.forEach(event => {
    // Count successful first-time matches (learned or exact)
    if (event.learnedMappingUsed || event.topCandidates[0]?.matchType === "exact") {
      stats.successfulFirstTimeMatches++;
    }

    // Count manual corrections
    if (event.manualCorrectionMade) {
      stats.searchesRequiringManualCorrection++;
      // If correction was made, it likely created a new learned mapping
      stats.newLearnedMappingsCreated++;
    }

    // Count learned mapping usage
    if (event.learnedMappingUsed) {
      stats.learnedMappingsUsedCount++;
    }

    // Count fuzzy matching usage
    if (event.fuzzyMatchingUsed) {
      stats.fuzzyMatchingUsedCount++;
    }

    // Track response time
    totalResponseTime += event.responseTimeMs;

    // Track common speech errors
    const normalized = event.normalizedTranscript;
    if (normalized) {
      stats.commonSpeechErrors.set(
        normalized,
        (stats.commonSpeechErrors.get(normalized) || 0) + 1
      );
    }
  });

  stats.averageResponseTimeMs = Math.round(totalResponseTime / events.length);

  return stats;
}

/**
 * Generate daily summary report
 */
export async function generateDailySummary(
  routeId: number,
  hoursAgo: number = 24
): Promise<{
  stats: FieldTestingStats;
  events: SearchEvent[];
  summary: string;
}> {
  const events = await getRecentSearchEvents(routeId, hoursAgo);
  const stats = calculateStats(events);

  const summary = `
Field Testing Summary — Last ${hoursAgo} Hours

Total Voice Searches: ${stats.totalSearches}
Successful First-Time Matches: ${stats.successfulFirstTimeMatches} (${Math.round((stats.successfulFirstTimeMatches / stats.totalSearches) * 100)}%)
Searches Requiring Manual Correction: ${stats.searchesRequiringManualCorrection} (${Math.round((stats.searchesRequiringManualCorrection / stats.totalSearches) * 100)}%)
New Learned Mappings Created: ${stats.newLearnedMappingsCreated}

Learned Mappings Used: ${stats.learnedMappingsUsedCount} (${Math.round((stats.learnedMappingsUsedCount / stats.totalSearches) * 100)}%)
Fuzzy Matching Used: ${stats.fuzzyMatchingUsedCount} (${Math.round((stats.fuzzyMatchingUsedCount / stats.totalSearches) * 100)}%)

Average Response Time: ${stats.averageResponseTimeMs}ms

Most Common Speech Recognition Errors:
${Array.from(stats.commonSpeechErrors.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)
  .map(([transcript, count]) => `  - "${transcript}": ${count} occurrences`)
  .join("\n")}
  `.trim();

  return { stats, events, summary };
}

/**
 * Export search events as JSON
 */
export function exportAsJSON(events: SearchEvent[]): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      totalEvents: events.length,
      events,
    },
    null,
    2
  );
}

/**
 * Export search events as CSV
 */
export function exportAsCSV(events: SearchEvent[]): string {
  const headers = [
    "Timestamp",
    "Original Transcript",
    "Normalized Transcript",
    "Learned Mapping Used",
    "Fuzzy Matching Used",
    "Top Candidate",
    "Confidence",
    "Selected Stop",
    "Response Time (ms)",
    "Manual Correction",
  ];

  const escapeCSV = (cell: string | number): string => {
    const str = String(cell);
    // Escape quotes by doubling them, then wrap in quotes
    return `"${str.replace(/"/g, '""')}"`;
  };

  const rows = events.map(event => [
    new Date(event.timestamp).toISOString(),
    event.originalTranscript,
    event.normalizedTranscript,
    event.learnedMappingUsed ? "Yes" : "No",
    event.fuzzyMatchingUsed ? "Yes" : "No",
    event.topCandidates[0]?.stopName || "N/A",
    event.topCandidates[0]?.confidence.toFixed(2) || "N/A",
    event.selectedStopName,
    event.responseTimeMs,
    event.manualCorrectionMade ? "Yes" : "No",
  ]);

  const csv = [
    headers.join(","),
    ...rows.map(row => row.map(escapeCSV).join(",")),
  ].join("\n");

  return csv;
}

/**
 * Clear all search events for a route
 */
export async function clearSearchEvents(routeId: number): Promise<void> {
  const database = await initDB();
  const events = await getSearchEventsForRoute(routeId);

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    events.forEach(event => {
      store.delete(event.id);
    });

    transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => resolve();
  });
}

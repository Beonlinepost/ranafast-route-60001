/**
 * Persistent Learning System for Route Intelligence
 * 
 * Stores explicit user corrections (speech transcript → stop ID) with confirmation counts.
 * Learned mappings survive app restarts and improve search accuracy over time.
 * 
 * Learning is triggered ONLY when:
 * 1. Voice search finds no exact match (level 0 or low confidence)
 * 2. User manually selects a stop from the results
 * 3. System records: original transcript, normalized transcript, stop ID, route ID, timestamp
 * 
 * On future searches:
 * 1. Check learned mappings first (highest priority)
 * 2. If no learned mapping, run fuzzy matching
 * 3. Learned mappings are separate from the permanent route dictionary
 */

export interface LearnedMapping {
  id: string; // UUID
  routeId: number;
  stopId: number;
  originalTranscript: string; // Raw speech-to-text output
  normalizedTranscript: string; // Normalized for comparison
  firstConfirmedAt: number; // Timestamp (ms)
  lastConfirmedAt: number; // Timestamp (ms)
  confirmationCount: number; // How many times user confirmed this mapping
  tags?: string[]; // Optional: "pronunciation", "abbreviation", "alias", etc.
}

export interface LearnedMappingLookupResult {
  stopId: number;
  confidence: number; // 0-1, based on confirmationCount
  confirmationCount: number;
  lastConfirmedAt: number;
}

const DB_NAME = "RouteIntelligence";
const DB_VERSION = 1;
const STORE_NAME = "learnedMappings";

/**
 * Initialize IndexedDB and create schema if needed
 */
export async function initializeLearningDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create learnedMappings object store
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        // Indexes for efficient querying
        store.createIndex("routeId", "routeId", { unique: false });
        store.createIndex("stopId", "stopId", { unique: false });
        store.createIndex("normalizedTranscript", "normalizedTranscript", {
          unique: false,
        });
        store.createIndex("routeId_stopId", ["routeId", "stopId"], {
          unique: false,
        });
      }
    };
  });
}

/**
 * Record a user correction: when user manually selects a stop after no exact match
 * 
 * @param routeId - ID of the route
 * @param stopId - ID of the selected stop
 * @param originalTranscript - Raw speech-to-text output
 * @param normalizedTranscript - Normalized for comparison
 * @param tags - Optional tags (e.g., "pronunciation", "abbreviation")
 */
export async function recordCorrection(
  routeId: number,
  stopId: number,
  originalTranscript: string,
  normalizedTranscript: string,
  tags?: string[]
): Promise<LearnedMapping> {
  const db = await initializeLearningDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index("normalizedTranscript");

    // Check if this normalized transcript already exists for this route+stop
    const query = IDBKeyRange.only(normalizedTranscript);
    const findRequest = index.getAll(query);

    findRequest.onsuccess = () => {
      const existing = findRequest.result.find(
        (m: LearnedMapping) =>
          m.routeId === routeId && m.stopId === stopId
      );

      const now = Date.now();
      let mapping: LearnedMapping;

      if (existing) {
        // Increment confirmation count for existing mapping
        mapping = {
          ...existing,
          lastConfirmedAt: now,
          confirmationCount: existing.confirmationCount + 1,
        };
      } else {
        // Create new mapping
        mapping = {
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
      }

      const putRequest = store.put(mapping);
      putRequest.onsuccess = () => resolve(mapping);
      putRequest.onerror = () => reject(putRequest.error);
    };

    findRequest.onerror = () => reject(findRequest.error);
  });
}

/**
 * Look up a learned mapping for a given normalized transcript and route
 * Returns the stop ID and confidence score if found
 * 
 * @param routeId - ID of the route
 * @param normalizedTranscript - Normalized transcript to look up
 * @returns LearnedMappingLookupResult or null if not found
 */
export async function lookupLearnedMapping(
  routeId: number,
  normalizedTranscript: string
): Promise<LearnedMappingLookupResult | null> {
  const db = await initializeLearningDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index("normalizedTranscript");

    const query = IDBKeyRange.only(normalizedTranscript);
    const request = index.getAll(query);

    request.onsuccess = () => {
      const mappings = request.result.filter(
        (m: LearnedMapping) => m.routeId === routeId
      );

      if (mappings.length === 0) {
        resolve(null);
        return;
      }

      // Use the most recently confirmed mapping (highest confidence)
      const best = mappings.reduce((a: LearnedMapping, b: LearnedMapping) =>
        a.confirmationCount > b.confirmationCount ? a : b
      );

      // Confidence: 0-1 scale based on confirmation count
      // 1 confirmation = 0.5, 2 = 0.65, 3 = 0.75, 4+ = 0.85
      const confidence = Math.min(0.5 + best.confirmationCount * 0.1, 0.85);

      resolve({
        stopId: best.stopId,
        confidence,
        confirmationCount: best.confirmationCount,
        lastConfirmedAt: best.lastConfirmedAt,
      });
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all learned mappings for a specific route (for admin inspection)
 * 
 * @param routeId - ID of the route
 * @returns Array of learned mappings
 */
export async function getAllLearnedMappingsForRoute(
  routeId: number
): Promise<LearnedMapping[]> {
  const db = await initializeLearningDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index("routeId");

    const query = IDBKeyRange.only(routeId);
    const request = index.getAll(query);

    request.onsuccess = () => {
      const mappings = request.result as LearnedMapping[];
      // Sort by confirmation count (descending) then by last confirmed time
      mappings.sort((a, b) => {
        if (b.confirmationCount !== a.confirmationCount) {
          return b.confirmationCount - a.confirmationCount;
        }
        return b.lastConfirmedAt - a.lastConfirmedAt;
      });
      resolve(mappings);
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete a learned mapping (for admin cleanup)
 * 
 * @param mappingId - ID of the mapping to delete
 */
export async function deleteLearnedMapping(mappingId: string): Promise<void> {
  const db = await initializeLearningDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(mappingId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear all learned mappings for a specific route (for testing/reset)
 * 
 * @param routeId - ID of the route
 */
export async function clearLearnedMappingsForRoute(
  routeId: number
): Promise<void> {
  const db = await initializeLearningDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index("routeId");

    const query = IDBKeyRange.only(routeId);
    const request = index.openCursor(query);

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        resolve();
      }
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Get statistics about learned mappings for a route
 */
export async function getLearnedMappingsStats(routeId: number): Promise<{
  totalMappings: number;
  totalConfirmations: number;
  mostConfirmedTranscript: string | null;
  mostConfirmedCount: number;
}> {
  const mappings = await getAllLearnedMappingsForRoute(routeId);

  const totalConfirmations = mappings.reduce(
    (sum, m) => sum + m.confirmationCount,
    0
  );
  const mostConfirmed = mappings[0];

  return {
    totalMappings: mappings.length,
    totalConfirmations,
    mostConfirmedTranscript: mostConfirmed?.normalizedTranscript || null,
    mostConfirmedCount: mostConfirmed?.confirmationCount || 0,
  };
}

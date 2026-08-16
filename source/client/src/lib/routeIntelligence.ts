/**
 * Route Intelligence Engine
 * 
 * Builds a searchable dictionary from a route's stops and provides:
 * - Normalized search indexing (Mc→Mac, strip punctuation, lowercase)
 * - Fuzzy matching with confidence scoring
 * - Learning from user corrections
 * - Local storage persistence
 */

// Stop type definition
export interface Stop {
  id: number;
  sectionId: number;
  routeId: number;
  stopOrder: number;
  propertyType?: string | null;
  side?: string | null;
  road?: string | null;
  houseName?: string | null;
  businessName?: string | null;
  houseNumber?: string | null;
  eircode?: string | null;
  residents?: string | null;
  aliases?: string | null;
  searchTags?: string | null;
  hasDog?: boolean;
  safePlace?: string | null;
  notes?: string | null;
  lat?: string | null;
  lng?: string | null;
}

// Common filler words to ignore during indexing
const FILLER_WORDS = new Set([
  "ah", "oh", "um", "uh", "er", "like", "right", "ok", "okay", "yeah", "yes", "no",
  "for", "god's", "sake", "hold", "on", "wait", "just", "so", "you", "know", "i", "me",
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "from", "of", "with",
  "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did",
  "will", "would", "could", "should", "may", "might", "must", "can", "shall",
]);

/**
 * Normalize a search term for matching
 * - Convert Mc/Mac variations
 * - Remove spaces, apostrophes, hyphens
 * - Lowercase
 * - Remove filler words
 */
export function normalizeSearchTerm(term: string): string {
  if (!term) return "";
  
  let normalized = term
    .toLowerCase()
    .trim()
    // Mc → Mac (and vice versa for consistency)
    .replace(/\bmc([a-z])/gi, "mac$1")
    // Remove spaces, apostrophes, hyphens
    .replace(/[\s'-]/g, "")
    // Remove accents (é → e, etc.)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  
  // Remove filler words
  const words = normalized.split(/\s+/);
  const filtered = words.filter(w => !FILLER_WORDS.has(w) && w.length > 0);
  
  return filtered.join(" ");
}

/**
 * Extract all searchable terms from a stop
 */
function extractSearchTerms(stop: Stop): Set<string> {
  const terms = new Set<string>();
  
  // Residents (pipe-separated)
  if (stop.residents) {
    stop.residents.split("|").forEach((name: string) => {
      const trimmed = name.trim();
      if (trimmed) {
        // Add full name
        terms.add(normalizeSearchTerm(trimmed));
        
        // Add first and last names separately
        const parts = trimmed.split(/\s+/);
        parts.forEach(part => {
          if (part.length > 0) {
            terms.add(normalizeSearchTerm(part));
          }
        });
      }
    });
  }
  
  // Aliases (pipe-separated)
  if (stop.aliases) {
    stop.aliases.split("|").forEach((alias: string) => {
      const trimmed = alias.trim();
      if (trimmed) {
        terms.add(normalizeSearchTerm(trimmed));
      }
    });
  }
  
  // House name
  if (stop.houseName) {
    terms.add(normalizeSearchTerm(stop.houseName));
  }
  
  // Business name
  if (stop.businessName) {
    terms.add(normalizeSearchTerm(stop.businessName));
    // Add business name parts
    stop.businessName.split(/\s+/).forEach((part: string) => {
      if (part.length > 0) {
        terms.add(normalizeSearchTerm(part));
      }
    });
  }
  
  // Road
  if (stop.road) {
    terms.add(normalizeSearchTerm(stop.road));
    // Add road parts
    stop.road.split(/\s+/).forEach((part: string) => {
      if (part.length > 0) {
        terms.add(normalizeSearchTerm(part));
      }
    });
  }
  
  // Search tags (if present)
  if (stop.searchTags) {
    stop.searchTags.split("|").forEach((tag: string) => {
      const trimmed = tag.trim();
      if (trimmed) {
        terms.add(normalizeSearchTerm(trimmed));
      }
    });
  }
  
  // Remove empty strings
  terms.delete("");
  
  return terms;
}

/**
 * Route dictionary entry — maps search terms to stops
 */
interface DictionaryEntry {
  term: string;
  stopIds: number[];
}

/**
 * Route Intelligence dictionary
 */
export class RouteIntelligence {
  private routeId: number;
  private dictionary: Map<string, number[]> = new Map(); // normalized term → stop IDs
  private stops: Map<number, Stop> = new Map(); // stop ID → full stop data
  private learnedMappings: Map<string, number> = new Map(); // learned term → stop ID
  
  constructor(routeId: number) {
    this.routeId = routeId;
    this.loadLearnedMappings();
  }
  
  /**
   * Build dictionary from stops
   */
  buildDictionary(stops: Stop[]): void {
    this.dictionary.clear();
    this.stops.clear();
    
    stops.forEach((stop: Stop) => {
      this.stops.set(stop.id, stop);
      
      const terms = extractSearchTerms(stop);
      terms.forEach((term: string) => {
        if (!this.dictionary.has(term)) {
          this.dictionary.set(term, []);
        }
        const stopIds = this.dictionary.get(term)!;
        if (!stopIds.includes(stop.id)) {
          stopIds.push(stop.id);
        }
      });
    });
  }
  
  /**
   * Get all stops in dictionary
   */
  getAllStops(): Stop[] {
    return Array.from(this.stops.values());
  }
  
  /**
   * Get dictionary size (for debugging)
   */
  getDictionarySize(): number {
    return this.dictionary.size;
  }
  
  /**
   * Learn a mapping: when user selects a stop after speaking a term
   */
  learn(spokenTerm: string, stopId: number): void {
    const normalized = normalizeSearchTerm(spokenTerm);
    if (normalized) {
      this.learnedMappings.set(normalized, stopId);
      this.saveLearnedMappings();
    }
  }
  
  /**
   * Get learned mapping for a term (if exists)
   */
  getLearnedMapping(spokenTerm: string): number | undefined {
    const normalized = normalizeSearchTerm(spokenTerm);
    return this.learnedMappings.get(normalized);
  }
  
  /**
   * Get all learned mappings (for admin/debugging)
   */
  getAllLearnedMappings(): Array<[string, number]> {
    return Array.from(this.learnedMappings.entries());
  }
  
  /**
   * Clear learned mappings for this route
   */
  clearLearnedMappings(): void {
    this.learnedMappings.clear();
    this.saveLearnedMappings();
  }
  
  /**
   * Save learned mappings to local storage
   */
  private saveLearnedMappings(): void {
    if (typeof localStorage === 'undefined') return; // Skip in tests
    const key = `route-intelligence-${this.routeId}`;
    const data = Object.fromEntries(this.learnedMappings);
    localStorage.setItem(key, JSON.stringify(data));
  }
  
  /**
   * Load learned mappings from local storage
   */
  private loadLearnedMappings(): void {
    if (typeof localStorage === 'undefined') return; // Skip in tests
    const key = `route-intelligence-${this.routeId}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        const data = JSON.parse(stored);
        this.learnedMappings = new Map(Object.entries(data));
      } catch (e) {
        console.warn("[RouteIntelligence] Failed to load learned mappings", e);
      }
    }
  }
  
  /**
   * Get dictionary entries (for debugging/admin)
   */
  getDictionaryEntries(): DictionaryEntry[] {
    return Array.from(this.dictionary.entries()).map(([term, stopIds]) => ({
      term,
      stopIds,
    }));
  }
}

export default RouteIntelligence;

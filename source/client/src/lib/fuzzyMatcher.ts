/**
 * Fuzzy Matching Engine for Route Intelligence
 * 
 * Provides:
 * - Levenshtein distance calculation
 * - Jaro-Winkler distance calculation (prefix-weighted name matching)
 * - Double Metaphone phonetic encoding (primary & secondary keys for Irish/regional names)
 * - Phonetic similarity (Double Metaphone + Soundex fallback)
 * - Confidence scoring
 * - Result ranking
 */

/**
 * Calculate Levenshtein distance between two strings
 * (number of edits needed to transform one into the other)
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
}

/**
 * Calculate similarity score (0-1) based on Levenshtein distance
 */
export function levenshteinSimilarity(a: string, b: string): number {
  const distance = levenshteinDistance(a, b);
  const maxLength = Math.max(a.length, b.length);
  if (maxLength === 0) return 1;
  return 1 - (distance / maxLength);
}

/**
 * Calculate Jaro-Winkler similarity (0-1)
 * Prefers prefix alignment, excellent for names and addresses
 */
export function jaroWinklerSimilarity(s1: string, s2: string): number {
  const str1 = s1.toLowerCase().trim();
  const str2 = s2.toLowerCase().trim();

  if (str1 === str2) return 1.0;
  if (!str1.length || !str2.length) return 0.0;

  const matchWindow = Math.floor(Math.max(str1.length, str2.length) / 2) - 1;
  const str1Matches = new Array(str1.length).fill(false);
  const str2Matches = new Array(str2.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < str1.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, str2.length);

    for (let j = start; j < end; j++) {
      if (!str2Matches[j] && str1[i] === str2[j]) {
        str1Matches[i] = true;
        str2Matches[j] = true;
        matches++;
        break;
      }
    }
  }

  if (matches === 0) return 0.0;

  let k = 0;
  for (let i = 0; i < str1.length; i++) {
    if (str1Matches[i]) {
      while (!str2Matches[k]) k++;
      if (str1[i] !== str2[k]) transpositions++;
      k++;
    }
  }

  const jaro = (matches / str1.length + matches / str2.length + (matches - transpositions / 2) / matches) / 3;

  // Winkler prefix scaling (up to 4 characters prefix)
  let prefix = 0;
  const maxPrefix = 4;
  for (let i = 0; i < Math.min(maxPrefix, str1.length, str2.length); i++) {
    if (str1[i] === str2[i]) prefix++;
    else break;
  }

  const p = 0.1; // scaling factor
  return jaro + prefix * p * (1 - jaro);
}

/**
 * Double Metaphone implementation (Primary and Secondary phonetic codes)
 * Optimised for Irish/British surnames, address names, and regional speech variations.
 */
export function doubleMetaphone(term: string): [string, string] {
  if (!term || term.trim().length === 0) return ["", ""];
  
  // Normalise string
  let str = term.toUpperCase().trim()
    .replace(/[^A-Z']/g, "")
    .replace(/^O'/, "O")
    .replace(/^MAC/, "M")
    .replace(/^MC/, "M");

  if (str.length === 0) return ["", ""];

  let primary = "";
  let secondary = "";
  let i = 0;
  const len = str.length;

  const charAt = (pos: number) => (pos >= 0 && pos < len ? str[pos] : "");

  while (i < len && (primary.length < 4 || secondary.length < 4)) {
    const ch = charAt(i);
    const nextChar = charAt(i + 1);

    switch (ch) {
      case 'A': case 'E': case 'I': case 'O': case 'U': case 'Y':
        if (i === 0) {
          primary += 'A';
          secondary += 'A';
        }
        i++;
        break;

      case 'B':
        primary += 'P';
        secondary += 'P';
        i += (nextChar === 'B') ? 2 : 1;
        break;

      case 'C':
        if (nextChar === 'H') {
          primary += 'X';
          secondary += 'K';
          i += 2;
        } else if (nextChar === 'K' || nextChar === 'Q') {
          primary += 'K';
          secondary += 'K';
          i += 2;
        } else if (['I', 'E', 'Y'].includes(nextChar)) {
          primary += 'S';
          secondary += 'S';
          i += (['I', 'E', 'Y'].includes(charAt(i + 2))) ? 2 : 1;
        } else {
          primary += 'K';
          secondary += 'K';
          i += (nextChar === 'C') ? 2 : 1;
        }
        break;

      case 'D':
        if (nextChar === 'G') {
          if (['I', 'E', 'Y'].includes(charAt(i + 2))) {
            primary += 'J';
            secondary += 'J';
            i += 3;
          } else {
            primary += 'TK';
            secondary += 'TK';
            i += 2;
          }
        } else {
          primary += 'T';
          secondary += 'T';
          i += (nextChar === 'D') ? 2 : 1;
        }
        break;

      case 'F':
        primary += 'F';
        secondary += 'F';
        i += (nextChar === 'F') ? 2 : 1;
        break;

      case 'G':
        if (nextChar === 'H') {
          primary += 'K';
          secondary += 'F';
          i += 2;
        } else if (nextChar === 'N') {
          primary += 'N';
          secondary += 'KN';
          i += 2;
        } else if (['I', 'E', 'Y'].includes(nextChar)) {
          primary += 'J';
          secondary += 'K';
          i += 2;
        } else {
          primary += 'K';
          secondary += 'K';
          i += (nextChar === 'G') ? 2 : 1;
        }
        break;

      case 'H':
        if (['A', 'E', 'I', 'O', 'U', 'Y'].includes(nextChar) && (i === 0 || ['A', 'E', 'I', 'O', 'U', 'Y'].includes(charAt(i - 1)))) {
          primary += 'H';
          secondary += 'H';
          i += 2;
        } else {
          i++;
        }
        break;

      case 'J':
        primary += 'J';
        secondary += 'H';
        i += (nextChar === 'J') ? 2 : 1;
        break;

      case 'K':
        primary += 'K';
        secondary += 'K';
        i += (nextChar === 'K') ? 2 : 1;
        break;

      case 'L':
        primary += 'L';
        secondary += 'L';
        i += (nextChar === 'L') ? 2 : 1;
        break;

      case 'M':
        primary += 'M';
        secondary += 'M';
        i += (nextChar === 'M') ? 2 : 1;
        break;

      case 'N':
        primary += 'N';
        secondary += 'N';
        i += (nextChar === 'N') ? 2 : 1;
        break;

      case 'P':
        if (nextChar === 'H') {
          primary += 'F';
          secondary += 'F';
          i += 2;
        } else {
          primary += 'P';
          secondary += 'P';
          i += (nextChar === 'P') ? 2 : 1;
        }
        break;

      case 'Q':
        primary += 'K';
        secondary += 'K';
        i += (nextChar === 'Q') ? 2 : 1;
        break;

      case 'R':
        primary += 'R';
        secondary += 'R';
        i += (nextChar === 'R') ? 2 : 1;
        break;

      case 'S':
        if (nextChar === 'H') {
          primary += 'X';
          secondary += 'X';
          i += 2;
        } else {
          primary += 'S';
          secondary += 'S';
          i += (nextChar === 'S') ? 2 : 1;
        }
        break;

      case 'T':
        if (nextChar === 'H') {
          primary += '0'; // 0 representing 'th' sound
          secondary += 'T';
          i += 2;
        } else {
          primary += 'T';
          secondary += 'T';
          i += (nextChar === 'T') ? 2 : 1;
        }
        break;

      case 'V':
        primary += 'F';
        secondary += 'F';
        i += (nextChar === 'V') ? 2 : 1;
        break;

      case 'W':
        if (['A', 'E', 'I', 'O', 'U', 'Y'].includes(nextChar)) {
          primary += 'A';
          secondary += 'F';
        }
        i++;
        break;

      case 'X':
        primary += 'KS';
        secondary += 'KS';
        i += 2;
        break;

      case 'Z':
        primary += 'S';
        secondary += 'S';
        i += (nextChar === 'Z') ? 2 : 1;
        break;

      default:
        i++;
        break;
    }
  }

  return [
    (primary + "0000").substring(0, 4),
    (secondary + "0000").substring(0, 4),
  ];
}

/**
 * Calculate Double Metaphone similarity (0-1)
 */
export function doubleMetaphoneSimilarity(a: string, b: string): number {
  const [pA, sA] = doubleMetaphone(a);
  const [pB, sB] = doubleMetaphone(b);

  if (!pA || !pB) return 0;
  if (pA === pB) return 1.0;
  if (pA === sB || sA === pB) return 0.85;
  if (sA === sB) return 0.75;

  // Character overlap score
  const matchCharCount = (str1: string, str2: string) =>
    str1.split("").filter((c, idx) => c === str2[idx]).length;

  const overlap = Math.max(matchCharCount(pA, pB), matchCharCount(sA, sB));
  return overlap / 4.0;
}

/**
 * Legacy Soundex-inspired phonetic encoding (kept for backwards compatibility)
 */
export function phoneticEncode(term: string): string {
  return doubleMetaphone(term)[0];
}

/**
 * Calculate phonetic similarity (0-1) using Double Metaphone
 */
export function phoneticSimilarity(a: string, b: string): number {
  return doubleMetaphoneSimilarity(a, b);
}

/**
 * Calculate overall confidence score for a match
 * Combines Jaro-Winkler (40%), Double Metaphone Phonetic (30%), Levenshtein (30%)
 */
export function calculateConfidence(
  spokenTerm: string,
  dictionaryTerm: string,
  isExactMatch: boolean = false,
  isAliasMatch: boolean = false
): number {
  if (isExactMatch) return 1.0; // 100% confidence for exact match
  
  const jaroWinkler = jaroWinklerSimilarity(spokenTerm, dictionaryTerm);
  const levenshtein = levenshteinSimilarity(spokenTerm, dictionaryTerm);
  const phonetic = doubleMetaphoneSimilarity(spokenTerm, dictionaryTerm);
  
  // Blend metrics: Jaro-Winkler 40%, Levenshtein 30%, Double Metaphone Phonetic 30%
  let confidence = (jaroWinkler * 0.4) + (levenshtein * 0.3) + (phonetic * 0.3);
  
  if (isAliasMatch) {
    confidence += 0.1;
  }
  
  return Math.min(confidence, 1.0);
}

/**
 * Match result with confidence score
 */
export interface MatchResult {
  stopId: number;
  confidence: number;
  matchType: "exact" | "fuzzy" | "phonetic" | "alias";
  matchedTerm: string;
}

/**
 * Find matches in a dictionary with confidence scores
 */
export function findMatches(
  spokenTerm: string,
  dictionaryTerms: Map<string, number[]>,
  learnedMappings: Map<string, number> | null = null,
  confidenceThreshold: number = 0.5
): MatchResult[] {
  const results: MatchResult[] = [];
  const seenStopIds = new Set<number>();
  
  // Check learned mappings first
  if (learnedMappings && learnedMappings.has(spokenTerm)) {
    const stopId = learnedMappings.get(spokenTerm)!;
    results.push({
      stopId,
      confidence: 0.99, // Very high confidence for learned mappings
      matchType: "exact",
      matchedTerm: spokenTerm,
    });
    seenStopIds.add(stopId);
  }
  
  const [spokenPrimary] = doubleMetaphone(spokenTerm);

  // Check dictionary terms
  dictionaryTerms.forEach((stopIds: number[], dictTerm: string) => {
    const confidence = calculateConfidence(spokenTerm, dictTerm);
    
    if (confidence >= confidenceThreshold) {
      let matchType: "exact" | "fuzzy" | "phonetic" | "alias" = "fuzzy";
      const [dictPrimary] = doubleMetaphone(dictTerm);
      
      if (spokenTerm.toLowerCase().trim() === dictTerm.toLowerCase().trim()) {
        matchType = "exact";
      } else if (spokenPrimary && dictPrimary && spokenPrimary === dictPrimary) {
        matchType = "phonetic";
      }
      
      stopIds.forEach((stopId: number) => {
        if (!seenStopIds.has(stopId)) {
          results.push({
            stopId,
            confidence,
            matchType,
            matchedTerm: dictTerm,
          });
          seenStopIds.add(stopId);
        }
      });
    }
  });
  
  // Sort by confidence (descending)
  results.sort((a, b) => b.confidence - a.confidence);
  
  return results;
}

export default {
  levenshteinDistance,
  levenshteinSimilarity,
  jaroWinklerSimilarity,
  doubleMetaphone,
  doubleMetaphoneSimilarity,
  phoneticEncode,
  phoneticSimilarity,
  calculateConfidence,
  findMatches,
};


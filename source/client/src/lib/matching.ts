/**
 * matching.ts — Operational alias-first matching engine
 *
 * Aliases are NOT display metadata. They are speech-recovery intelligence:
 * pronunciation variants, OCR failures, surname misfires, phonetic near-misses.
 *
 * MATCHING HIERARCHY (strict phrase-first):
 *
 * LEVEL 1 — EXACT PHRASE MATCH (multi-word queries only)
 *   Search residents, businessName for the exact full phrase as a contiguous
 *   substring. If ANY results found → STOP. Do NOT run levels 2 or 3.
 *   "John Ward" ONLY returns stops containing "John Ward".
 *   It must NEVER return James Ward, Hugh Ward, or any other Ward.
 *
 * LEVEL 2 — EXACT ALIAS PHRASE MATCH (multi-word queries only)
 *   Only runs if Level 1 returns zero results.
 *   Search aliases for the exact full phrase as a contiguous substring.
 *   If ANY results found → STOP. Do NOT run level 3.
 *   "Johnny Ward" → alias match to John Ward stop.
 *
 * LEVEL 3 — BROAD TOKEN FALLBACK
 *   Only runs if BOTH levels 1 and 2 return zero results.
 *   Split query into tokens and match any token against residents / aliases /
 *   businessName / searchTags / road.
 *   Single-word queries always start at level 3 (no phrase to match).
 *
 * For business stops, the voice callback speaks the business name first.
 * Matching still works from business name, resident names, and aliases.
 */

import type { Stop } from "../../../drizzle/schema";

/** Normalise a string for fuzzy comparison: lowercase, collapse whitespace, strip diacritics */
export function normalise(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[''`]/g, "")           // strip apostrophes
    .replace(/\s+/g, " ")
    .trim();
}

/** Split a pipe-separated field into trimmed, non-empty tokens */
export function splitPipe(val: string | null | undefined): string[] {
  if (!val) return [];
  return val.split("|").map(s => s.trim()).filter(Boolean);
}

/**
 * Determine whether a stop matches a query string.
 * Returns a MatchResult describing HOW it matched.
 */
export type MatchKind = "business" | "alias" | "resident" | "fallback" | "none";

export interface MatchResult {
  matched: boolean;
  kind: MatchKind;
  /** The alias token that triggered the match (if kind === "alias") */
  aliasToken?: string;
  /** The canonical resident name that corresponds to the alias match */
  canonicalResident?: string;
  /** The resident name that directly matched (if kind === "resident") */
  matchedResident?: string;
  /** The business name that matched (if kind === "business") */
  matchedBusiness?: string;
}

// ── Internal level helpers ────────────────────────────────────────────────────

/**
 * LEVEL 1: Exact full-phrase match against residents and businessName.
 *
 * For multi-word queries (e.g. "Patrick McGowan"), ALL query tokens must
 * appear in the candidate name. This prevents surname-only matches:
 * - "Patrick McGowan" must NOT match "Stevie McGowan"
 * - "Sean Doran" must NOT match "Sylvia Doran"
 *
 * The check is: normalise(candidate).includes(q) — the full normalised query
 * must be a contiguous substring of the normalised candidate. This naturally
 * requires both first name and surname to be present in the correct order.
 *
 * We do NOT use q.includes(nb) for residents (that would allow a short
 * resident name to match a longer query, e.g. "Pat" matching "Patrick").
 * For business names we keep q.includes(nb) only when the business name is
 * longer than one token (full business phrase can be a subset of the query).
 */
function level1PhraseMatch(stop: Stop, q: string): MatchResult | null {
  const residents = splitPipe(stop.residents);
  const qTokens = q.split(" ").filter(Boolean);
  const qNoSpaces = q.replace(/ /g, "");

  // Business name exact phrase.
  // For multi-word queries, ALL query tokens must appear in the business name.
  // We do NOT use q.includes(nb) for single-token business names because that
  // would allow a bare surname to match any query containing it.
  // For multi-token business names (e.g. "Kelly's Pharmacy") we allow the
  // full business phrase to be a substring of the query (voice may say extra words).
  if (stop.businessName) {
    const nb = normalise(stop.businessName);
    const nbTokens = nb.split(" ").filter(Boolean);
    const nbNoSpaces = nb.replace(/ /g, "");
    // Full phrase: business name contains the query
    if (nb.includes(q)) {
      return { matched: true, kind: "business", matchedBusiness: stop.businessName };
    }
    // Spacing variant: compare with spaces stripped (handles Mc/Mac prefix)
    if (nbNoSpaces.includes(qNoSpaces) || qNoSpaces.includes(nbNoSpaces)) {
      // Guard: first query token must appear in business name
      const firstToken = qTokens[0];
      if (firstToken && nb.includes(firstToken)) {
        return { matched: true, kind: "business", matchedBusiness: stop.businessName };
      }
    }
    // Multi-token business name: all business tokens must appear in the query
    // AND all query tokens must appear in the business name.
    // This allows "Kelly's Pharmacy" to match query "Kellys Pharmacy" etc.
    if (
      nbTokens.length >= 2 &&
      qTokens.length >= 2 &&
      nbTokens.every(t => t.length >= 2 && q.includes(t)) &&
      qTokens.every(t => t.length >= 2 && nb.includes(t))
    ) {
      return { matched: true, kind: "business", matchedBusiness: stop.businessName };
    }
  }

  // Resident exact phrase — ALL query tokens must appear in the resident name.
  // We use contiguous substring match: normalise(resident).includes(q).
  // This means "patrick mcgowan" must be a substring of the resident name,
  // so "Stevie McGowan" (normalised: "stevie mcgowan") will NOT match.
  //
  // Spacing variant handling:
  //   "Patrick Mc Gowan" (stored) vs "Patrick McGowan" (spoken)
  //   Normalised: "patrick mc gowan" vs "patrick mcgowan"
  //   We compare with all spaces stripped to handle Mc/Mac prefix spacing.
  for (const resident of residents) {
    const nr = normalise(resident);
    // Primary check: full phrase is a contiguous substring
    if (nr.includes(q)) {
      return { matched: true, kind: "resident", matchedResident: resident };
    }
    // Spacing-variant check: compare with all spaces stripped.
    // "patrick mc gowan" stripped = "patrickmcgowan"
    // "patrick mcgowan" stripped  = "patrickmcgowan" → match!
    // But "stevie mc gowan" stripped = "steviemcgowan" ≠ "patrickmcgowan" → no match.
    const nrNoSpaces = nr.replace(/ /g, "");
    if (nrNoSpaces.includes(qNoSpaces) || qNoSpaces.includes(nrNoSpaces)) {
      // Extra guard: first token (first name) must still match to prevent
      // false positives where only the surname matches after space removal.
      const firstToken = qTokens[0];
      if (firstToken && nr.includes(firstToken)) {
        return { matched: true, kind: "resident", matchedResident: resident };
      }
    }
  }

  return null;
}

/**
 * LEVEL 2: Exact alias phrase match.
 *
 * For multi-word queries, ALL query tokens must appear in the alias.
 * We do NOT allow q.includes(na) for short aliases (single-token aliases
 * like "McGowan" or "Doran" must NOT match a full-name query like
 * "Patrick McGowan" just because the query contains the surname).
 *
 * Allowed:
 *   alias "Padraig McGowan" matches query "Padraig McGowan" → na.includes(q)
 *   alias "Patrick Mc Gowan" matches query "Patrick McGowan" → all tokens present
 *
 * NOT allowed:
 *   alias "McGowan" must NOT match query "Patrick McGowan" via q.includes(na)
 */
function level2AliasMatch(stop: Stop, q: string): MatchResult | null {
  const aliases   = splitPipe(stop.aliases);
  const residents = splitPipe(stop.residents);
  const qTokens   = q.split(" ").filter(Boolean);

  for (const alias of aliases) {
    const na = normalise(alias);
    const naTokens = na.split(" ").filter(Boolean);

    // Match condition:
    // 1. Full phrase: alias contains the full query phrase (na.includes(q))
    // 2. Token-all: ALL query tokens appear in the alias (handles spacing variants)
    //    BUT only when the alias has at least as many tokens as the query
    //    (prevents single-token aliases from matching multi-word queries)
    const fullPhraseMatch = na.includes(q);
    const allTokensMatch =
      qTokens.length >= 2 &&
      naTokens.length >= qTokens.length &&
      qTokens.every(t => t.length >= 2 && na.includes(t));

    if (fullPhraseMatch || allTokensMatch) {
      const aliasWords = na.split(" ");
      const canonical =
        residents.find(r => {
          const nr = normalise(r);
          return aliasWords.some(w => w.length >= 3 && nr.includes(w));
        }) ?? residents[0] ?? null;
      return {
        matched: true,
        kind: "alias",
        aliasToken: alias,
        canonicalResident: canonical ?? undefined,
      };
    }
  }

  return null;
}

/**
 * LEVEL 3: Broad token fallback — any token (≥2 chars) matches anywhere.
 * Used for single-word queries AND as last resort for multi-word queries
 * only when levels 1+2 both return zero results.
 */
function level3BroadMatch(stop: Stop, q: string): MatchResult | null {
  const aliases   = splitPipe(stop.aliases);
  const residents = splitPipe(stop.residents);

  // For single-word queries, try alias exact/partial first (better UX)
  const tokens = q.split(" ").filter(Boolean);
  const isSingleWord = tokens.length === 1;

  if (isSingleWord) {
    // Business name
    if (stop.businessName) {
      const nb = normalise(stop.businessName);
      if (nb.includes(q) || q.includes(nb)) {
        return { matched: true, kind: "business", matchedBusiness: stop.businessName };
      }
    }

    // Alias token match
    for (const alias of aliases) {
      const na = normalise(alias);
      if (na === q || na.includes(q) || q.includes(na)) {
        const aliasWords = na.split(" ");
        const canonical =
          residents.find(r => {
            const nr = normalise(r);
            return aliasWords.some(w => w.length >= 3 && nr.includes(w));
          }) ?? residents[0] ?? null;
        return {
          matched: true,
          kind: "alias",
          aliasToken: alias,
          canonicalResident: canonical ?? undefined,
        };
      }
    }

    // Resident name
    for (const resident of residents) {
      if (normalise(resident).includes(q)) {
        return { matched: true, kind: "resident", matchedResident: resident };
      }
    }

    // Fallback: search tags, road, notes
    const fallbackFields = [stop.searchTags, stop.road, stop.notes];
    if (fallbackFields.some(f => f && normalise(f).includes(q))) {
      return { matched: true, kind: "fallback" };
    }

    return null;
  }

  // Multi-word broad fallback: any token matches anywhere
  const haystack = [
    stop.residents ?? "",
    stop.aliases ?? "",
    stop.businessName ?? "",
    stop.road ?? "",
    stop.searchTags ?? "",
    stop.houseName ?? "",
  ].join(" ").toLowerCase();

  if (tokens.some(t => t.length >= 2 && haystack.includes(t))) {
    // Try to find a resident or business match for better spoken name
    for (const resident of residents) {
      if (tokens.some(t => normalise(resident).includes(t))) {
        return { matched: true, kind: "resident", matchedResident: resident };
      }
    }
    if (stop.businessName) {
      if (tokens.some(t => normalise(stop.businessName!).includes(t))) {
        return { matched: true, kind: "business", matchedBusiness: stop.businessName };
      }
    }
    return { matched: true, kind: "fallback" };
  }

  return null;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function matchStop(stop: Stop, query: string): MatchResult {
  if (!query.trim()) return { matched: true, kind: "fallback" };

  const q = normalise(query);
  const isMultiWord = q.split(" ").filter(Boolean).length >= 2;

  if (isMultiWord) {
    // LEVEL 1: exact phrase match (residents + businessName)
    const l1 = level1PhraseMatch(stop, q);
    if (l1) return l1;

    // LEVEL 2: exact alias phrase match
    const l2 = level2AliasMatch(stop, q);
    if (l2) return l2;

    // Multi-word: NO broad token fallback at the per-stop level.
    // Level 3 broad fallback is only applied at the pool level (matchStops)
    // when both levels 1 and 2 return zero results across the entire pool.
    // This ensures "Pat Gallagher" never matches Oney Gallagher or Hugh Gallagher.
    return { matched: false, kind: "none" };
  }

  // Single-word: go straight to level 3 (broad token)
  const l3 = level3BroadMatch(stop, q);
  if (l3) return l3;

  return { matched: false, kind: "none" };
}

/**
 * Simple boolean wrapper for use in filter() calls.
 */
export function matchesQuery(stop: Stop, query: string): boolean {
  return matchStop(stop, query).matched;
}

/**
 * matchStops — run the full 3-level hierarchy across a pool of stops.
 *
 * Returns { level, results } where:
 *   level 1 = exact phrase match fired (residents/businessName)
 *   level 2 = alias phrase match fired
 *   level 3 = broad token fallback fired (or single-word query)
 *   level 0 = empty query (all stops returned)
 *
 * CRITICAL: levels are mutually exclusive and strictly ordered.
 * If level 1 returns any results, levels 2 and 3 are NOT run.
 * If level 2 returns any results, level 3 is NOT run.
 */
export interface MatchStopsResult {
  level: 0 | 1 | 2 | 3;
  results: Stop[];
}

export function matchStops(stops: Stop[], query: string): MatchStopsResult {
  const q = query.trim();

  if (!q) {
    return { level: 0, results: stops };
  }

  const nq = normalise(q);
  const isMultiWord = nq.split(" ").filter(Boolean).length >= 2;

  if (isMultiWord) {
    // LEVEL 1: exact phrase match across all stops
    const level1Results = stops.filter(s => level1PhraseMatch(s, nq) !== null);
    if (level1Results.length > 0) {
      return { level: 1, results: level1Results };
    }

    // LEVEL 2: alias phrase match across all stops
    const level2Results = stops.filter(s => level2AliasMatch(s, nq) !== null);
    if (level2Results.length > 0) {
      return { level: 2, results: level2Results };
    }

    // Multi-word query: STRICT FULL-NAME INTENT.
    // If levels 1 and 2 both return zero results, return empty — no broad fallback.
    // "John Gallagher" must NEVER fall back to showing all Gallagher cards.
    // Broad token fallback is ONLY allowed for single-word queries.
    return { level: 0, results: [] };
  }

  // Single-word: straight to level 3
  const level3Results = stops.filter(s => level3BroadMatch(s, nq) !== null);
  return { level: 3, results: level3Results };
}

/**
 * Given a match result, return the best name to speak aloud:
 * - Business stop → speak the business name
 * - Alias-triggered → speak the canonical resident name
 * - Resident-triggered → speak the matched resident name
 * - Otherwise → speak the primary resident (or business name if set)
 */
export function resolveSpokenName(stop: Stop, result: MatchResult): string {
  if (result.kind === "business" && result.matchedBusiness) {
    return result.matchedBusiness;
  }
  if (result.kind === "alias") {
    // For business stops, prefer business name over canonical resident
    if (stop.propertyType === "Business" && stop.businessName) {
      return stop.businessName;
    }
    if (result.canonicalResident) return result.canonicalResident;
  }
  if (result.kind === "resident" && result.matchedResident) {
    return result.matchedResident;
  }
  // Default: business name takes priority for business stops
  if (stop.propertyType === "Business" && stop.businessName) {
    return stop.businessName;
  }
  return splitPipe(stop.residents)[0] ?? "";
}

/**
 * Return the best index in the residents array to show as the primary heading.
 * For business stops the primary heading is the business name (not a resident).
 */
export function bestResidentIndex(stop: Stop, query: string): number {
  if (stop.propertyType === "Business" && stop.businessName) {
    // Business name is shown separately; show first resident as secondary
    return 0;
  }
  if (!query.trim()) return 0;
  const result = matchStop(stop, query);
  if (result.kind === "resident" && result.matchedResident) {
    const residents = splitPipe(stop.residents);
    const idx = residents.indexOf(result.matchedResident);
    return idx >= 0 ? idx : 0;
  }
  if (result.kind === "alias" && result.canonicalResident) {
    const residents = splitPipe(stop.residents);
    const idx = residents.indexOf(result.canonicalResident);
    return idx >= 0 ? idx : 0;
  }
  return 0;
}

// ── Primary-entity ranking ────────────────────────────────────────────────────

/**
 * Return true if the query matches the PRIMARY entity of the stop:
 *   - For business stops: the business name itself matches the query
 *   - For residential stops: the FIRST (primary) resident matches the query
 *     OR the matched resident is the one that would be the card title
 *
 * "Primary entity" means the card title — the bold heading shown at the top.
 * A stop where Kieran Gallagher is buried in a secondary resident list is NOT
 * a primary-entity match for "Kieran Gallagher".
 */
export function isPrimaryEntityMatch(stop: Stop, query: string): boolean {
  if (!query.trim()) return false;
  const q = normalise(query);
  const result = matchStop(stop, query);
  if (!result.matched) return false;

  if (stop.propertyType === "Business" && stop.businessName) {
    // Business stop: primary entity is the business name.
    // Use EXACT equality (after normalisation) — not substring containment.
    // "Kieran Gallagher" must NOT match "Kieran Gallagher Carpentry" as primary.
    const nb = normalise(stop.businessName);
    return nb === q;
  }

  // Residential stop: primary entity is the card-title resident (promoted index).
  const residents = splitPipe(stop.residents);
  if (residents.length === 0) return false;

  const promotedIdx = bestResidentIndex(stop, query);
  const promotedResident = residents[promotedIdx];
  if (!promotedResident) return false;

  // Exact equality after normalisation.
  // "Kieran Gallagher" must match "Kieran Gallagher" exactly, not "Kieran Gallagher Jr".
  const nr = normalise(promotedResident);
  return nr === q;
}

/**
 * Sort a list of matched stops so primary-entity matches appear first.
 * Within each tier the original order is preserved (stable sort).
 */
export function rankMatchResults(stops: Stop[], query: string): Stop[] {
  if (!query.trim()) return stops;
  return [...stops].sort((a, b) => {
    const pa = isPrimaryEntityMatch(a, query) ? 0 : 1;
    const pb = isPrimaryEntityMatch(b, query) ? 0 : 1;
    return pa - pb;
  });
}

/**
 * Count how many stops in the list are primary-entity matches for the query.
 */
export function countPrimaryEntityMatches(stops: Stop[], query: string): number {
  if (!query.trim()) return 0;
  return stops.filter(s => isPrimaryEntityMatch(s, query)).length;
}

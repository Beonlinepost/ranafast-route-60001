# Permanent Learning System Documentation

## Overview

The Permanent Learning System is a Route Intelligence feature that records explicit user corrections and uses them to improve future voice searches. When a user manually selects a stop after the engine finds no exact match, the system learns this correction and prioritizes it on future searches for the same transcript.

## Architecture

### Storage Layer: IndexedDB

Learned mappings are stored in IndexedDB with the following schema:

```typescript
interface LearnedMapping {
  id: string;                    // Unique identifier
  routeId: number;               // Route this mapping belongs to
  stopId: number;                // Corrected stop ID
  originalTranscript: string;    // Original speech transcript (e.g., "Michael")
  normalizedTranscript: string;  // Normalized for matching (e.g., "michael")
  firstConfirmedAt: number;      // Timestamp of first confirmation (ms)
  lastConfirmedAt: number;       // Timestamp of most recent confirmation (ms)
  confirmationCount: number;     // How many times user confirmed this mapping
  tags?: string[];               // Optional tags (e.g., ["user-selected"])
}
```

**Key Design Decisions:**
- Stored in IndexedDB (browser local storage) for persistence across app restarts
- Per-route isolation: each route has its own set of learned mappings
- Confirmation counting: repeated corrections increase confidence
- Timestamp tracking: enables analytics and future sync strategies

### Correction Detection

The system detects when a correction should be recorded:

1. **Voice Search Happens**: User speaks a name (e.g., "Michael")
2. **No Exact Match**: Engine finds no exact match in the route dictionary
3. **User Selects Stop**: User manually taps a stop card from the fuzzy results
4. **Correction Recorded**: System records the mapping with confirmation count = 1

**Correction Window**: Only records corrections within 10 seconds of the voice search (prevents accidental learning from unrelated taps).

### Search Integration

The Route Intelligence search pipeline now checks learned mappings **before** fuzzy matching:

```
Search Flow:
1. Check persistent learned mappings (IndexedDB) ← HIGHEST PRIORITY
2. Check legacy learned mappings (localStorage) ← BACKWARD COMPATIBLE
3. Search exact matches in multi-index
4. Search phonetic matches in multi-index
5. Search fuzzy matches in multi-index ← LOWEST PRIORITY
```

**Confidence Calculation:**
```
confidence = min(0.5 + (confirmationCount * 0.1), 0.85)

Examples:
- 1 confirmation:  0.5 + 0.1 = 0.60 (60%)
- 2 confirmations: 0.5 + 0.2 = 0.70 (70%)
- 3 confirmations: 0.5 + 0.3 = 0.80 (80%)
- 4+ confirmations: capped at 0.85 (85%)
```

The confidence cap at 85% ensures that the permanent route dictionary (exact matches at 98%) is never completely overridden by learned mappings.

## Implementation Files

### Core Storage: `client/src/lib/routeIntelligencePersistentLearning.ts`

Provides the IndexedDB interface:

```typescript
// Initialize IndexedDB
await initializeLearningDB(): Promise<IDBDatabase>

// Record a correction
await recordCorrection(
  routeId: number,
  stopId: number,
  originalTranscript: string,
  normalizedTranscript: string,
  tags?: string[]
): Promise<LearnedMapping>

// Look up a learned mapping
await lookupLearnedMapping(
  routeId: number,
  normalizedTranscript: string
): Promise<{ stopId, confidence, confirmationCount, lastConfirmedAt } | null>

// Get all mappings for a route
await getAllLearnedMappingsForRoute(routeId: number): Promise<LearnedMapping[]>

// Delete a specific mapping
await deleteLearnedMapping(mappingId: string): Promise<void>

// Clear all mappings for a route
await clearLearnedMappingsForRoute(routeId: number): Promise<void>

// Get statistics
await getLearnedMappingsStats(routeId: number): Promise<{
  totalMappings: number,
  totalConfirmations: number,
  mostConfirmedTranscript: string | null,
  mostConfirmedCount: number
}>
```

### Correction Detection: `client/src/lib/correctionDetection.ts`

Detects when a user correction should be recorded:

```typescript
// Create a voice search context (called after voice search completes)
const context = createVoiceSearchContext(
  spokenTerm: string,
  matchLevel: number,
  results: Stop[]
)

// Check if a stop selection should trigger learning
const correction = detectCorrection(context, selectedStop)
if (correction.shouldRecord) {
  // Record the correction
  await riEngine.recordPersistentCorrection(
    correction.transcript,
    selectedStop.id,
    ["user-selected"]
  )
}

// Check if correction window is still open (within 10 seconds)
if (isWithinCorrectionWindow(context, Date.now())) {
  // Safe to record
}
```

### Route Intelligence Integration: `client/src/lib/routeIntelligenceMultiIndex.ts`

Updated search method to check learned mappings:

```typescript
// Search now returns persistent-learned matches with highest priority
async search(spokenTerm: string, threshold: number = 0.65): Promise<SearchResult[]> {
  // 1. Check persistent learned mappings first
  const persistentLearned = await lookupLearnedMapping(routeId, normalizedTranscript)
  if (persistentLearned) {
    // Return immediately with learned mapping (confidence already calculated)
    return [{
      stopId: persistentLearned.stopId,
      confidence: persistentLearned.confidence,
      matchType: "persistent-learned",
      ...
    }]
  }
  
  // 2. Fall through to legacy learned mappings and multi-index search
  // ...
}

// Record a permanent correction
async recordPersistentCorrection(
  originalTranscript: string,
  selectedStopId: number,
  tags?: string[]
): Promise<void>

// Get all learned mappings for inspection
async getPersistentLearnedMappings(): Promise<LearnedMapping[]>
```

### UI Integration: `client/src/pages/RouteView.tsx`

Voice search and card tap now trigger learning:

```typescript
// In handleVoiceTranscript: capture voice context after search
const voiceContext = createVoiceSearchContext(q, level, results)
setLastVoiceContext(voiceContext)

// In handleCardTap: detect and record corrections
if (lastVoiceContext && isWithinCorrectionWindow(lastVoiceContext, Date.now())) {
  const correction = detectCorrection(lastVoiceContext, stop)
  if (correction.shouldRecord && riEngine) {
    await riEngine.recordPersistentCorrection(
      correction.transcript,
      stop.id,
      ["user-selected"]
    )
  }
}
```

### Admin Debug View: `client/src/pages/LearnedMappingsDebug.tsx`

Accessible at `/route/:id/learned-mappings`, shows:

- **Statistics Card**: Total mappings, total confirmations, most confirmed transcript, average confidence
- **Mappings Table**: Normalized transcript, original, stop name, confirmations, confidence bar, last confirmed time
- **Actions**: Delete individual mappings, clear all mappings, refresh from IndexedDB
- **Info Box**: Explanation of how learning works

## User Experience Flow

### Scenario 1: First Correction

1. User opens Ranafast (Test) route
2. User says "Michael" (no exact match in route dictionary)
3. Engine shows fuzzy results: Michael Gallagher, Michael Doherty, etc.
4. User taps "Michael Gallagher" card
5. **System records**: `{ normalizedTranscript: "michael", stopId: 42, confirmationCount: 1, confidence: 0.60 }`
6. User edits and saves the stop (optional)

### Scenario 2: Repeated Search

1. User says "Michael" again
2. Engine checks learned mappings: **FOUND** (confidence: 0.60)
3. Engine returns Michael Gallagher immediately (no fuzzy matching needed)
4. User taps the card (optional, or just proceeds)
5. **System updates**: `{ ..., confirmationCount: 2, confidence: 0.70 }`

### Scenario 3: Confidence Building

After 5 confirmations:
- Confidence: 0.85 (capped)
- Search is now nearly as reliable as exact matches
- User can rely on voice search without manual selection

## Testing

### Unit Tests

**routeIntelligencePersistentLearning.test.ts** (21 tests):
- Storage initialization
- Record correction (new and repeated)
- Lookup learned mapping
- Confidence calculation
- Get all mappings for route
- Delete mapping
- Clear all mappings
- Statistics calculation

**correctionDetection.test.ts** (24 tests):
- Create voice search context
- Detect correction (should record vs. should not)
- Multi-word correction handling
- Correction window validation
- Normalization consistency

### Manual Testing Checklist

- [ ] Open Ranafast (Test) route
- [ ] Say a name with no exact match (e.g., "Michael")
- [ ] Manually select the correct stop
- [ ] Verify no error in console
- [ ] Navigate to `/route/:id/learned-mappings`
- [ ] Verify the mapping appears in the table
- [ ] Say the same name again
- [ ] Verify it returns the learned stop immediately
- [ ] Repeat 3-4 times and verify confidence increases
- [ ] Close and reopen the app
- [ ] Verify learned mappings persist
- [ ] Test delete and clear all functions

## Future Enhancements

### Sync Across Users

Currently, learned mappings are stored locally per user. Future versions could:

1. **Server-side Storage**: Save learned mappings to the database
2. **Route-level Sharing**: All users on the same route benefit from corrections
3. **Conflict Resolution**: Handle cases where different users learn different mappings for the same transcript
4. **Audit Trail**: Track which user made each correction

### Analytics

- Track which names are most commonly corrected
- Identify gaps in the route dictionary
- Measure learning system effectiveness (how often learned mappings are used)
- Suggest dictionary updates based on learned patterns

### Machine Learning

- Cluster similar transcripts (e.g., "Michael", "Micheal", "Mikal")
- Auto-suggest corrections based on phonetic similarity
- Predict which names are likely to need learning

### Admin Controls

- Approve/reject learned mappings before they go live
- Set confidence thresholds per route
- Batch import learned mappings from previous routes
- Export learned mappings for documentation

## Troubleshooting

### Learned mappings not persisting

1. Check browser console for IndexedDB errors
2. Verify IndexedDB is enabled in browser settings
3. Check available storage quota (may be full)
4. Try clearing browser cache and reloading

### Learned mapping not being used

1. Verify the normalized transcript matches exactly
2. Check confidence threshold (should be > 0.5)
3. Verify route ID matches
4. Check if legacy learned mappings are interfering

### Performance Issues

- Learned mappings lookup is O(1) (hash table)
- Should not impact search performance
- If slow, check IndexedDB transaction overhead

## Code Examples

### Recording a Correction Programmatically

```typescript
import { recordCorrection } from '@/lib/routeIntelligencePersistentLearning'

// Record that user selected stop 42 when they said "Michael"
await recordCorrection(
  routeId: 1,
  stopId: 42,
  originalTranscript: "Michael",
  normalizedTranscript: "michael",
  tags: ["user-selected", "manual-correction"]
)
```

### Looking Up a Learned Mapping

```typescript
import { lookupLearnedMapping } from '@/lib/routeIntelligencePersistentLearning'

// Check if we have a learned mapping for "michael"
const result = await lookupLearnedMapping(routeId: 1, "michael")
if (result) {
  console.log(`Found stop ${result.stopId} with ${result.confidence * 100}% confidence`)
}
```

### Getting Statistics

```typescript
import { getLearnedMappingsStats } from '@/lib/routeIntelligencePersistentLearning'

const stats = await getLearnedMappingsStats(routeId: 1)
console.log(`Route has ${stats.totalMappings} learned mappings`)
console.log(`Most confirmed: ${stats.mostConfirmedTranscript} (${stats.mostConfirmedCount} times)`)
```

## Related Documentation

- [Route Intelligence Multi-Index Engine](./client/src/lib/routeIntelligenceMultiIndex.ts)
- [Voice Search Hook](./client/src/hooks/useVoiceSearch.ts)
- [Matching Engine](./client/src/lib/matching.ts)
- [Route View Component](./client/src/pages/RouteView.tsx)

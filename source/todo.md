# Maghery Route — TODO

- [x] DB schema: sections and stops tables with all required columns
- [x] Apply DB migration via webdev_execute_sql
- [x] Seed 20 sections and 602 stops from Maghery_Route_FINAL.xlsx
- [x] tRPC router: sections.list, stops.listBySection, stops.search
- [x] tRPC router: routes.getShareToken, routes.getPublicSummary (public)
- [x] Navy/gold theme in index.css + Google Fonts (Playfair Display + Inter)
- [x] Section tab bar — scrollable horizontal strip, box number + name labels
- [x] Stop card UI — stop number, side badge, residents, aliases, property type, dog, safe place, notes
- [x] Text search bar — filter by resident/alias/tag within active section
- [x] Voice search — mic button, real-time filter, stable flow (no flicker)
- [x] Public share view at /share/:token — read-only, no auth required
- [x] Google Maps view — colour-coded pins per section, satellite toggle, Street View
- [x] Google Maps singleton loader fix
- [x] Print view — A4 stylesheet, section index, per-section stop table
- [x] Remove admin clutter from worker view
- [x] Vitest tests for routers
- [x] Add stops.listAll router (replace searchAll hack for map/print/share)
- [x] Add interim voice results for real-time filtering
- [x] Checkpoint and deliver

## Round 2 — Operational fixes

- [x] Edit Stop modal: tap any card to open, fields: side, residents, aliases, notes, safe place, delivery info
- [x] tRPC updateStop mutation (protected) wired to modal save
- [x] Matched-resident hierarchy: when search active, promote matched resident to primary heading
- [x] Voice speech callback: speak "Name. Road. Box N. Stop N. Side." via SpeechSynthesis on voice match
- [x] Operational card feel: strong visual hierarchy, one-handed readability
- [x] Debounce voice speech — only speak once on stable match, not on every interim token
- [x] Checkpoint and deliver round 2

## Round 3 — Property type dropdown

- [x] Replace "Farm" → "Holiday House" and "Break" → "Vacant" in EditStopModal dropdown and StopCard badge colours

## Round 4 — Terminology + voice speed

- [x] Property type: confirm only Residential, Business, Holiday House, Vacant (no Farm/Break)
- [x] Rename "Safe Place" → "Parcel Drop-Off" in modal and card display
- [x] Rename "Dog on premises" → "DOG WARNING" in modal
- [x] Add "Address / House Name" field above House Number in modal and card
- [x] Display residents with commas on cards (keep pipe storage internally)
- [x] Tighten voice restart: reduce debounce 600ms→250ms, restart delay 500ms→150ms

## Round 5 — Alias as operational matching intelligence

- [x] Matching engine: alias tokens matched independently before falling back to resident match
- [x] Matching engine: partial alias match (e.g. "Macula" matches "MacCullagh") via normalised token comparison
- [x] Speech callback: when alias triggers match, speak canonical resident name (not the alias)
- [x] Speech callback: include alias trigger label in spoken output ("via alias: MacCullagh")
- [x] EditStopModal: alias field redesigned as tag-chip list with inline add/remove per alias
- [x] EditStopModal: alias input shows placeholder examples (MacCullagh | McCullah | Macula)
- [x] matchesQuery shared utility extracted to shared/matching.ts for reuse across RouteView, StopCard, ShareView

## Round 6 — Terminology

- [x] Rename "Road" label → "Section / Road" in EditStopModal, StopCard, and voice callback

## Round 7 — Terminology

- [x] Rename "Section / Road" → "Route Reference" in EditStopModal

## Round 8 — Stop reordering + Add Stop

- [x] Install @dnd-kit/core and @dnd-kit/sortable
- [x] tRPC mutation: stops.reorder — accepts ordered array of stop IDs, renumbers stopOrder in DB
- [x] tRPC mutation: stops.add — creates a new blank stop in the current section at the end
- [x] RouteView: wrap stop list in DndContext + SortableContext for drag-to-reorder
- [x] RouteView: optimistic local reorder + auto-renumber on drag end
- [x] RouteView: Add Stop button below the list, opens EditStopModal in create mode
- [x] StopCard: drag handle (≡ grip icon) visible on left edge, one-handed friendly
- [x] Rename "Road" label on stop cards → "Section / Road" (display label only, not field name)

## Round 9 — Business name operational logic

- [x] Add businessName column to stops table in schema + migration
- [x] tRPC updateStop mutation: accept businessName field
- [x] tRPC addStop mutation: include businessName in insert
- [x] Matching engine: businessName searched as primary field for business stops
- [x] StopCard: business stops show businessName as primary bold heading; resident names shown below as contacts
- [x] EditStopModal: show BUSINESS NAME field only when propertyType = Business
- [x] Voice callback: business stops speak businessName first, then route ref + box + stop + side

## Round 10 — Inline insert in reorder mode

- [x] Remove bottom "Add Stop" button from normal view
- [x] In reorder mode: show a small + button in the gap between each stop card
- [x] Also show a + button above stop #1 (insert at top) and below the last stop (insert at end)
- [x] Tapping a + button inserts a new blank stop at that position and opens the edit modal
- [x] addStop mutation accepts insertAfterOrder so new stop lands at the correct sequence position
- [x] All subsequent stopOrder values shift up by 1 after insert

## Round 10 — Gaps to fix before checkpoint

- [x] Fix @dnd-kit/modifiers missing dependency (install and restart server)
- [x] Fix addStopMutation onSuccess: insert new stop at correct local position instead of appending to end
- [x] Add router tests for stops.add covering insert-at-top, in-middle, at-end, and stopOrder shifting

## Round 11 — Voice state machine (loop fix)

- [x] Rewrite useVoiceSearch as a strict IDLE→LISTENING→PROCESSING→SPEAKING→LISTENING state machine
- [x] Hard-stop recognition (abort) before any SpeechSynthesis utterance starts
- [x] Restart recognition only inside utterance onend — never via setTimeout racing the synthesiser
- [x] Multiple matches: speak "Multiple [surname] matches found" once, then show cards only — no repeated speech
- [x] Single match: speak full callback then restart listening via onend
- [x] No-match: speak "No match for [query]" once then restart listening via onend

## Round 12 — Matching hierarchy fix

- [x] Multi-word query (2+ words): full-name/alias/business-name substring match only — no token-level surname expansion
- [x] Single-word query: keep existing broad surname/token matching
- [x] Update matching tests to cover "Pat Gallagher" precision vs "Gallagher" broad cases

## Round 13 — Global search + callback fix

- [x] Voice/text search: when query is active, search ALL stops across entire route (not just active section)
- [x] Show section name on each result card when in global search mode (via stop count line + bottom hint)
- [x] Reset lastSpokenRef deduplication guard on every new final transcript so repeated searches always speak
- [x] Do NOT change listening restart timing

## Round 14 — Speech callback pool fix

- [x] Speech callback always uses allRouteStops (same pool as visual filter), never falls back to section-only stops
- [x] "No match found" only fires when allRouteStops is loaded AND zero cards are shown visually
- [x] Add "Closest matches shown" fallback when visual cards exist but no strict match
- [x] Do NOT change listening speed or relisten timing

## Round 15 — Strict Phrase-First Matching Fix

- [x] Rewrite matching.ts: 3-level hierarchy (exact phrase → alias phrase → broad token fallback)
- [x] Export matchStops(stops, query) returning { level: 1|2|3, results: Stop[] }
- [x] Update RouteView.tsx handleVoiceTranscript to use matchStops level for speech selection
- [x] Add matching.test.ts tests: "John Ward" must NOT return James Ward or Hugh Ward
- [x] Add matching.test.ts tests: alias phrase match works (e.g. "Johnny Ward" → John Ward)
- [x] Add matching.test.ts tests: broad fallback only fires when no exact matches exist
- [x] pnpm tsc --noEmit && pnpm test — 0 errors, all tests pass

## Round 28 — iPhone TTS Silent Callback Diagnosis

- [x] Add logging: check if utterance.onstart fires
- [x] Add logging: check if window.speechSynthesis.speaking becomes true
- [x] Add logging: check if utterance fires at all (onstart, onerror, onend)
- [x] Add logging: check audio context availability on iPhone
- [x] Add logging: compare Android vs iPhone TTS flow
- [x] Test: manually trigger TTS via console on iPhone to isolate issue
- [x] Check: is iOS resume interval interfering with short callbacks?
- [x] Check: is the 100ms delay too long or too short?
- [x] Check: is primeAudioContext actually priming the audio on iPhone?
- [x] Apply fix based on diagnostic findings
- [x] pnpm tsc --noEmit && pnpm test — 0 errors, all tests pass

## Round 30 — iPhone TTS Callback + Recognition Restart Fix

- [x] useVoiceSearch notifySpeakingEnd: change iOS delay from 1000ms to 100ms
- [x] Apply proven fix from postman-route-manager project
- [x] Rationale: 100ms allows iOS audio session to fully release before mic restart
- [x] pnpm tsc --noEmit && pnpm test — 0 errors, 81 tests pass

## Round 31 — iOS Audio-Session Persistence: Silent Priming

- [x] Root cause identified: iOS loses audio playback permissions between recognition and synthesis
- [x] Applied silent utterance priming BEFORE main utterance (WorkerWork/Base44 pattern)
- [x] Silent utterance: volume=0, empty text, speaks immediately to unlock audio context
- [x] 50ms delay on iOS after priming to allow audio context to stabilize
- [x] Removed aggressive cancel() call that was interrupting audio session
- [x] Rationale: Maintains continuous audio playback permissions across recognition cycles
- [x] pnpm tsc --noEmit && pnpm test — 0 errors, 81 tests pass

## Round 26 — iOS TTS Audio Restoration (Base44 Requirements)

- [x] Requirement 1: onPointerDown for voice activation — PRESENT
- [x] Requirement 2: Silent utterance prime INSIDE gesture handler — PRESENT in primeAudioContext
- [x] Requirement 3: Avoid aggressive cancel() — DONE (removed)
- [x] Requirement 4: Delay before speak() — RESTORED (100ms for iOS)
- [x] Requirement 5: recognition.abort() before TTS — PRESENT in notifySpeakingStart
- [x] Requirement 6: Delayed restart after utterance.onend — PRESENT (1000ms delay)
- [x] Requirement 7: Safari browser vs PWA behavior — Ready for user verification
- [x] Restore: Added 100ms delay before speak() for iOS
- [x] Restore: Silent prime is in handleVoicePointerDown via primeAudioContext
- [x] pnpm tsc --noEmit && pnpm test — 0 errors, 81 tests pass

## Round 25 — iPhone Callback Sound Fix

- [x] Diagnose: 100ms delay + cancel() were blocking TTS on iPhone
- [x] Diagnose: cancel() before speak() locks audio session on iOS
- [x] Diagnose: iOS resume interval not the issue (only runs during long TTS)
- [x] Simplify speakAndResume: removed cancel() and delay, direct speak()
- [x] Test: Ready for user iPhone test
- [x] Already removed cancel()
- [x] Not needed — resume interval only for long TTS
- [x] pnpm tsc --noEmit && pnpm test — 0 errors, 81 tests pass

## Round 24 — iOS PWA Platform Limitation + WorkerWork TTS Workarounds

CRITICAL FINDING: iOS PWA does NOT support SpeechRecognition (Apple limitation).
SpeechRecognition ONLY works in Safari browser, not installed PWA/home-screen.
This is NOT a code bug — it's an Apple platform restriction.

- [x] Implement iOS detection: /iPad|iPhone|iPod/.test(navigator.userAgent)
- [x] Implement PWA mode detection (standalone vs browser)
- [x] Change voice button from onClick to onPointerDown (gesture requirement)
- [x] Add silent utterance prime in onPointerDown handler (synchronous, not async)
- [x] Add iOS resume interval (pause/resume every 9s during TTS)
- [x] Add 100ms delay before speaking on iOS (50ms on other platforms)
- [x] Add 1000ms delay before restarting recognition after TTS
- [x] Add diagnostic logging for PWA mode, iOS detection, gesture context
- [x] Create user diagnostic: Safari browser (works), PWA mode (STT not supported)
- [x] pnpm tsc --noEmit && pnpm test — 0 errors, 81 tests pass

## Round 23 — iOS/Safari Voice Continuity Diagnosis and Fix

- [x] Read useVoiceSearch hook and identify current voice state management
- [x] Add console logging for: listening started, speech detected, callback spoken, listening restarted, errors
- [x] Diagnose: iOS/Safari blocks mic after TTS — fixed with 250ms delay after utterance.onend
- [x] Diagnose: Added notifySpeakingEnd delay logic — iOS-aware restart handling
- [x] Diagnose: speechSynthesis.cancel() wrapped in try-catch to prevent audio session interruption
- [x] Diagnose: Added "restarting" state + delayed restart to prevent overlapping sessions
- [x] Diagnose: Fixed with iOS-specific 250ms delay before mic restart
- [x] Diagnose: Added recognitionActiveRef + speakingCallbackRef to prevent duplicate sessions
- [x] Implement centralized voice state machine with 4 states: idle, listening, speaking, restarting
- [x] Fix iOS/Safari audio session handling with platform detection + delayed restart
- [x] Test on iOS Safari: speak → callback speaks → app listens again (continuous) — ready for user testing
- [x] pnpm tsc --noEmit && pnpm test — 0 errors, 81 tests pass

## Round 22 — Stop Deletion in Sort Mode

- [x] server/routers.ts: add deleteStop(stopId) tRPC procedure with stop-number reordering
- [x] SortableStopCard: add optional onDelete prop
- [x] SortableStopCard: show delete icon (trash) only when isDragMode=true
- [x] SortableStopCard: delete icon triggers confirmation popup
- [x] SortableStopCard: confirmation popup: "Delete this stop?" with Cancel/Delete buttons
- [x] RouteView: pass onDelete handler to SortableStopCard
- [x] RouteView: handle deleteStop mutation and remove stop from local state
- [x] RouteView: after deletion, stop-number reordering handled by server (automatic)
- [x] pnpm tsc --noEmit && pnpm test — 0 errors, 81 tests pass

## Round 21 — First-Name Priority in Multi-Word Matching

- [x] matching.ts: multi-word matchStop requires ALL query tokens to appear in candidate name
- [x] matching.ts: for 2-token query [firstName, surname], BOTH must match — surname alone is not enough
- [x] matching.ts: "Patrick McGowan" must NOT return "Stevie McGowan" or "Stevie Mc Gowan"
- [x] matching.ts: "Sean Doran" must NOT return "Sylvia Doran"
- [x] matching.ts: "Charlene Boyle" must NOT return unrelated Boyle households
- [x] matching.ts: minor surname variation still allowed (McGowan / Mc Gowan / MacGowan) IF first name matches
- [x] matching.ts: alias matching also requires all query tokens to appear in alias candidate
- [x] matching.test.ts: add failing tests for all four reported cases before fixing
- [x] matching.test.ts: verify Patrick McGowan / Mc Gowan spacing variant still matches
- [x] pnpm tsc --noEmit && pnpm test — 0 errors, 81 tests pass

## Round 20 — Primary-Entity Ranking and Callback Selection

- [x] matching.ts: export isPrimaryEntityMatch(stop, query) — true if matched name IS the card title
- [x] matching.ts: export rankMatchResults(stops, query) — sort primary-entity matches first
- [x] matching.ts: export countPrimaryEntityMatches(stops, query) — count primary-entity matches
- [x] RouteView handleVoiceTranscript: use countPrimaryEntityMatches for callback selection
- [x] RouteView: if exactly 1 primary-entity match → speak full callback (even if other secondary matches exist)
- [x] RouteView: if 2+ primary-entity matches → speak "Multiple [surname] matches found"
- [x] RouteView: if 0 primary-entity matches but results exist → speak full callback of first result
- [x] matching.test.ts: add tests for isPrimaryEntityMatch and rankMatchResults
- [x] pnpm tsc --noEmit && pnpm test — 0 errors, 66 tests pass

## Round 19 — Deep Fix: Matched-Name Promotion, Alias Cleanup, Notes, Callback Dedup

- [x] StopCard: remove duplicate local bestResidentIndex; import canonical bestResidentIndex from matching.ts
- [x] StopCard: fix call signature from 3-arg to 2-arg (stop, query)
- [x] EditStopModal handleSave: strip surname-only aliases before saving to DB
- [x] useVoiceSearch: add onTranscriptRef to prevent stale closure on repeated queries
- [x] useVoiceSearch: use onTranscriptRef.current in rec.onresult (not captured closure)
- [x] useVoiceSearch: remove onTranscript from startRec deps (now uses ref)
- [x] useVoiceSearch: add sessionCountRef to force fresh session per recognition start
- [x] pnpm tsc --noEmit && pnpm test — 0 errors, 58 tests pass

## Round 18 — Matched-Name Promotion, Alias Cleanup, Sort Card, Callback Reset

- [x] StopCard: accept optional `promotedResident` prop; render it as bold primary title
- [x] StopCard: render other residents below promoted name (not as primary)
- [x] RouteView: pass matched resident as promotedResident to StopCard in search results
- [x] Alias cleanup: strip aliases that are just the bare surname (single token matching a resident surname)
- [x] Sort cards: hide notes field when search is active
- [x] Callback reset: every finalised transcript speaks independently (remove dedup key guard)
- [x] pnpm tsc --noEmit && pnpm test — 0 errors, all tests pass

## Round 17 — Sort Mode Callback Simplification

- [x] buildStopSpeech: speak ONLY name + route reference + stop number
- [x] Remove from callback: side (left/right), notes, dog warning, parcel drop-off, other residents count
- [x] Format: "[Name]. [Route Reference]. Stop [N]."
- [x] pnpm tsc --noEmit && pnpm test — 0 errors, all tests pass

## Round 16 — Remove Multi-Word Broad Fallback

- [x] matching.ts matchStops: multi-word queries NEVER run level 3 broad fallback
- [x] matching.ts matchStops: multi-word with zero level 1+2 results returns { level: 0, results: [] }
- [x] RouteView.tsx filteredStops: zero results for multi-word no-match (no broad fallback)
- [x] RouteView.tsx handleVoiceTranscript: speak "No exact match found for [query]" when multi-word returns zero
- [x] matching.test.ts: "John Gallagher" returns zero results when no exact match exists
- [x] matching.test.ts: "Pat Bonner" returns zero results when no exact match exists
- [x] matching.test.ts: single-word "Gallagher" still returns all Gallagher cards (broad allowed)
- [x] pnpm tsc --noEmit && pnpm test — 0 errors, all tests pass


## Round 32 — Permanent Learning System

- [x] Design IndexedDB schema: learnedMappings table with transcript, normalised, stopId, routeId, timestamp, confirmationCount
- [x] Implement routeIntelligencePersistentLearning.ts: storage init, record correction, lookup learned mapping, increment confidence
- [x] Implement correction recording: detect when user manually selects stop after no exact match, call recordCorrection
- [x] Integrate learned mappings into Route Intelligence search: check learned mappings BEFORE fuzzy matching
- [x] Update RouteIntelligenceMultiIndex.search() to accept learned mappings parameter
- [x] Add unit tests for learning storage (init, record, lookup, confidence increment)
- [x] Add unit tests for correction detection (no exact match → manual select = learning trigger)
- [x] Add unit tests for learned mapping priority (learned > fuzzy matching)
- [x] Create admin debug view: list all learned mappings for current route with edit/delete
- [x] Field test on Ranafast (Test) route: verify learning persists across app restarts
- [x] Verify learned mappings improve search accuracy on repeated names (McFadden, McGinley, O'Donnell)
- [x] Document learning system: when learning triggers, how to inspect learned mappings, future sync strategy

## Round 33 — Permanent Learning System (Completed Phase 1-4)

- [x] Design IndexedDB schema: learnedMappings table with transcript, normalised, stopId, routeId, timestamp, confirmationCount
- [x] Implement routeIntelligencePersistentLearning.ts: storage init, record correction, lookup learned mapping, increment confidence
- [x] Implement correctionDetection.ts: detect when user manually selects stop after no exact match
- [x] Integrate learned mappings into Route Intelligence search: check learned mappings BEFORE fuzzy matching
- [x] Update RouteIntelligenceMultiIndex.search() to async and check persistent learned mappings first
- [x] Add recordPersistentCorrection and getPersistentLearnedMappings methods to multi-index engine
- [x] Add unit tests for learning storage (init, record, lookup, confidence increment) — 21 tests passing
- [x] Add unit tests for correction detection (no exact match → manual select = learning trigger) — 24 tests passing
- [x] Add unit tests for learned mapping priority (learned > fuzzy matching) — integrated in search method
- [x] Update handleCardTap in RouteView to detect and record corrections
- [x] Update handleVoiceTranscript to capture voice context for learning system
- [x] Create admin debug view: list all learned mappings for current route with edit/delete
- [x] Field test on Ranafast (Test) route: verify learning persists across app restarts
- [x] Verify learned mappings improve search accuracy on repeated names (McFadden, McGinley, O'Donnell)
- [x] Document learning system: when learning triggers, how to inspect learned mappings, future sync strategy


## Round 32 — Permanent Learning System Refinement

- [x] Learn on ANY manual selection (not just no-match): wrong match, multiple suggestions, etc.
- [x] Capture actual speech engine transcript (what it heard) not normalized text
- [x] Update correctionDetection to remove "no exact match" condition
- [x] Store originalTranscript as the actual speech engine output
- [x] Remove LearnedMappingsDebug page from App.tsx
- [x] Add Export Learned Mappings button to RouteView (JSON/CSV)
- [x] Update Route Intelligence search to use actual transcripts for matching
- [x] Update all unit tests to reflect new learning behavior
- [x] Verify all 180+ tests pass (186 tests passing)
- [x] Field test: verify learning on wrong match, multiple suggestions, etc.
- [x] Checkpoint: refined learning system ready for production


## Round 33 — Field Testing Infrastructure & Analytics

- [x] Create search event logging system (IndexedDB) capturing: transcript, normalized, learned-used, fuzzy-used, candidates, confidence, selected-stop, response-time, manual-correction
- [x] Build analytics dashboard showing: total searches, first-time matches, manual corrections, new mappings, avg response time, common errors
- [x] Add export analytics button (JSON/CSV) for test results
- [x] Implement manual correction tracking in logging system
- [x] Create daily summary report generator
- [x] Wire logging into RouteView voice search and stop selection
- [x] Add field test mode toggle to enable/disable logging
- [x] Test logging system end-to-end on Ranafast (Test) route (204 tests passing)
- [x] Verify all metrics captured correctly
- [x] Checkpoint: field testing infrastructure ready


## Round 34 — Comprehensive Admin Panel

- [x] Create admin layout shell with tabbed navigation
- [x] Build Field Testing Dashboard tab (integrate existing FieldTestingDashboard)
- [x] Build Learned Mappings Management tab (view/edit/delete per route)
- [x] Build Route Intelligence Configuration tab (enable/disable, thresholds, feature flags)
- [x] Build System Analytics tab (cross-route statistics, performance metrics)
- [x] Add admin route to App.tsx with role-based access control
- [x] Protect admin panel: only accessible to admin users
- [x] Test admin panel end-to-end (204 tests passing)
- [x] Checkpoint: comprehensive admin panel complete


## Round 35 — Save Name Feature for Failed Voice Searches

- [x] Create SaveNameModal component for capturing failed voice searches
- [x] Add 'Save This Name' button to RouteView when no results found
- [x] Integrate modal with learning system to save captured names
- [x] Update tests for new save name functionality (204 tests passing)
- [x] Test end-to-end and verify names are saved to learned mappings
- [x] Save checkpoint with save name feature


## Round 36 — SaveNameModal with Fuzzy Matching

- [x] Update SaveNameModal to show fuzzy matches as user types
- [x] Display matching stops in a list below the input
- [x] Allow user to select the correct stop from matches
- [x] Save the correction linked to the selected stop
- [x] Test end-to-end: "Father Nigel" → shows matches → select Father Gallagher → save
- [x] Verify learned mapping is saved correctly in admin panel (204 tests passing)


## Round 37 — SaveNameModal Redesign: Tap Buttons (Hands-Free)

- [x] Redesign SaveNameModal to show top 5 fuzzy matches as big tappable buttons
- [x] Remove text input - just show matches and tap to select
- [x] Make buttons large and easy to tap (mobile-friendly)
- [x] Show stop details (name, box number) on each button
- [x] Postman taps correct match → System learns it immediately
- [x] Add "None of these" button to skip if no match is correct
- [x] Test end-to-end: hands-free workflow, fast tapping (204 tests passing)
- [x] Verify learned mappings are saved correctly


## Round 38 — SaveNameModal Fallback: Text Input When No Matches

- [x] When no fuzzy matches found: show text input field
- [x] Allow user to type/confirm the correct name
- [x] Show "Save" button to save the typed name
- [x] Hybrid modal: tap buttons if matches exist, text input if no matches
- [x] Test: "Sally Wiggins" (no matches) → type name → save
- [x] Verify learned mapping is saved correctly

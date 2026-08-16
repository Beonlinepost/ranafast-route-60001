# Field Test Plan: Permanent Learning System

## Objective

Verify that the permanent learning system works correctly on the Ranafast (Test) route, including:
1. Corrections are recorded when user manually selects stops
2. Learned mappings persist across app restarts
3. Learned mappings improve search accuracy on repeated names
4. Confidence increases with each confirmation
5. Admin debug view correctly displays all learned mappings

## Test Environment

- **Route**: Ranafast (Test) — Post route for Ranafast Route - Test Copy
- **Browser**: Chrome/Safari/Firefox (test on multiple browsers)
- **Device**: Desktop/Mobile (test on both)
- **Dev Server**: Running locally at https://3000-i8o7gqxicsdc6xpgoyqlw-1ba05c03.us2.manus.computer

## Test Cases

### Test 1: Record First Correction

**Setup**: Open Ranafast (Test) route, voice search enabled

**Steps**:
1. Say "Michael" (or similar name with no exact match)
2. Verify no exact match found (engine shows fuzzy results)
3. Manually tap a stop card (e.g., Michael Gallagher)
4. Verify no error in browser console

**Expected Result**:
- Stop is selected and edit modal opens (normal behavior)
- No console errors
- Learned mapping is recorded in IndexedDB

**Verification**:
- Open DevTools → Application → IndexedDB → maghery-route → learnedMappings
- Verify entry exists with:
  - `normalizedTranscript`: "michael"
  - `stopId`: (the stop you selected)
  - `confirmationCount`: 1
  - `confidence`: 0.60 (calculated as 0.5 + 0.1 * 1)

---

### Test 2: Learned Mapping Used on Repeat Search

**Setup**: After Test 1 is complete

**Steps**:
1. Say "Michael" again (same transcript)
2. Verify the previously selected stop appears immediately (no fuzzy matching)
3. Verify browser console shows learned mapping was used

**Expected Result**:
- Stop appears with matchType: "persistent-learned"
- No fuzzy matching needed
- Search is instant

**Verification**:
- Open DevTools → Console
- Look for log: `[RI] Search result: persistent-learned match`
- Verify stop is the same as Test 1

---

### Test 3: Confidence Increases on Repeated Confirmations

**Setup**: After Test 2 is complete

**Steps**:
1. Repeat Test 2 three more times (say "Michael" and tap the same stop)
2. After each confirmation, check the learned mapping in IndexedDB

**Expected Result**:
- After 2nd confirmation: `confirmationCount`: 2, `confidence`: 0.70
- After 3rd confirmation: `confirmationCount`: 3, `confidence`: 0.80
- After 4th confirmation: `confirmationCount`: 4, `confidence`: 0.80 (capped at 0.85)
- After 5th confirmation: `confirmationCount`: 5, `confidence`: 0.85 (capped)

**Verification**:
- Open DevTools → Application → IndexedDB → learnedMappings
- Verify `confirmationCount` and `confidence` increase correctly

---

### Test 4: Persistence Across App Restart

**Setup**: After Test 3 is complete (at least 3 confirmations recorded)

**Steps**:
1. Note the learned mapping details (transcript, stopId, confirmationCount)
2. Close the browser tab completely
3. Wait 5 seconds
4. Reopen the app and navigate to Ranafast (Test) route
5. Check if learned mapping still exists

**Expected Result**:
- Learned mapping persists in IndexedDB
- Same `confirmationCount` and `confidence` values
- Say "Michael" again and verify it still uses the learned mapping

**Verification**:
- Open DevTools → Application → IndexedDB → learnedMappings
- Verify entry still exists with same values
- Verify search still returns the learned stop

---

### Test 5: Multiple Different Corrections

**Setup**: After Test 4 is complete

**Steps**:
1. Say "Patrick" (different name, no exact match)
2. Manually select a different stop (e.g., Patrick McGowan)
3. Verify new learned mapping is recorded
4. Say "Patrick" again and verify it returns the learned stop
5. Say "Michael" again and verify it STILL returns the Michael stop (not Patrick)

**Expected Result**:
- Two separate learned mappings exist in IndexedDB
- Each transcript maps to its own stop
- No cross-contamination between different corrections

**Verification**:
- Open DevTools → Application → IndexedDB → learnedMappings
- Verify TWO entries exist:
  - `normalizedTranscript`: "michael" → stopId: (Michael's stop)
  - `normalizedTranscript`: "patrick" → stopId: (Patrick's stop)

---

### Test 6: Admin Debug View

**Setup**: After Test 5 is complete (at least 2 learned mappings)

**Steps**:
1. Navigate to `/route/:id/learned-mappings` (replace :id with Ranafast Test route ID)
2. Verify page loads without errors
3. Check statistics card (total mappings, total confirmations, most confirmed)
4. Check mappings table shows all learned mappings
5. Verify confidence bars display correctly

**Expected Result**:
- Page loads successfully
- Statistics show correct counts
- Table displays all learned mappings with correct data
- Confidence bars are proportional to confidence values

**Verification**:
- Statistics Card:
  - Total Mappings: 2 (or more if you added more)
  - Total Confirmations: (sum of all confirmationCounts)
  - Most Confirmed: "michael" or "patrick" (whichever has more confirmations)
  - Avg Confidence: (calculated average)
- Mappings Table:
  - All learned mappings visible
  - Normalized transcript, original, stop name, confirmations, confidence all correct
  - Confidence bars display correctly

---

### Test 7: Delete Learned Mapping

**Setup**: After Test 6 is complete

**Steps**:
1. In admin debug view, click delete icon for one learned mapping
2. Confirm deletion in popup
3. Verify mapping is removed from table
4. Say the deleted transcript again (e.g., "Michael")
5. Verify it no longer uses the learned mapping (falls back to fuzzy matching)

**Expected Result**:
- Mapping is deleted from IndexedDB
- Table updates immediately
- Search falls back to fuzzy matching
- No console errors

**Verification**:
- Table no longer shows deleted mapping
- DevTools → IndexedDB → learnedMappings shows one fewer entry
- Say the transcript again and verify fuzzy matching is used

---

### Test 8: Clear All Learned Mappings

**Setup**: After Test 7 is complete

**Steps**:
1. In admin debug view, click "Clear All Mappings" button
2. Confirm deletion in popup
3. Verify all mappings are removed from table
4. Verify statistics reset to zero
5. Say any transcript and verify it uses fuzzy matching

**Expected Result**:
- All learned mappings deleted
- Table is empty
- Statistics show: Total Mappings: 0, Total Confirmations: 0
- Search falls back to fuzzy matching

**Verification**:
- Table is empty
- DevTools → IndexedDB → learnedMappings is empty
- Statistics all show zero

---

### Test 9: Cross-Browser Persistence

**Setup**: After Test 8 is complete

**Steps**:
1. Record a new learned mapping in Chrome (say "Michael", select stop)
2. Verify it appears in admin debug view
3. Close Chrome
4. Open Safari (or Firefox)
5. Navigate to Ranafast (Test) route
6. Check if learned mapping exists

**Expected Result**:
- Learned mapping is browser-specific (stored in Chrome's IndexedDB)
- Safari will NOT see the learned mapping (different IndexedDB instance)
- This is expected behavior (each browser has its own storage)

**Verification**:
- Chrome: Learned mapping exists
- Safari: Learned mapping does NOT exist (fresh IndexedDB)
- This confirms storage is working correctly per browser

---

### Test 10: Learned Mapping Priority Over Fuzzy

**Setup**: After Test 9 is complete

**Steps**:
1. Record a learned mapping for "Michael" → Michael Gallagher
2. Say "Michael" and verify it returns Michael Gallagher (learned mapping)
3. Say "Michael" with slightly different pronunciation (e.g., "Micheal")
4. Verify it still returns Michael Gallagher (learned mapping takes priority)
5. Say a completely different name (e.g., "Patrick")
6. Verify it uses fuzzy matching (not the learned Michael mapping)

**Expected Result**:
- Learned mappings take priority over fuzzy matching
- Slight variations in pronunciation still use learned mapping
- Different names don't interfere with learned mappings

**Verification**:
- All searches return expected stops
- No console errors
- Learned mapping is used (matchType: "persistent-learned")

---

## Success Criteria

✅ **All tests pass if**:
1. Corrections are recorded when user manually selects stops
2. Learned mappings persist across app restarts
3. Learned mappings are used on repeat searches (matchType: "persistent-learned")
4. Confidence increases with each confirmation (0.5 + 0.1*count, capped at 0.85)
5. Admin debug view displays all learned mappings correctly
6. Delete and clear all functions work correctly
7. Learned mappings take priority over fuzzy matching
8. No console errors during any test

---

## Troubleshooting

### Learned mapping not being recorded

1. Check browser console for errors
2. Verify IndexedDB is enabled in browser settings
3. Check DevTools → Application → IndexedDB → maghery-route → learnedMappings
4. If empty, check if correction detection is working:
   - Add console.log to handleCardTap in RouteView.tsx
   - Verify correction.shouldRecord is true

### Learned mapping not being used

1. Check if normalizedTranscript matches exactly
2. Verify route ID matches
3. Check browser console for errors during search
4. Verify search method is async and awaiting lookupLearnedMapping

### Admin debug view not loading

1. Check browser console for errors
2. Verify route ID in URL is correct
3. Check if riEngine is initialized
4. Verify getAllLearnedMappingsForRoute is working

### Persistence not working across restart

1. Check if IndexedDB transaction completed successfully
2. Verify browser is not in private/incognito mode (IndexedDB may be disabled)
3. Check available storage quota
4. Try clearing browser cache and reloading

---

## Notes

- Tests should be performed on multiple browsers (Chrome, Safari, Firefox)
- Tests should be performed on multiple devices (desktop, mobile)
- Each test should be independent (can be run in any order)
- Document any unexpected behavior or errors
- Take screenshots of admin debug view for documentation

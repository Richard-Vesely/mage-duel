# Testing Guide: Hybrid Room Browser

## Prerequisites

1. **Apply Firebase Rules**: Follow `FIREBASE_RULES_SETUP.md` to apply the new database rules
2. **Build & Deploy**: Run `npm run build` and deploy to Firebase Hosting (or test locally with `npm run dev`)
3. **Open Multiple Browser Windows**: You'll need 2-3 browser windows/tabs for testing

## Test Suite

### Test 1: Public Room Listing (Basic)

**Objective**: Verify that public rooms appear in the lobby list in real-time

**Steps**:
1. Open **Window A** (incognito/private browsing)
2. Navigate to your app URL
3. Wait for "Online" status (Firebase auth completes)
4. Verify "No active rooms yet." is displayed in the room list
5. Open **Window B** (regular browsing)
6. In Window B:
   - Enter display name: "Alice"
   - Leave "Create as private room" **unchecked** (public)
   - Click "Create New Room"
   - Note the generated room code (e.g., "arcana-123")
7. Switch back to **Window A**
8. **Expected**: Within 1-2 seconds, the room list should show:
   - Room code: "arcana-123"
   - Player count: "1 mage"
   - Status: "lobby"
   - Button: "Join"

**Pass Criteria**: ✅ Room appears automatically without clicking "Refresh"

---

### Test 2: Join Public Room

**Objective**: Verify that clicking a room card allows joining

**Steps**:
1. Continue from Test 1 (Window A showing room list, Window B in room)
2. In **Window A**:
   - Enter display name: "Bob"
   - Click the room card for "arcana-123"
3. **Expected**:
   - Window A enters the game view
   - Window A shows "Room: arcana-123"
   - Window A shows 2 players
   - Window B updates to show 2 players
4. Switch back to Window A's lobby (you may need to refresh or use back button)
5. **Expected**: Room card now shows:
   - "2 mages · lobby"
   - Button: "Spectate" (not "Join")

**Pass Criteria**: ✅ Second player joins successfully, room updates to "Spectate"

---

### Test 3: Private Room (Join by Code Only)

**Objective**: Verify that private rooms do NOT appear in the public list

**Steps**:
1. Open **Window C** (new incognito)
2. Navigate to your app
3. Wait for "Online" status
4. Enter display name: "Charlie"
5. Check the box "Create as private room"
6. Click "Create New Room"
7. Note the generated room code (e.g., "arcana-456")
8. Switch to **Window A** (should still be at lobby)
9. **Expected**: The room list should **NOT** show "arcana-456"
10. In Window A:
    - Manually type "arcana-456" in the "Room Code" field
    - Click "Join Room"
11. **Expected**: Window A successfully joins the private room

**Pass Criteria**: ✅ Private room does NOT appear in list but CAN be joined by code

---

### Test 4: Room Disappears When Empty

**Objective**: Verify that rooms are removed from the list when all players leave

**Steps**:
1. Continue from Test 2 (2 players in "arcana-123")
2. In **Window B** (Alice's session):
   - Click "Leave" button
3. In **Window A** (Bob's session):
   - Click "Leave" button
4. View the lobby in either window
5. **Expected**: "arcana-123" should disappear from the room list
6. Message should show "No active rooms yet." (or only other active rooms)

**Pass Criteria**: ✅ Empty rooms are automatically removed from the list

---

### Test 5: Game Status Updates

**Objective**: Verify that room status changes (lobby → active → finished) update the list

**Steps**:
1. Create a new public room with 2 players (Windows A & B)
2. In **Window A** (host):
   - Click "Start Duel"
3. Open **Window C** at the lobby
4. **Expected**: Room card shows:
   - "2 mages · **active**"
   - Button: "Spectate"
5. Let the game complete (one player wins or draw)
6. **Expected**: Room disappears from list (status: "finished" rooms are filtered out)

**Pass Criteria**: ✅ Room status updates in real-time, finished rooms don't show

---

### Test 6: Firebase Rules Enforcement

**Objective**: Verify that security rules prevent unauthorized access

**Steps**:
1. Open Firebase Console → Realtime Database → Data tab
2. Navigate to `/publicRooms`
3. Verify the structure matches:
   ```json
   {
     "arcana-123": {
       "roomId": "arcana-123",
       "status": "lobby",
       "playerCount": 2,
       "spectatorCount": 0,
       "visibility": "public",
       "updatedAt": 1234567890,
       "hostName": "Alice"
     }
   }
   ```
4. Navigate to `/rooms/arcana-123`
5. Verify fields include: `visibility`, `hostUid`, `updatedAt`, `players`, etc.
6. Try to manually edit data (should fail unless you're using Firebase Console with admin access)

**Pass Criteria**: ✅ Data structure matches plan

---

### Test 7: Spectator Mode

**Objective**: Verify that spectators can join full rooms

**Steps**:
1. Create public room with 2 players (Windows A & B)
2. In **Window C**:
   - View lobby
   - Click the room card (now showing "Spectate")
3. **Expected**:
   - Window C enters the game as spectator
   - Can see both players' HP, mana, regen
   - Cannot interact with controls (sliders disabled)
4. Check Firebase `/rooms/arcana-123/spectators`
5. **Expected**: Spectator UID appears in the database

**Pass Criteria**: ✅ Spectators can join and observe without affecting gameplay

---

## Common Issues & Fixes

### Issue: "No active rooms yet" persists even after creating rooms

**Likely Cause**: Firebase rules not applied or incorrect

**Fix**:
1. Go to Firebase Console → Realtime Database → Rules
2. Verify rules match `database.rules.json`
3. Check browser console for errors (F12 → Console tab)
4. Look for "permission denied" errors

### Issue: Room list doesn't update in real-time

**Likely Cause**: Realtime subscription not working

**Fix**:
1. Check browser console for errors
2. Verify Firebase SDK imports in `firebase.js`
3. Ensure `subscribePublicRooms()` is called in `bindConfigForm()`

### Issue: Private rooms appear in list

**Likely Cause**: Visibility not set correctly

**Fix**:
1. Check Firebase Database → `/rooms/$roomId/visibility`
2. Should be `"private"` for private rooms
3. Verify toggle checkbox value is read in `main.js`

### Issue: Rules prevent legitimate actions

**Likely Cause**: Rules too restrictive or hostUid not set

**Fix**:
1. Check `/rooms/$roomId/hostUid` exists
2. Verify it matches first player's UID
3. Use Firebase Console Rules Simulator to debug

---

## Success Metrics

All tests should pass for the feature to be production-ready:

- ✅ Public rooms appear in list automatically
- ✅ Private rooms are join-by-code only
- ✅ Room list updates in real-time
- ✅ Empty rooms disappear from list
- ✅ Room status changes reflect immediately
- ✅ Firebase rules prevent unauthorized access
- ✅ Spectators can join full games

## Next Steps

After testing is complete:
1. Monitor Firebase Console for any rule violations
2. Consider adding room age cleanup (remove rooms older than 24h)
3. Add pagination if room count exceeds 50
4. Consider adding search/filter functionality

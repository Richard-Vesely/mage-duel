# Bug Fix: Public Room Creation Not Working

## Problem Summary
Creating a new room when "Create as private room" was **unchecked** (i.e., creating a public room) was failing. The room would not appear in the lobby list and the creator might see permission errors.

## Root Cause
The `ensureRoom()` function was trying to **read the room and perform transactions** before the user had written their participant membership data. Under the strict Firebase security rules, you can only read a room if:
1. You are a participant (player/spectator), OR
2. The room is marked as public

When creating a brand new room:
- No participants exist yet
- No `visibility` field exists yet
- Therefore, neither condition is met → **PERMISSION_DENIED**

The problematic sequence was:
1. `get(roomRef)` - tries to read room → DENIED
2. `runTransaction(hostUidRef)` - tries to read/write host → DENIED
3. Room creation fails

## Solution Implemented

### 1. Refactored `ensureRoom()` Flow
**File**: `src/services/firebase.js`

Changed the order of operations:
1. **Write participant membership FIRST** (`players/$uid` or `spectators/$uid`)
   - This gives us read permission under the rules
2. **Set creation-only fields** (`hostUid`, `visibility`, `createdAt`)
   - Use simple `set()` calls wrapped in try/catch
   - If the field already exists, the write fails (as intended by rules)
   - No transaction needed
3. **Now read the room** (we have permission as a participant)
4. **Update status and sync public index**

### 2. Fixed `leaveRoom()` Ordering
**File**: `src/services/firebase.js`

Changed to read room data **before** removing participant node:
1. Read room (while still a participant)
2. Remove participant node
3. Try to sync public index (best effort, may fail)

This prevents permission errors when trying to read after leaving.

### 3. Fixed `updateRoom()` RoomId Detection
**Files**: `src/services/firebase.js`, `src/main.js`

- Changed signature from `updateRoom(roomRef, updates)` to `updateRoom(roomId, roomRef, updates)`
- Updated call site in `main.js` to pass `state.roomId` explicitly
- No longer relies on internal SDK fields like `roomRef._path`

### 4. Fixed `database.rules.json` Format
**File**: `database.rules.json`

- Converted all multiline strings to single-line JSON strings
- File is now valid JSON that can be parsed and uploaded to Firebase Console

## Files Changed

1. **`src/services/firebase.js`**
   - Refactored `ensureRoom()` to write membership first
   - Fixed `leaveRoom()` to read before removing participant
   - Updated `updateRoom()` signature to accept explicit roomId

2. **`src/main.js`**
   - Updated `updateRoom()` call site to pass roomId

3. **`database.rules.json`**
   - Fixed JSON formatting (no multiline strings)

## How to Apply This Fix

### Step 1: Update Firebase Rules
1. Open [Firebase Console](https://console.firebase.google.com/)
2. Select project: **mage-duel-demo**
3. Navigate to **Realtime Database** → **Rules**
4. Copy the contents of `database.rules.json` from this repository
5. Paste into the Rules editor
6. Click **Publish**

### Step 2: Test the Fix

#### Test 1: Create Public Room
1. Open your app in the browser
2. Wait for "Online" status (Firebase auth completes)
3. Leave "Create as private room" **unchecked**
4. Click "Create New Room"
5. **Expected**: Room is created, you enter the game view

#### Test 2: Verify Public Room Appears in List
1. Open a second browser tab (or incognito window)
2. Navigate to your app
3. Wait for "Online" status
4. **Expected**: The room from Test 1 appears in "Open Rooms" list

#### Test 3: Join Public Room
1. In the second tab, click the room card
2. **Expected**: You join the room successfully
3. Both tabs show 2 players

#### Test 4: Create Private Room
1. Open a third tab
2. Check "Create as private room"
3. Click "Create New Room"
4. **Expected**: Room is created, you enter the game view
5. In another tab, verify the room does **NOT** appear in "Open Rooms"
6. You can still join by typing the room code manually

## Technical Details

### Why The New Approach Works

**Before (broken)**:
```javascript
// Try to read room → PERMISSION_DENIED (no participants yet)
const roomSnapshot = await get(roomRef)

// Try transaction → PERMISSION_DENIED (need read access)
await runTransaction(hostUidRef, ...)

// Never gets here ❌
await set(state.playerRef, {...})
```

**After (working)**:
```javascript
// Write membership first
await set(state.playerRef, {...}) // ✅ Always allowed by rules

// Set creation fields (best effort, fails if exists)
try { await set(hostUidRef, uid) } catch (e) {}
try { await set(visibilityRef, visibility) } catch (e) {}

// Now we can read (we're a participant)
const roomSnapshot = await get(roomRef) // ✅ Allowed

// Sync public index
await syncPublicRoomIndex(code) // ✅ Works
```

### Security Implications

The fix **maintains** all security guarantees:
- Users can only write their own participant nodes
- `hostUid`, `visibility`, `createdAt` can only be set once (rules deny overwrite)
- Only host can modify game state (`status`, `tick`, `log`, etc.)
- Private rooms remain hidden from public index
- Unauthenticated users have no access

## Rollback Plan

If you need to rollback:

1. **Revert code changes**: `git revert <commit-hash>`
2. **Revert Firebase rules**: In Firebase Console, go to Rules → History → Restore previous version
3. Note: This will restore the bug where public room creation doesn't work

## Additional Notes

- The `try/catch` blocks around `hostUid`/`visibility`/`createdAt` writes are intentional
- These writes will fail for subsequent joiners (room already exists), which is expected
- The error is caught and ignored, allowing the join to succeed
- Console warnings in `leaveRoom()` are also intentional (best-effort cleanup)

## Testing Checklist

- [x] Code changes implemented
- [x] No linter errors
- [x] Firebase rules are valid JSON
- [ ] Rules applied in Firebase Console (user action required)
- [ ] Manual test: Create public room works
- [ ] Manual test: Room appears in lobby list
- [ ] Manual test: Can join public room
- [ ] Manual test: Create private room works
- [ ] Manual test: Private room doesn't appear in list
- [ ] Manual test: Can join private room by code

# Firebase Realtime Database Rules Setup

## How to Apply the Rules

1. Open [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **mage-duel-demo**
3. Navigate to **Realtime Database** → **Rules** tab
4. Copy the contents of `database.rules.json` from this repository
5. Paste into the Rules editor
6. Click **Publish**

## What These Rules Do

### Public Rooms Index (`/publicRooms`)
- **Read**: Any authenticated user can browse the public rooms list
- **Write**: Only room participants or the host can update the public index
- **Index**: Optimized for sorting by `updatedAt`

### Room Data (`/rooms/$roomId`)
- **Read**: Only if:
  - The room is marked as `public`, OR
  - You are a player in the room, OR
  - You are a spectator in the room
- **Write**: Restricted by field:
  - `players/$uid` and `spectators/$uid`: Only the user themselves can write their own data
  - `status`, `tick`, `log`, `winner`: Only the room host can modify
  - `hostUid`, `visibility`, `createdAt`: Set once on room creation, cannot be changed
  - `updatedAt`: Any participant can update

## Security Benefits

1. **No unauthenticated access**: All reads/writes require Firebase anonymous authentication
2. **Participant isolation**: Players cannot modify other players' data
3. **Host authority**: Only the host (first joiner) can control game flow (start, tick, resolve)
4. **Public/private rooms**: Private rooms don't appear in listings but can be joined by code
5. **Write isolation**: Users can only write to their own player/spectator nodes

## Testing the Rules

Use the Firebase Console Rules Simulator to test scenarios:

### Test 1: Unauthenticated read (should fail)
```
Location: /publicRooms
Method: read
Auth: null
Expected: DENIED
```

### Test 2: Authenticated user reads public rooms (should pass)
```
Location: /publicRooms
Method: read
Auth: { uid: "test-user-123" }
Expected: ALLOWED
```

### Test 3: Player writes their own data (should pass)
```
Location: /rooms/arcana-1/players/test-user-123
Method: write
Auth: { uid: "test-user-123" }
Expected: ALLOWED
```

### Test 4: Player tries to write another player's data (should fail)
```
Location: /rooms/arcana-1/players/other-user-456
Method: write
Auth: { uid: "test-user-123" }
Expected: DENIED
```

### Test 5: Non-host tries to start game (should fail)
```
Location: /rooms/arcana-1/status
Method: write
Auth: { uid: "test-user-123" }
Data: { hostUid: "other-user-456" }
Expected: DENIED
```

import { initializeApp, getApps, getApp } from 'firebase/app'
import {
  getDatabase,
  ref,
  onValue,
  update,
  set,
  get,
  push,
  serverTimestamp,
  runTransaction,
  onDisconnect,
  query,
  orderByChild,
  limitToLast,
  remove,
} from 'firebase/database'
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth'
import { computeOutcome } from '../game/combat.js'
import {
  PLAN_MS,
  START_HP,
  START_MANA,
} from '../config/constants.js'

let db = null
let auth = null
let roomsRef = null

export function getDb() {
  return db
}

export function getAuthRef() {
  return auth
}

export function getRoomsRef() {
  return roomsRef
}

export function getRoomsSnapshot() {
  if (!roomsRef) return Promise.resolve(null)
  return get(roomsRef)
}

export function init(config, state, callbacks = {}) {
  const app = getApps().length === 0 ? initializeApp(config) : getApp()
  db = getDatabase(app)
  auth = getAuth(app)
  signInAnonymously(auth)
  onAuthStateChanged(auth, (currentUser) => {
    if (!currentUser) return
    state.user = currentUser
    if (callbacks.onAuth) callbacks.onAuth()
  })
}

export async function ensureRoom(roomId, playerName, mode, state, visibility = 'public', options = {}) {
  const { onJoined, onError } = options
  const code = roomId.toLowerCase()
  const roomRef = ref(db, `rooms/${code}`)
  state.roomId = code
  state.roomRef = roomRef
  state.isSpectator = mode === 'spectator'
  const uid = state.user.uid

  // STEP 1: Write participant membership FIRST (before any reads)
  // This gives us read access under the strict rules
  if (state.isSpectator) {
    state.spectatorRef = ref(db, `rooms/${code}/spectators/${uid}`)
    await set(state.spectatorRef, {
      uid,
      name: playerName,
      joinTime: Date.now(),
      lastSeen: Date.now(),
    })
    onDisconnect(state.spectatorRef).remove()
    state.playerRef = null
  } else {
    state.playerRef = ref(db, `rooms/${code}/players/${uid}`)
    await set(state.playerRef, {
      uid,
      name: playerName,
      hp: START_HP,
      mana: START_MANA,
      stored: 0,
      regenBonus: 0,
      allocation: { attack: 0, shield: 0, channel: 0, regen: 0 },
      joinTime: Date.now(),
      lastSeen: Date.now(),
    })
    onDisconnect(state.playerRef).remove()
    state.spectatorRef = null
  }

  state.presenceInterval = window.setInterval(() => {
    if (state.playerRef) update(state.playerRef, { lastSeen: Date.now() })
    if (state.spectatorRef) update(state.spectatorRef, { lastSeen: Date.now() })
  }, 4000)
  window.location.hash = code

  if (onJoined) onJoined(state)

  try {
    // STEP 2: Try to set creation-only fields (hostUid, visibility, createdAt)
    // These will fail silently if the room already exists (rules deny overwrite)
    try {
      await set(ref(db, `rooms/${code}/hostUid`), uid)
    } catch (e) {
      // hostUid already set by another user, that's fine
    }

    try {
      await set(ref(db, `rooms/${code}/visibility`), visibility)
    } catch (e) {
      // visibility already set, that's fine
    }

    try {
      await set(ref(db, `rooms/${code}/createdAt`), serverTimestamp())
    } catch (e) {
      // createdAt already set, that's fine
    }

    // STEP 3: Now we're a participant, we can read the room.
    // Only the host can write host-only fields (like `status`), but participants
    // can always write `updatedAt`.
    const roomSnapshot = await get(roomRef)
    const existingRoom = roomSnapshot.val() || {}

    const hostUid = existingRoom.hostUid || null
    const isHost = hostUid ? hostUid === uid : true

    const roomUpdates = { updatedAt: Date.now() }
    if (!existingRoom.status && isHost) {
      roomUpdates.status = 'lobby'
    }
    await update(roomRef, roomUpdates)

    // STEP 4: Update public index if room is public (best effort; never fail join)
    const roomVisibility = existingRoom.visibility || visibility
    if (roomVisibility === 'public') {
      try {
        await syncPublicRoomIndex(code)
      } catch (e) {
        console.warn('Could not sync public room index (non-fatal):', e)
      }
    }
  } catch (err) {
    if (onError) onError(err)
    throw err
  }
}

export function subscribeRoom(roomId, callback) {
  if (!db) return
  const roomRef = ref(db, `rooms/${roomId}`)
  return onValue(roomRef, (snapshot) => callback(snapshot.val()))
}

export function subscribeRooms(callback) {
  if (!db) return
  roomsRef = ref(db, 'rooms')
  onValue(roomsRef, (snapshot) => callback(snapshot.val() || {}))
}

export function subscribePublicRooms(callback) {
  if (!db) return
  const publicRoomsRef = ref(db, 'publicRooms')
  const publicRoomsQuery = query(publicRoomsRef, orderByChild('updatedAt'), limitToLast(50))
  onValue(publicRoomsQuery, (snapshot) => callback(snapshot.val() || {}))
}

let cleanupEmptyRoomsTimeout = null
const CLEANUP_DEBOUNCE_MS = 2500

export function cleanupEmptyPublicRooms(publicRooms) {
  if (!db || !publicRooms || typeof publicRooms !== 'object') return
  const roomIds = Object.keys(publicRooms)
  if (roomIds.length === 0) return

  if (cleanupEmptyRoomsTimeout) clearTimeout(cleanupEmptyRoomsTimeout)
  cleanupEmptyRoomsTimeout = setTimeout(async () => {
    cleanupEmptyRoomsTimeout = null
    for (const roomId of roomIds) {
      try {
        const roomRef = ref(db, `rooms/${roomId}`)
        const snapshot = await get(roomRef)
        const room = snapshot.val()
        if (!room) continue
        const players = room.players || {}
        const spectators = room.spectators || {}
        if (Object.keys(players).length === 0 && Object.keys(spectators).length === 0) {
          const publicRoomRef = ref(db, `publicRooms/${roomId}`)
          await remove(publicRoomRef)
        }
      } catch (e) {
        // best effort; skip room on read/write errors (e.g. private room)
      }
      await new Promise((r) => setTimeout(r, 80))
    }
  }, CLEANUP_DEBOUNCE_MS)
}

export async function syncPublicRoomIndex(roomId) {
  const roomRef = ref(db, `rooms/${roomId}`)
  const snapshot = await get(roomRef)
  const room = snapshot.val()
  
  if (!room) return
  
  const players = room.players || {}
  const spectators = room.spectators || {}
  const playerCount = Object.keys(players).length
  const spectatorCount = Object.keys(spectators).length
  
  // If room is empty, remove from public index
  if (playerCount === 0 && spectatorCount === 0) {
    const publicRoomRef = ref(db, `publicRooms/${roomId}`)
    await remove(publicRoomRef)
    return
  }
  
  // Get host name if available
  const hostUid = room.hostUid
  const hostName = hostUid && players[hostUid] ? players[hostUid].name : null
  
  // Update public index
  const publicRoomRef = ref(db, `publicRooms/${roomId}`)
  await set(publicRoomRef, {
    roomId,
    status: room.status || 'lobby',
    updatedAt: room.updatedAt || Date.now(),
    playerCount,
    spectatorCount,
    visibility: 'public',
    ...(hostName && { hostName })
  })
}

export async function updateRoom(roomId, roomRef, updates) {
  await update(roomRef, updates)
  
  // If status changed, update the public index
  if (updates.status && roomId) {
    await update(roomRef, { updatedAt: Date.now() })
    const snapshot = await get(roomRef)
    const room = snapshot.val()
    if (room && room.visibility === 'public') {
      await syncPublicRoomIndex(roomId)
    }
  }
}

export function updatePlayer(playerRef, data) {
  return update(playerRef, data)
}

export async function resolveRound(roomRef, roomId) {
  const snapshot = await get(roomRef)
  const room = snapshot.val()
  if (!room || room.status !== 'active') return
  const tick = room.tick
  if (!tick || tick.phase !== 'resolving') return

  const players = room.players || {}
  const playerIds = Object.keys(players)
  if (playerIds.length < 2) return
  const sortedIds = playerIds.sort(
    (a, b) => (players[a].joinTime || 0) - (players[b].joinTime || 0)
  )
  const [idA, idB] = sortedIds
  const playerA = players[idA]
  const playerB = players[idB]

  const outcome = computeOutcome(idA, playerA, idB, playerB, tick.round)

  const updates = {}
  updates[`players/${idA}`] = outcome.nextA
  updates[`players/${idB}`] = outcome.nextB
  updates['lastRound'] = outcome.lastRound
  updates['tick'] = {
    round: tick.round + 1,
    phase: 'plan',
    endsAt: Date.now() + PLAN_MS,
  }

  if (outcome.winnerId) {
    updates['status'] = 'finished'
    updates['winner'] = outcome.winnerId
  }

  const logRef = push(ref(db, `rooms/${roomId}/log`))
  updates[`log/${logRef.key}`] = outcome.lastRound

  await update(roomRef, updates)
}

export async function maybeAdvanceTick(state) {
  if (!state.isHost || !state.roomState?.tick || state.roomState.status !== 'active')
    return
  const tick = state.roomState.tick
  if (tick.phase !== 'plan') return
  if (Date.now() < tick.endsAt) return

  const tickRef = ref(db, `rooms/${state.roomId}/tick`)
  const result = await runTransaction(tickRef, (current) => {
    if (!current || current.phase !== 'plan') return current
    if (Date.now() < current.endsAt) return current
    return { ...current, phase: 'resolving', resolvedAt: Date.now() }
  })

  if (result.committed) {
    await resolveRound(state.roomRef, state.roomId)
  }
}

export async function leaveRoom(state) {
  const roomId = state.roomId
  
  // Read room data BEFORE removing ourselves (while we still have read permission)
  let shouldSyncPublicIndex = false
  if (roomId) {
    try {
      const roomRef = ref(db, `rooms/${roomId}`)
      const snapshot = await get(roomRef)
      const room = snapshot.val()
      shouldSyncPublicIndex = room && room.visibility === 'public'
    } catch (e) {
      // If read fails, we'll skip sync (best effort)
      console.warn('Could not read room before leaving:', e)
    }
  }
  
  // Now remove ourselves
  if (state.playerRef) await set(state.playerRef, null)
  if (state.spectatorRef) await set(state.spectatorRef, null)
  if (state.presenceInterval) window.clearInterval(state.presenceInterval)
  
  // Update public index after leaving (best effort - may fail if we lost read permission)
  if (roomId && shouldSyncPublicIndex) {
    try {
      const roomRef = ref(db, `rooms/${roomId}`)
      await update(roomRef, { updatedAt: Date.now() })
      await syncPublicRoomIndex(roomId)
    } catch (e) {
      // Index sync failed (likely permission denied after removing ourselves)
      // This is expected and acceptable - another participant will sync eventually
      console.warn('Could not sync public index after leaving:', e)
    }
  }
  
  state.roomId = null
  state.roomRef = null
  state.playerRef = null
  state.spectatorRef = null
  state.roomState = null
  state.isSpectator = false
  state.presenceInterval = null
}

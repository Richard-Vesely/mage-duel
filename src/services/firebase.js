import { initializeApp } from 'firebase/app'
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
} from 'firebase/database'
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth'
import { computeOutcome } from '../game/combat.js'
import {
  PLAN_MS,
  START_HP,
  START_MANA,
  MAX_MANA,
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
  const app = initializeApp(config)
  db = getDatabase(app)
  auth = getAuth(app)
  signInAnonymously(auth)
  onAuthStateChanged(auth, (currentUser) => {
    if (!currentUser) return
    state.user = currentUser
    if (callbacks.onAuth) callbacks.onAuth()
  })
}

export async function ensureRoom(roomId, playerName, mode, state) {
  const code = roomId.toLowerCase()
  const roomRef = ref(db, `rooms/${code}`)
  state.roomId = code
  state.roomRef = roomRef
  state.isSpectator = mode === 'spectator'
  const uid = state.user.uid

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
      maxMana: MAX_MANA,
      stored: 0,
      regenBonus: 0,
      allocation: { attack: 0, shield: 0, channel: 0, regen: 0 },
      joinTime: Date.now(),
      lastSeen: Date.now(),
    })
    onDisconnect(state.playerRef).remove()
    state.spectatorRef = null
  }

  await update(roomRef, {
    createdAt: serverTimestamp(),
    status: 'lobby',
  })

  state.presenceInterval = window.setInterval(() => {
    if (state.playerRef) update(state.playerRef, { lastSeen: Date.now() })
    if (state.spectatorRef) update(state.spectatorRef, { lastSeen: Date.now() })
  }, 4000)

  window.location.hash = code
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

export function updateRoom(roomRef, updates) {
  return update(roomRef, updates)
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
  if (state.playerRef) await set(state.playerRef, null)
  if (state.spectatorRef) await set(state.spectatorRef, null)
  if (state.presenceInterval) window.clearInterval(state.presenceInterval)
  state.roomId = null
  state.roomRef = null
  state.playerRef = null
  state.spectatorRef = null
  state.roomState = null
  state.isSpectator = false
  state.presenceInterval = null
}

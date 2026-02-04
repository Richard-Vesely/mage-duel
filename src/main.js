import './style.css'
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

const PLAN_MS = 12000
const BASE_REGEN = 5
const START_HP = 30
const START_MANA = 10
const MAX_MANA = 20

const $ = (selector) => document.querySelector(selector)

const root = document.querySelector('#app')
root.innerHTML = `
  <div class="app">
    <header class="title">
      <div>
        <p class="eyebrow">Neon Arcana</p>
        <h1>Mage Duel: Mana Weaving</h1>
        <p class="sub">Static combat. Real-time decisions. Invest mana to outplay your rival.</p>
      </div>
      <div class="status" id="status">Offline</div>
    </header>

    <section class="panel config" id="configPanel">
      <h2>Firebase Setup</h2>
      <p>Paste your Firebase client config and enable Anonymous Auth + Realtime Database.</p>
      <div class="grid">
        <label>API Key<input id="cfg_apiKey" /></label>
        <label>Auth Domain<input id="cfg_authDomain" /></label>
        <label>Database URL<input id="cfg_databaseURL" /></label>
        <label>Project ID<input id="cfg_projectId" /></label>
        <label>Storage Bucket<input id="cfg_storageBucket" /></label>
        <label>Messaging Sender ID<input id="cfg_messagingSenderId" /></label>
        <label>App ID<input id="cfg_appId" /></label>
      </div>
      <button id="saveConfig">Save Config</button>
    </section>

    <section class="panel lobby" id="lobbyPanel">
      <h2>Join A Duel</h2>
      <div class="grid two">
        <label>Display Name<input id="playerName" placeholder="Nova" /></label>
        <label>Room Code<input id="roomCode" placeholder="arcana-001" /></label>
      </div>
      <div class="actions">
        <button id="joinRoom">Join Room</button>
        <button class="ghost" id="createRoom">Create New Room</button>
      </div>
      <div class="roomMeta" id="roomMeta"></div>
      <div class="roomList">
        <div class="roomListHeader">
          <h3>Open Rooms</h3>
          <button class="ghost" id="refreshRooms">Refresh</button>
        </div>
        <p class="muted roomListHint">Click a room to join or spectate.</p>
        <div id="roomsContainer" class="roomsContainer"></div>
      </div>
    </section>
    <section class="panel rules" id="rulesPanel">
      <h2>Pravidla</h2>
      <div class="rulesGrid">
        <div>
          <h3>Průběh kola</h3>
          <p>Každé kolo rozděluje manu mezi akce. Oba hráči plánují současně, pak se kolo vyhodnotí.</p>
          <p>Poškození = max(0, útok − štít soupeře).</p>
        </div>
        <div>
          <h3>Akce</h3>
          <ul>
            <li><strong>Útok (Beam):</strong> Přímé poškození soupeře.</li>
            <li><strong>Štít (Aegis):</strong> Blokuje protivníkův útok.</li>
            <li><strong>Kanálování (Surge):</strong> Ulož manu na další kolo.</li>
            <li><strong>Regen:</strong> 7 many = +1 regen, 10 many = +2 regen.</li>
          </ul>
        </div>
        <div>
          <h3>Regenerace many</h3>
          <p>Každé kolo získá základní regen + uloženou manu + bonus z investice do Regen.</p>
        </div>
        <div>
          <h3>Výhra</h3>
          <p>Hráč s HP na nule prohrává. Pokud oba spadnou na nulu ve stejném kole, je to remíza.</p>
        </div>
      </div>
    </section>


    <section class="panel game hidden" id="gamePanel">
      <div class="gameHeader">
        <div>
          <h2 id="roomTitle">Room</h2>
          <p id="roundInfo">Waiting for duel to start...</p>
        </div>
        <div class="actions">
          <button id="startDuel" class="hidden">Start Duel</button>
          <button id="leaveRoom" class="ghost">Leave</button>
        </div>
      </div>

      <div class="arena">
        <div class="mage" id="selfCard">
          <h3>You</h3>
          <div class="stat"><span>HP</span><span id="selfHp">--</span></div>
          <div class="stat"><span>Mana</span><span id="selfMana">--</span></div>
          <div class="stat"><span>Stored</span><span id="selfStored">--</span></div>
          <div class="stat"><span>Status</span><span id="selfStatus">--</span></div>
        </div>

        <div class="focus">
          <div class="timer" id="timer">--</div>
          <div class="sigils">
            <div class="sigil">Beam</div>
            <div class="sigil">Aegis</div>
            <div class="sigil">Surge</div>
          </div>
          <div class="allocation" id="allocation">
            <div class="allocationRow">
              <label>Attack</label>
              <input type="range" id="attackRange" min="0" max="20" step="1" />
              <span id="attackValue">0</span>
            </div>
            <div class="allocationRow">
              <label>Shield</label>
              <input type="range" id="shieldRange" min="0" max="20" step="1" />
              <span id="shieldValue">0</span>
            </div>
          <div class="allocationRow">
            <label>Channel</label>
            <input type="range" id="channelRange" min="0" max="20" step="1" />
            <span id="channelValue">0</span>
          </div>
          <div class="allocationRow">
            <label>Regen</label>
            <input type="range" id="regenRange" min="0" max="20" step="1" />
            <span id="regenValue">0</span>
          </div>
            <div class="allocationFooter">
              <div>Mana Left: <span id="manaLeft">0</span></div>
              <div class="preset">
                <button id="presetBalanced">Balanced</button>
                <button id="presetBurst" class="ghost">Burst</button>
                <button id="presetWard" class="ghost">Ward</button>
                <button id="presetBuild" class="ghost">Build</button>
              </div>
            </div>
          </div>
        </div>

        <div class="mage" id="enemyCard">
          <h3>Opponent</h3>
          <div class="stat"><span>HP</span><span id="enemyHp">--</span></div>
          <div class="stat"><span>Mana</span><span id="enemyMana">--</span></div>
          <div class="stat"><span>Stored</span><span id="enemyStored">--</span></div>
          <div class="stat"><span>Status</span><span id="enemyStatus">--</span></div>
        </div>
      </div>

      <div class="log" id="logPanel"></div>
    </section>
  </div>
`

const statusEl = $('#status')
const configPanel = $('#configPanel')
const lobbyPanel = $('#lobbyPanel')
const gamePanel = $('#gamePanel')
const roomMeta = $('#roomMeta')
const startDuelBtn = $('#startDuel')

const attackRange = $('#attackRange')
const shieldRange = $('#shieldRange')
const channelRange = $('#channelRange')
const regenRange = $('#regenRange')
const attackValue = $('#attackValue')
const shieldValue = $('#shieldValue')
const channelValue = $('#channelValue')
const regenValue = $('#regenValue')
const manaLeft = $('#manaLeft')

let firebaseApp = null
let db = null
let auth = null
let user = null
let roomId = null
let roomRef = null
let playerRef = null
let spectatorRef = null
let roomState = null
let isHost = false
let presenceInterval = null
let roomsRef = null
let isSpectator = false

const firebaseConfig = {
  apiKey: "AIzaSyCrOkk10O__p1M6VdZbTBK99KRlTPaPE28",
  authDomain: "mage-duel-demo.firebaseapp.com",
  databaseURL: "https://mage-duel-demo-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "mage-duel-demo",
  storageBucket: "mage-duel-demo.firebasestorage.app",
  messagingSenderId: "155740558323",
  appId: "1:155740558323:web:f42998107776f80177b886"
}

const setStatus = (text, tone = 'info') => {
  statusEl.textContent = text
  statusEl.dataset.tone = tone
}

const showConfig = (show) => {
  configPanel.classList.toggle('hidden', !show)
  lobbyPanel.classList.toggle('hidden', show)
}

const showGame = (show) => {
  gamePanel.classList.toggle('hidden', !show)
  lobbyPanel.classList.toggle('hidden', show)
}

const toInt = (value, fallback = 0) => {
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

const updateAllocationUi = (alloc, mana) => {
  attackRange.max = String(mana)
  shieldRange.max = String(mana)
  channelRange.max = String(mana)
  regenRange.max = String(mana)

  attackRange.value = alloc.attack
  shieldRange.value = alloc.shield
  channelRange.value = alloc.channel
  regenRange.value = alloc.regen

  attackValue.textContent = alloc.attack
  shieldValue.textContent = alloc.shield
  channelValue.textContent = alloc.channel
  regenValue.textContent = alloc.regen

  manaLeft.textContent = String(
    Math.max(0, mana - (alloc.attack + alloc.shield + alloc.channel + alloc.regen))
  )
}

const sanitizeAllocation = (alloc, mana) => {
  let attack = clamp(toInt(alloc.attack), 0, mana)
  let shield = clamp(toInt(alloc.shield), 0, mana)
  let channel = clamp(toInt(alloc.channel), 0, mana)
  let regen = clamp(toInt(alloc.regen), 0, mana)
  let spent = attack + shield + channel + regen
  if (spent > mana) {
    const scale = mana / spent
    attack = Math.floor(attack * scale)
    shield = Math.floor(shield * scale)
    channel = Math.floor(channel * scale)
    regen = Math.floor(regen * scale)
    spent = attack + shield + channel + regen
  }
  return { attack, shield, channel, regen, spent }
}

const allocationFromUi = () => ({
  attack: toInt(attackRange.value),
  shield: toInt(shieldRange.value),
  channel: toInt(channelRange.value),
  regen: toInt(regenRange.value),
})

const setAllocation = async (allocation) => {
  if (!playerRef) return
  await update(playerRef, { allocation })
}

const applyPreset = (type) => {
  if (!roomState || !user) return
  const player = roomState.players?.[user.uid]
  const mana = player?.mana ?? START_MANA
  let alloc = { attack: 0, shield: 0, channel: 0, regen: 0 }
  if (type === 'balanced') {
    const slice = Math.floor(mana / 4)
    alloc = { attack: slice, shield: slice, channel: slice, regen: mana - slice * 3 }
  }
  if (type === 'burst') {
    alloc = { attack: Math.min(mana, 8), shield: 0, channel: Math.max(0, mana - 8), regen: 0 }
  }
  if (type === 'ward') {
    alloc = { attack: 2, shield: Math.min(mana, 8), channel: Math.max(0, mana - 10), regen: 0 }
  }
  if (type === 'build') {
    alloc = { attack: 0, shield: 2, channel: Math.max(0, mana - 2), regen: 0 }
  }
  const safe = sanitizeAllocation(alloc, mana)
  updateAllocationUi(safe, mana)
  setAllocation({
    attack: safe.attack,
    shield: safe.shield,
    channel: safe.channel,
    regen: safe.regen,
  })
}

const initFirebase = (config) => {
  firebaseApp = initializeApp(config)
  db = getDatabase(firebaseApp)
  auth = getAuth(firebaseApp)
  signInAnonymously(auth)
  onAuthStateChanged(auth, (currentUser) => {
    if (!currentUser) return
    user = currentUser
    setStatus('Online', 'good')
  })
}

const getRoomCodeFromUrl = () => {
  const search = new URLSearchParams(window.location.search)
  return search.get('room') || window.location.hash.replace('#', '')
}

const bindConfigForm = () => {
  showConfig(false)
  initFirebase(firebaseConfig)
}

const renderRooms = (rooms) => {
  const container = $('#roomsContainer')
  const roomEntries = Object.entries(rooms || {})
    .map(([id, room]) => {
      const players = Object.keys(room.players || {})
      const status = room.status || 'lobby'
      return { id, status, count: players.length }
    })
    .filter((room) => room.count > 0)
    .sort((a, b) => a.id.localeCompare(b.id))

  if (roomEntries.length === 0) {
    container.innerHTML = '<p class="muted">No active rooms yet.</p>'
    return
  }

  container.innerHTML = roomEntries
    .map((room) => {
      const isFull = room.count >= 2
      const label = isFull ? 'Spectate' : 'Join'
      const mode = isFull ? 'spectator' : 'player'
      return `<div class="roomCard" data-room="${room.id}" data-mode="${mode}" role="button" tabindex="0">
        <div>
          <div class="roomCode">${room.id}</div>
          <div class="roomInfo">${room.count} mage${room.count === 1 ? '' : 's'} · ${room.status}</div>
        </div>
        <span class="roomCardLabel">${label}</span>
      </div>`
    })
    .join('')

  const handleRoomCardAction = (el) => {
    const code = el.dataset.room
    const mode = el.dataset.mode || 'player'
    const name = $('#playerName').value.trim() || 'Arcane Mage'
    $('#roomCode').value = code
    ensureRoom(code, name, mode)
  }

  container.querySelectorAll('.roomCard').forEach((card) => {
    card.addEventListener('click', () => handleRoomCardAction(card))
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        handleRoomCardAction(card)
      }
    })
  })
}

const subscribeRooms = () => {
  if (!db) return
  roomsRef = ref(db, 'rooms')
  onValue(roomsRef, (snapshot) => {
    const rooms = snapshot.val() || {}
    renderRooms(rooms)
  })
}

const ensureRoom = async (code, playerName, mode = 'player') => {
  roomId = code.toLowerCase()
  roomRef = ref(db, `rooms/${roomId}`)
  isSpectator = mode === 'spectator'
  if (isSpectator) {
    spectatorRef = ref(db, `rooms/${roomId}/spectators/${user.uid}`)
    await set(spectatorRef, {
      uid: user.uid,
      name: playerName,
      joinTime: Date.now(),
      lastSeen: Date.now(),
    })
    onDisconnect(spectatorRef).remove()
  } else {
    playerRef = ref(db, `rooms/${roomId}/players/${user.uid}`)
    await set(playerRef, {
      uid: user.uid,
      name: playerName,
      hp: START_HP,
      mana: START_MANA,
      maxMana: MAX_MANA,
      stored: 0,
      allocation: { attack: 0, shield: 0, channel: 0, regen: 0 },
      joinTime: Date.now(),
      lastSeen: Date.now(),
    })
    onDisconnect(playerRef).remove()
  }

  await update(roomRef, {
    createdAt: serverTimestamp(),
    status: 'lobby',
  })

  presenceInterval = window.setInterval(() => {
    if (playerRef) update(playerRef, { lastSeen: Date.now() })
    if (spectatorRef) update(spectatorRef, { lastSeen: Date.now() })
  }, 4000)

  window.location.hash = roomId
  showGame(true)

  onValue(roomRef, (snapshot) => {
    roomState = snapshot.val()
    renderRoom()
  })
}

const renderRoom = () => {
  if (!roomState || !user) return
  const players = roomState.players || {}
  const playerIds = Object.keys(players)
  const sortedIds = playerIds.sort((a, b) => (players[a].joinTime || 0) - (players[b].joinTime || 0))
  const hostId = sortedIds[0]
  isHost = user.uid === hostId

  const self = players[user.uid]
  const opponentId = sortedIds.find((id) => id !== user.uid)
  const opponent = opponentId ? players[opponentId] : null

  roomMeta.textContent = `Players: ${playerIds.length} | Host: ${players[hostId]?.name || '---'}`

  $('#roomTitle').textContent = `Room: ${roomId}`
  $('#selfHp').textContent = self ? `${self.hp}` : '--'
  $('#selfMana').textContent = self ? `${self.mana}` : '--'
  $('#selfStored').textContent = self ? `${self.stored}` : '--'
  $('#selfStatus').textContent = self ? 'Ready' : isSpectator ? 'Spectating' : '--'

  $('#enemyHp').textContent = opponent ? `${opponent.hp}` : '--'
  $('#enemyMana').textContent = opponent ? `${opponent.mana}` : '--'
  $('#enemyStored').textContent = opponent ? `${opponent.stored}` : '--'
  $('#enemyStatus').textContent = opponent ? 'Engaged' : 'Awaiting Mage'

  const allocation = self?.allocation || { attack: 0, shield: 0, channel: 0, regen: 0 }
  updateAllocationUi(allocation, self?.mana ?? START_MANA)
  const canAct = Boolean(self)
  attackRange.disabled = !canAct
  shieldRange.disabled = !canAct
  channelRange.disabled = !canAct
  regenRange.disabled = !canAct

  startDuelBtn.classList.toggle('hidden', !isHost || roomState.status === 'active')

  const tick = roomState.tick
  if (roomState.status === 'finished') {
    const winnerId = roomState.winner
    const winnerName =
      winnerId === 'draw' ? 'Draw' : players[winnerId]?.name || 'Unknown'
    $('#roundInfo').textContent = `Duel Complete - ${winnerName}`
    $('#timer').textContent = '--'
  } else if (roomState.status !== 'active' || !tick) {
    $('#roundInfo').textContent = 'Waiting for duel to start...'
    $('#timer').textContent = '--'
  } else {
    $('#roundInfo').textContent = `Round ${tick.round} - ${tick.phase}`
  }

  renderLog(roomState.log || {})
}

const renderLog = (log) => {
  const logPanel = $('#logPanel')
  const entries = Object.values(log).slice(-6).reverse()
  if (entries.length === 0) {
    logPanel.innerHTML = '<p class="muted">No clashes yet.</p>'
    return
  }
  logPanel.innerHTML = entries
    .map((entry) => {
      return `<div class="logEntry">
        <div class="logTitle">Round ${entry.round}</div>
        <div class="logDetail">${entry.summary}</div>
      </div>`
    })
    .join('')
}

const resolveRound = async () => {
  if (!roomRef || !roomState?.tick) return
  const snapshot = await get(roomRef)
  const room = snapshot.val()
  if (!room || room.status !== 'active') return
  const tick = room.tick
  if (tick.phase !== 'resolving') return

  const players = room.players || {}
  const playerIds = Object.keys(players)
  if (playerIds.length < 2) return
  const sortedIds = playerIds.sort((a, b) => (players[a].joinTime || 0) - (players[b].joinTime || 0))
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

const computeOutcome = (idA, a, idB, b, round) => {
  const allocA = sanitizeAllocation(a.allocation || {}, a.mana ?? START_MANA)
  const allocB = sanitizeAllocation(b.allocation || {}, b.mana ?? START_MANA)

  const regenBonusA = allocA.regen >= 10 ? 2 : allocA.regen >= 7 ? 1 : 0
  const regenBonusB = allocB.regen >= 10 ? 2 : allocB.regen >= 7 ? 1 : 0

  const bonusA = {
    attack: allocA.attack >= 6 ? 2 : 0,
    shield: allocA.shield >= 6 ? 2 : 0,
    channel: allocA.channel >= 6 ? 2 : 0,
  }
  const bonusB = {
    attack: allocB.attack >= 6 ? 2 : 0,
    shield: allocB.shield >= 6 ? 2 : 0,
    channel: allocB.channel >= 6 ? 2 : 0,
  }

  const attackA = allocA.attack + bonusA.attack
  const shieldA = allocA.shield + bonusA.shield
  const storedA = allocA.channel + bonusA.channel

  const attackB = allocB.attack + bonusB.attack
  const shieldB = allocB.shield + bonusB.shield
  const storedB = allocB.channel + bonusB.channel

  const damageToB = Math.max(0, attackA - shieldB)
  const damageToA = Math.max(0, attackB - shieldA)

  const nextA = {
    ...a,
    hp: Math.max(0, (a.hp ?? START_HP) - damageToA),
    mana: clamp(
      (a.mana ?? START_MANA) - allocA.spent + BASE_REGEN + regenBonusA + storedA,
      0,
      a.maxMana ?? MAX_MANA
    ),
    stored: storedA,
    allocation: allocA,
  }

  const nextB = {
    ...b,
    hp: Math.max(0, (b.hp ?? START_HP) - damageToB),
    mana: clamp(
      (b.mana ?? START_MANA) - allocB.spent + BASE_REGEN + regenBonusB + storedB,
      0,
      b.maxMana ?? MAX_MANA
    ),
    stored: storedB,
    allocation: allocB,
  }

  let winnerId = null
  if (nextA.hp <= 0 && nextB.hp <= 0) {
    winnerId = 'draw'
  } else if (nextA.hp <= 0) {
    winnerId = idB
  } else if (nextB.hp <= 0) {
    winnerId = idA
  }

  const summary = `Beam ${attackA} vs ${shieldB} | Aegis ${attackB} vs ${shieldA} | Damage: ${damageToA} / ${damageToB} | Regen +${regenBonusA}/+${regenBonusB}`

  return {
    nextA,
    nextB,
    winnerId,
    lastRound: {
      round,
      summary,
      damage: { toA: damageToA, toB: damageToB },
      stored: { a: storedA, b: storedB },
    },
  }
}

const maybeAdvanceTick = async () => {
  if (!isHost || !roomState?.tick || roomState.status !== 'active') return
  const tick = roomState.tick
  if (tick.phase !== 'plan') return
  if (Date.now() < tick.endsAt) return

  const tickRef = ref(db, `rooms/${roomId}/tick`)
  const result = await runTransaction(tickRef, (current) => {
    if (!current || current.phase !== 'plan') return current
    if (Date.now() < current.endsAt) return current
    return { ...current, phase: 'resolving', resolvedAt: Date.now() }
  })

  if (result.committed) {
    await resolveRound()
  }
}

const tickTimer = () => {
  if (!roomState?.tick || roomState.status !== 'active') {
    $('#timer').textContent = '--'
    return
  }
  const remaining = Math.max(0, roomState.tick.endsAt - Date.now())
  $('#timer').textContent = `${(remaining / 1000).toFixed(1)}s`
  if (remaining <= 0) {
    $('#timer').classList.add('pulse')
  } else {
    $('#timer').classList.remove('pulse')
  }
}

const bindLobbyActions = () => {
  $('#joinRoom').addEventListener('click', () => {
    if (!user) {
      alert('Waiting for Firebase auth...')
      return
    }
    const name = $('#playerName').value.trim() || 'Arcane Mage'
    const code = $('#roomCode').value.trim()
    if (!code) {
      alert('Enter a room code.')
      return
    }
    ensureRoom(code, name)
  })

  $('#createRoom').addEventListener('click', () => {
    if (!user) {
      alert('Waiting for Firebase auth...')
      return
    }
    const name = $('#playerName').value.trim() || 'Arcane Mage'
    const code = `arcana-${Math.floor(Math.random() * 999) + 1}`
    $('#roomCode').value = code
    ensureRoom(code, name)
  })

  $('#refreshRooms').addEventListener('click', () => {
    if (!roomsRef) return
    get(roomsRef).then((snapshot) => {
      renderRooms(snapshot.val() || {})
    })
  })
}

const bindGameActions = () => {
  startDuelBtn.addEventListener('click', async () => {
    if (!roomRef) return
    await update(roomRef, {
      status: 'active',
      tick: {
        round: 1,
        phase: 'plan',
        endsAt: Date.now() + PLAN_MS,
      },
    })
  })

  $('#leaveRoom').addEventListener('click', () => {
    if (playerRef) set(playerRef, null)
    if (spectatorRef) set(spectatorRef, null)
    if (presenceInterval) window.clearInterval(presenceInterval)
    roomId = null
    roomRef = null
    playerRef = null
    spectatorRef = null
    roomState = null
    isSpectator = false
    showGame(false)
  })

  const allocationHandler = () => {
    if (!roomState || !user) return
    const player = roomState.players?.[user.uid]
    if (!player) return
    const mana = player.mana ?? START_MANA
    const alloc = sanitizeAllocation(allocationFromUi(), mana)
    updateAllocationUi(alloc, mana)
    setAllocation({
      attack: alloc.attack,
      shield: alloc.shield,
      channel: alloc.channel,
      regen: alloc.regen,
    })
  }

  attackRange.addEventListener('input', allocationHandler)
  shieldRange.addEventListener('input', allocationHandler)
  channelRange.addEventListener('input', allocationHandler)
  regenRange.addEventListener('input', allocationHandler)

  $('#presetBalanced').addEventListener('click', () => applyPreset('balanced'))
  $('#presetBurst').addEventListener('click', () => applyPreset('burst'))
  $('#presetWard').addEventListener('click', () => applyPreset('ward'))
  $('#presetBuild').addEventListener('click', () => applyPreset('build'))
}

const bootstrap = () => {
  const roomFromUrl = getRoomCodeFromUrl()
  if (roomFromUrl) {
    $('#roomCode').value = roomFromUrl
  }

  bindConfigForm()
  bindLobbyActions()
  bindGameActions()
  subscribeRooms()

  window.setInterval(() => {
    tickTimer()
    maybeAdvanceTick()
  }, 250)
}

bootstrap()

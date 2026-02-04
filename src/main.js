import './style.css'
import * as constants from './config/constants.js'
import { firebaseConfig } from './config/firebaseConfig.js'
import { initDom } from './dom.js'
import { appState } from './state.js'
import {
  setStatus,
  showConfig,
  showGame,
  renderRooms,
  renderRoom,
  renderTimer,
  updateAllocationUi,
} from './ui/render.js'
import { sanitizeAllocation, toInt } from './game/allocation.js'
import * as firebase from './services/firebase.js'

const root = document.querySelector('#app')
const dom = initDom(root)
const state = appState

function getRoomCodeFromUrl() {
  const search = new URLSearchParams(window.location.search)
  return search.get('room') || window.location.hash.replace('#', '')
}

function allocationFromDom(domRef) {
  return {
    attack: toInt(domRef.attackRange.value),
    shield: toInt(domRef.shieldRange.value),
    channel: toInt(domRef.channelRange.value),
    regen: toInt(domRef.regenAmount.value),
  }
}

function handleJoinOrSpectate(code, mode) {
  const name = dom.playerName.value.trim() || 'Arcane Mage'
  firebase
    .ensureRoom(code, name, mode, state)
    .then(() => {
      showGame(true, dom)
      firebase.subscribeRoom(state.roomId, (data) => {
        state.roomState = data
        renderRoom(state.roomState, state, dom, constants)
      })
    })
}

function bindConfigForm() {
  showConfig(false, dom)
  firebase.init(firebaseConfig, state, {
    onAuth() {
      setStatus('Online', 'good', dom)
    },
  })
}

function bindLobbyActions() {
  dom.joinRoom.addEventListener('click', () => {
    if (!state.user) {
      alert('Waiting for Firebase auth...')
      return
    }
    const name = dom.playerName.value.trim() || 'Arcane Mage'
    const code = dom.roomCode.value.trim()
    if (!code) {
      alert('Enter a room code.')
      return
    }
    handleJoinOrSpectate(code, 'player')
  })

  dom.createRoom.addEventListener('click', () => {
    if (!state.user) {
      alert('Waiting for Firebase auth...')
      return
    }
    const name = dom.playerName.value.trim() || 'Arcane Mage'
    const code = `arcana-${Math.floor(Math.random() * 999) + 1}`
    dom.roomCode.value = code
    handleJoinOrSpectate(code, 'player')
  })

  dom.refreshRooms.addEventListener('click', () => {
    firebase.getRoomsSnapshot()?.then((snapshot) => {
      if (!snapshot) return
      renderRooms(snapshot.val() || {}, dom, {
        onRoomCardAction(code, mode) {
          dom.roomCode.value = code
          handleJoinOrSpectate(code, mode)
        },
      })
    })
  })
}

function bindGameActions() {
  dom.startDuelBtn.addEventListener('click', async () => {
    if (!state.roomRef) return
    await firebase.updateRoom(state.roomRef, {
      status: 'active',
      tick: {
        round: 1,
        phase: 'plan',
        endsAt: Date.now() + constants.PLAN_MS,
      },
    })
  })

  dom.leaveRoom.addEventListener('click', async () => {
    await firebase.leaveRoom(state)
    showGame(false, dom)
  })

  const allocationHandler = () => {
    if (!state.roomState || !state.user) return
    const player = state.roomState.players?.[state.user.uid]
    if (!player) return
    const mana = player.mana ?? constants.START_MANA
    const alloc = sanitizeAllocation(allocationFromDom(dom), mana)
    updateAllocationUi(alloc, mana, dom)
    firebase.updatePlayer(state.playerRef, {
      allocation: {
        attack: alloc.attack,
        shield: alloc.shield,
        channel: alloc.channel,
        regen: alloc.regen,
      },
    })
  }

  dom.attackRange.addEventListener('input', allocationHandler)
  dom.shieldRange.addEventListener('input', allocationHandler)
  dom.channelRange.addEventListener('input', allocationHandler)

  dom.regenBtn1.addEventListener('click', () => {
    if (!state.roomState || !state.user) return
    const player = state.roomState.players?.[state.user.uid]
    if (!player) return
    const mana = player.mana ?? constants.START_MANA
    const alloc = allocationFromDom(dom)
    const newRegen = alloc.regen === 7 ? 0 : 7
    const safe = sanitizeAllocation({ ...alloc, regen: newRegen }, mana)
    updateAllocationUi(safe, mana, dom)
    firebase.updatePlayer(state.playerRef, {
      allocation: {
        attack: safe.attack,
        shield: safe.shield,
        channel: safe.channel,
        regen: safe.regen,
      },
    })
  })
  dom.regenBtn2.addEventListener('click', () => {
    if (!state.roomState || !state.user) return
    const player = state.roomState.players?.[state.user.uid]
    if (!player) return
    const mana = player.mana ?? constants.START_MANA
    const alloc = allocationFromDom(dom)
    const newRegen = alloc.regen === 12 ? 0 : 12
    const safe = sanitizeAllocation({ ...alloc, regen: newRegen }, mana)
    updateAllocationUi(safe, mana, dom)
    firebase.updatePlayer(state.playerRef, {
      allocation: {
        attack: safe.attack,
        shield: safe.shield,
        channel: safe.channel,
        regen: safe.regen,
      },
    })
  })
}

function bootstrap() {
  const roomFromUrl = getRoomCodeFromUrl()
  if (roomFromUrl) {
    dom.roomCode.value = roomFromUrl
  }

  bindConfigForm()
  bindLobbyActions()
  bindGameActions()

  firebase.subscribeRooms((rooms) =>
    renderRooms(rooms, dom, {
      onRoomCardAction(code, mode) {
        dom.roomCode.value = code
        handleJoinOrSpectate(code, mode)
      },
    })
  )

  window.setInterval(() => {
    renderTimer(state.roomState, dom)
    firebase.maybeAdvanceTick(state)
  }, 250)
}

bootstrap()

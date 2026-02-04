import { REGEN_OPTIONS } from '../config/constants.js'

export function setStatus(text, tone, dom) {
  dom.statusEl.textContent = text
  dom.statusEl.dataset.tone = tone
}

export function showConfig(show, dom) {
  dom.configPanel.classList.toggle('hidden', !show)
  dom.lobbyPanel.classList.toggle('hidden', show)
}

export function showGame(show, dom) {
  dom.gamePanel.classList.toggle('hidden', !show)
  dom.lobbyPanel.classList.toggle('hidden', show)
}

export function updateAllocationUi(alloc, mana, dom) {
  const {
    attackRange,
    shieldRange,
    channelRange,
    regenAmount,
    regenBtn1,
    regenBtn2,
    attackValue,
    shieldValue,
    channelValue,
    manaLeft,
  } = dom

  attackRange.max = String(mana)
  shieldRange.max = String(mana)
  channelRange.max = String(mana)

  const regen = REGEN_OPTIONS.includes(alloc.regen) ? alloc.regen : 0
  regenAmount.value = String(regen)

  attackRange.value = alloc.attack
  shieldRange.value = alloc.shield
  channelRange.value = alloc.channel

  attackValue.textContent = alloc.attack
  shieldValue.textContent = alloc.shield
  channelValue.textContent = alloc.channel

  const spentWithoutRegen = alloc.attack + alloc.shield + alloc.channel
  const manaForRegen = Math.max(0, mana - spentWithoutRegen)
  regenBtn1.disabled = manaForRegen < 7
  regenBtn2.disabled = manaForRegen < 12
  regenBtn1.classList.toggle('ghost', regen !== 7)
  regenBtn2.classList.toggle('ghost', regen !== 12)

  const remaining = Math.max(
    0,
    mana - (alloc.attack + alloc.shield + alloc.channel + regen)
  )
  manaLeft.textContent = String(remaining)
  if (dom.selfMana) dom.selfMana.textContent = String(remaining)
}

export function renderLog(log, dom) {
  const entries = Object.values(log).slice(-6).reverse()
  if (entries.length === 0) {
    dom.logPanel.innerHTML = '<p class="muted">No clashes yet.</p>'
    return
  }
  dom.logPanel.innerHTML = entries
    .map(
      (entry) =>
        `<div class="logEntry">
        <div class="logTitle">Round ${entry.round}</div>
        <div class="logDetail">${entry.summary}</div>
      </div>`
    )
    .join('')
}

export function renderRooms(publicRooms, dom, options = {}) {
  const { onRoomCardAction } = options
  const roomEntries = Object.entries(publicRooms || {})
    .map(([id, room]) => {
      // publicRooms entries have playerCount directly
      const count = room.playerCount || 0
      const status = room.status || 'lobby'
      const hostName = room.hostName || null
      return { id, status, count, hostName }
    })
    .filter((room) => room.count > 0 && room.status !== 'finished')
    .sort((a, b) => a.id.localeCompare(b.id))

  if (roomEntries.length === 0) {
    dom.roomsContainer.innerHTML = '<p class="muted">No active rooms yet.</p>'
    return
  }

  dom.roomsContainer.innerHTML = roomEntries
    .map((room) => {
      const isFull = room.count >= 2
      const label = isFull ? 'Spectate' : 'Join'
      const mode = isFull ? 'spectator' : 'player'
      const hostInfo = room.hostName ? ` · Host: ${room.hostName}` : ''
      return `<div class="roomCard" data-room="${room.id}" data-mode="${mode}" role="button" tabindex="0">
        <div>
          <div class="roomCode">${room.id}</div>
          <div class="roomInfo">${room.count} mage${room.count === 1 ? '' : 's'} · ${room.status}${hostInfo}</div>
        </div>
        <span class="roomCardLabel">${label}</span>
      </div>`
    })
    .join('')

  if (onRoomCardAction) {
    dom.roomsContainer.querySelectorAll('.roomCard').forEach((card) => {
      card.addEventListener('click', () =>
        onRoomCardAction(card.dataset.room, card.dataset.mode || 'player')
      )
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onRoomCardAction(card.dataset.room, card.dataset.mode || 'player')
        }
      })
    })
  }
}

export function renderRoom(roomState, state, dom, constants) {
  const { START_MANA, BASE_REGEN } = constants
  const { user, roomId, isHost, isSpectator } = state
  if (!roomState || !user) return

  const players = roomState.players || {}
  const playerIds = Object.keys(players)
  const sortedIds = playerIds.sort(
    (a, b) => (players[a].joinTime || 0) - (players[b].joinTime || 0)
  )
  const hostId = sortedIds[0]
  state.isHost = user.uid === hostId

  const self = players[user.uid]
  const opponentId = sortedIds.find((id) => id !== user.uid)
  const opponent = opponentId ? players[opponentId] : null

  dom.roomMeta.textContent = `Players: ${playerIds.length} | Host: ${players[hostId]?.name || '---'}`

  dom.roomTitle.textContent = `Room: ${roomId}`

  if (isSpectator) {
    const player1 = sortedIds[0] != null ? players[sortedIds[0]] : null
    const player2 = sortedIds[1] != null ? players[sortedIds[1]] : null
    dom.selfCardTitle.textContent = player1?.name || 'Mage 1'
    dom.enemyCardTitle.textContent = player2?.name || 'Mage 2'
    dom.selfHp.textContent = player1 != null ? String(player1.hp) : '--'
    dom.selfMana.textContent = player1 != null ? String(player1.mana ?? START_MANA) : '--'
    dom.selfRegen.textContent = player1 != null ? String(BASE_REGEN + (player1.regenBonus ?? 0)) : '--'
    dom.enemyHp.textContent = player2 != null ? String(player2.hp) : '--'
    dom.enemyMana.textContent = player2 != null ? String(player2.mana ?? START_MANA) : '--'
    dom.enemyRegen.textContent = player2 != null ? String(BASE_REGEN + (player2.regenBonus ?? 0)) : '--'
    if (dom.allocationPanel) dom.allocationPanel.classList.add('hidden')
    dom.attackRange.disabled = true
    dom.shieldRange.disabled = true
    dom.channelRange.disabled = true
    dom.regenBtn1.disabled = true
    dom.regenBtn2.disabled = true
  } else {
    dom.selfCardTitle.textContent = 'You'
    dom.enemyCardTitle.textContent = 'Opponent'
    dom.selfHp.textContent = self ? `${self.hp}` : '--'
    dom.selfRegen.textContent = self != null ? String(BASE_REGEN + (self.regenBonus ?? 0)) : '--'
    dom.enemyHp.textContent = opponent ? `${opponent.hp}` : '--'
    dom.enemyMana.textContent = opponent ? '?' : '--'
    dom.enemyRegen.textContent = opponent != null ? String(BASE_REGEN + (opponent.regenBonus ?? 0)) : '--'
    if (dom.allocationPanel) dom.allocationPanel.classList.remove('hidden')
    const allocation = self?.allocation || {
      attack: 0,
      shield: 0,
      channel: 0,
      regen: 0,
    }
    updateAllocationUi(allocation, self?.mana ?? START_MANA, dom)
    const canAct = Boolean(self)
    dom.attackRange.disabled = !canAct
    dom.shieldRange.disabled = !canAct
    dom.channelRange.disabled = !canAct
    if (!canAct) {
      dom.regenBtn1.disabled = true
      dom.regenBtn2.disabled = true
    }
  }

  dom.startDuelBtn.classList.toggle(
    'hidden',
    !state.isHost || roomState.status === 'active'
  )

  const tick = roomState.tick
  if (roomState.status === 'finished') {
    const winnerId = roomState.winner
    const winnerName =
      winnerId === 'draw' ? 'Draw' : players[winnerId]?.name || 'Unknown'
    dom.roundInfo.textContent = `Duel Complete - ${winnerName}`
    dom.timer.textContent = '--'
  } else if (roomState.status !== 'active' || !tick) {
    dom.roundInfo.textContent = 'Waiting for duel to start...'
    dom.timer.textContent = '--'
  } else {
    dom.roundInfo.textContent = `Round ${tick.round} - ${tick.phase}`
  }

  renderLog(roomState.log || {}, dom)

  if (isSpectator && dom.lastRoundPanel && dom.lastRoundContent) {
    const lastRound = roomState.lastRound
    if (lastRound) {
      dom.lastRoundPanel.classList.remove('hidden')
      const damage = lastRound.damage || {}
      const damageLine = lastRound.round != null
        ? `Damage: Mage 1 -${damage.toA ?? 0} | Mage 2 -${damage.toB ?? 0}`
        : ''
      dom.lastRoundContent.innerHTML = `
        <div class="logTitle">Last round (${lastRound.round ?? '—'})</div>
        <div class="logDetail">${lastRound.summary ?? ''}</div>
        ${damageLine ? `<div class="logDetail">${damageLine}</div>` : ''}
      `
    } else {
      dom.lastRoundPanel.classList.add('hidden')
      dom.lastRoundContent.innerHTML = ''
    }
  } else {
    if (dom.lastRoundPanel) dom.lastRoundPanel.classList.add('hidden')
    if (dom.lastRoundContent) dom.lastRoundContent.innerHTML = ''
  }
}

export function renderTimer(roomState, dom) {
  if (!roomState?.tick || roomState.status !== 'active') {
    dom.timer.textContent = '--'
    dom.timer.classList.remove('pulse')
    return
  }
  const remaining = Math.max(0, roomState.tick.endsAt - Date.now())
  dom.timer.textContent = `${(remaining / 1000).toFixed(1)}s`
  if (remaining <= 0) {
    dom.timer.classList.add('pulse')
  } else {
    dom.timer.classList.remove('pulse')
  }
}

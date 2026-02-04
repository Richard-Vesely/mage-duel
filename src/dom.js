import { appTemplate } from './ui/template.js'

const $ = (selector, root) => root.querySelector(selector)

export function initDom(root) {
  root.innerHTML = appTemplate
  return {
    statusEl: $('#status', root),
    configPanel: $('#configPanel', root),
    lobbyPanel: $('#lobbyPanel', root),
    gamePanel: $('#gamePanel', root),
    roomMeta: $('#roomMeta', root),
    startDuelBtn: $('#startDuel', root),
    attackRange: $('#attackRange', root),
    shieldRange: $('#shieldRange', root),
    channelRange: $('#channelRange', root),
    regenAmount: $('#regenAmount', root),
    regenBtn1: $('#regenBtn1', root),
    regenBtn2: $('#regenBtn2', root),
    attackValue: $('#attackValue', root),
    shieldValue: $('#shieldValue', root),
    channelValue: $('#channelValue', root),
    manaLeft: $('#manaLeft', root),
    roomsContainer: $('#roomsContainer', root),
    playerName: $('#playerName', root),
    roomCode: $('#roomCode', root),
    joinRoom: $('#joinRoom', root),
    createRoom: $('#createRoom', root),
    refreshRooms: $('#refreshRooms', root),
    leaveRoom: $('#leaveRoom', root),
    roomTitle: $('#roomTitle', root),
    roundInfo: $('#roundInfo', root),
    selfHp: $('#selfHp', root),
    selfMana: $('#selfMana', root),
    selfStored: $('#selfStored', root),
    selfRegen: $('#selfRegen', root),
    selfStatus: $('#selfStatus', root),
    enemyHp: $('#enemyHp', root),
    enemyMana: $('#enemyMana', root),
    enemyStored: $('#enemyStored', root),
    enemyStatus: $('#enemyStatus', root),
    timer: $('#timer', root),
    logPanel: $('#logPanel', root),
  }
}

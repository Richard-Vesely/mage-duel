import { sanitizeAllocation } from './allocation.js'
import { START_HP, START_MANA, BASE_REGEN } from '../config/constants.js'

export function computeOutcome(idA, a, idB, b, round) {
  const allocA = sanitizeAllocation(a.allocation || {}, a.mana ?? START_MANA)
  const allocB = sanitizeAllocation(b.allocation || {}, b.mana ?? START_MANA)

  // This round's regen investment (additive for rest of game); applied only when turn is evaluated
  const regenInvestedA = allocA.regen >= 12 ? 2 : allocA.regen >= 7 ? 1 : 0
  const regenInvestedB = allocB.regen >= 12 ? 2 : allocB.regen >= 7 ? 1 : 0
  const prevRegenBonusA = a.regenBonus ?? 0
  const prevRegenBonusB = b.regenBonus ?? 0
  const nextRegenBonusA = prevRegenBonusA + regenInvestedA
  const nextRegenBonusB = prevRegenBonusB + regenInvestedB

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

  // Reset allocation so choices (attack/shield/channel/regen) start at zero next round
  const nextAllocA = { attack: 0, shield: 0, channel: 0, regen: 0 }
  const nextAllocB = { attack: 0, shield: 0, channel: 0, regen: 0 }

  // Mana regen uses previous bonus only (this turn's investment applies from next turn)
  const nextA = {
    ...a,
    hp: Math.max(0, (a.hp ?? START_HP) - damageToA),
    mana: Math.max(
      0,
      (a.mana ?? START_MANA) - allocA.spent + BASE_REGEN + prevRegenBonusA + storedA
    ),
    stored: storedA,
    regenBonus: nextRegenBonusA,
    allocation: nextAllocA,
  }

  const nextB = {
    ...b,
    hp: Math.max(0, (b.hp ?? START_HP) - damageToB),
    mana: Math.max(
      0,
      (b.mana ?? START_MANA) - allocB.spent + BASE_REGEN + prevRegenBonusB + storedB
    ),
    stored: storedB,
    regenBonus: nextRegenBonusB,
    allocation: nextAllocB,
  }

  let winnerId = null
  if (nextA.hp <= 0 && nextB.hp <= 0) {
    winnerId = 'draw'
  } else if (nextA.hp <= 0) {
    winnerId = idB
  } else if (nextB.hp <= 0) {
    winnerId = idA
  }

  const summary = `Attack ${attackA} vs ${shieldB} | Shield ${attackB} vs ${shieldA} | Damage: ${damageToA} / ${damageToB} | Regen +${nextRegenBonusA}/+${nextRegenBonusB}`

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

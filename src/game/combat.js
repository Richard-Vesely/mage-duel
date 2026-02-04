import { sanitizeAllocation, clamp } from './allocation.js'
import { START_HP, START_MANA, MAX_MANA, BASE_REGEN } from '../config/constants.js'

export function computeOutcome(idA, a, idB, b, round) {
  const allocA = sanitizeAllocation(a.allocation || {}, a.mana ?? START_MANA)
  const allocB = sanitizeAllocation(b.allocation || {}, b.mana ?? START_MANA)

  const regenInvestedA = allocA.regen >= 12 ? 2 : allocA.regen >= 7 ? 1 : 0
  const regenInvestedB = allocB.regen >= 12 ? 2 : allocB.regen >= 7 ? 1 : 0
  const regenBonusA = (a.regenBonus ?? 0) + regenInvestedA
  const regenBonusB = (b.regenBonus ?? 0) + regenInvestedB

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

  // Clear allocation.regen so the same investment isn't counted again next round
  const nextAllocA = { ...allocA, regen: 0 }
  const nextAllocB = { ...allocB, regen: 0 }

  const nextA = {
    ...a,
    hp: Math.max(0, (a.hp ?? START_HP) - damageToA),
    mana: clamp(
      (a.mana ?? START_MANA) - allocA.spent + BASE_REGEN + regenBonusA + storedA,
      0,
      a.maxMana ?? MAX_MANA
    ),
    stored: storedA,
    regenBonus: regenBonusA,
    allocation: nextAllocA,
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
    regenBonus: regenBonusB,
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

  const summary = `Beam ${attackA} vs ${shieldB} | Aegis ${attackB} vs ${shieldA} | Damage: ${damageToA} / ${damageToB} | Regen +${nextA.regenBonus}/+${nextB.regenBonus}`

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

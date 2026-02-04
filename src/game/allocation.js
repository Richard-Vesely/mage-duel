import { REGEN_OPTIONS } from '../config/constants.js'

export { REGEN_OPTIONS }

export const toInt = (value, fallback = 0) => {
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

export function sanitizeAllocation(alloc, mana) {
  let regen = toInt(alloc.regen)
  regen = REGEN_OPTIONS.includes(regen) ? regen : (regen >= 10 ? 12 : regen >= 7 ? 7 : 0)
  const maxOther = mana - regen
  let attack = clamp(toInt(alloc.attack), 0, maxOther)
  let shield = clamp(toInt(alloc.shield), 0, maxOther)
  let channel = clamp(toInt(alloc.channel), 0, maxOther)
  let spent = attack + shield + channel + regen
  if (spent > mana) {
    const scale = (mana - regen) / (attack + shield + channel) || 0
    attack = Math.floor(attack * scale)
    shield = Math.floor(shield * scale)
    channel = Math.floor(channel * scale)
    spent = attack + shield + channel + regen
  }
  return { attack, shield, channel, regen, spent }
}

export function allocationFromValues(attack, shield, channel, regen) {
  return { attack, shield, channel, regen }
}

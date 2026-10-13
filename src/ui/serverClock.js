import { CONTINUE_RULES, dayNumber } from '../shared/gameData.js'
import { gameState } from '../store/gameStore'

/** Date.now() on the server's clock (the welcome message lines the client up). */
export const serverNow = () => Date.now() + (gameState().serverOffset || 0)

/** Free continues left today (the server keeps the real count). */
export function freeContinuesLeft(me) {
  const usedToday = me?.continueDay === dayNumber(serverNow()) ? me.continuesUsed : 0
  return Math.max(0, CONTINUE_RULES.freePerDay - usedToday)
}

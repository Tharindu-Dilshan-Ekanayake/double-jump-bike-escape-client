import { useEffect } from 'react'

import { sound } from '../audio/sound'
import { send } from '../net/connection'
import { EGGS, MAX_PETS_EQUIPPED, WORLD2_UNLOCK, parseList, worldUnlocked } from '../shared/gameData.js'
import { gameState, useGameStore } from '../store/gameStore'

/** Click handler that plays the click sound first. */
export const withClick = (fn) => () => {
  sound.click()
  fn()
}

/** Click handler that opens a window. */
export const open = (id, props) => withClick(() => gameState().openPanel(id, props))

/** Opens a window, or closes it when that same window (and tab) is already open. */
export function toggle(id, props = {}) {
  sound.click()
  const { panel, openPanel, closePanel } = gameState()
  if (panel?.id === id && (!props.tab || panel.props?.tab === props.tab)) closePanel()
  else openPanel(id, props)
}

export function buyProduct(id) {
  sound.click()
  send('buy', { cat: 'product', id })
}

export function buy2xSpeed(me) {
  if (me.pass2xSpeed) gameState().toast('2x Speed is active!', 'success')
  else buyProduct('pass2xSpeed')
}

export function toggleMusic() {
  const music = !gameState().settings.music
  gameState().setSetting('music', music)
  sound.setMusic(music)
}

/** "04:59" (minutes may pass 60 for long waits). */
export function mmss(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** Pets need a look: a free slot with a pet to fill it, or Wins for a first egg. */
export function petsAlert(me) {
  const owned = parseList(me.pets).length
  const equipped = parseList(me.petsEquipped).length
  if (!owned) return me.wins >= EGGS[0].price
  return equipped < Math.min(owned, MAX_PETS_EQUIPPED)
}

/** World 1 escaped, World 2 still waiting on rebirths. */
export const worldTwoPending = (me) => (me.bestStage ?? 0) >= WORLD2_UNLOCK.stage && !worldUnlocked(2, me)

/** A store value that clears itself `ms` after it was set (popups). */
export function useExpire(selector, key, ms) {
  const value = useGameStore(selector)
  useEffect(() => {
    if (!value) return undefined
    const timer = setTimeout(() => useGameStore.setState({ [key]: null }), ms)
    return () => clearTimeout(timer)
  }, [value, key, ms])
  return value
}

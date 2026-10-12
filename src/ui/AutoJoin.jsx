import { useEffect, useRef, useState } from 'react'

import { sound } from '../audio/sound'
import { useBloxity } from '../bloxity/BloxityContext'
import { avatarPayload, joinGame, leaveGame, playerUid } from '../net/connection'
import { gameState, useGameStore } from '../store/gameStore'

/**
 * Gets the player into a lobby with no screen of our own: the Bloxity host
 * page already shows a loading screen, so this only tells it what's happening
 * (`loadingStep`) and lifts it (`loadingEnd`) once the rider is in the lobby.
 *
 * A signed-in Bloxity player joins with their account, anyone else as a guest.
 * Dropped connections rejoin by themselves; a small notice shows meanwhile.
 */

/** How long to wait for the Bloxity SDK before playing as a local guest. */
const ACCOUNT_TIMEOUT_MS = 8000
const RETRY_MS = 3000

function useFontsLoaded() {
  const [done, setDone] = useState(false)
  useEffect(() => {
    let alive = true
    const finish = () => alive && setDone(true)
    document.fonts.ready.then(finish, finish)
    const timer = setTimeout(finish, 3000)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [])
  return done
}

/** Browsers only allow sound after a click or key press; start it on the first one. */
function useUnlockSoundOnFirstInput() {
  useEffect(() => {
    const unlock = () => {
      sound.unlock()
      const { settings } = gameState()
      sound.setSfx(settings.sfx)
      sound.setMusic(settings.music)
      remove()
    }
    const events = ['pointerdown', 'keydown', 'touchstart']
    const remove = () => events.forEach((e) => window.removeEventListener(e, unlock, true))
    events.forEach((e) => window.addEventListener(e, unlock, true))
    return remove
  }, [])
}

/** Who to join as; dev builds can force a throwaway test profile with ?autoplay&name=&uid=. */
function joinIdentity(bloxity) {
  const params = new URLSearchParams(window.location.search)
  if (import.meta.env.DEV && params.has('autoplay')) {
    return {
      name: params.get('name') || 'Tester',
      uid: params.get('uid') ? `test:${params.get('uid')}` : playerUid(null),
    }
  }
  const { identity, user } = bloxity
  return { name: identity?.displayName || identity?.username || 'Guest', uid: playerUid(user) }
}

export function AutoJoin() {
  const phase = useGameStore((s) => s.phase)
  const error = useGameStore((s) => s.error)
  const canRetry = useGameStore((s) => s.canRetry)
  const worldReady = useGameStore((s) => s.worldReady)
  const bloxity = useBloxity()
  const fontsLoaded = useFontsLoaded()
  useUnlockSoundOnFirstInput()

  const [accountTimedOut, setAccountTimedOut] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setAccountTimedOut(true), ACCOUNT_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [])
  const accountReady = bloxity.status === 'ready' || bloxity.status === 'error' || accountTimedOut

  // Join as soon as everything else is ready, and again after a dropped
  // connection (but not when another window took over this profile).
  const bloxityRef = useRef(bloxity)
  const joinedUid = useRef(null)
  useEffect(() => {
    bloxityRef.current = bloxity
  })
  const readyToJoin = fontsLoaded && accountReady && worldReady
  const waiting = phase === 'menu' || (phase === 'disconnected' && canRetry)
  useEffect(() => {
    if (!readyToJoin || !waiting) return undefined
    const delay = phase === 'disconnected' ? 600 : error ? RETRY_MS : 0
    const timer = setTimeout(() => {
      const who = joinIdentity(bloxityRef.current)
      joinedUid.current = who.uid
      joinGame({ ...who, avatar: avatarPayload(bloxityRef.current) })
    }, delay)
    return () => clearTimeout(timer)
  }, [readyToJoin, waiting, error, phase])

  // Signing in (or out) of Bloxity mid-game switches to that profile.
  const accountUid = accountReady ? joinIdentity(bloxity).uid : null
  useEffect(() => {
    if (phase !== 'playing' || !accountUid || !joinedUid.current) return
    if (accountUid !== joinedUid.current) leaveGame()
  }, [phase, accountUid])

  // Keep the host page's loading screen informed, and lift it once we're in.
  let step = null
  if (!fontsLoaded || !worldReady) step = 'Building the world…'
  else if (!accountReady) step = 'Signing in…'
  else if (phase !== 'playing') step = 'Finding a lobby…'
  const { game } = bloxity
  useEffect(() => {
    if (step) game.loadingStep(step)
  }, [step, game])
  const loadingEnded = useRef(false)
  useEffect(() => {
    if (phase !== 'playing' || loadingEnded.current) return
    loadingEnded.current = true
    game.loadingEnd()
  }, [phase, game])

  // Only problems get a (small) notice: a failed join or a dropped connection.
  if (phase === 'playing' || (!error && phase !== 'disconnected')) return null
  let notice = `${error} Retrying…`
  if (phase === 'disconnected') notice = canRetry ? error || 'Reconnecting…' : `${error} Reload the page to play here.`
  return <div className="connection-notice game-text pointer-events-none fixed left-1/2 top-4 z-40">{notice}</div>
}

export default AutoJoin

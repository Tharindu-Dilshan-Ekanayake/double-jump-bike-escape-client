import { useProgress } from '@react-three/drei'
import { useEffect, useRef, useState } from 'react'

import { sound } from '../audio/sound'
import { useBloxity } from '../bloxity/BloxityContext'
import { avatarPayload, joinGame, leaveGame, playerUid } from '../net/connection'
import { gameState, useGameStore } from '../store/gameStore'
import { BikeIcon } from './icons'

/**
 * Loading screen: counts 0 -> 100 while the game gets ready, then joins a lobby
 * on its own. There is no Play button: a signed-in Bloxity player joins with
 * their account, anyone else as a guest.
 *
 * Steps (and their share of the bar): fonts, Bloxity sign-in, 3D assets, the
 * world's first frame, then finding a lobby.
 */

const STEPS = [
  { id: 'fonts', label: 'Loading fonts…', weight: 8 },
  { id: 'account', label: 'Signing in…', weight: 14 },
  { id: 'assets', label: 'Loading bikes and riders…', weight: 34 },
  { id: 'world', label: 'Building the world…', weight: 22 },
  { id: 'join', label: 'Finding a lobby…', weight: 22 },
]

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

export function LoadingScreen() {
  const phase = useGameStore((s) => s.phase)
  const error = useGameStore((s) => s.error)
  const canRetry = useGameStore((s) => s.canRetry)
  const worldReady = useGameStore((s) => s.worldReady)
  const joinedAt = useGameStore((s) => s.joinedAt)
  const bloxity = useBloxity()
  const { progress: assetProgress, active: assetsActive } = useProgress()
  const fontsLoaded = useFontsLoaded()
  useUnlockSoundOnFirstInput()

  const [accountTimedOut, setAccountTimedOut] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setAccountTimedOut(true), ACCOUNT_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [])
  const accountReady = bloxity.status === 'ready' || bloxity.status === 'error' || accountTimedOut
  const assetsDone = !assetsActive && (assetProgress >= 100 || worldReady)

  const done = {
    fonts: fontsLoaded,
    account: accountReady,
    assets: assetsDone,
    world: worldReady,
    join: phase === 'playing',
  }
  const current = STEPS.find((s) => !done[s.id])

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

  // Tell the Bloxity host page what we're doing (it can show its own loader).
  useEffect(() => {
    if (current) bloxity.game.loadingStep(current.label)
  }, [current, bloxity.game])

  // Smoothly animated percentage: eases towards the finished steps, and creeps
  // a little into the current one so the bar never looks stuck.
  const target = STEPS.reduce((sum, s) => {
    if (done[s.id]) return sum + s.weight
    if (s.id === 'assets' && assetsActive) return sum + (s.weight * assetProgress) / 100
    return sum
  }, 0)
  const playing = phase === 'playing'
  const [hiddenFor, setHiddenFor] = useState(null)
  const hidden = playing && hiddenFor === joinedAt
  const [shown, setShown] = useState(0)
  const shownRef = useRef(0)
  const targetRef = useRef(target)
  useEffect(() => {
    targetRef.current = target
  })
  useEffect(() => {
    if (hidden) return undefined
    // Counting up again after a dropped connection starts from zero.
    shownRef.current = 0
    let raf = 0
    let last = performance.now()
    let stepStart = last
    let lastTarget = 0
    const tick = (now) => {
      raf = requestAnimationFrame(tick)
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const t = targetRef.current
      if (t !== lastTarget) {
        lastTarget = t
        stepStart = now
      }
      // Up to 6% of fake progress while a step is still running.
      const creep = t >= 100 ? 0 : Math.min(6, ((now - stepStart) / 1000) * 1.5)
      const goal = Math.min(100, t + creep)
      const next = shownRef.current + (goal - shownRef.current) * (1 - Math.exp(-dt * 6))
      shownRef.current = goal - next < 0.05 ? goal : next
      setShown(Math.floor(shownRef.current))
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [hidden])

  // Fade away once the bar reaches 100 and we're in a lobby.
  useEffect(() => {
    if (!playing || shown < 100) return undefined
    const timer = setTimeout(() => setHiddenFor(joinedAt), 650)
    return () => clearTimeout(timer)
  }, [playing, shown, joinedAt])
  if (hidden) return null

  const reconnecting = phase === 'disconnected'
  let status = current?.label ?? 'Let’s ride!'
  if (reconnecting) status = canRetry ? 'Reconnecting…' : error
  else if (error) status = `${error} Retrying…`
  const fading = playing && shown >= 100

  return (
    <div className={`loading-screen fixed inset-0 z-40 flex flex-col items-center justify-center ${fading ? 'loading-out' : ''}`}>
      <div className="loading-rays" />
      <div className="ui-scaled relative flex flex-col items-center">
        <div className="title-text logo-small">+1 DOUBLE JUMP</div>
        <div className="title-text logo-big">BIKE ESCAPE</div>

        <div className="loading-bike mt-6">
          <BikeIcon frame="#ff4f8b" rim="#ffe23a" size={150} />
        </div>

        <div className="loading-bar mt-6">
          <div className="loading-fill" style={{ width: `${shown}%` }} />
          <div className="loading-shine" />
        </div>
        <div className="mt-3 flex w-[620px] items-center justify-between">
          <span className="game-text text-[24px]">{status}</span>
          <span className="title-text text-[40px]">{shown}%</span>
        </div>
        {reconnecting && !canRetry && <div className="game-text mt-2 text-[20px] opacity-90">Reload the page to play here.</div>}
      </div>
    </div>
  )
}

export default LoadingScreen

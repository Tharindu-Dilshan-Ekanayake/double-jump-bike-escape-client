import { create } from 'zustand'

/**
 * Everything the HUD renders, in one zustand store.
 *
 * Written by the network layer (`net/connection.js`) and the local player
 * controller; read by React components. Per-frame data (positions, velocities)
 * deliberately does NOT live here — see `game/localPlayer.js` — so the HUD only
 * re-renders when something it shows actually changes.
 */

const SETTINGS_KEY = 'bike-escape:settings:v2'

function loadSettings() {
  const defaults = { music: true, sfx: true, quality: 'high' }
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }
  } catch {
    return defaults
  }
}

let toastId = 0

export const useGameStore = create((set, get) => ({
  /** @type {'menu'|'connecting'|'playing'|'disconnected'} */
  phase: 'menu',
  error: null,
  /** False after another window took over this profile (don't auto-rejoin). */
  canRetry: true,
  /** True once the 3D world has drawn its first frame. */
  worldReady: false,
  /** When the current lobby was joined (each join fades the loading screen once). */
  joinedAt: 0,
  lobby: null,
  playerCount: 0,
  /** My server-side stats (see PlayerState on the server). Null until joined. */
  me: null,
  /** Riders for the top progress bar: [{ sid, name, progress, isMe, pfp, color }]. */
  racers: [],
  /** Global top-10 lists keyed by stat. */
  leaderboards: { totalSpeed: [], wins: [], rebirths: [], level: [] },

  /** Open modal: { id, props } or null. */
  panel: null,
  /** Windows waiting to open after the current one closes (welcome back, daily reward…). */
  panelQueue: [],
  /** Standing on a treadmill: { label, mult, color, gained, since } (the AFK counter). */
  training: null,
  /** The full-screen rebirth celebration: { rebirths, bonusFrom, bonusTo, treadmills, bikes, at }. */
  rebirthCelebration: null,
  /** Server clock minus ours (ms), for countdowns that the server checks. */
  serverOffset: 0,
  /** An egg hatching on screen: { egg, pet, isNew, at }. */
  hatching: null,
  /** The lucky spin: the last result, the wheel's angle, and when its result was shown. */
  spinResult: null,
  spinAngle: 0,
  spinShown: 0,
  /** After a fall on the course: { gid, islandName, fall, at } (see DeathPrompt). */
  deathPrompt: null,
  /** The island the server agreed to continue from (the controller moves you there). */
  continueTo: 0,
  /** Fell at a gate you're too slow for: { stage, need, have, missing, seconds, pad, padMult, at }. */
  gateFail: null,
  toasts: [],
  levelUp: null,
  /** When the rider last landed on a new island this run (the "GAP CLEARED!" pop). */
  cleared: null,
  /** Mid-air jump counter: { left, max } while airborne, else null. */
  jump: null,
  /** True once the player is past the lobby (shows the progress bar). */
  onCourse: false,
  /** The bike on the stand the rider is standing on (press E to buy / equip), or null. */
  nearBike: null,
  /** Which world the local rider is in (1 or 2). */
  world: 1,
  chat: [],
  chatOpen: false,
  settings: loadSettings(),

  setPhase: (phase, error = null, canRetry = true) => set({ phase, error, canRetry }),

  openPanel: (id, props = {}) => set({ panel: { id, props } }),
  closePanel: (id) => {
    const { panel, panelQueue } = get()
    if (!panel || (id && panel.id !== id)) return
    const [next, ...rest] = panelQueue
    set({ panel: next ?? null, panelQueue: rest })
  },

  /** Opens a window now, or after the ones already open or waiting. */
  queuePanel: (id, props = {}) => {
    const { panel, panelQueue } = get()
    if (!panel) set({ panel: { id, props } })
    else set({ panelQueue: [...panelQueue, { id, props }] })
  },

  toast: (text, kind = 'info', ms = 2600) => {
    const id = ++toastId
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, kind }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms)
  },

  addChat: (entry) =>
    set((s) => ({ chat: [...s.chat.slice(-30), { ...entry, id: ++toastId, at: Date.now() }] })),

  setSetting: (key, value) => {
    const settings = { ...get().settings, [key]: value }
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    } catch {
      // Private mode: settings just won't persist.
    }
    set({ settings })
  },
}))

export const gameState = () => useGameStore.getState()

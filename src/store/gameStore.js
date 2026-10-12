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
  toasts: [],
  levelUp: null,
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
    const { panel } = get()
    if (!panel || (id && panel.id !== id)) return
    set({ panel: null })
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

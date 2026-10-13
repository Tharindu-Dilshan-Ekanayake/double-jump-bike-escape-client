import { Client } from '@colyseus/sdk'

import { sound } from '../audio/sound'
import { getSDK, safeCall } from '../bloxity/sdk'
import { localPlayer } from '../game/playerState'
import { ROOM_NAME, SPIN_REWARDS, describeReward } from '../shared/gameData.js'
import { courseProgress, getLayout, worldIdAt } from '../shared/layout.js'
import { gameState, useGameStore } from '../store/gameStore'
import { spawnGainPopup, spawnRewardPopup } from '../ui/fx'
import { confetti } from '../ui/confetti'
import { rainWins } from '../ui/winsRain'

/**
 * Colyseus connection.
 *
 * `joinOrCreate` puts the player in any lobby with a free seat; Colyseus locks a
 * room at 8 players, so the 9th rider automatically gets a brand new lobby.
 *
 * Where the game server is:
 *  - VITE_SERVER_URL, when set (local testing against a particular server);
 *  - otherwise, when VITE_GAME_ID is set and the page isn't on localhost, the
 *    Bloxity Legion matchmaker: it picks (or starts) a server with room and
 *    returns a relay endpoint pinned to it. Every join resolves again and uses
 *    a fresh Client, as the hosting docs require;
 *  - otherwise ws://<this host>:2567 (`npm run dev` in the server repo).
 */

const GAME_ID = import.meta.env.VITE_GAME_ID || ''
/** Optional matchmaker version, e.g. "preview" to reach the dev backend from your own domain. */
const MATCHMAKER_VERSION = import.meta.env.VITE_MATCHMAKER_VERSION || undefined
const LOCAL_SERVER = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:2567`
const isLocalPage = ['localhost', '127.0.0.1', ''].includes(window.location.hostname)

/** The endpoint to join through: a fixed URL, or a fresh one from the matchmaker. */
async function resolveServer() {
  if (import.meta.env.VITE_SERVER_URL) return import.meta.env.VITE_SERVER_URL
  const sdk = getSDK()
  if (GAME_ID && !isLocalPage && sdk?.net?.resolveEndpoint) {
    const { endpoint } = await sdk.net.resolveEndpoint(GAME_ID, MATCHMAKER_VERSION ? { version: MATCHMAKER_VERSION } : {})
    return endpoint
  }
  return LOCAL_SERVER
}

/** Fields mirrored into `useGameStore().me` for the HUD. */
const ME_FIELDS = [
  'name',
  'level',
  'xp',
  'totalSpeed',
  'wins',
  'rebirths',
  'bikeUpg',
  'bike',
  'trail',
  'aura',
  'owned',
  'padsOwned',
  'items',
  'shop',
  'pass2xSpeed',
  'pass2xWins',
  'dailyAt',
  'dailyStreak',
  'daily',
  'chestAt',
  'bestStage',
  'quests',
  'counters',
  'records',
  'pets',
  'petsEquipped',
  'petIndex',
  'sessionStart',
  'giftsClaimed',
  'spinReadyAt',
  'continueDay',
  'continuesUsed',
  'starTiers',
]

let client = null
/** How long the lucky wheel spins before showing its prize (matches the CSS transition). */
const SPIN_MS = 4200
/** Close code the server uses when it moves riders to a fresh server (see BikeRoom.drainLobbies). */
const MOVE_SERVER_CODE = 4002
let room = null
let lastMeSignature = ''
let racerTimer = null

/** sessionId -> { text, until } — read by RemotePlayers to draw chat bubbles. */
export const chatBubbles = new Map()

export const getRoom = () => room
export const mySessionId = () => room?.sessionId ?? null

export function send(type, payload) {
  room?.send(type, payload)
}

/** What other players need to render our avatar (from the Bloxity session). */
export function avatarPayload(bloxity) {
  return JSON.stringify({
    equipped: bloxity.avatar || null,
    proportions: bloxity.proportions || null,
    pfp: bloxity.identity?.pfp || null,
  })
}

/** A stable id per browser for guests; Bloxity accounts use their own id. */
export function playerUid(user) {
  if (user?._id) return `bx:${user._id}`
  const KEY = 'bike-escape:uid'
  try {
    let uid = localStorage.getItem(KEY)
    if (!uid) {
      uid = `guest:${crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`}`
      localStorage.setItem(KEY, uid)
    }
    return uid
  } catch {
    return `guest:${Math.random().toString(36).slice(2)}`
  }
}

function describeJoinError(err) {
  const message = String(err?.message || err || '')
  if (/fetch|ECONNREFUSED|network|Failed|refused/i.test(message)) {
    return isLocalPage ? `Can't reach the game server at ${LOCAL_SERVER}. Is it running?` : "Can't reach the game servers."
  }
  return message || 'Could not join a lobby.'
}

export async function joinGame({ name, uid, avatar }) {
  const store = gameState()
  if (store.phase === 'connecting') return null
  store.setPhase('connecting')
  try {
    // A new Client for every resolve: each matchmaker endpoint is pinned to one server.
    client = new Client(await resolveServer())
    room = await client.joinOrCreate(ROOM_NAME, { name, uid, avatar })
  } catch (err) {
    console.error('[net] join failed', err)
    store.setPhase('menu', describeJoinError(err))
    return null
  }

  wireRoom(room)
  room.send('hello')
  lastMeSignature = ''
  syncFromState()
  localPlayer.respawn()
  useGameStore.setState({ joinedAt: Date.now() })
  store.setPhase('playing')
  return room
}

export async function leaveGame() {
  const current = room
  room = null
  clearInterval(racerTimer)
  useGameStore.setState({ me: null, lobby: null, racers: [], panel: null })
  await current?.leave().catch(() => {})
  gameState().setPhase('menu')
}

function wireRoom(r) {
  const store = useGameStore

  r.onMessage('welcome', (m) => {
    store.setState({ lobby: { number: m.lobby, roomId: m.roomId, max: m.maxPlayers }, serverOffset: (m.serverTime ?? Date.now()) - Date.now() })
    const sdk = getSDK()
    safeCall(sdk?.game?.updateRoom?.bind(sdk.game), m.roomId, '')
    for (const name of m.roster || []) safeCall(sdk?.game?.playerInRoom?.bind(sdk.game), name)
    // On arrival, one window after another: how to play (first time), what your
    // bike earned while you were away, then today's login reward.
    if (m.isNew) gameState().queuePanel('welcome')
    if (m.offline) gameState().queuePanel('offline', m.offline)
    const me = gameState().me
    if (me && me.dailyAt <= Date.now()) gameState().queuePanel('dailyReward')
  })

  r.onMessage('leaderboards', (boards) => store.setState({ leaderboards: boards }))

  r.onMessage('gain', ({ n, pad }) => {
    spawnGainPopup(n, pad > 1)
    sound.gain()
    // The treadmill counter adds up what this session on the belt has earned.
    const training = gameState().training
    if (training) useGameStore.setState({ training: { ...training, gained: training.gained + n } })
  })

  r.onMessage('levelup', (m) => {
    store.setState({ levelUp: { ...m, at: Date.now() } })
    sound.levelUp()
  })

  r.onMessage('reward', ({ wins }) => {
    // Wins pad: fanfare and confetti, then trophies rain once you're home.
    spawnRewardPopup(`+${wins}`, 'wins')
    confetti(Math.min(2, 0.8 + Math.log10(Math.max(1, wins)) * 0.3))
    sound.fanfare()
    setTimeout(() => rainWins(wins), 900)
  })

  r.onMessage('result', (m) => {
    if (!m.ok) {
      if (m.error) gameState().toast(m.error, 'error')
      sound.error()
      return
    }
    if (m.spin !== undefined && m.spin !== null) {
      // The wheel lands on the server's slot; its prize shows when it stops.
      const SEG = 360 / SPIN_REWARDS.length
      const prev = gameState().spinAngle
      const angle = Math.ceil(prev / 360) * 360 + 5 * 360 + (360 - (m.spin + 0.5) * SEG)
      const at = Date.now()
      useGameStore.setState({ spinResult: { slot: m.spin, reward: m.reward, hatch: m.hatch, at }, spinAngle: angle })
      sound.whoosh()
      setTimeout(() => {
        useGameStore.setState({ spinShown: at })
        if (m.reward?.wins) rainWins(m.reward.wins)
        if (m.reward && !m.reward.egg) spawnRewardPopup(describeReward(m.reward), 'reward')
        if (m.hatch) useGameStore.setState({ hatching: { ...m.hatch, at: Date.now() } })
        sound.fanfare()
      }, SPIN_MS)
      return
    }
    if (m.hatch) {
      useGameStore.setState({ hatching: { ...m.hatch, at: Date.now() } })
      sound.whoosh()
      return
    }
    if (m.continued) {
      useGameStore.setState({ continueTo: m.continued, deathPrompt: null })
      sound.whoosh()
      return
    }
    if (m.reward && !m.reward.egg) spawnRewardPopup(describeReward(m.reward), 'reward')
    if (m.reward?.wins) setTimeout(() => rainWins(m.reward.wins), 300)
    if (m.toast) gameState().toast(m.toast, 'success')
    if (m.celebrate) {
      // Rebirth: the full-screen celebration (see Hud), confetti and a fanfare.
      gameState().closePanel()
      useGameStore.setState({ rebirthCelebration: { ...m.celebrate, at: Date.now() } })
      confetti(2)
      sound.fanfare()
      setTimeout(() => sound.levelUp(), 450)
    } else if (m.rebirth) sound.levelUp()
    else sound.buy()
    // The daily reward window closes itself once claimed.
    if (m.streakDay) gameState().closePanel('dailyReward')
  })

  r.onMessage('needPass', ({ product }) => gameState().openPanel('shop', { highlight: product }))

  // New stars unlocked a star reward (Star Trail, Star Bike…).
  r.onMessage('starReward', ({ total, given }) => {
    for (const tier of given) {
      gameState().toast(`⭐ ${total} stars! ${describeReward(tier)}`, 'success', 4000)
      if (tier.wins) rainWins(tier.wins)
    }
    confetti(1.5)
    sound.fanfare()
  })

  r.onMessage('chat', (m) => {
    gameState().addChat(m)
    chatBubbles.set(m.sid, { text: m.text, until: performance.now() + 6000 })
  })

  r.onMessage('joined', ({ name }) => {
    const sdk = getSDK()
    safeCall(sdk?.game?.playerJoined?.bind(sdk.game), name)
  })

  // Nobody gets a "joined / left the lobby" message; the server still sends it.
  r.onMessage('left', () => {})

  r.onStateChange(() => syncFromState())

  r.onLeave((code, reason) => {
    if (room !== r) return
    room = null
    clearInterval(racerTimer)
    const takenOver = code === 4001
    let message = 'Disconnected from the lobby.'
    if (takenOver) message = reason || 'You joined from another window.'
    // The server is restarting for an update: hop to a fresh one.
    else if (code === MOVE_SERVER_CODE) message = 'Moving you to a new server…'
    useGameStore.setState({ me: null, panel: null })
    gameState().setPhase('disconnected', message, !takenOver)
  })

  clearInterval(racerTimer)
  racerTimer = setInterval(updateRacers, 250)
}

function syncFromState() {
  if (!room) return
  const player = room.state.players?.get(room.sessionId)
  if (!player) return
  const snapshot = {}
  for (const field of ME_FIELDS) snapshot[field] = player[field]
  const signature = JSON.stringify(snapshot)
  const count = room.state.players.size
  const state = gameState()
  if (signature !== lastMeSignature) {
    lastMeSignature = signature
    useGameStore.setState({ me: snapshot })
  }
  if (state.playerCount !== count) useGameStore.setState({ playerCount: count })
}

/** Cached parse of each player's avatar JSON (it rarely changes). */
const avatarCache = new Map()
export function parseAvatar(json) {
  if (!json) return {}
  let value = avatarCache.get(json)
  if (!value) {
    try {
      value = JSON.parse(json) || {}
    } catch {
      value = {}
    }
    avatarCache.set(json, value)
  }
  return value
}

function updateRacers() {
  if (!room) return
  const layout = getLayout()
  const racers = []
  const myWorld = localPlayer.world
  room.state.players.forEach((p, sid) => {
    const isMe = sid === room.sessionId
    const x = isMe ? localPlayer.position.x : p.x
    const z = isMe ? localPlayer.position.z : p.z
    // The bar shows one world's stages, so only riders in that world appear on it.
    if (worldIdAt(x) !== myWorld) return
    racers.push({
      sid,
      name: p.name,
      isMe,
      progress: Math.round(courseProgress(layout, x, z) * 100) / 100,
      pfp: parseAvatar(p.avatar).pfp || null,
    })
  })
  const prev = gameState().racers
  if (JSON.stringify(prev) !== JSON.stringify(racers)) useGameStore.setState({ racers })
}

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Vector3 } from 'three'

import { sound } from '../audio/sound'
import { chatBubbles, mySessionId, send } from '../net/connection'
import {
  DOUBLE_PAD_WINS,
  canUseDoublePad,
  PHYSICS,
  TRAIN_PAD_BY_ID,
  bikeSpeedFor,
  formatDuration,
  formatNumber,
  jumpsFor,
  padUnlocked,
  worldUnlocked,
} from '../shared/gameData.js'
import { LOBBY_FRONT_Z, getLayout, inHazardPit, insideBox, killHeightAt, stageAt, trainPadAt, worldIdAt } from '../shared/layout.js'
import { gameState, useGameStore } from '../store/gameStore'
import { flashScreen, spawnTrickPopup } from '../ui/fx'
import { burst } from './burst'
import { cameraRig } from './cameraRig'
import { hazardTime, touchingHazard } from './hazards'
import { input, moveAxes } from './input'
import { AUTO_JUMP_SPEED, CollisionWorld, stepBodyAuto } from './physics'
import { localPlayer } from './playerState'
import { Rider } from './rider/Rider'
import { trickFor } from './rider/tricks'

const SEND_INTERVAL = 0.05
const COYOTE_TIME = 0.12
/** The "Jump: x/y" counter stays up this long after landing. */
const JUMP_COUNTER_LINGER = 1.4
/** How fast the pedals spin on a treadmill (as if riding at this speed). */
const TREADMILL_PEDAL_SPEED = 18
const _probe = new Vector3()

const angleTowards = (from, to, maxStep) => {
  const diff = Math.atan2(Math.sin(to - from), Math.cos(to - from))
  return from + Math.max(-maxStep, Math.min(maxStep, diff))
}

/** The lobby trigger (shop, stand, portal...) containing the point, if any. */
function triggerAt(layout, x, y, z) {
  for (const t of layout.triggers) if (insideBox(t, x, y, z)) return t
  return null
}

const triggerKey = (t) => (t ? `${t.kind}:${t.id ?? t.bike ?? t.aura ?? t.to ?? ''}` : null)

/** What stepping into a trigger does. Returns a panel to open, or acts directly. */
function enterTrigger(t, store) {
  const key = triggerKey(t)
  switch (t.kind) {
    case 'shop':
      store.openPanel('itemShop', { trigger: key })
      break
    case 'bike':
      // Shown as a "Press E" prompt by the HUD.
      break
    case 'aura':
      store.openPanel('items', { tab: 'auras', highlight: t.aura, trigger: key })
      break
    case 'mailbox':
      store.openPanel('feedback', { trigger: key })
      break
    case 'chest': {
      const wait = (store.me?.chestAt ?? 0) - Date.now()
      if (wait <= 0) send('claim', { what: 'chest' })
      else store.toast(`Group Chest refills in ${formatDuration(wait)}`, 'info', 2200)
      break
    }
    case 'portal':
      if (t.to === 2 && !worldUnlocked(2, store.me)) store.openPanel('worlds', { trigger: key })
      else localPlayer.requestWorld(t.to)
      break
    default:
  }
}

/**
 * The local rider: reads input, runs physics, checks pickups/hazards/triggers,
 * streams the transform to the server and renders the Rider.
 */
export function LocalPlayer() {
  const layout = getLayout()
  const collision = useMemo(() => new CollisionWorld(layout.boxes), [layout])
  const me = useGameStore((s) => s.me)
  const [bubble, setBubble] = useState(null)

  const look = useMemo(
    () => ({ bike: me?.bike ?? 'starter', trail: me?.trail ?? 'none', aura: me?.aura ?? 'none', seed: me?.name }),
    [me?.bike, me?.trail, me?.aura, me?.name],
  )

  const ctl = useRef({
    lastGroundedAt: 0,
    lastJumpAt: 0,
    landedAt: -10,
    usedGroundJump: false,
    fallSpeed: 0,
    sendTimer: 0,
    lastSent: '',
    padKey: null,
    trainId: null,
    trigger: null,
    bannerStage: 0,
    deadUntil: 0,
    teleportAt: 0,
    debugTeleport: import.meta.env.DEV ? Number(new URLSearchParams(window.location.search).get('tp')) || 0 : 0,
  })

  // A new run starts with no stage banners shown yet.
  useEffect(
    () =>
      useGameStore.subscribe((s, prev) => {
        if (s.phase === 'playing' && prev.phase !== 'playing') ctl.current.bannerStage = 0
      }),
    [],
  )

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const c = ctl.current
    const lp = localPlayer
    const store = gameState()
    const now = performance.now() / 1000
    const motion = lp.motion

    // Chat bubble over our own head.
    const b = chatBubbles.get(mySessionId())
    const text = b && b.until > performance.now() ? b.text : null
    if (text !== bubble) setBubble(text)

    if (store.phase !== 'playing') {
      motion.speed = 0
      motion.air = false
      return
    }

    // Dev-only shortcut (?tp=<stage gid>): start on that stage's plateau, once.
    if (c.debugTeleport) {
      const stage = layout.stages.find((st) => st.gid === c.debugTeleport)
      c.debugTeleport = 0
      if (stage) {
        lp.world = stage.world
        lp.position.set(stage.originX, stage.floorY + 0.5, stage.plateauZ0 - 12)
        lp.yaw = Math.PI
        lp.teleportedAt = performance.now()
      }
    }

    const respawn = (worldId = lp.world) => {
      lp.respawn(worldId)
      c.bannerStage = 0
      c.padKey = null
      c.trainId = null
      c.trigger = null
      c.lastSent = ''
      useGameStore.setState({ onCourse: false, jump: null, world: worldId })
    }

    if (lp.wantsWorld) {
      const to = lp.wantsWorld
      lp.wantsWorld = 0
      sound.whoosh()
      flashScreen('teleport')
      respawn(to)
      store.closePanel()
      store.toast(to === 2 ? 'Welcome to World 2!' : 'Back to World 1', 'success', 2000)
    }
    if (lp.wantsTeleport) {
      lp.wantsTeleport = false
      sound.whoosh()
      flashScreen('teleport')
      respawn()
    }
    if (c.teleportAt && now >= c.teleportAt) {
      c.teleportAt = 0
      flashScreen('teleport')
      respawn()
    }
    if (c.deadUntil) {
      if (now < c.deadUntil) return
      c.deadUntil = 0
      respawn()
    }

    const level = store.me?.level ?? 1
    const maxJumps = jumpsFor(level)
    // A rebirth mid-air drops the level; never keep more jumps than it allows.
    lp.jumpsLeft = Math.min(lp.jumpsLeft, maxJumps)
    const maxSpeed = Math.min(bikeSpeedFor(level, store.me?.bikeUpg ?? 0), PHYSICS.maxMoveSpeed)

    // --- Steering: camera-relative, the bike turns smoothly towards the input.
    const { forward, strafe } = store.chatOpen ? { forward: 0, strafe: 0 } : moveAxes()
    const camYaw = cameraRig.yaw
    const mx = -Math.sin(camYaw) * forward + Math.cos(camYaw) * strafe
    const mz = -Math.cos(camYaw) * forward - Math.sin(camYaw) * strafe
    const amount = Math.min(1, Math.hypot(mx, mz))
    if (amount > 0.05) lp.yaw = angleTowards(lp.yaw, Math.atan2(mx, mz), dt * 9)

    // On a treadmill with no input: face the console and pedal in place.
    const onBelt = lp.grounded ? trainPadAt(layout, lp.position.x, lp.position.y, lp.position.z) : null
    const treadmill = onBelt && amount <= 0.05
    if (treadmill) lp.yaw = angleTowards(lp.yaw, Math.PI, dt * 4)

    // The bike rolls the way it faces, so turning carves instead of strafing.
    const targetSpeed = amount > 0.05 ? maxSpeed * amount : 0
    const accel = lp.grounded ? 7 : 3.5
    const k = 1 - Math.exp(-accel * dt)
    lp.velocity.x += (Math.sin(lp.yaw) * targetSpeed - lp.velocity.x) * k
    lp.velocity.z += (Math.cos(lp.yaw) * targetSpeed - lp.velocity.z) * k

    // --- Jumping: ground jump, then mid-air jumps until the counter runs out.
    const groundJump = () => {
      lp.velocity.y = PHYSICS.jumpVelocity
      lp.grounded = false
      lp.jumpsLeft = maxJumps - 1
      c.usedGroundJump = true
      c.lastJumpAt = now
      motion.jumpAt = now
      sound.jump()
      send('jump')
    }
    // Everything a mid-air jump does besides the velocity (physics may fire it).
    const onAirJump = () => {
      lp.flips = (lp.flips + 1) & 0xffff
      motion.flips = lp.flips
      spawnTrickPopup(trickFor(lp.flips))
      c.lastJumpAt = now
      sound.airJump()
      send('jump', { air: true })
      burst(lp.position, { color: '#ffffff', count: 12, speed: 7, up: 1, life: 0.45, gravity: 2 })
    }
    const airJump = () => {
      lp.velocity.y = PHYSICS.jumpVelocity
      lp.jumpsLeft -= 1
      onAirJump()
    }
    const canGroundJump = lp.grounded || (now - c.lastGroundedAt < COYOTE_TIME && !c.usedGroundJump)
    if (input.jumpPressed) {
      input.jumpPressed = false
      if (canGroundJump) groundJump()
      else if (lp.jumpsLeft > 0) airJump()
    } else if (input.jumpHeld) {
      // Holding jump climbs: each jump fires just before the top of the last one
      // (the physics step below fires it at the exact moment; this catches a
      // hold that starts while already falling).
      if (lp.grounded && now - c.landedAt > 0.06) groundJump()
      else if (!lp.grounded && lp.velocity.y < AUTO_JUMP_SPEED && lp.jumpsLeft > 0 && now - c.lastJumpAt > 0.15) airJump()
    }

    // --- Physics.
    c.fallSpeed = Math.max(c.fallSpeed, -lp.velocity.y)
    const auto = input.jumpHeld && !store.chatOpen ? { left: lp.jumpsLeft } : null
    const { landed, jumped } = stepBodyAuto(collision, lp, dt, auto)
    if (jumped) {
      lp.jumpsLeft = auto.left
      onAirJump()
    }
    if (lp.grounded) {
      c.lastGroundedAt = now
      c.usedGroundJump = false
      lp.jumpsLeft = maxJumps
    }
    if (landed) {
      c.landedAt = now
      if (c.fallSpeed > 30) {
        motion.landAt = now
        sound.land()
        burst(lp.position, { color: '#e8e8e8', count: 14, speed: 8, up: 2, life: 0.5, gravity: 6 })
      }
      c.fallSpeed = 0
    }

    const { x, y, z } = lp.position
    lp.world = worldIdAt(x)

    // --- Hazards: a laser, or falling into a gap, sends you all the way back to the lobby.
    const fell = inHazardPit(layout, x, y, z)
    if (fell || touchingHazard(layout, lp.position, hazardTime()) || y < killHeightAt()) {
      c.deadUntil = now + 0.7
      lp.velocity.set(0, 0, 0)
      motion.speed = 0
      sound.death()
      flashScreen('death')
      burst(_probe.set(x, y + 2, z), { color: fell ? '#ffb21f' : '#ff4040', count: 40, speed: 12, up: 8, life: 0.9, gravity: 18 })
      store.toast(fell ? '😵 You fell! Back to the lobby!' : 'Oops! Back to the start!', 'error', 1800)
      useGameStore.setState({ jump: null })
      return
    }

    // --- Win pads: Return (+wins, back to the lobby) and 2x Wins.
    let pad = null
    if (lp.grounded) for (const p of layout.pads) if (insideBox(p, x, y, z, 0.2)) pad = p
    const padKey = pad ? `${pad.stage}:${pad.kind}` : null
    if (padKey !== c.padKey) {
      c.padKey = padKey
      if (pad && !c.teleportAt) {
        sendMoveNow(c)
        send('pad', { stage: pad.stage, kind: pad.kind })
        if (pad.kind === 'return' || canUseDoublePad(store.me)) {
          c.teleportAt = now + 0.35
          sound.whoosh()
        } else {
          store.toast(`Hold ${DOUBLE_PAD_WINS} Wins to use the 2x pad!`, 'info', 2200)
        }
      }
    }

    // --- Treadmills.
    if ((onBelt?.id ?? null) !== c.trainId) {
      c.trainId = onBelt?.id ?? null
      if (onBelt && store.me) {
        const def = TRAIN_PAD_BY_ID[onBelt.id]
        if (padUnlocked(def, store.me)) store.toast(`${formatNumber(def.mult)}x Speed treadmill!`, 'success', 1600)
        else if (def.world === 2 && !worldUnlocked(2, store.me)) store.toast('Unlock World 2 first!', 'error', 1800)
        else if (def.wins) store.openPanel('pad', { pad: def.id, trigger: `pad:${def.id}` })
        else store.toast(`Needs Rebirth ${def.rebirths}+`, 'error', 1800)
      }
    }

    // --- Shops, stands, portals and the chest act while you stand in them.
    const t = triggerAt(layout, x, y, z)
    const key = triggerKey(t)
    if (key !== c.trigger) {
      const previous = c.trigger
      c.trigger = key
      const nearBike = t?.kind === 'bike' ? t.bike : null
      if (store.nearBike !== nearBike) useGameStore.setState({ nearBike })
      const open = store.panel
      if (previous && open?.props?.trigger === previous) store.closePanel()
      if (t) enterTrigger(t, store)
    }

    // --- A chime the first time each stage is reached this run.
    const stage = stageAt(layout, x, z)
    if (stage && stage.gid > c.bannerStage && z <= stage.plateauZ0 - 1 && y >= stage.floorY - 0.5) {
      c.bannerStage = stage.gid
      sound.win()
    }
    const onCourse = z < LOBBY_FRONT_Z
    if (onCourse !== store.onCourse || lp.world !== store.world) useGameStore.setState({ onCourse, world: lp.world })

    // --- "Jump: 7/11" while airborne and for a moment after landing.
    const showJumps = !lp.grounded || (now - c.landedAt < JUMP_COUNTER_LINGER && c.lastJumpAt > c.landedAt - 3)
    const jumpView = showJumps ? { left: lp.jumpsLeft, max: maxJumps } : null
    const current = store.jump
    if (jumpView?.left !== current?.left || jumpView?.max !== current?.max) useGameStore.setState({ jump: jumpView })

    // --- Visual motion for the Rider.
    motion.position.copy(lp.position)
    motion.yaw = lp.yaw
    motion.speed = treadmill ? TREADMILL_PEDAL_SPEED : Math.hypot(lp.velocity.x, lp.velocity.z)
    motion.air = !lp.grounded
    // Chain clicks once per half pedal turn while riding on the ground.
    if (lp.grounded && motion.speed > 3 && !treadmill) {
      c.chainDist = (c.chainDist || 0) + motion.speed * dt
      if (c.chainDist > 4.5) {
        c.chainDist = 0
        sound.chain(motion.speed)
      }
    }

    c.sendTimer += dt
    if (c.sendTimer >= SEND_INTERVAL) {
      c.sendTimer = 0
      sendMoveNow(c)
    }
  })

  return <Rider motion={localPlayer.motion} look={look} isLocal bubble={bubble} />
}

/** Streams the transform; skipped when nothing changed since the last send. */
function sendMoveNow(c) {
  const lp = localPlayer
  const payload = {
    x: Math.round(lp.position.x * 100) / 100,
    y: Math.round(lp.position.y * 100) / 100,
    z: Math.round(lp.position.z * 100) / 100,
    r: Math.round(lp.yaw * 1000) / 1000,
    s: Math.round(lp.motion.speed * 10) / 10,
    a: lp.grounded ? 0 : 1,
    f: lp.flips,
  }
  const key = `${payload.x},${payload.y},${payload.z},${payload.r},${payload.s},${payload.a},${payload.f}`
  if (key === c.lastSent) return
  c.lastSent = key
  send('move', payload)
}

export default LocalPlayer

import { useFrame } from '@react-three/fiber'
import { Component, Suspense, useEffect, useMemo, useRef } from 'react'
import { Mesh, MeshBasicMaterial, SphereGeometry, Vector3 } from 'three'

import { burst } from '../burst'
import PlayerAvatar from '../PlayerAvatar'
import { ringBurst } from '../rings'
import { textSprite } from '../world/signs'
import { createBlockyAvatar } from './blockyAvatar'
import { BIKE, createBike } from './bikeModel'
import { AuraEffect, TireStreak, TrailRibbon } from './effects'
import { AVATAR_HEIGHT, AVATAR_OFFSET, AVATAR_SCALE, computeRiderPose, createRiderPose } from './riderPose'
import { TRICKS, TRICK_DURATION, easeInOut, trickFor } from './tricks'

// Dev-only switches: ?blocky forces the fallback avatar, ?posedebug draws the IK targets.
const DEV_PARAMS = import.meta.env.DEV ? new URLSearchParams(window.location.search) : null
const FORCE_BLOCKY = Boolean(DEV_PARAMS?.has('blocky'))
const POSE_DEBUG = Boolean(DEV_PARAMS?.has('posedebug'))

/** Height of the flip/lean pivot (roughly the rider's centre of mass). */
const PIVOT_Y = 2.1
const REAR_WHEEL = new Vector3(0, 0.55, -1.8)
const REAR_CONTACT = new Vector3(0, 0, -1.55)
/** Fastest the pedals turn (radians/sec), so legs don't blur at top speed. */
const MAX_CADENCE = 26
const TRICK_BY_ID = Object.fromEntries(TRICKS.map((trick) => [trick.id, trick]))

const UP = new Vector3(0, 1, 0)

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a))

/** Falls back to the blocky avatar if the Bloxity avatar can't load. */
class AvatarBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(err) {
    console.warn('[rider] avatar failed to load, using blocky avatar', err)
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function BlockyRider({ seed, poseRef }) {
  const avatar = useMemo(() => createBlockyAvatar(seed), [seed])
  const pose = useMemo(() => createRiderPose(), [])
  useEffect(() => () => avatar.dispose(), [avatar])
  useFrame(() => avatar.applyPose(computeRiderPose(poseRef.current, pose)))
  return <primitive object={avatar.group} />
}

/** Dev aid: dots at every IK joint (hips/knees/feet red, shoulders/elbows/hands blue). */
function PoseDebug({ poseRef }) {
  const pose = useMemo(() => createRiderPose(), [])
  const dots = useMemo(
    () =>
      ['#ff3030', '#ff9a30', '#ffe030', '#ff3030', '#ff9a30', '#ffe030', '#3060ff', '#30c0ff', '#30ffe0', '#3060ff', '#30c0ff', '#30ffe0'].map((color) => {
        const dot = new Mesh(new SphereGeometry(0.22, 10, 8), new MeshBasicMaterial({ color, depthTest: false }))
        dot.renderOrder = 10
        return dot
      }),
    [],
  )
  useFrame(() => {
    computeRiderPose(poseRef.current, pose)
    const points = [pose.legL, pose.legR, pose.armL, pose.armR].flatMap((l) => [l.root, l.joint, l.end])
    points.forEach((point, i) => dots[i].position.copy(point))
  })
  return (
    <group scale={AVATAR_SCALE}>
      {dots.map((dot, i) => (
        <primitive key={i} object={dot} />
      ))}
    </group>
  )
}

/**
 * Per-frame rider animation: wheel spin, pedalling, wing flaps, flips, lean,
 * wheelie, landing squash, plus trail/aura updates.
 */
function stepRider(ctx, camera, delta) {
  const { motion, bike, trail, streak, aura, anchor, anim: a, pose, root, pivot, content } = ctx
  if (!root || !pivot || !content) return
  const dt = Math.min(delta, 0.05)
  const now = performance.now() / 1000

  root.position.copy(motion.position)
  root.rotation.y = motion.yaw

  // Wheels and pedals roll forward with the bike.
  a.wheel += (motion.speed * dt) / BIKE.wheelRadius
  bike.wheels[0].rotation.x = a.wheel
  bike.wheels[1].rotation.x = a.wheel
  // Pedals turn with the rear wheel (about a 2:1 gear), capped so fast riding
  // stays readable; they freewheel in the air.
  if (!motion.air) a.pedal += Math.min(motion.speed * 0.55, MAX_CADENCE) * dt
  bike.crank.rotation.x = a.pedal
  for (const pedal of bike.pedals) pedal.rotation.x = -a.pedal
  for (const wing of bike.wings) {
    const flap = motion.air ? Math.sin(now * 16) * 0.5 : Math.sin(now * 3) * 0.12
    wing.pivot.rotation.z = wing.side * (0.2 + flap)
  }

  // Tricks: every mid-air jump queues the next one (from the synced jump
  // counter); spamming chains them and speeds them up.
  const flipsDelta = (motion.flips - a.lastFlips) & 0xffff
  if (flipsDelta > 0 && flipsDelta < 64) {
    // Double-jump ring burst, in the trick's colours.
    const [c1, c2] = trickFor(motion.flips).colors ?? ['#ffffff', '#ffffff']
    ringBurst(motion.position, { color: c1, from: 1.5, to: 9, life: 0.5, lift: 0.4 })
    ringBurst(motion.position, { color: '#ffffff', from: 0.8, to: 5, life: 0.32, lift: 0.5, solid: true, opacity: 0.9 })
    burst(motion.position, { color: c2, count: 10, speed: 9, up: 1, life: 0.45, gravity: 2 })
    for (let k = flipsDelta - 1; k >= 0; k -= 1) {
      if (a.queue.length < 2) a.queue.push(trickFor(motion.flips - k).id)
    }
  }
  a.lastFlips = motion.flips
  if (!a.trick && a.queue.length) {
    a.trick = a.queue.shift()
    a.trickT = 0
  }
  let spinX = 0
  let spinY = 0
  let spinZ = 0
  let whip = 0
  let trickPose = null
  let trickAmt = 0
  if (a.trick) {
    const trick = TRICK_BY_ID[a.trick]
    a.trickT = Math.min(1, a.trickT + (dt / TRICK_DURATION) * (motion.air ? 1 : 3) * (a.queue.length ? 1.6 : 1))
    const turn = Math.PI * 2 * easeInOut(a.trickT)
    const swing = Math.sin(Math.PI * a.trickT)
    // Pose tricks only lean a little (`once`); spins go all the way round.
    const amount = trick.once ? swing * Math.PI * 0.5 : turn
    spinX = trick.spin[0] * amount
    spinY = trick.spin[1] * amount
    spinZ = trick.spin[2] * amount
    if (trick.whip) whip = turn
    trickPose = trick.pose ?? null
    trickAmt = swing
    if (a.trickT >= 1) a.trick = null
  }

  // Lean into turns.
  const yawRate = wrapAngle(motion.yaw - a.prevYaw) / Math.max(dt, 1e-4)
  a.prevYaw = motion.yaw
  const leanTarget = Math.max(-0.45, Math.min(0.45, -yawRate * 0.09 * Math.min(motion.speed / 25, 1.6)))
  a.lean += (leanTarget - a.lean) * (1 - Math.exp(-dt * 7))

  // Wheelie on take-off, squash on landing.
  const jumpAge = now - motion.jumpAt
  const wheelie = jumpAge < 0.4 ? -Math.sin((jumpAge / 0.4) * Math.PI) * 0.32 : 0
  const landAge = now - motion.landAt
  const power = motion.landPower ?? 0.6
  if (motion.landAt !== a.lastLandAt) {
    a.lastLandAt = motion.landAt
    if (landAge < 0.3) {
      // Dust kicked up on touchdown, bigger for harder landings.
      ringBurst(motion.position, { color: '#efe3c8', from: 1, to: 4 + 5 * power, life: 0.55, lift: 0.15, solid: true, opacity: 0.6 })
      burst(motion.position, { color: '#eadfc8', count: Math.round(10 + 16 * power), speed: 6 + 6 * power, up: 1.5, life: 0.6, gravity: 5 })
    }
  }
  const squash = landAge < 0.28 ? Math.sin((landAge / 0.28) * Math.PI) * (0.07 + 0.1 * power) : 0

  // Stopped on the ground: one foot down and the bike tips a little that way.
  const stopped = !motion.air && motion.speed < 0.6 ? 1 : 0
  a.idle += (stopped - a.idle) * (1 - Math.exp(-dt * 6))

  // Nose dips a touch as the landing squashes the forks.
  pivot.rotation.set(spinX + wheelie + squash * 0.4, spinY, a.lean - a.idle * 0.12 + spinZ)
  bike.group.rotation.y = whip
  content.scale.set(1 + squash * 0.5, 1 - squash, 1 + squash * 0.5)

  pose.pedal = a.pedal
  pose.air = motion.air
  pose.speed = motion.speed
  pose.idle = a.idle
  pose.trick = trickPose
  pose.trickAmt = trickAmt
  pose.time = now

  // Cosmetics: a failing effect must never stop the frame (and with it the
  // rider's controls), so each one is isolated and reported once.
  safely('aura', () => aura.update(now))
  anchor.copy(REAR_WHEEL).applyAxisAngle(UP, motion.yaw).add(motion.position)
  safely('trail', () => trail.update(anchor, camera, motion.speed > 2))
  anchor.copy(REAR_CONTACT).applyAxisAngle(UP, motion.yaw).add(motion.position)
  safely('streak', () => streak.update(anchor, motion.speed > 2, now))
}

const reportedEffects = new Set()
function safely(name, run) {
  try {
    run()
  } catch (err) {
    if (reportedEffects.has(name)) return
    reportedEffects.add(name)
    console.error(`[rider] ${name} effect failed; skipping it`, err)
  }
}

/**
 * A player on their bike: avatar, bike, trail, aura and name tag.
 *
 * `motion` is a mutable object ({ position, yaw, speed, air, flips, jumpAt,
 * landAt }) written by the local controller or the remote interpolator; this
 * component turns it into wheel spin, pedalling, leaning, wheelies, landing
 * squash and the mid-air flips.
 *
 * `look` = { bike, trail, aura, equipped, proportions, seed, level, speed, crown }. For the local
 * player `equipped` is undefined, so the avatar comes from the Bloxity session.
 */
export function Rider({ motion, look, name, isLocal = false, bubble, onAvatarReady }) {
  const root = useRef(null)
  const pivot = useRef(null)
  const content = useRef(null)
  const poseRef = useRef({ riding: true, pedal: 0, air: false, time: 0, speed: 0, idle: 0 })
  const anim = useRef({
    wheel: 0,
    pedal: 0,
    lean: 0,
    prevYaw: motion.yaw,
    lastFlips: motion.flips,
    trick: null,
    trickT: 0,
    queue: [],
    idle: 0,
    lastLandAt: motion.landAt,
  })

  const bike = useMemo(() => createBike(look.bike), [look.bike])
  useEffect(() => () => bike.dispose(), [bike])

  const trail = useMemo(() => new TrailRibbon('none'), [])
  const streak = useMemo(() => new TireStreak(), [])
  useEffect(() => () => streak.dispose(), [streak])
  const aura = useMemo(() => new AuraEffect(), [])
  useEffect(() => trail.setTrail(look.trail), [trail, look.trail])
  useEffect(() => aura.setAura(look.aura), [aura, look.aura])
  useEffect(
    () => () => {
      trail.dispose()
      aura.dispose()
    },
    [trail, aura],
  )


  // Other riders' tags: name, then level and total speed, coloured by level;
  // the fastest rider in the lobby wears a crown.
  const { crown } = look
  const nameTag = useMemo(() => {
    if (isLocal || !name) return null
    const lines = [{ text: crown ? `👑 ${name}` : name, size: 44, fill: crown ? ['#fff3a0', '#ffb21f'] : '#ffffff' }]
    const sprite = textSprite(lines, { height: lines.length > 1 ? 2.4 : 1.25, padding: 8, gap: 2 })
    sprite.position.y = lines.length > 1 ? 7.6 : 7
    return sprite
  }, [isLocal, name, crown])

  const bubbleSprite = useMemo(() => {
    if (!bubble) return null
    const sprite = textSprite([{ text: bubble, size: 40, stroke: null, fill: '#1d1d26' }], {
      height: 1.6,
      padding: 16,
      background: 'rgba(255,255,255,0.95)',
      radius: 30,
    })
    sprite.position.y = isLocal ? 7.2 : 8.6
    return sprite
  }, [bubble, isLocal])

  useEffect(
    () => () => {
      nameTag?.material.map.dispose()
      nameTag?.material.dispose()
    },
    [nameTag],
  )
  useEffect(
    () => () => {
      bubbleSprite?.material.map.dispose()
      bubbleSprite?.material.dispose()
    },
    [bubbleSprite],
  )

  const anchor = useMemo(() => new Vector3(), [])

  useFrame((state, delta) => {
    stepRider({ motion, bike, trail, streak, aura, anchor, anim: anim.current, pose: poseRef.current, root: root.current, pivot: pivot.current, content: content.current }, state.camera, delta)
  })

  const seed = look.seed || name || 'rider'

  return (
    <>
      <group ref={root}>
        <group ref={pivot} position={[0, PIVOT_Y, 0]}>
          <group ref={content} position={[0, -PIVOT_Y, 0]}>
            <primitive object={bike.group} />
            <group position={AVATAR_OFFSET}>
              {POSE_DEBUG && isLocal && <PoseDebug poseRef={poseRef} />}
              {FORCE_BLOCKY ? (
                <BlockyRider seed={seed} poseRef={poseRef} />
              ) : (
              <AvatarBoundary fallback={<BlockyRider seed={seed} poseRef={poseRef} />}>
                <Suspense fallback={<BlockyRider seed={seed} poseRef={poseRef} />}>
                  <PlayerAvatar
                    motionRef={poseRef}
                    targetHeight={AVATAR_HEIGHT}
                    equipped={isLocal ? undefined : look.equipped ?? null}
                    proportions={isLocal ? undefined : look.proportions}
                    reportLoading={isLocal}
                    onReady={onAvatarReady}
                  />
                </Suspense>
              </AvatarBoundary>
              )}
            </group>
          </group>
        </group>
        <primitive object={aura.group} />
        {nameTag && <primitive object={nameTag} />}
        {bubbleSprite && <primitive object={bubbleSprite} />}
      </group>
      <primitive object={trail.mesh} />
      <primitive object={streak.mesh} />
    </>
  )
}

export default Rider

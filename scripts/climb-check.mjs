// Headless check (npm run check:climb): simulates the real controller physics
// for every stage. Each stage is across a gap: its gate's Speed must clear it
// even when jumping a little before the edge, and `1 - gates.tolerance` of that
// Speed must fall into the river even with a perfect jump right at the edge.
// (Lasers are ignored.) Gates and tolerance come from config/balance.ts.
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = process.argv[2] || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const imp = (p) => import(pathToFileURL(path.join(root, p)).href)
const { PHYSICS, bikeSpeedFor, formatNumber, jumpsFor, levelForSpeed } = await imp('src/shared/gameData.js')
const { BALANCE } = await imp('config/balance.ts')
const { gapReach, getLayout, inHazardPit } = await imp('src/shared/layout.js')
const { AUTO_JUMP_SPEED, CollisionWorld, stepBodyAuto } = await imp('src/game/physics.js')

const layout = getLayout()
const world = new CollisionWorld(layout.boxes)
const DT = 1 / 60

/**
 * Rides towards the stage at full speed and holds jump (the controller's
 * hold-to-jump rule) from `lead` studs before the take-off point.
 */
function attempt(stage, totalSpeed, lead) {
  const maxJumps = jumpsFor(levelForSpeed(totalSpeed))
  const speed = Math.min(bikeSpeedFor(totalSpeed), PHYSICS.maxMoveSpeed)
  const takeoffZ = stage.hasPit ? stage.zStart : stage.wallZ + 12
  const body = { position: { x: stage.originX, y: stage.prevTop + 0.01, z: takeoffZ + 30 }, velocity: { x: 0, y: 0, z: 0 }, grounded: true }
  let jumpsLeft = maxJumps
  let lastJump = -10
  let landedAt = 0
  for (let t = 0; t < 60; t += DT) {
    body.velocity.x = 0
    body.velocity.z = -speed
    const holding = body.position.z - takeoffZ < lead
    if (holding) {
      if (body.grounded && t - landedAt > 0.06) {
        body.velocity.y = PHYSICS.jumpVelocity
        body.grounded = false
        jumpsLeft = maxJumps - 1
        lastJump = t
      } else if (!body.grounded && body.velocity.y < AUTO_JUMP_SPEED && jumpsLeft > 0 && t - lastJump > 0.15) {
        body.velocity.y = PHYSICS.jumpVelocity
        jumpsLeft -= 1
        lastJump = t
      }
    }
    const auto = holding ? { left: jumpsLeft } : null
    const step = stepBodyAuto(world, body, DT, auto)
    if (step.jumped) {
      jumpsLeft = auto.left
      lastJump = t
    }
    if (step.landed) landedAt = t
    if (body.grounded) jumpsLeft = maxJumps
    const { x, y, z } = body.position
    if (inHazardPit(layout, x, y, z)) return false
    if (body.grounded && z < stage.wallZ - 1 && y >= stage.floorY - 0.05) return true
    // Climbing: stuck at the foot of the wall with nothing left.
    if (!stage.hasPit && body.grounded && lastJump > 0 && t - lastJump > 1.5) return false
  }
  return false
}

let ok = true
const low = 1 - BALANCE.gates.tolerance
for (const stage of layout.stages) {
  const rise = stage.floorY - stage.prevTop
  // Jumping early costs distance: allow up to half the spare reach, at most 4 studs.
  const early = Math.min(4, (gapReach(stage.speed, rise) - stage.gap) / 2)
  const at = attempt(stage, stage.speed, early)
  const below = attempt(stage, stage.speed * low, 0.5)
  const good = at && !below
  if (!good) ok = false
  const speed = (v) => `⚡${formatNumber(v)}`.padEnd(8)
  console.log(
    `W${stage.world} ${String(stage.index).padStart(2)} ${stage.name.padEnd(17)} gap ${String(stage.gap).padStart(4)}  ${speed(stage.speed)} ${at ? 'makes it' : 'FAILS   '}  ${speed(stage.speed * low)} ${below ? 'MAKES IT' : 'falls'}${good ? '' : '   <-- check'}`,
  )
}
console.log(ok ? `Every gate needs its Speed (${Math.round(low * 100)}% of it falls short).` : 'Some gates are off.')
if (!ok) process.exitCode = 1

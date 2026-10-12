import { PHYSICS } from '../shared/gameData.js'
import { HALF_WIDTH } from '../shared/layout.js'

/**
 * Moving lasers and spinning sweeper bars.
 *
 * The same functions place the meshes (World) and test hits (the controller),
 * so what you see is exactly what kills you. Time is local seconds; hazards don't
 * need to be in sync between players because collisions are checked locally.
 */

export const hazardTime = () => performance.now() / 1000

export const sweepLaserZ = (laser, t) => laser.zCenter + laser.amplitude * Math.sin(laser.speed * t + laser.phase)

export const verticalLaserY = (laser, t) =>
  laser.yMin + (laser.yMax - laser.yMin) * (0.5 + 0.5 * Math.sin(laser.speed * t + laser.phase))

export const sweeperAngle = (sweeper, t) => sweeper.phase + sweeper.speed * t

/** Forgiving body size: lasers only kill on a clear touch. */
const BODY_RADIUS = PHYSICS.radius * 0.7
const BEAM = 0.3

export function touchingHazard(layout, pos, t) {
  const feet = pos.y + 0.3
  const head = pos.y + PHYSICS.height - 0.5

  for (const laser of layout.lasers) {
    // Both worlds share the same Z range; only lasers in this world count.
    if (Math.abs(pos.x - laser.originX) > (laser.halfWidth ?? HALF_WIDTH) + 2) continue
    if (laser.type === 'sweep') {
      if (Math.abs(pos.z - laser.zCenter) > laser.amplitude + 3) continue
      if (laser.y < feet || laser.y > head) continue
      if (Math.abs(pos.z - sweepLaserZ(laser, t)) < BODY_RADIUS + BEAM) return true
    } else {
      if (Math.abs(pos.z - laser.z) > BODY_RADIUS + BEAM) continue
      const y = verticalLaserY(laser, t)
      if (y > feet && y < head) return true
    }
  }

  for (const sweeper of layout.sweepers) {
    const [cx, cy, cz] = sweeper.center
    if (Math.abs(pos.z - cz) > sweeper.radius + 2) continue
    if (cy < feet || cy > head) continue
    const angle = sweeperAngle(sweeper, t)
    const dx = Math.cos(angle)
    const dz = Math.sin(angle)
    const px = pos.x - cx
    const pz = pos.z - cz
    if (Math.abs(px * dx + pz * dz) > sweeper.radius) continue
    if (Math.abs(px * dz - pz * dx) < BODY_RADIUS + BEAM) return true
  }
  return false
}

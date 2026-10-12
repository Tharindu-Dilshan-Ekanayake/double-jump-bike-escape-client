import { PHYSICS } from '../shared/gameData.js'
import { AUTO_JUMP_FIRE_SPEED } from '../shared/layout.js'

/**
 * Axis-aligned box collision for a rider.
 *
 * The whole world is boxes, so a small custom solver beats a physics engine here:
 * it is deterministic, steps up small ledges like Roblox, and lets a player slide
 * up a wall face while multi-jumping (the core move of the game).
 *
 * The rider is an upright box: `radius` wide on X/Z, `height` tall, with
 * `position` at the feet.
 */

const CELL = 16
const EPS = 1e-4
const MAX_SUBSTEP = 0.45

export class CollisionWorld {
  constructor(boxes) {
    this.boxes = boxes.filter((b) => b.solid)
    /** "cx,cz" -> indices of boxes overlapping that grid cell */
    this.grid = new Map()
    this.stamp = new Uint32Array(this.boxes.length)
    this.query = 0
    this.boxes.forEach((b, i) => {
      for (let cx = Math.floor(b.min[0] / CELL); cx <= Math.floor(b.max[0] / CELL); cx += 1) {
        for (let cz = Math.floor(b.min[2] / CELL); cz <= Math.floor(b.max[2] / CELL); cz += 1) {
          const key = `${cx},${cz}`
          let list = this.grid.get(key)
          if (!list) this.grid.set(key, (list = []))
          list.push(i)
        }
      }
    })
    this.results = []
    this.scratch = []
  }

  /** Boxes whose XZ footprint may overlap the given rectangle. */
  near(minX, maxX, minZ, maxZ, out = this.results) {
    this.query += 1
    out.length = 0
    for (let cx = Math.floor(minX / CELL); cx <= Math.floor(maxX / CELL); cx += 1) {
      for (let cz = Math.floor(minZ / CELL); cz <= Math.floor(maxZ / CELL); cz += 1) {
        const list = this.grid.get(`${cx},${cz}`)
        if (!list) continue
        for (const i of list) {
          if (this.stamp[i] === this.query) continue
          this.stamp[i] = this.query
          out.push(this.boxes[i])
        }
      }
    }
    return out
  }

  /** True if a rider standing at (x, y, z) would intersect any solid box. */
  blocked(x, y, z) {
    const r = PHYSICS.radius
    // Own scratch list: this runs while a caller is iterating `results`.
    for (const b of this.near(x - r, x + r, z - r, z + r, this.scratch)) {
      if (overlaps(b, x, y, z)) return true
    }
    return false
  }
}

function overlaps(b, x, y, z) {
  const r = PHYSICS.radius
  return (
    x - r < b.max[0] - EPS &&
    x + r > b.min[0] + EPS &&
    z - r < b.max[2] - EPS &&
    z + r > b.min[2] + EPS &&
    y < b.max[1] - EPS &&
    y + PHYSICS.height > b.min[1] + EPS
  )
}

/**
 * Advances `body` ({ position, velocity, grounded }) by `dt`, resolving collisions.
 * Gravity is applied here; horizontal velocity is whatever the controller set.
 * Returns true if the body landed this step.
 */
export function stepBody(world, body, dt) {
  const v = body.velocity
  // Move with the average of the start and end velocities: exact under constant
  // gravity, so a jump peaks at the same height whatever the frame rate.
  const vy0 = v.y
  v.y = Math.max(v.y - PHYSICS.gravity * dt, -PHYSICS.maxFallSpeed)
  const vyMove = (vy0 + v.y) / 2
  const travel = Math.max(Math.abs(v.x), Math.abs(vyMove), Math.abs(v.z)) * dt
  const steps = Math.min(16, Math.max(1, Math.ceil(travel / MAX_SUBSTEP)))
  const h = dt / steps
  const wasGrounded = body.grounded
  let grounded = false
  for (let i = 0; i < steps; i += 1) {
    moveHorizontal(world, body, 0, v.x * h, wasGrounded || grounded)
    moveHorizontal(world, body, 2, v.z * h, wasGrounded || grounded)
    // A collision zeroes v.y; stop rising/falling for the rest of the step too.
    if (moveVertical(world, body, (v.y === 0 ? 0 : vyMove) * h)) grounded = true
  }
  body.grounded = grounded
  return grounded && !wasGrounded
}

export const AUTO_JUMP_SPEED = AUTO_JUMP_FIRE_SPEED

/**
 * `stepBody` for a rider holding jump: if the rider's rising speed crosses
 * AUTO_JUMP_SPEED part-way through the step, the step is split and the next jump
 * fires at exactly that instant. That keeps hold-to-jump flights identical at
 * any frame rate (and equal to `gapReach` in layout.js).
 *
 * `auto` is `{ left }` (mid-air jumps remaining) or null when jump isn't held;
 * `left` is decremented when a jump fires. Returns `{ landed, jumped }`.
 */
export function stepBodyAuto(world, body, dt, auto) {
  const vy = body.velocity.y
  const crossing = (vy - AUTO_JUMP_SPEED) / PHYSICS.gravity
  if (!auto || auto.left <= 0 || body.grounded || vy < AUTO_JUMP_SPEED || crossing >= dt) {
    return { landed: stepBody(world, body, dt), jumped: false }
  }
  let landed = stepBody(world, body, crossing)
  if (body.grounded) return { landed, jumped: false }
  body.velocity.y = PHYSICS.jumpVelocity
  auto.left -= 1
  landed = stepBody(world, body, dt - crossing) || landed
  return { landed, jumped: true }
}

const AXES = ['x', 'y', 'z']

function moveHorizontal(world, body, axis, delta, canStep) {
  if (delta === 0) return
  const p = body.position
  const key = AXES[axis]
  p[key] += delta
  const r = PHYSICS.radius
  for (const b of world.near(p.x - r, p.x + r, p.z - r, p.z + r)) {
    if (!overlaps(b, p.x, p.y, p.z)) continue
    // Small ledge: step up onto it instead of stopping, like Roblox characters.
    const rise = b.max[1] - p.y
    if (canStep && rise > 0 && rise <= PHYSICS.stepHeight && !world.blocked(p.x, b.max[1] + EPS, p.z)) {
      p.y = b.max[1]
      continue
    }
    p[key] = delta > 0 ? b.min[axis] - r - EPS * 2 : b.max[axis] + r + EPS * 2
    body.velocity[key] = 0
  }
}

function moveVertical(world, body, delta) {
  const p = body.position
  p.y += delta
  const r = PHYSICS.radius
  let landed = false
  for (const b of world.near(p.x - r, p.x + r, p.z - r, p.z + r)) {
    if (!overlaps(b, p.x, p.y, p.z)) continue
    if (delta <= 0) {
      p.y = b.max[1]
      landed = true
    } else {
      p.y = b.min[1] - PHYSICS.height - EPS * 2
    }
    body.velocity.y = 0
  }
  return landed
}

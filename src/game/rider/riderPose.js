import { Quaternion, Vector3 } from 'three'

import { BIKE } from './bikeModel'

/**
 * Seated riding pose, solved with 2-bone IK so the feet stay on the pedals and
 * the hands grip the handlebar while the rider leans over the bike.
 *
 * Everything is worked out in the Bloxity rig's own units (player.glb is 6.4
 * tall: hips at 2.4, knees 1.2, shoulders 4.8, elbows 3.6) and returned as the
 * direction each limb segment should point. `applyAim` turns those directions
 * into bone rotations for either avatar (the Bloxity rig or the blocky one),
 * so neither depends on how its bones' local axes happen to be oriented.
 */

export const RIG = Object.freeze({
  height: 6.4,
  hipY: 2.4,
  hipX: 0.6,
  thigh: 1.2,
  shin: 1.2,
  shoulder: [2.0, 4.8, 0.4],
  upperArm: 1.2,
  forearm: 1.2,
})

/** Rider height in studs; everything rig-side is scaled by this. */
export const AVATAR_HEIGHT = 5
export const AVATAR_SCALE = AVATAR_HEIGHT / RIG.height

/** Where the avatar's origin (its feet in bind pose) sits so the hips rest on the saddle. */
export const AVATAR_OFFSET = Object.freeze([0, BIKE.saddle[1] + 0.1 - RIG.hipY * AVATAR_SCALE, BIKE.saddle[2]])

const BASE_LEAN = 0.5
const SPEED_LEAN = 0.14
const FOOT_X = 0.42
/** Sole above the pedal's centre. */
const FOOT_LIFT = 0.06

export const UP = Object.freeze(new Vector3(0, 1, 0))
export const DOWN = Object.freeze(new Vector3(0, -1, 0))

const _a = new Vector3()
const _b = new Vector3()
const _c = new Vector3()

/** Bike-space point -> rig space. */
function toRig(out, x, y, z) {
  return out.set((x - AVATAR_OFFSET[0]) / AVATAR_SCALE, (y - AVATAR_OFFSET[1]) / AVATAR_SCALE, (z - AVATAR_OFFSET[2]) / AVATAR_SCALE)
}

/**
 * Two-bone IK: the middle joint for a chain rooted at `root` reaching `target`,
 * bending towards `pole` (a direction). Writes the joint into `out`.
 */
function solveJoint(out, root, target, upper, lower, pole) {
  const dir = _a.subVectors(target, root)
  const d = Math.min(Math.max(dir.length(), 0.01), upper + lower - 0.001)
  dir.normalize()
  const along = (upper * upper - lower * lower + d * d) / (2 * d)
  const h = Math.sqrt(Math.max(upper * upper - along * along, 0))
  const bend = _b.copy(pole).addScaledVector(dir, -pole.dot(dir))
  if (bend.lengthSq() < 1e-6) bend.set(0, 0, 1)
  bend.normalize()
  return out.copy(root).addScaledVector(dir, along).addScaledVector(bend, h)
}

function makeLimb() {
  return { root: new Vector3(), joint: new Vector3(), end: new Vector3(), upper: new Vector3(), lower: new Vector3() }
}

function limb(l, upper, lower, pole) {
  solveJoint(l.joint, l.root, l.end, upper, lower, pole)
  l.upper.subVectors(l.joint, l.root).normalize()
  l.lower.subVectors(l.end, l.joint).normalize()
}

export function createRiderPose() {
  return {
    lean: BASE_LEAN,
    spine: new Vector3(0, 1, 0),
    neck: new Vector3(0, 1, 0),
    legL: makeLimb(),
    legR: makeLimb(),
    armL: makeLimb(),
    armR: makeLimb(),
  }
}

const _pole = new Vector3()

/**
 * Where hands and feet go during a trick pose (bike space, `side` is +1 for the
 * left limb), blended in by `motion.trickAmt`. Missing entries keep the normal
 * riding position.
 */
const TRICK_FEET = {
  superman: (side) => [side * 0.5, 2.5, -2.5],
  tailwhip: (side) => [side * 1.2, 1.5, -0.1],
  cancan: (side) => (side > 0 ? [2, 1.5, 0.5] : null),
}
const TRICK_HANDS = {
  nohander: (side) => [side * 1.45, 5.3, -0.4],
}

const blend = (from, to, t) => from + (to - from) * t

/**
 * @param {{ pedal: number, speed?: number, idle?: number, trick?: string, trickAmt?: number }} motion
 *   `pedal` is the crank's rotation.x; `idle` (0..1) puts the left foot down;
 *   `trick` names a pose in TRICK_FEET / TRICK_HANDS, blended in by `trickAmt`.
 */
export function computeRiderPose(motion, pose) {
  const speedRatio = Math.min((motion.speed || 0) / 40, 1)
  const lean = BASE_LEAN + SPEED_LEAN * speedRatio
  pose.lean = lean
  pose.spine.set(0, Math.cos(lean), Math.sin(lean))
  pose.neck.set(0, Math.cos(lean * 0.2), Math.sin(lean * 0.2))
  const idle = motion.idle || 0
  const trickAmt = motion.trickAmt || 0
  const feetFor = trickAmt > 0 ? TRICK_FEET[motion.trick] : null
  const handsFor = trickAmt > 0 ? TRICK_HANDS[motion.trick] : null

  for (const side of [1, -1]) {
    // Legs: hip to the pedal, knees pushed forward and a touch outward.
    const leg = side > 0 ? pose.legL : pose.legR
    leg.root.set(side * RIG.hipX, RIG.hipY, 0)
    const crank = motion.pedal + (side > 0 ? 0 : Math.PI)
    let fx = side * FOOT_X
    let fy = BIKE.bottomBracket[1] - BIKE.crankLength * Math.cos(crank) + FOOT_LIFT
    let fz = BIKE.bottomBracket[2] - BIKE.crankLength * Math.sin(crank)
    if (side > 0 && idle > 0) {
      // Stopped: left foot down on the ground beside the bike.
      fx += (1.05 - fx) * idle
      fy += (0.02 - fy) * idle
      fz += (BIKE.bottomBracket[2] + 0.15 - fz) * idle
    }
    const trickFoot = feetFor?.(side)
    if (trickFoot) {
      fx = blend(fx, trickFoot[0], trickAmt)
      fy = blend(fy, trickFoot[1], trickAmt)
      fz = blend(fz, trickFoot[2], trickAmt)
    }
    toRig(leg.end, fx, fy, fz)
    limb(leg, RIG.thigh, RIG.shin, _pole.set(side * 0.25, 0, 1))

    // Arms: shoulders ride forward with the lean; hands on the grips, elbows out.
    const arm = side > 0 ? pose.armL : pose.armR
    const [sx, sy, sz] = RIG.shoulder
    const ry = sy - RIG.hipY
    arm.root.set(side * sx, RIG.hipY + ry * Math.cos(lean) - sz * Math.sin(lean), ry * Math.sin(lean) + sz * Math.cos(lean))
    const trickHand = handsFor?.(side)
    toRig(
      arm.end,
      blend(side * BIKE.grip[0], trickHand?.[0] ?? 0, trickHand ? trickAmt : 0),
      blend(BIKE.grip[1], trickHand?.[1] ?? 0, trickHand ? trickAmt : 0),
      blend(BIKE.grip[2], trickHand?.[2] ?? 0, trickHand ? trickAmt : 0),
    )
    limb(arm, RIG.upperArm, RIG.forearm, _pole.set(side, -0.35, -0.7))
  }
  return pose
}

/* ---------------------------------------------------------------------------
 * Applying the pose
 * ------------------------------------------------------------------------- */

const _q = new Quaternion()
const _inv = new Quaternion()

/**
 * Rotates a bone so its rest segment direction (`restDir`, in the avatar's space
 * at bind pose, alongside its bind rotation `bindQ`) points along `dir`.
 * `parentQ` is the parent's current avatar-space rotation; the bone's new
 * avatar-space rotation is written to `outQ` and its local rotation to the bone.
 */
export function applyAim(object, parentQ, bindQ, restDir, dir, outQ) {
  _q.setFromUnitVectors(restDir, _c.copy(dir).normalize())
  outQ.copy(_q).multiply(bindQ)
  object.quaternion.copy(_inv.copy(parentQ).invert().multiply(outQ))
  return outQ
}

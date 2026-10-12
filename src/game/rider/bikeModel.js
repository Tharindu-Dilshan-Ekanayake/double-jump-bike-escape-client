import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Euler,
  ExtrudeGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { BIKE_BY_ID } from '../../shared/gameData.js'
import { getGlowTexture } from '../world/textures'

/**
 * Procedural BMX bikes. Local +Z is forward, the origin is on the ground between
 * the wheels. Units are studs (a rider is ~5 tall).
 *
 * Every bike is built from many small parts, but they're merged per material
 * into a handful of meshes (wheels, crank and pedals stay separate so they can
 * spin), and materials are shared between bikes of the same kind. That keeps a
 * lobby full of riders and display bikes cheap to draw.
 */
export const BIKE = Object.freeze({
  wheelRadius: 0.95,
  rearHub: [0, 0.95, -1.55],
  frontHub: [0, 0.95, 1.6],
  bottomBracket: [0, 0.82, -0.08],
  crankLength: 0.42,
  /** Top of the saddle; the rider's hips sit just above it. */
  saddle: [0, 2.0, -0.95],
  /** Grip centre; x is the half-width of the handlebar. */
  grip: [1.02, 2.85, 1.5],
})

const UP = new Vector3(0, 1, 0)
const _a = new Vector3()
const _b = new Vector3()
const _m = new Matrix4()
const _q = new Quaternion()
const _e = new Euler()
const _p = new Vector3()
const _s = new Vector3()

/* ---------------------------------------------------------------------------
 * Merging parts
 * ------------------------------------------------------------------------- */

/** Collects transformed part geometries per material, then merges them into meshes. */
class Parts {
  constructor() {
    this.buckets = new Map()
  }

  /** Adds a geometry placed at `pos`, turned by `rot` (Euler) or `quat`, scaled by `scale`. */
  add(geometry, material, { pos = [0, 0, 0], rot = null, quat = null, scale = null } = {}) {
    if (quat) _q.copy(quat)
    else _q.setFromEuler(_e.set(rot?.[0] ?? 0, rot?.[1] ?? 0, rot?.[2] ?? 0))
    _p.set(pos[0], pos[1], pos[2])
    if (typeof scale === 'number') _s.setScalar(scale)
    else _s.set(scale?.[0] ?? 1, scale?.[1] ?? 1, scale?.[2] ?? 1)
    geometry.applyMatrix4(_m.compose(_p, _q, _s))
    const flat = geometry.index ? geometry.toNonIndexed() : geometry
    if (flat !== geometry) geometry.dispose()
    let list = this.buckets.get(material)
    if (!list) {
      list = []
      this.buckets.set(material, list)
    }
    list.push(flat)
    return this
  }

  /** A round tube from a to b. */
  tube(a, b, radius, material, segments = 10) {
    _a.set(a[0], a[1], a[2])
    _b.set(b[0], b[1], b[2])
    const dir = _b.clone().sub(_a)
    const geo = new CylinderGeometry(radius, radius, dir.length(), segments)
    const quat = new Quaternion().setFromUnitVectors(UP, dir.normalize())
    const mid = _a.clone().add(_b).multiplyScalar(0.5)
    return this.add(geo, material, { pos: [mid.x, mid.y, mid.z], quat })
  }

  /** Hands every part over to `other`, shifted by `offset` (merging sub-assemblies). */
  moveInto(other, offset) {
    for (const [material, list] of this.buckets) for (const g of list) other.add(g, material, { pos: offset })
    this.buckets.clear()
  }

  /** Merges everything into `parent` (one mesh per material). */
  build(parent, { castShadow = true } = {}) {
    for (const [material, list] of this.buckets) {
      const merged = mergeGeometries(list, false)
      for (const g of list) g.dispose()
      if (!merged) continue
      const mesh = new Mesh(merged, material)
      mesh.castShadow = castShadow && !material.userData.noShadow
      parent.add(mesh)
    }
    this.buckets.clear()
    return parent
  }
}

/* ---------------------------------------------------------------------------
 * Shared materials and textures
 * ------------------------------------------------------------------------- */

const materialCache = new Map()
const textureCache = new Map()
const SHARED = new Set()

const shared = (material) => {
  SHARED.add(material)
  return material
}

function starTexture(key) {
  if (textureCache.has(key)) return textureCache.get(key)
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const g = canvas.getContext('2d')
  g.fillStyle = '#5b2bd9'
  g.fillRect(0, 0, 128, 128)
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 70; i += 1) {
    g.fillStyle = ['#ffffff', '#ff9df5', '#9fe8ff'][i % 3]
    g.fillRect(rnd() * 128, rnd() * 128, 2.5, 2.5)
  }
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  textureCache.set(key, texture)
  return texture
}

function plateTexture(text, color) {
  const key = `plate:${text}:${color}`
  if (textureCache.has(key)) return textureCache.get(key)
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 192
  const g = canvas.getContext('2d')
  g.fillStyle = '#ffffff'
  g.beginPath()
  if (g.roundRect) g.roundRect(8, 8, 240, 176, 40)
  else g.rect(8, 8, 240, 176)
  g.fill()
  g.lineWidth = 12
  g.strokeStyle = color
  g.stroke()
  g.font = '700 132px "Fredoka", sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = color
  g.fillText(text, 128, 104)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  textureCache.set(key, texture)
  return texture
}

const RAINBOW_HUES = [0, 35, 55, 130, 200, 270]

/** Materials for one kind of bike, created once and shared by every copy. */
function materialsFor(def) {
  if (materialCache.has(def.id)) return materialCache.get(def.id)
  const glow = Boolean(def.glow)
  const frameMap = def.extra === 'stars' ? starTexture(def.id) : null
  const mats = {
    frame: new MeshStandardMaterial({
      color: frameMap ? '#ffffff' : def.frame,
      map: frameMap,
      roughness: def.metal ? 0.25 : 0.38,
      metalness: def.metal ? 0.6 : 0.25,
      emissive: glow ? def.frame : def.metal ? '#5a3b00' : '#000000',
      emissiveIntensity: glow ? 0.45 : def.metal ? 0.25 : 0,
      emissiveMap: frameMap,
    }),
    accent: new MeshStandardMaterial({ color: def.accent, roughness: 0.4, metalness: 0.15, emissive: glow ? def.accent : '#000000', emissiveIntensity: glow ? 0.7 : 0 }),
    rim: new MeshStandardMaterial({ color: def.rim, roughness: 0.3, metalness: 0.45, emissive: glow ? def.rim : '#000000', emissiveIntensity: glow ? 0.9 : 0 }),
    tire: new MeshStandardMaterial({ color: '#1c1d22', roughness: 0.95 }),
    sidewall: new MeshStandardMaterial({ color: '#3a3d46', roughness: 0.9 }),
    chrome: new MeshStandardMaterial({ color: '#d5dae2', roughness: 0.22, metalness: 0.75 }),
    dark: new MeshStandardMaterial({ color: '#25272d', roughness: 0.7 }),
    rainbow: def.extra === 'rainbow'
      ? RAINBOW_HUES.map((h) => new MeshStandardMaterial({ color: `hsl(${h}, 90%, 58%)`, roughness: 0.38, emissive: `hsl(${h}, 90%, 40%)`, emissiveIntensity: 0.3 }))
      : null,
  }
  if (glow || def.metal) {
    mats.underglow = new MeshBasicMaterial({
      map: getGlowTexture(),
      color: def.rim,
      transparent: true,
      opacity: 0.55,
      blending: AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
    mats.underglow.userData.noShadow = true
  }
  for (const m of Object.values(mats)) {
    if (Array.isArray(m)) m.forEach(shared)
    else if (m) shared(m)
  }
  materialCache.set(def.id, mats)
  return mats
}

/* ---------------------------------------------------------------------------
 * Parts
 * ------------------------------------------------------------------------- */

/** A knobby BMX wheel: tyre with tread blocks, rim, 20 thin spokes, hub and axle pegs. */
function buildWheel(parts, mats, { pegs = true, cog = false } = {}) {
  const R = BIKE.wheelRadius
  const side = [0, Math.PI / 2, 0]
  parts.add(new TorusGeometry(R - 0.15, 0.16, 12, 40), mats.tire, { rot: side })
  parts.add(new TorusGeometry(R - 0.27, 0.05, 6, 36), mats.sidewall, { rot: side })
  for (let k = 0; k < 26; k += 1) {
    const a = (k / 26) * Math.PI * 2
    const r = R - 0.03
    parts.add(new BoxGeometry(0.26, 0.09, 0.13), mats.tire, { pos: [0, Math.cos(a) * r, Math.sin(a) * r], rot: [-a, 0, 0] })
  }
  parts.add(new TorusGeometry(R - 0.33, 0.065, 6, 36), mats.rim, { rot: side })
  for (let k = 0; k < 20; k += 1) {
    const a = (k / 20) * Math.PI * 2
    const r = R - 0.36
    const hubX = k % 2 ? 0.1 : -0.1
    parts.tube([hubX, Math.cos(a + 0.2) * 0.12, Math.sin(a + 0.2) * 0.12], [0, Math.cos(a) * r, Math.sin(a) * r], 0.012, mats.chrome, 4)
  }
  parts.add(new CylinderGeometry(0.14, 0.14, 0.3, 12), mats.chrome, { rot: [0, 0, Math.PI / 2] })
  if (pegs) {
    for (const s of [1, -1]) parts.add(new CylinderGeometry(0.1, 0.1, 0.42, 10), mats.chrome, { pos: [s * 0.36, 0, 0], rot: [0, 0, Math.PI / 2] })
  }
  if (cog) {
    parts.add(new CylinderGeometry(0.17, 0.17, 0.04, 14), mats.accent, { pos: [0.19, 0, 0], rot: [0, 0, Math.PI / 2] })
  }
}

function wingShape(bat) {
  const s = new Shape()
  if (bat) {
    s.moveTo(0, 0)
    s.lineTo(0.5, 0.55)
    s.lineTo(1.2, 1.0)
    s.lineTo(1.9, 1.15)
    s.lineTo(1.6, 0.7)
    s.lineTo(1.75, 0.35)
    s.lineTo(1.25, 0.45)
    s.lineTo(1.2, 0.05)
    s.lineTo(0.75, 0.25)
    s.lineTo(0.5, -0.1)
  } else {
    s.moveTo(0, 0)
    s.quadraticCurveTo(0.6, 0.9, 1.9, 1.25)
    s.lineTo(1.75, 0.95)
    s.lineTo(1.95, 0.8)
    s.lineTo(1.6, 0.6)
    s.lineTo(1.75, 0.42)
    s.lineTo(1.3, 0.3)
    s.lineTo(1.4, 0.12)
    s.quadraticCurveTo(0.6, -0.05, 0, 0)
  }
  return new ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: false })
}

const wingMaterials = new Map()
function wingMaterial(key, make) {
  if (!wingMaterials.has(key)) wingMaterials.set(key, shared(make()))
  return wingMaterials.get(key)
}

function wings(parent, material, bat) {
  const result = []
  for (const side of [1, -1]) {
    const pivot = new Group()
    pivot.position.set(0.2 * side, 2.3, -0.95)
    const wing = new Mesh(wingShape(bat), material)
    wing.scale.set(side, 1, 1)
    wing.castShadow = true
    pivot.add(wing)
    pivot.rotation.y = side * -0.35
    parent.add(pivot)
    result.push({ pivot, side })
  }
  return result
}

/** Static extras for each bike's theme (wings are added separately, they flap). */
function buildExtras(parts, def, mats) {
  const BB = BIKE.bottomBracket
  const HTb = [0, 1.72, 1.12]
  switch (def.extra) {
    case 'wings': {
      const halo = wingMaterial('halo', () => new MeshStandardMaterial({ color: '#ffe27a', emissive: '#ffd23f', emissiveIntensity: 0.9 }))
      parts.add(new TorusGeometry(0.5, 0.05, 6, 24), halo, { pos: [0, 2.85, 1.15], rot: [Math.PI / 2, 0, 0] })
      break
    }
    case 'dragon':
      for (const side of [1, -1]) parts.add(new CylinderGeometry(0, 0.09, 0.5, 6), mats.accent, { pos: [side * 0.3, 2.75, 1.16], rot: [0, 0, side * -0.35] })
      break
    case 'ufo': {
      const ring = wingMaterial('ufoRing', () => new MeshStandardMaterial({ color: '#9aa7b8', metalness: 0.6, roughness: 0.3 }))
      const bulb = wingMaterial('ufoBulb', () => new MeshBasicMaterial({ color: '#36f0ff', toneMapped: false }))
      parts.add(new TorusGeometry(2.2, 0.16, 8, 40), ring, { pos: [0, 0.55, 0], rot: [Math.PI / 2, 0, 0] })
      for (let i = 0; i < 12; i += 1) {
        const a = (i / 12) * Math.PI * 2
        parts.add(new SphereGeometry(0.11, 8, 6), bulb, { pos: [Math.cos(a) * 2.2, 0.72, Math.sin(a) * 2.2] })
      }
      break
    }
    case 'plate': {
      const plate = wingMaterial(`plate:${def.id}`, () => new MeshStandardMaterial({ map: plateTexture('67', def.frame), roughness: 0.5 }))
      parts.add(new PlaneGeometry(0.75, 0.56), plate, { pos: [0, 2.15, 1.3] })
      break
    }
    case 'fin':
      parts.add(new ConeGeometry(0.5, 1.1, 4), mats.frame, { pos: [0, 2.55, -0.25], rot: [-0.35, 0, 0], scale: [0.25, 1, 1] })
      break
    case 'horns':
      for (const side of [1, -1]) parts.add(new ConeGeometry(0.1, 0.55, 6), mats.accent, { pos: [side * 0.3, 2.95, 1.15], rot: [0, 0, side * -0.4] })
      break
    case 'crown':
      for (let i = 0; i < 5; i += 1) {
        const a = (i / 5) * Math.PI * 2
        parts.add(new ConeGeometry(0.08, 0.35, 6), mats.accent, { pos: [Math.cos(a) * 0.32, 2.95, Math.sin(a) * 0.32 + 1.15] })
      }
      parts.add(new TorusGeometry(0.34, 0.07, 6, 20), mats.accent, { pos: [0, 2.8, 1.15], rot: [Math.PI / 2, 0, 0] })
      break
    case 'flames':
    case 'flamewings': {
      const flame = wingMaterial(`flame:${def.accent}`, () => new MeshBasicMaterial({ color: def.accent, toneMapped: false }))
      for (let i = 0; i < 4; i += 1) {
        parts.add(new ConeGeometry(0.16, 0.7 - i * 0.1, 6), flame, { pos: [i % 2 ? 0.18 : -0.18, 1.25 + i * 0.05, -2.25 - i * 0.18], rot: [-1.35, 0, 0] })
      }
      break
    }
    case 'crystals': {
      const crystal = wingMaterial(`crystal:${def.rim}`, () => new MeshStandardMaterial({ color: def.rim, emissive: def.rim, emissiveIntensity: 0.5, roughness: 0.2 }))
      for (const [x, y, z, s] of [
        [0, 2.2, -0.6, 0.3],
        [0.25, 1.4, 0.5, 0.22],
        [-0.25, 1.4, 0.5, 0.22],
        [0, 1.1, -1.4, 0.25],
      ]) {
        parts.add(new OctahedronGeometry(s, 0), crystal, { pos: [x, y, z], scale: [0.7, 1.6, 0.7] })
      }
      break
    }
    case 'stripes':
      for (let i = 0; i < 5; i += 1) {
        const t = (i + 0.5) / 5
        parts.add(new TorusGeometry(0.135, 0.035, 6, 12), mats.accent, {
          pos: [0, BB[1] + (HTb[1] - BB[1]) * t, BB[2] + (HTb[2] - BB[2]) * t],
          rot: [Math.atan2(HTb[2] - BB[2], HTb[1] - BB[1]), 0, 0],
        })
      }
      break
    default:
  }
}

/* ---------------------------------------------------------------------------
 * Bike
 * ------------------------------------------------------------------------- */

/**
 * Builds a bike. Returns the root group plus the parts the rider animates.
 * `still: true` (display stands) merges the wheels and crank in too, since
 * they never spin. Call `dispose()` when swapping bikes.
 */
export function createBike(bikeId, { still = false } = {}) {
  const def = BIKE_BY_ID[bikeId] || BIKE_BY_ID.starter
  const mats = materialsFor(def)
  const group = new Group()
  group.name = `bike:${def.id}`
  const frame = new Parts()

  let hue = 0
  const frameMat = () => (mats.rainbow ? mats.rainbow[hue++ % mats.rainbow.length] : mats.frame)

  const RH = BIKE.rearHub
  const FH = BIKE.frontHub
  const BB = BIKE.bottomBracket
  const ST = [0, 1.82, -0.72]
  const HTt = [0, 2.1, 1.0]
  const HTb = [0, 1.72, 1.12]

  // Frame: chunky BMX tubes, a gusset under the head tube and a sleeve decal.
  frame.tube(BB, ST, 0.1, frameMat())
  frame.tube(ST, HTt, 0.1, frameMat())
  frame.tube(BB, HTb, 0.12, frameMat())
  frame.tube(HTb, [0, HTt[1] + 0.06, HTt[2] - 0.03], 0.135, frameMat())
  frame.tube([0, HTt[1] - 0.18, HTt[2] - 0.32], [0, HTb[1] - 0.12, HTb[2] - 0.3], 0.07, frameMat())
  const sleeveA = [BB[0], BB[1] + (HTb[1] - BB[1]) * 0.35, BB[2] + (HTb[2] - BB[2]) * 0.35]
  const sleeveB = [BB[0], BB[1] + (HTb[1] - BB[1]) * 0.62, BB[2] + (HTb[2] - BB[2]) * 0.62]
  frame.tube(sleeveA, sleeveB, 0.128, mats.accent)
  frame.add(new CylinderGeometry(0.16, 0.16, 0.34, 14), mats.chrome, { pos: BB, rot: [0, 0, Math.PI / 2] })
  for (const side of [1, -1]) {
    const stays = frameMat()
    frame.tube([0.17 * side, RH[1], RH[2]], [0.08 * side, BB[1], BB[2]], 0.055, stays)
    frame.tube([0.17 * side, RH[1], RH[2]], [0.06 * side, ST[1] - 0.05, ST[2]], 0.05, stays)
    // Fork legs down to the front axle.
    frame.tube([0.16 * side, HTb[1] - 0.02, HTb[2] + 0.02], [0.16 * side, FH[1], FH[2]], 0.07, mats.accent)
  }
  frame.add(new BoxGeometry(0.46, 0.12, 0.26), mats.accent, { pos: [0, HTb[1] - 0.04, HTb[2] + 0.02] })

  // Chain: from the chainring round to the rear cog (right side).
  frame.tube([0.19, BB[1] + 0.3, BB[2]], [0.19, RH[1] + 0.17, RH[2]], 0.025, mats.dark, 5)
  frame.tube([0.19, BB[1] - 0.3, BB[2]], [0.19, RH[1] - 0.17, RH[2]], 0.025, mats.dark, 5)

  // Seat post and a rounded saddle.
  frame.tube(ST, [0, BIKE.saddle[1] - 0.08, BIKE.saddle[2] + 0.08], 0.055, mats.chrome)
  frame.add(new SphereGeometry(0.5, 16, 10), mats.dark, { pos: [0, BIKE.saddle[1] - 0.07, BIKE.saddle[2]], rot: [-0.06, 0, 0], scale: [0.5, 0.17, 0.95] })

  // Stem, riser bar with crossbar, grips with flanges.
  const [gx, gy, gz] = BIKE.grip
  const stemTop = [0, gy - 0.12, gz - 0.08]
  frame.tube(HTt, stemTop, 0.07, mats.chrome)
  frame.add(new BoxGeometry(0.3, 0.16, 0.3), mats.dark, { pos: stemTop })
  frame.tube([-gx + 0.2, gy - 0.05, gz], [gx - 0.2, gy - 0.05, gz], 0.055, mats.chrome)
  frame.tube([-0.38, stemTop[1] + 0.02, stemTop[2]], [0.38, stemTop[1] + 0.02, stemTop[2]], 0.05, mats.accent)
  for (const side of [1, -1]) {
    frame.tube([side * 0.36, stemTop[1], stemTop[2]], [side * 0.58, gy - 0.05, gz], 0.05, mats.chrome)
    frame.tube([side * (gx - 0.26), gy - 0.05, gz], [side * (gx + 0.13), gy - 0.05, gz], 0.09, mats.dark)
    frame.add(new CylinderGeometry(0.13, 0.13, 0.04, 12), mats.accent, { pos: [side * (gx - 0.27), gy - 0.05, gz], rot: [0, 0, Math.PI / 2] })
    frame.add(new CylinderGeometry(0.1, 0.1, 0.05, 12), mats.accent, { pos: [side * (gx + 0.14), gy - 0.05, gz], rot: [0, 0, Math.PI / 2] })
  }

  buildExtras(frame, def, mats)
  if (mats.underglow) frame.add(new PlaneGeometry(4.6, 3.4), mats.underglow, { pos: [0, 0.06, 0], rot: [-Math.PI / 2, 0, 0] })

  // Wheels.
  const rear = new Group()
  rear.position.set(RH[0], RH[1], RH[2])
  const front = new Group()
  front.position.set(FH[0], FH[1], FH[2])

  // Crank: a toothed chainring and arms; pedals counter-rotate to stay level.
  const crank = new Group()
  crank.position.set(BB[0], BB[1], BB[2])
  const crankParts = new Parts()
  crankParts.add(new CylinderGeometry(0.31, 0.31, 0.04, 20), mats.accent, { pos: [0.19, 0, 0], rot: [0, 0, Math.PI / 2] })
  for (let k = 0; k < 18; k += 1) {
    const a = (k / 18) * Math.PI * 2
    crankParts.add(new BoxGeometry(0.035, 0.07, 0.07), mats.accent, { pos: [0.19, Math.cos(a) * 0.34, Math.sin(a) * 0.34], rot: [-a, 0, 0] })
  }
  crankParts.add(new CylinderGeometry(0.12, 0.12, 0.06, 10), mats.chrome, { pos: [0.21, 0, 0], rot: [0, 0, Math.PI / 2] })
  for (const side of [1, -1]) {
    crankParts.add(new BoxGeometry(0.08, BIKE.crankLength, 0.1), mats.chrome, { pos: [0.24 * side, (-BIKE.crankLength / 2) * side, 0] })
  }
  const pedals = []
  for (const side of [1, -1]) {
    const pedal = new Group()
    pedal.position.set(0.38 * side, -BIKE.crankLength * side, 0)
    const pedalParts = new Parts()
    pedalParts.add(new BoxGeometry(0.36, 0.07, 0.26), mats.dark)
    for (const [px, pz] of [[-0.13, -0.09], [0.13, -0.09], [-0.13, 0.09], [0.13, 0.09]]) {
      pedalParts.add(new CylinderGeometry(0.018, 0.018, 0.12, 4), mats.chrome, { pos: [px, 0, pz] })
    }
    if (still) {
      pedalParts.moveInto(crankParts, [0.38 * side, -BIKE.crankLength * side, 0])
    } else {
      pedalParts.build(pedal)
      crank.add(pedal)
      pedals.push(pedal)
    }
  }

  const rearParts = new Parts()
  buildWheel(rearParts, mats, { cog: true })
  const frontParts = new Parts()
  buildWheel(frontParts, mats)
  if (still) {
    // Display bikes never move: one set of merged meshes for the whole bike.
    rearParts.moveInto(frame, RH)
    frontParts.moveInto(frame, FH)
    crankParts.moveInto(frame, BB)
    frame.build(group)
  } else {
    rearParts.build(rear)
    frontParts.build(front)
    crankParts.build(crank)
    frame.build(group)
    group.add(rear, front, crank)
  }

  // Flapping wings.
  let wingParts = []
  if (def.extra === 'wings') {
    wingParts = wings(group, wingMaterial('angel', () => new MeshStandardMaterial({ color: '#ffffff', roughness: 0.6, emissive: '#fff4c8', emissiveIntensity: 0.25, side: DoubleSide })), false)
  } else if (def.extra === 'dragon') {
    wingParts = wings(group, wingMaterial('dragon', () => new MeshStandardMaterial({ color: '#3aa14a', roughness: 0.55, side: DoubleSide })), true)
  } else if (def.extra === 'flamewings') {
    wingParts = wings(
      group,
      wingMaterial(`flamewing:${def.id}`, () => new MeshStandardMaterial({ color: def.frame, emissive: def.accent, emissiveIntensity: 0.6, side: DoubleSide })),
      false,
    )
  }

  return {
    group,
    def,
    wheels: [front, rear],
    crank,
    pedals,
    wings: wingParts,
    dispose() {
      // Materials and textures are shared between bikes; only geometry is per bike.
      group.traverse((node) => {
        node.geometry?.dispose()
        if (node.material && !SHARED.has(node.material)) node.material.dispose()
      })
    },
  }
}

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  Points,
  PointsMaterial,
  RingGeometry,
  Vector3,
} from 'three'

import { AURA_BY_ID, TRAIL_BY_ID } from '../../shared/gameData.js'
import { getGlowTexture } from '../world/textures'

/* ---------------------------------------------------------------------------
 * Trail: a camera-facing ribbon that follows the rear wheel.
 * ------------------------------------------------------------------------- */

const TRAIL_POINTS = 44
const _tangent = new Vector3()
const _view = new Vector3()
const _side = new Vector3()
const _color = new Color()

export class TrailRibbon {
  constructor(trailId) {
    this.points = []
    const geometry = new BufferGeometry()
    this.positions = new Float32Array(TRAIL_POINTS * 2 * 3)
    this.colors = new Float32Array(TRAIL_POINTS * 2 * 4)
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3))
    geometry.setAttribute('color', new BufferAttribute(this.colors, 4))
    const index = []
    for (let i = 0; i < TRAIL_POINTS - 1; i += 1) {
      const a = i * 2
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
    geometry.setIndex(index)
    this.material = new MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      toneMapped: false,
    })
    this.mesh = new Mesh(geometry, this.material)
    this.mesh.frustumCulled = false
    this.setTrail(trailId)
  }

  setTrail(trailId) {
    this.def = TRAIL_BY_ID[trailId] || TRAIL_BY_ID.none
    this.mesh.visible = this.def.colors.length > 0
    this.material.blending = this.def.glow ? AdditiveBlending : NormalBlending
    this.points.length = 0
  }

  /** `anchor` is the world-space emit point, `camera` the active camera. */
  update(anchor, camera, moving) {
    if (!this.mesh.visible) return
    const pts = this.points
    const last = pts[0]
    if (moving && (!last || last.distanceToSquared(anchor) > 0.09)) {
      pts.unshift(anchor.clone())
      if (pts.length > TRAIL_POINTS) pts.pop()
    } else if (!moving && pts.length) {
      pts.pop()
    }
    const n = pts.length
    const colors = this.def.colors
    for (let i = 0; i < TRAIL_POINTS; i += 1) {
      const p = pts[Math.min(i, n - 1)]
      if (!p) break
      const next = pts[Math.min(i + 1, n - 1)]
      const prev = pts[Math.max(i - 1, 0)]
      _tangent.subVectors(prev, next)
      if (_tangent.lengthSq() < 1e-6) _tangent.set(0, 0, 1)
      _view.subVectors(camera.position, p)
      _side.crossVectors(_tangent, _view).normalize()
      const t = n > 1 ? Math.min(i, n - 1) / (n - 1) : 0
      const width = 0.75 * (1 - t * 0.85)
      _side.multiplyScalar(width)
      const o = i * 6
      this.positions[o] = p.x + _side.x
      this.positions[o + 1] = p.y + _side.y
      this.positions[o + 2] = p.z + _side.z
      this.positions[o + 3] = p.x - _side.x
      this.positions[o + 4] = p.y - _side.y
      this.positions[o + 5] = p.z - _side.z
      const ci = Math.min(colors.length - 1, Math.floor(t * colors.length))
      _color.set(colors[(ci + Math.floor(performance.now() / 120)) % colors.length])
      const alpha = i < n ? (1 - t) * 0.9 : 0
      for (let k = 0; k < 2; k += 1) {
        const c = (i * 2 + k) * 4
        this.colors[c] = _color.r
        this.colors[c + 1] = _color.g
        this.colors[c + 2] = _color.b
        this.colors[c + 3] = alpha
      }
    }
    this.mesh.geometry.attributes.position.needsUpdate = true
    this.mesh.geometry.attributes.color.needsUpdate = true
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.material.dispose()
  }
}

/* ---------------------------------------------------------------------------
 * Tire streak: a thin white line behind the rear wheel, on the ground or in the
 * air at the bike's height, fading out over a second or two. Every rider has one.
 * ------------------------------------------------------------------------- */

const STREAK_POINTS = 90
const STREAK_LIFE = 1.5
const STREAK_HALF_WIDTH = 0.16

export class TireStreak {
  constructor() {
    this.points = []
    const geometry = new BufferGeometry()
    this.positions = new Float32Array(STREAK_POINTS * 2 * 3)
    this.colors = new Float32Array(STREAK_POINTS * 2 * 4)
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3))
    geometry.setAttribute('color', new BufferAttribute(this.colors, 4))
    const index = []
    for (let i = 0; i < STREAK_POINTS - 1; i += 1) {
      const a = i * 2
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
    geometry.setIndex(index)
    this.material = new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: DoubleSide, toneMapped: false })
    this.mesh = new Mesh(geometry, this.material)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 1
  }

  /** `contact` is under the rear wheel; adds to the line while the bike is moving. */
  update(contact, rolling, now) {
    const pts = this.points
    const last = pts[0]
    if (rolling) {
      // Starting again somewhere else (after a jump or teleport): begin a new line.
      if (last && (last.distanceToSquared(contact) > 100 || now - last.t > 0.25)) pts.length = 0
      if (!pts[0] || pts[0].distanceToSquared(contact) > 0.16) {
        const p = contact.clone()
        p.y += 0.07
        p.t = now
        pts.unshift(p)
        if (pts.length > STREAK_POINTS) pts.pop()
      }
    }
    while (pts.length && now - pts[pts.length - 1].t > STREAK_LIFE) pts.pop()

    const n = pts.length
    for (let i = 0; i < STREAK_POINTS; i += 1) {
      const p = pts[Math.min(i, n - 1)]
      const o = i * 6
      if (!p) {
        this.colors.fill(0, i * 8)
        break
      }
      const prev = pts[Math.min(Math.max(i - 1, 0), n - 1)]
      const next = pts[Math.min(i + 1, n - 1)]
      let tx = prev.x - next.x
      let tz = prev.z - next.z
      const len = Math.hypot(tx, tz) || 1
      tx /= len
      tz /= len
      this.positions[o] = p.x - tz * STREAK_HALF_WIDTH
      this.positions[o + 1] = p.y
      this.positions[o + 2] = p.z + tx * STREAK_HALF_WIDTH
      this.positions[o + 3] = p.x + tz * STREAK_HALF_WIDTH
      this.positions[o + 4] = p.y
      this.positions[o + 5] = p.z - tx * STREAK_HALF_WIDTH
      const alpha = i < n ? Math.max(0, 1 - (now - p.t) / STREAK_LIFE) * 0.85 : 0
      for (let k = 0; k < 2; k += 1) {
        const c = (i * 2 + k) * 4
        this.colors[c] = 1
        this.colors[c + 1] = 1
        this.colors[c + 2] = 1
        this.colors[c + 3] = alpha
      }
    }
    this.mesh.geometry.attributes.position.needsUpdate = true
    this.mesh.geometry.attributes.color.needsUpdate = true
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.material.dispose()
  }
}

/* ---------------------------------------------------------------------------
 * Aura: a rising spiral of glowing particles plus a ground ring.
 * ------------------------------------------------------------------------- */

const AURA_PARTICLES = 46

export class AuraEffect {
  constructor() {
    this.group = new Group()
    const geometry = new BufferGeometry()
    this.positions = new Float32Array(AURA_PARTICLES * 3)
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3))
    this.seeds = Array.from({ length: AURA_PARTICLES }, (_, i) => ({
      angle: (i / AURA_PARTICLES) * Math.PI * 2 * 3,
      offset: Math.random(),
      radius: 1.8 + Math.random() * 0.9,
    }))
    this.material = new PointsMaterial({
      map: getGlowTexture(),
      size: 0.9,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
    })
    this.points = new Points(geometry, this.material)
    this.points.frustumCulled = false
    this.ringMaterial = new MeshBasicMaterial({
      map: getGlowTexture(),
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
      side: DoubleSide,
    })
    this.ring = new Mesh(new RingGeometry(1.6, 3.2, 40), this.ringMaterial)
    this.ring.rotation.x = -Math.PI / 2
    this.ring.position.y = 0.08
    this.group.add(this.points, this.ring)
  }

  setAura(auraId) {
    const def = AURA_BY_ID[auraId]
    this.group.visible = Boolean(def && def.id !== 'none')
    if (!this.group.visible) return
    this.material.color.set(def.color)
    this.ringMaterial.color.set(def.color)
  }

  update(t) {
    if (!this.group.visible) return
    for (let i = 0; i < AURA_PARTICLES; i += 1) {
      const s = this.seeds[i]
      const life = (t * 0.45 + s.offset) % 1
      const a = s.angle + t * 1.6
      const r = s.radius * (1 - life * 0.35)
      this.positions[i * 3] = Math.cos(a) * r
      this.positions[i * 3 + 1] = 0.2 + life * 5.2
      this.positions[i * 3 + 2] = Math.sin(a) * r
    }
    this.points.geometry.attributes.position.needsUpdate = true
    this.material.opacity = 0.85
    this.ring.rotation.z = t * 0.6
    this.ringMaterial.opacity = 0.35 + Math.sin(t * 3) * 0.12
  }

  dispose() {
    this.points.geometry.dispose()
    this.material.dispose()
    this.ring.geometry.dispose()
    this.ringMaterial.dispose()
  }
}

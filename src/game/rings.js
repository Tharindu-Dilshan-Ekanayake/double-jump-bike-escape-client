import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three'

/**
 * Flat rings that expand and fade on the ground plane: the burst under a
 * double jump, and the dust ring when a rider lands. Call `ringBurst()` from
 * anywhere; <Particles> steps them every frame. A small fixed pool, so a busy
 * lobby can't pile them up.
 */

const POOL = 24
const queue = []

let ringTexture = null
function getRingTexture() {
  if (ringTexture) return ringTexture
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const g = canvas.getContext('2d')
  // A soft bright band near the edge, fading inwards.
  const grad = g.createRadialGradient(128, 128, 60, 128, 128, 126)
  grad.addColorStop(0, 'rgba(255,255,255,0)')
  grad.addColorStop(0.6, 'rgba(255,255,255,0.15)')
  grad.addColorStop(0.86, 'rgba(255,255,255,1)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 256, 256)
  ringTexture = new CanvasTexture(canvas)
  ringTexture.colorSpace = SRGBColorSpace
  return ringTexture
}

/**
 * Queues a ring at `position` (world space). `from`/`to` are radii in studs;
 * `solid` draws it with normal blending (dust, or a white ring that shows on
 * bright ground) instead of glowing.
 */
export function ringBurst(position, { color = '#ffffff', from = 0.8, to = 6, life = 0.4, lift = 0.3, solid = false, opacity = 1 } = {}) {
  queue.push({ x: position.x, y: position.y + lift, z: position.z, color, from, to, life, solid, opacity })
}

export function createRingSystem() {
  const group = new Group()
  const geometry = new PlaneGeometry(2, 2).rotateX(-Math.PI / 2)
  const rings = Array.from({ length: POOL }, () => {
    const material = new MeshBasicMaterial({
      map: getRingTexture(),
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      toneMapped: false,
    })
    const mesh = new Mesh(geometry, material)
    mesh.visible = false
    mesh.frustumCulled = false
    mesh.renderOrder = 2
    group.add(mesh)
    return { mesh, material, age: 0, life: 1, from: 1, to: 1, opacity: 1 }
  })
  return { group, rings, cursor: 0 }
}

const _color = new Color()
const easeOut = (t) => 1 - (1 - t) ** 3

export function stepRings(system, delta) {
  const dt = Math.min(delta, 0.05)
  while (queue.length) {
    const e = queue.shift()
    const ring = system.rings[system.cursor]
    system.cursor = (system.cursor + 1) % POOL
    ring.age = 0
    ring.life = e.life
    ring.from = e.from
    ring.to = e.to
    ring.opacity = e.opacity
    ring.mesh.position.set(e.x, e.y, e.z)
    ring.material.color.copy(_color.set(e.color))
    ring.material.blending = e.solid ? NormalBlending : AdditiveBlending
    ring.material.needsUpdate = true
    ring.mesh.visible = true
  }
  for (const ring of system.rings) {
    if (!ring.mesh.visible) continue
    ring.age += dt
    const t = ring.age / ring.life
    if (t >= 1) {
      ring.mesh.visible = false
      continue
    }
    const r = ring.from + (ring.to - ring.from) * easeOut(t)
    ring.mesh.scale.setScalar(r)
    ring.material.opacity = ring.opacity * (1 - t) ** 1.5
  }
}

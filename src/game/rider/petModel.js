import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { PET_BY_ID } from '../../shared/gameData.js'
import { getGlowTexture } from '../world/textures'

/**
 * Procedural pets: each species is a few simple shapes (spheres, boxes, cones)
 * in its colours, merged into ONE mesh with vertex colours, so a lobby full of
 * pets stays cheap. Local +Z is forward; the feet are at y=0; about 1.6 studs
 * tall. `kind` picks the body plan (see PETS in gameData.js).
 */

const FLYING = new Set(['bird', 'owl', 'phoenix', 'dragon', 'ghost', 'whale', 'alien'])
export const petFlies = (petId) => FLYING.has(PET_BY_ID[petId]?.kind)

const _m = new Matrix4()
const _q = new Quaternion()
const _e = new Euler()
const _p = new Vector3()
const _s = new Vector3()
const _c = new Color()

/** Collects coloured parts and merges them. */
class Shape {
  constructor() {
    this.parts = []
  }

  add(geo, color, pos, { rot = [0, 0, 0], scale = [1, 1, 1] } = {}) {
    _p.set(pos[0], pos[1], pos[2])
    _q.setFromEuler(_e.set(rot[0], rot[1], rot[2]))
    _s.set(scale[0], scale[1], scale[2])
    geo.applyMatrix4(_m.compose(_p, _q, _s))
    const g = geo.index ? geo.toNonIndexed() : geo
    _c.set(color)
    const colors = new Float32Array(g.attributes.position.count * 3)
    for (let i = 0; i < colors.length; i += 3) {
      colors[i] = _c.r
      colors[i + 1] = _c.g
      colors[i + 2] = _c.b
    }
    g.setAttribute('color', new (g.attributes.position.constructor)(colors, 3))
    if (g.attributes.uv) g.deleteAttribute('uv')
    this.parts.push(g)
    return this
  }

  ball(color, pos, r, opts) {
    return this.add(new SphereGeometry(r, 14, 10), color, pos, opts)
  }

  box(color, pos, size, opts) {
    return this.add(new BoxGeometry(size[0], size[1], size[2]), color, pos, opts)
  }

  cone(color, pos, r, h, opts) {
    return this.add(new ConeGeometry(r, h, 10), color, pos, opts)
  }

  rod(color, pos, r, h, opts) {
    return this.add(new CylinderGeometry(r, r, h, 8), color, pos, opts)
  }

  build() {
    const merged = mergeGeometries(this.parts, false)
    for (const g of this.parts) g.dispose()
    return merged
  }
}

/** Eyes with a white glint, on a head centred at (0, y, z) facing +Z. */
function eyes(s, y, z, spread = 0.17, r = 0.07) {
  for (const side of [-1, 1]) {
    s.ball('#15151d', [side * spread, y, z], r)
    s.ball('#ffffff', [side * spread + 0.02, y + 0.03, z + r * 0.8], r * 0.35)
  }
}

/** A round head on a round body (most pets). */
function critter(s, body, belly, { headY = 1.05, bodyR = 0.45, headR = 0.36 } = {}) {
  s.ball(body, [0, 0.5, 0], bodyR, { scale: [1, 0.95, 1.1] })
  s.ball(belly, [0, 0.46, 0.2], bodyR * 0.72, { scale: [1, 0.9, 0.7] })
  s.ball(body, [0, headY, 0.18], headR)
  for (const side of [-1, 1]) {
    s.ball(body, [side * 0.22, 0.1, 0.2], 0.12)
    s.ball(body, [side * 0.22, 0.1, -0.22], 0.12)
  }
}

const BUILDERS = {
  dog(s, [body, belly, accent]) {
    critter(s, body, belly)
    for (const side of [-1, 1]) s.ball(accent, [side * 0.3, 1.0, 0.12], 0.13, { scale: [0.6, 1.5, 0.9], rot: [0, 0, side * 0.3] })
    s.ball(belly, [0, 0.98, 0.48], 0.15, { scale: [1, 0.8, 1] })
    s.ball('#15151d', [0, 1.02, 0.6], 0.06)
    s.cone(body, [0, 0.7, -0.5], 0.08, 0.4, { rot: [-1, 0, 0] })
    eyes(s, 1.12, 0.48)
  },
  cat(s, [body, belly, accent], def) {
    critter(s, body, belly)
    for (const side of [-1, 1]) s.cone(body, [side * 0.2, 1.38, 0.14], 0.11, 0.24, { rot: [0, 0, side * -0.25] })
    s.ball(accent, [0, 1.0, 0.52], 0.04)
    s.rod(body, [0, 0.75, -0.48], 0.06, 0.6, { rot: [0.9, 0, 0] })
    if (def.stripes) for (const z of [-0.2, 0, 0.2]) s.box(accent, [0, 0.9, z], [0.5, 0.06, 0.06])
    eyes(s, 1.1, 0.46)
  },
  bunny(s, [body, belly, accent]) {
    critter(s, body, belly)
    for (const side of [-1, 1]) {
      s.ball(body, [side * 0.12, 1.55, 0.1], 0.1, { scale: [0.8, 3, 0.6] })
      s.ball(accent, [side * 0.12, 1.55, 0.14], 0.05, { scale: [0.7, 3, 0.4] })
    }
    s.ball(belly, [0, 0.55, -0.46], 0.14)
    s.ball(accent, [0, 1.0, 0.52], 0.04)
    eyes(s, 1.1, 0.46)
  },
  fox(s, [body, belly, accent]) {
    critter(s, body, belly)
    for (const side of [-1, 1]) {
      s.cone(body, [side * 0.22, 1.42, 0.12], 0.13, 0.32, { rot: [0, 0, side * -0.25] })
      s.cone(accent, [side * 0.22, 1.36, 0.16], 0.06, 0.16, { rot: [0, 0, side * -0.25] })
    }
    s.cone(belly, [0, 0.98, 0.52], 0.12, 0.26, { rot: [Math.PI / 2, 0, 0] })
    s.ball(accent, [0, 0.98, 0.66], 0.04)
    s.ball(body, [0, 0.62, -0.62], 0.2, { scale: [0.8, 0.8, 1.6] })
    s.ball(belly, [0, 0.62, -0.92], 0.12)
    eyes(s, 1.12, 0.46)
  },
  unicorn(s, [body, belly, accent]) {
    s.ball(body, [0, 0.62, 0], 0.42, { scale: [0.9, 0.85, 1.3] })
    for (const [x, z] of [[-0.2, 0.28], [0.2, 0.28], [-0.2, -0.28], [0.2, -0.28]]) s.rod(body, [x, 0.22, z], 0.08, 0.4)
    s.ball(body, [0, 1.12, 0.42], 0.28, { scale: [0.9, 1, 1.2] })
    s.cone('#ffd23a', [0, 1.5, 0.52], 0.06, 0.4, { rot: [0.4, 0, 0] })
    for (let i = 0; i < 4; i += 1) s.ball(accent, [0, 1.25 - i * 0.13, 0.2 - i * 0.12], 0.1)
    s.ball(belly, [0, 0.72, -0.62], 0.13, { scale: [0.8, 0.8, 1.8] })
    eyes(s, 1.18, 0.66, 0.15, 0.06)
  },
  bear(s, [body, belly, accent]) {
    critter(s, body, belly, { bodyR: 0.5 })
    for (const side of [-1, 1]) {
      s.ball(accent, [side * 0.26, 1.34, 0.12], 0.12)
      s.ball(accent, [side * 0.15, 1.08, 0.44], 0.1, { scale: [1, 1.3, 0.5] })
      s.ball(accent, [side * 0.22, 0.1, 0.2], 0.13)
    }
    s.ball(accent, [0, 0.98, 0.54], 0.05)
    eyes(s, 1.1, 0.5, 0.15, 0.05)
  },
  penguin(s, [body, belly, accent]) {
    s.ball(body, [0, 0.65, 0], 0.45, { scale: [0.95, 1.35, 0.9] })
    s.ball(belly, [0, 0.6, 0.18], 0.36, { scale: [0.9, 1.25, 0.6] })
    s.cone(accent, [0, 1.08, 0.45], 0.08, 0.2, { rot: [Math.PI / 2, 0, 0] })
    for (const side of [-1, 1]) {
      s.ball(body, [side * 0.44, 0.7, 0], 0.1, { scale: [0.6, 2.2, 1], rot: [0, 0, side * 0.3] })
      s.ball(accent, [side * 0.15, 0.04, 0.12], 0.1, { scale: [1, 0.4, 1.5] })
    }
    eyes(s, 1.2, 0.36, 0.13, 0.06)
  },
  bird(s, [body, belly, accent]) {
    s.ball(body, [0, 0.6, 0], 0.46)
    s.ball(belly, [0, 0.52, 0.22], 0.32, { scale: [1, 0.9, 0.6] })
    s.cone(accent, [0, 0.66, 0.5], 0.08, 0.18, { rot: [Math.PI / 2, 0, 0] })
    for (const side of [-1, 1]) s.ball(body, [side * 0.44, 0.6, -0.05], 0.12, { scale: [0.5, 1.4, 1.6], rot: [0, 0, side * 0.5] })
    s.ball(accent, [0, 1.08, 0], 0.08, { scale: [0.6, 1.4, 0.6] })
    eyes(s, 0.78, 0.4, 0.15, 0.06)
  },
  owl(s, [body, belly, accent]) {
    s.ball(body, [0, 0.62, 0], 0.48, { scale: [1, 1.1, 0.95] })
    s.ball(belly, [0, 0.52, 0.22], 0.34, { scale: [1, 1, 0.6] })
    for (const side of [-1, 1]) {
      s.ball('#ffffff', [side * 0.17, 0.85, 0.36], 0.14, { scale: [1, 1, 0.4] })
      s.ball(accent, [side * 0.17, 0.85, 0.41], 0.08, { scale: [1, 1, 0.4] })
      s.ball('#15151d', [side * 0.17, 0.85, 0.44], 0.04)
      s.cone(body, [side * 0.26, 1.22, 0], 0.08, 0.22, { rot: [0, 0, side * -0.4] })
      s.ball(body, [side * 0.46, 0.6, -0.05], 0.12, { scale: [0.5, 1.5, 1.4] })
    }
    s.cone(accent, [0, 0.7, 0.46], 0.05, 0.14, { rot: [Math.PI / 2 + 0.4, 0, 0] })
  },
  phoenix(s, colors) {
    BUILDERS.bird(s, colors)
    const [body, , accent] = colors
    for (let i = 0; i < 3; i += 1) s.cone(i % 2 ? accent : body, [(i - 1) * 0.16, 0.6, -0.55], 0.1, 0.6, { rot: [-1.2, 0, (i - 1) * 0.3] })
    for (let i = 0; i < 3; i += 1) s.cone(accent, [(i - 1) * 0.1, 1.15, 0.05], 0.05, 0.25, { rot: [0, 0, (i - 1) * 0.4] })
  },
  dragon(s, [body, belly, accent]) {
    s.ball(body, [0, 0.62, 0], 0.42, { scale: [0.95, 0.9, 1.25] })
    s.ball(belly, [0, 0.56, 0.18], 0.3, { scale: [0.9, 0.8, 0.8] })
    s.ball(body, [0, 1.08, 0.42], 0.3, { scale: [1, 0.95, 1.2] })
    for (const side of [-1, 1]) {
      s.cone(accent, [side * 0.16, 1.4, 0.32], 0.05, 0.22, { rot: [-0.4, 0, side * -0.3] })
      s.cone(body, [side * 0.55, 0.95, -0.05], 0.28, 0.6, { rot: [0, 0, side * 1.1], scale: [1, 1, 0.25] })
    }
    s.cone(body, [0, 0.6, -0.65], 0.14, 0.6, { rot: [-1.4, 0, 0] })
    for (let i = 0; i < 3; i += 1) s.cone(accent, [0, 1.02 - i * 0.02, 0.05 - i * 0.22], 0.06, 0.16)
    eyes(s, 1.14, 0.7, 0.13, 0.055)
  },
  alien(s, [body, belly, accent]) {
    s.ball(body, [0, 0.45, 0], 0.3, { scale: [0.9, 1.1, 0.9] })
    s.ball(body, [0, 1.0, 0.05], 0.42, { scale: [1.1, 1, 1] })
    for (const side of [-1, 1]) {
      s.ball(accent, [side * 0.17, 1.0, 0.36], 0.12, { scale: [1.2, 0.8, 0.5], rot: [0, 0, side * -0.35] })
      s.rod(belly, [side * 0.12, 1.5, 0], 0.02, 0.3, { rot: [0, 0, side * -0.3] })
      s.ball(belly, [side * 0.17, 1.66, 0], 0.06)
    }
  },
  robot(s, [body, belly, accent]) {
    s.box(body, [0, 0.5, 0], [0.62, 0.6, 0.5])
    s.box(body, [0, 1.06, 0.05], [0.56, 0.44, 0.48])
    s.box('#1d2233', [0, 1.06, 0.3], [0.44, 0.26, 0.02])
    for (const side of [-1, 1]) {
      s.box(belly, [side * 0.1, 1.07, 0.32], [0.08, 0.08, 0.02])
      s.box(body, [side * 0.38, 0.55, 0], [0.12, 0.42, 0.14])
      s.box('#3b404c', [side * 0.16, 0.1, 0], [0.18, 0.2, 0.3])
    }
    s.rod('#9aa3b2', [0, 1.42, 0.05], 0.025, 0.26)
    s.ball(accent, [0, 1.58, 0.05], 0.06)
  },
  ghost(s, [body, belly, accent]) {
    s.ball(body, [0, 0.9, 0], 0.45, { scale: [1, 1.1, 0.95] })
    s.cone(body, [0, 0.42, 0], 0.45, 0.6, { rot: [Math.PI, 0, 0] })
    for (const side of [-1, 1]) s.ball(body, [side * 0.46, 0.8, 0.05], 0.1, { scale: [0.6, 1.2, 0.8] })
    s.ball(accent, [-0.15, 1.0, 0.38], 0.07, { scale: [1, 1.4, 0.5] })
    s.ball(accent, [0.15, 1.0, 0.38], 0.07, { scale: [1, 1.4, 0.5] })
    s.ball(belly, [0, 0.82, 0.4], 0.08, { scale: [1.2, 0.8, 0.5] })
  },
  whale(s, [body, belly, accent]) {
    s.ball(body, [0, 0.6, 0], 0.5, { scale: [0.9, 0.8, 1.5] })
    s.ball(belly, [0, 0.46, 0.08], 0.4, { scale: [0.8, 0.55, 1.3] })
    s.cone(body, [0, 0.66, -0.82], 0.16, 0.3, { rot: [-Math.PI / 2, 0, 0] })
    for (const side of [-1, 1]) {
      s.ball(body, [side * 0.26, 0.72, -1.0], 0.16, { scale: [1.6, 0.35, 1] })
      s.ball(body, [side * 0.44, 0.42, 0.2], 0.12, { scale: [1.4, 0.35, 0.9], rot: [0, 0, side * -0.4] })
    }
    for (let i = 0; i < 4; i += 1) s.ball(accent, [(i - 1.5) * 0.08, 1.1 + (i % 2) * 0.08, 0.2], 0.05)
    eyes(s, 0.66, 0.58, 0.3, 0.06)
  },
}

const materialCache = new Map()
function materialFor(glow) {
  const key = glow ? 'glow' : 'plain'
  if (!materialCache.has(key)) {
    materialCache.set(
      key,
      new MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05, emissive: glow ? '#ffffff' : '#000000', emissiveIntensity: glow ? 0.12 : 0 }),
    )
  }
  return materialCache.get(key)
}

/** Builds a pet for `petId`. Returns `{ group, def, dispose }`. */
export function createPet(petId) {
  const def = PET_BY_ID[petId] || PET_BY_ID.puppy
  const s = new Shape()
  ;(BUILDERS[def.kind] || BUILDERS.dog)(s, def.colors, def)
  const mesh = new Mesh(s.build(), materialFor(def.glow))
  mesh.castShadow = true
  const group = new Group()
  group.name = `pet:${def.id}`
  group.add(mesh)
  let glowSprite = null
  if (def.glow) {
    glowSprite = new Sprite(
      new SpriteMaterial({ map: getGlowTexture(), color: def.colors[2], transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false }),
    )
    glowSprite.scale.setScalar(2.4)
    glowSprite.position.y = 0.7
    group.add(glowSprite)
  }
  return {
    group,
    def,
    body: mesh,
    dispose() {
      mesh.geometry.dispose()
      glowSprite?.material.dispose()
    },
  }
}

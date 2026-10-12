import {
  AdditiveBlending,
  Box3,
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Sphere,
  TorusGeometry,
} from 'three'

import { AURA_BY_ID, BIKE_BY_ID, BIKES, PRODUCTS, TRAIN_PAD_BY_ID, formatNumber } from '../../shared/gameData.js'
import { HALF_WIDTH, getLayout } from '../../shared/layout.js'
import { sweepLaserZ, sweeperAngle, verticalLaserY } from '../hazards'
import { createBike } from '../rider/bikeModel'
import { AuraEffect } from '../rider/effects'
import { decorateLobby, decorateStage } from './decor'
import { GeoBatch, Props, worldBox, worldBoxSides, worldPlane } from './geometry'
import { animateMaterials, fallMaterial, glowMaterial, propsMaterial, riverMaterial, surfaceMaterial } from './materials'
import { FONT_TITLE, canvasTexture, drawLeaderboard, jumpWallSign, textPlane, textSprite } from './signs'
import { LIQUIDS, shade, surfaceTile } from './textures'

const LASER_COLORS = { red: '#ff2a2a', yellow: '#ffdd1f', green: '#6bff3a', magenta: '#ff3af2' }

/**
 * A stage's river: a surface flowing towards the lobby, and sides that pour down
 * like little waterfalls where one segment steps down to the next.
 */
function addRiver(batch, box) {
  const kind = box.mat.slice('river_'.length)
  const zone = `#${box.zone}`
  const tile = LIQUIDS[kind]?.tile ?? 24
  batch.add(`river:${kind}${zone}`, worldPlane(box.min[0], box.max[0], box.min[2], box.max[2], box.max[1], tile), riverMaterial(kind))
  batch.add(`riverFall:${kind}${zone}`, worldBoxSides(box.min, box.max, 8), fallMaterial(kind, true))
}

const TITLE_FILLS = {
  starter: ['#ffffff', '#cfe9ff'],
  forest: ['#e8ffb0', '#3fd13a'],
  cloud: ['#ffffff', '#7fd6ff'],
  volcano: ['#ffe27a', '#ff4d1f'],
  desert: ['#fff1c4', '#e89a2a'],
  ice: ['#ffffff', '#7fe0ff'],
  candy: ['#fff0fa', '#ff5fb8'],
  neon: ['#c9fffd', '#ff3df2'],
  space: ['#f3dcff', '#9b5cff'],
  rainbow: ['#ff6b6b', '#ffd23a', '#5fe08a', '#5fb8ff'],
  finish: ['#fff6c4', '#ffb81f'],
  jungle: ['#e2ff9a', '#2f9e3a'],
  beach: ['#fff6c4', '#3fb8ff'],
  toxic: ['#eaff9a', '#5fe62b'],
  haunted: ['#e6d6ff', '#7a4dff'],
  crystal: ['#ffffff', '#b07bff'],
  factory: ['#ffffff', '#9aa3b2'],
  sakura: ['#ffffff', '#ff7ac8'],
  magma: ['#ffe27a', '#ff3a1f'],
  galaxy: ['#ffd6ff', '#7a3bff'],
  golden: ['#fff6c4', '#ffb81f'],
}

/**
 * Builds both worlds from the shared layout.
 *
 * Returns the root Object3D plus hooks: `update(t, dt)` animates lasers,
 * belts, liquids and displays; `updateLeaderboards(data)` redraws the boards;
 */
export function buildWorld() {
  const layout = getLayout()
  const root = new Group()
  root.name = 'world'
  const batch = new GeoBatch()
  const propsByZone = new Map()
  const props = (zone) => {
    if (!propsByZone.has(zone)) propsByZone.set(zone, new Props(batch, zone, propsMaterial, glowMaterial))
    return propsByZone.get(zone)
  }
  const extras = []
  const animated = []

  for (const box of layout.boxes) {
    if (!box.visible || box.mat === 'none') continue
    if (box.mat.startsWith('river_')) {
      addRiver(batch, box)
      continue
    }
    batch.add(`${box.mat}#${box.zone}`, worldBox(box.min, box.max, surfaceTile(box.mat)), surfaceMaterial(box.mat))
  }

  for (const entry of layout.decor) {
    if (entry.kind === 'lobby') decorateLobby(props(entry.world * 100), batch, entry)
    else {
      const stage = layout.worlds[entry.world - 1].stages[entry.index - 1]
      decorateStage(props(entry.zone), batch, stage, extras)
    }
  }

  buildTreadmillProps(layout, props)
  buildShops(layout, props)
  buildChest(layout, props(100), root)
  buildMailbox(layout, props(100), root)
  const boards = buildLeaderboards(layout, root)

  for (const mesh of batch.build()) root.add(mesh)
  for (const extra of extras) root.add(extra)

  buildShopSigns(layout, root)
  buildPortals(layout, props, root, animated)
  buildSigns(layout, root)
  buildStands(layout, root, animated)
  const hazards = buildHazards(layout, root)

  // Signs, stands, lasers and portals: hidden when the camera is far away.
  const culler = createDistanceCuller(root.children)

  // Portals add props after the first merge; merge those too.
  for (const mesh of batch.build()) root.add(mesh)

  return {
    root,
    updateLeaderboards(data) {
      for (const board of boards) board.update(data)
    },
    update(t, dt, camera) {
      animateMaterials(dt)
      hazards.update(t)
      for (const item of animated) item.update(t, dt)
      if (camera) culler.update(camera.position, dt)
    },
  }
}

/** Scenery props further than this from the camera aren't drawn. */
const PROPS_RANGE = 700

/**
 * Hides small objects (labels, lasers, display bikes, portals…) beyond a range
 * that grows with their size; they'd only be a few pixels on screen there, and
 * each one is a draw call (twice, with shadows). The big merged scenery meshes
 * are left to normal frustum culling.
 */
function createDistanceCuller(objects) {
  const box = new Box3()
  const sphere = new Sphere()
  const items = []
  const zoneProps = []
  for (const object of objects) {
    // A stage's merged props (trees, rocks, trims…): hidden once the camera is
    // far from every part of that stage.
    if (/^(props|glow)#\d+$/.test(object.name)) {
      zoneProps.push({ object, box: new Box3().setFromObject(object) })
      continue
    }
    if (/#\d+$/.test(object.name) || object.isPoints) continue
    box.setFromObject(object)
    if (box.isEmpty()) continue
    box.getBoundingSphere(sphere)
    const range = Math.min(1600, Math.max(320, 260 + sphere.radius * 8))
    items.push({ object, x: sphere.center.x, z: sphere.center.z, range2: range * range })
  }
  let wait = 0
  return {
    update(position, dt) {
      wait -= dt
      if (wait > 0) return
      wait = 0.2
      for (const item of items) {
        const dx = item.x - position.x
        const dz = item.z - position.z
        item.object.visible = dx * dx + dz * dz < item.range2
      }
      for (const item of zoneProps) item.object.visible = item.box.distanceToPoint(position) < PROPS_RANGE
    },
  }
}

/* ---------------------------------------------------------------------------
 * Signs
 * ------------------------------------------------------------------------- */

function requirementText(pad) {
  if (pad.wins) return { text: `🏆 ${formatNumber(pad.wins)}`, fill: '#ffd23a' }
  if (pad.rebirths) return { text: `Rebirth ${pad.rebirths}+`, fill: '#ffe27a' }
  return { text: pad.world === 2 ? 'WORLD 2' : 'FREE', fill: '#7dff8a' }
}

function buildSigns(layout, root) {
  for (const sign of layout.signs) {
    let object = null
    if (sign.kind === 'trainLabel') {
      const pad = TRAIN_PAD_BY_ID[sign.padId]
      const req = requirementText(pad)
      object = textSprite(
        [
          { text: pad.label, size: 34, fill: pad.color },
          { text: `${formatNumber(pad.mult)}x Speed`, size: 66, fill: ['#ffffff', '#e4f0ff'] },
          { text: req.text, size: 40, fill: req.fill },
        ],
        { height: 5.2 },
      )
    } else if (sign.kind === 'title') {
      object = textPlane([{ text: sign.text, size: 150, font: FONT_TITLE, weight: 400, fill: ['#a9e6ff', sign.color], strokeWidth: 16 }], {
        height: sign.size[1],
      })
      object.rotation.y = sign.rotY
    } else if (sign.kind === 'banner') {
      object = textPlane([{ text: sign.text, size: 90, font: FONT_TITLE, weight: 400 }], { height: 5, background: sign.color, border: '#ffffff', padding: 24 })
      object.rotation.y = sign.rotY
    } else if (sign.kind === 'worldTitle') {
      object = textSprite([{ text: sign.text, size: 150, font: FONT_TITLE, weight: 400, fill: ['#ffd6ff', '#9b5cff'], strokeWidth: 16 }], { height: 7 })
    } else if (sign.kind === 'jumpWall') {
      object = jumpWallSign(sign.jumps, sign.width, sign.starter, sign.gap)
    } else if (sign.kind === 'stageTitle') {
      object = textSprite([{ text: sign.text, size: 110, font: FONT_TITLE, weight: 400, fill: TITLE_FILLS[sign.theme] || TITLE_FILLS.starter, strokeWidth: 14 }], {
        height: 6.5,
      })
    } else if (sign.kind === 'padLabel') {
      object =
        sign.pad === 'return'
          ? textSprite(
              [
                { text: 'Return', size: 44 },
                { text: `+${formatNumber(sign.wins)} Wins`, size: 62, fill: ['#fff47a', '#ffb21f'] },
              ],
              { height: 4.4 },
            )
          : textSprite(
              [
                { text: `🏆 ${PRODUCTS.pass2xWins.price}`, size: 36, fill: '#ffd23a' },
                { text: `2x Wins (+${formatNumber(sign.wins * 2)} Wins)`, size: 50, fill: ['#efd9ff', '#b46bff'] },
              ],
              { height: 4 },
            )
    }
    if (!object) continue
    object.position.set(sign.pos[0], sign.pos[1], sign.pos[2])
    root.add(object)
  }
}

/* ---------------------------------------------------------------------------
 * Lobby features
 * ------------------------------------------------------------------------- */

function buildLeaderboards(layout, root) {
  return layout.leaderboards.map((board) => {
    const group = new Group()
    group.position.set(board.pos[0], board.pos[1], board.pos[2])
    group.rotation.y = board.rotY
    const frame = new MeshStandardMaterial({ color: board.color, roughness: 0.65 })
    const dark = new MeshStandardMaterial({ color: shade(board.color, -0.35), roughness: 0.7 })
    const add = (geo, mat, x, y, z) => {
      const mesh = new Mesh(geo, mat)
      mesh.position.set(x, y, z)
      mesh.castShadow = true
      mesh.receiveShadow = true
      group.add(mesh)
    }
    add(new BoxGeometry(1.8, 4.4, 1.8), dark, -5, 2.2, 0)
    add(new BoxGeometry(1.8, 4.4, 1.8), dark, 5, 2.2, 0)
    add(new BoxGeometry(16.5, 19.5, 1.4), frame, 0, 13.8, 0)
    add(new BoxGeometry(18, 1.6, 2.2), dark, 0, 4.6, 0)
    for (let i = 0; i < 6; i += 1) {
      add(new BoxGeometry(2.2, i % 2 ? 1.2 : 2, 1.6), frame, -6.9 + i * 2.76, 23.9 + (i % 2 ? 0 : 0.4), 0)
    }

    const canvas = document.createElement('canvas')
    canvas.width = 720
    canvas.height = 880
    const texture = canvasTexture(canvas)
    const panel = new Mesh(new PlaneGeometry(14.6, 17.8), new MeshBasicMaterial({ map: texture }))
    panel.position.set(0, 13.9, 0.72)
    group.add(panel)

    const title = textSprite(
      [{ text: board.title, size: 96, font: FONT_TITLE, weight: 400, fill: [shade(board.color, 0.55), board.color], strokeWidth: 12 }],
      { height: 4.6 },
    )
    title.position.set(0, 27.4, 0)
    group.add(title)
    root.add(group)

    const update = (data) => {
      drawLeaderboard(canvas, board, data?.[board.stat] || [])
      texture.needsUpdate = true
    }
    update(null)
    return { update }
  })
}

function swirlTexture(inner, mid, outer) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const g = canvas.getContext('2d')
  const grad = g.createRadialGradient(128, 128, 10, 128, 128, 128)
  grad.addColorStop(0, inner)
  grad.addColorStop(0.4, mid)
  grad.addColorStop(1, outer)
  g.fillStyle = grad
  g.fillRect(0, 0, 256, 256)
  g.strokeStyle = 'rgba(0,20,10,0.5)'
  g.lineWidth = 10
  for (let arm = 0; arm < 4; arm += 1) {
    g.beginPath()
    for (let i = 0; i < 60; i += 1) {
      const a = arm * (Math.PI / 2) + i * 0.09
      const r = i * 2.1
      g.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r)
    }
    g.stroke()
  }
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

const PORTAL_SWIRLS = {
  2: ['#d8ffe0', '#3cf56a', '#0b5c22'],
  1: ['#e0f4ff', '#2fb5ff', '#0b3a6b'],
}

/** Portal arches: World 2 (green, radioactive) and back to World 1 (blue). */
function buildPortals(layout, props, root, animated) {
  for (const portal of layout.portals) {
    const p = props(portal.world * 100)
    const y = portal.y ?? 0
    const facingZ = portal.facing === 'z'
    const along = (offset) => (facingZ ? [portal.x + offset, 0, portal.z] : [portal.x, 0, portal.z + offset])
    const pillar = facingZ ? [2.5, 14, 2] : [2, 14, 2.5]
    for (const side of [-1, 1]) {
      const [px, , pz] = along(side * 7.75)
      p.box('#2f3540', [px, y + 7, pz], pillar)
      p.box(portal.color, [px, y + 14.4, pz], [pillar[0] + 0.4, 0.8, pillar[2] + 0.4], { glow: true })
    }
    p.box('#2f3540', [portal.x, y + 14.6, portal.z], facingZ ? [18, 1.6, 2] : [2, 1.6, 18])
    p.box('#3b3f4a', [portal.x, y + 0.2, portal.z], facingZ ? [19, 0.5, 4] : [4, 0.5, 19])

    const holder = new Group()
    holder.position.set(portal.x, y + 7, portal.z)
    if (!facingZ) holder.rotation.y = Math.PI / 2
    const ring = new Mesh(new TorusGeometry(6.1, 0.55, 10, 48), new MeshBasicMaterial({ color: portal.color, toneMapped: false }))
    const [inner, mid, outer] = PORTAL_SWIRLS[portal.to]
    const swirl = new Mesh(new CircleGeometry(5.8, 48), new MeshBasicMaterial({ map: swirlTexture(inner, mid, outer), side: DoubleSide, toneMapped: false }))
    holder.add(ring, swirl)
    root.add(holder)
    animated.push({ update: (t) => (swirl.rotation.z = -t * 1.6) })

    const lines =
      portal.to === 2
        ? [
            { text: '☢', size: 70, fill: '#3cf56a' },
            { text: 'WORLD 2', size: 88, font: FONT_TITLE, weight: 400, fill: ['#b4ffb8', '#2fd35a'] },
            ...(portal.facing === 'z' ? [] : [{ text: 'Escape World 1 + 10 Rebirths', size: 34, fill: '#ffffff' }]),
          ]
        : [{ text: 'WORLD 1', size: 88, font: FONT_TITLE, weight: 400, fill: ['#d6f2ff', '#2fb5ff'] }]
    const sign = textSprite(lines, { height: portal.to === 2 && !facingZ ? 7.5 : 5 })
    sign.position.set(portal.x, y + 20, portal.z)
    root.add(sign)
  }
}

const SHOP_ICONS = { items: '🛒' }

/** Shop huts, open towards the plaza (+X). */
function buildShops(layout, props) {
  for (const shop of layout.shops) {
    const p = props(shop.world * 100)
    const { x, z, color } = shop
    p.box(color, [x - 3, 4.5, z], [12, 9, 16])
    p.box('#ffffff', [x + 3.05, 4.2, z], [0.2, 6.4, 11.4])
    p.box(shade(color, -0.45), [x + 3.12, 3.9, z], [0.25, 5.6, 10])
    p.box('#f6f6f6', [x + 4.7, 1.3, z], [2.6, 2.6, 13])
    p.box(color, [x + 4.7, 2.75, z], [2.9, 0.3, 13.3])
    p.box(shade(color, -0.25), [x - 3, 9.6, z], [13.6, 1.4, 17.6])
    for (let i = 0; i < 7; i += 1) {
      p.box(i % 2 ? '#ffffff' : color, [x + 4.4, 8.3, z - 6.9 + i * 2.3], [3, 0.45, 2.3], { rot: [0, 0, -0.38] })
    }
    // Shelves of goodies inside the shop.
    for (let i = 0; i < 4; i += 1) {
      p.box(['#ffd23a', '#7ad8ff', '#ff7a7a', '#7dff8a'][i], [x + 4.4, 3.2, z - 4.5 + i * 3], [1, 0.9, 1], { glow: true })
    }
  }
}

function buildShopSigns(layout, root) {
  for (const shop of layout.shops) {
    const sign = textSprite([{ text: `${SHOP_ICONS[shop.id]} ${shop.title}`, size: 74 }], { height: 3.8, background: shop.color, border: '#ffffff' })
    sign.position.set(shop.x + 1, 13.6, shop.z)
    root.add(sign)
  }
}

function buildChest(layout, p, root) {
  const [cx, cy, cz] = layout.chest.pos
  p.box('#ff8a2f', [cx, cy + 1.2, cz], [4.2, 2.4, 3])
  p.box('#ffcc33', [cx, cy + 1.25, cz], [4.3, 0.3, 3.1])
  p.box('#b85a1c', [cx - 2.1, cy + 1.2, cz], [0.25, 2.5, 3.1])
  p.box('#b85a1c', [cx + 2.1, cy + 1.2, cz], [0.25, 2.5, 3.1])
  p.box('#e8742a', [cx, cy + 3.05, cz - 1.2], [4.3, 0.9, 3.1], { rot: [-0.95, 0, 0] })
  p.box('#ffcc33', [cx + 2.2, cy + 1.6, cz], [0.15, 0.8, 0.6])
  p.cylinder('#ffd23a', [cx, cy + 2.45, cz], 1.5, 1.6, 0.3, { glow: true, segments: 14 })
  const sign = textSprite(
    [
      { text: 'Group Chest', size: 60, fill: ['#ffe27a', '#ff8a2f'] },
      { text: 'Free Rewards!', size: 38 },
    ],
    { height: 3.4 },
  )
  sign.position.set(cx, cy + 6.5, cz)
  root.add(sign)
}

function buildMailbox(layout, p, root) {
  const [x, y, z] = layout.mailbox.pos
  p.box('#6b4223', [x, y + 1.6, z], [0.5, 3.2, 0.5])
  p.box('#2f6bff', [x, y + 3.7, z], [2.2, 1.4, 1.4])
  p.cylinder('#2f6bff', [x, y + 4.4, z], 0.7, 0.7, 2.2, { rot: [0, 0, Math.PI / 2], segments: 14 })
  p.box('#e8343a', [x + 0.9, y + 4.6, z + 0.75], [0.15, 1.4, 0.15])
  p.box('#e8343a', [x + 0.9, y + 5.2, z + 1.05], [0.15, 0.4, 0.6])
  const sign = textSprite(
    [
      { text: '💌 Feedback', size: 54, fill: ['#d6e8ff', '#5fa8ff'] },
      { text: '& Suggestions', size: 36 },
    ],
    { height: 3.2 },
  )
  sign.position.set(x, y + 8, z)
  root.add(sign)
}

/** Handrails at the front of each treadmill (the frame, belt and console are boxes). */
function buildTreadmillProps(layout, props) {
  for (const pad of layout.trainPads) {
    const p = props(pad.world * 100)
    const [cx, cz] = pad.center
    for (const side of [-1, 1]) {
      p.box('#9aa3b2', [cx + side * 5.6, 3, cz - 6], [0.35, 4.2, 0.35])
      p.box('#9aa3b2', [cx + side * 5.6, 4.9, cz - 7.8], [0.35, 0.35, 4])
    }
    p.box(pad.color, [cx, 4.25, cz - 10.3], [8, 2.4, 0.2], { glow: true })
    p.box('#1b1e26', [cx, 4.25, cz - 10.2], [8.6, 2.8, 0.2])
  }
}

function bikeLabel(def, style) {
  const best = BIKES.reduce((max, b) => Math.max(max, b.mult), 1)
  const lines = [
    { text: 'NEW!', size: 40, fill: ['#ff6b6b', '#ffd23a', '#5fe08a'] },
    { text: def.name, size: 58, fill: ['#ffffff', '#cde8ff'] },
    { text: `${formatNumber(def.mult)}x Speed`, size: 38, fill: '#7dff8a' },
    { text: def.price ? `🏆 ${formatNumber(def.price)}` : 'FREE', size: 44, fill: '#ffd23a' },
    { text: 'Press E', size: 34, fill: '#ffffff' },
  ]
  if (style === 'gallery' && def.mult === best) lines[0] = { text: 'BEST!', size: 40, fill: ['#ffd23a', '#ff8a1f'] }
  return textSprite(lines, { height: 5.4 })
}

function buildStands(layout, root, animated) {
  for (const stand of layout.bikeStands) {
    const def = BIKE_BY_ID[stand.bike]
    const bike = createBike(stand.bike, { still: true })
    // Display bikes are drawn often (a lobby full of them); skip their shadows.
    bike.group.traverse((node) => {
      node.castShadow = false
    })
    const gallery = stand.style === 'gallery'
    bike.group.position.set(stand.x, gallery ? 0.7 : 0.5, stand.z)
    bike.group.scale.setScalar(1.25)
    root.add(bike.group)
    const spin = gallery ? 0.5 : 0.7
    animated.push({ update: (t) => (bike.group.rotation.y = t * spin + stand.z) })
    const label = bikeLabel(def, stand.style)
    label.position.set(stand.x, 8.2, stand.z)
    root.add(label)
  }

  for (const stand of layout.auraStands) {
    const aura = new AuraEffect()
    aura.setAura(stand.aura)
    aura.group.position.set(stand.pos[0], stand.pos[1], stand.pos[2])
    root.add(aura.group)
    animated.push({ update: (t) => aura.update(t) })
    const unchained = stand.aura === 'unchained'
    const price = `🏆 ${formatNumber(AURA_BY_ID[stand.aura].price)}`
    const label = textSprite(
      [
        { text: 'NEW!', size: 40, fill: ['#ff6b6b', '#ffd23a', '#5fe08a'] },
        { text: unchained ? 'Unchained Aura' : 'Shadow Aura', size: 54, fill: unchained ? ['#ff9a9a', '#ff2f4d'] : ['#e6d6ff', '#9b5cff'] },
        { text: unchained ? '10x Wins' : '3x Wins', size: 38, fill: '#ffe27a' },
        { text: price, size: 44, fill: '#ffd23a' },
      ],
      { height: 5.4 },
    )
    label.position.set(stand.pos[0], 7.6, stand.pos[2])
    root.add(label)
  }
}

/* ---------------------------------------------------------------------------
 * Hazards
 * ------------------------------------------------------------------------- */

const beamMaterials = new Map()
function beamMaterialsFor(colorKey) {
  if (!beamMaterials.has(colorKey)) {
    const color = LASER_COLORS[colorKey] || LASER_COLORS.red
    beamMaterials.set(colorKey, {
      core: new MeshBasicMaterial({ color: '#ffffff', toneMapped: false }),
      inner: new MeshBasicMaterial({ color, transparent: true, opacity: 0.9, toneMapped: false }),
      glow: new MeshBasicMaterial({ color, transparent: true, opacity: 0.28, blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
      cap: new MeshBasicMaterial({ color, toneMapped: false }),
    })
  }
  return beamMaterials.get(colorKey)
}

const emitterMaterial = new MeshStandardMaterial({ color: '#2b2f38', roughness: 0.5, metalness: 0.4 })

/** A horizontal beam along local X. */
function beam(colorKey, length) {
  const m = beamMaterialsFor(colorKey)
  const group = new Group()
  for (const [radius, material] of [
    [0.14, m.core],
    [0.26, m.inner],
    [0.75, m.glow],
  ]) {
    const mesh = new Mesh(new CylinderGeometry(radius, radius, length, 10), material)
    mesh.rotation.z = Math.PI / 2
    group.add(mesh)
  }
  return group
}

function buildHazards(layout, root) {
  const lasers = layout.lasers.map((laser) => {
    const half = laser.halfWidth ?? HALF_WIDTH
    const group = beam(laser.color, half * 2)
    const m = beamMaterialsFor(laser.color)
    for (const side of [-1, 1]) {
      const emitter = new Mesh(new BoxGeometry(1, 1.2, 1.2), emitterMaterial)
      emitter.position.x = side * (half - 0.3)
      const cap = new Mesh(new BoxGeometry(0.15, 0.7, 0.7), m.cap)
      cap.position.x = side * (half - 0.85)
      group.add(emitter, cap)
    }
    root.add(group)
    if (laser.type === 'sweep') group.position.set(laser.originX, laser.y, laser.zCenter)
    else group.position.set(laser.originX, laser.yMin, laser.z)
    return { laser, group }
  })

  const sweepers = layout.sweepers.map((sweeper) => {
    const [cx, cy, cz] = sweeper.center
    const arm = beam(sweeper.color, sweeper.radius * 2)
    arm.position.set(cx, cy, cz)
    root.add(arm)
    return { sweeper, arm }
  })

  return {
    update(t) {
      for (const { laser, group } of lasers) {
        if (laser.type === 'sweep') group.position.z = sweepLaserZ(laser, t)
        else group.position.y = verticalLaserY(laser, t)
      }
      for (const { sweeper, arm } of sweepers) arm.rotation.y = -sweeperAngle(sweeper, t)
    },
  }
}

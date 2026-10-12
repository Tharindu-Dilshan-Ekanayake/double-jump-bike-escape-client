import { BufferAttribute, BufferGeometry, Points, PointsMaterial } from 'three'

import { CLIFF_TIERS, CORRIDOR_HALF as C, HALF_WIDTH as W, LOBBY_FRONT_Z, THEMES, mulberry32 } from '../../shared/layout.js'
import { worldBox } from './geometry'
import { fallMaterial, surfaceMaterial } from './materials'
import { LIQUIDS, getGlowTexture, surfaceTile } from './textures'

/**
 * Scenery. None of it collides — the corridor walls and invisible barriers keep
 * riders on the track — so it is free to be big and busy. Flat-coloured props
 * are merged per zone through `Props`; star fields come back in `extras`.
 */

const GREENS = ['#2f9e3a', '#39b045', '#2a8c34']

/* ---------------------------------------------------------------------------
 * Props
 * ------------------------------------------------------------------------- */

function pine(p, x, y, z, s = 1, snowy = false) {
  p.box('#6b4223', [x, y + 1.3 * s, z], [0.9 * s, 2.6 * s, 0.9 * s])
  const layers = [
    [5.2, 2.6],
    [4.0, 4.5],
    [2.8, 6.3],
    [1.5, 7.9],
  ]
  layers.forEach(([w, h], i) => {
    p.box(snowy && i % 2 ? '#f4fbff' : GREENS[i % GREENS.length], [x, y + h * s, z], [w * s, 1.9 * s, w * s])
  })
}

function roundTree(p, x, y, z, s = 1, leaf = '#3fbf3f') {
  p.box('#7a4a26', [x, y + 2 * s, z], [1 * s, 4 * s, 1 * s])
  p.box(leaf, [x, y + 5.2 * s, z], [4.6 * s, 3.4 * s, 4.6 * s])
  p.box(leaf, [x + 0.4 * s, y + 7.2 * s, z - 0.3 * s], [3 * s, 1.6 * s, 3 * s])
}

function bush(p, x, y, z, s = 1, color = '#3caf3c') {
  p.sphere(color, [x, y + 0.8 * s, z], 1.4 * s, { scale: [1.2, 0.8, 1.2] })
  p.sphere(color, [x + 0.9 * s, y + 0.7 * s, z + 0.4 * s], 1 * s, { scale: [1, 0.8, 1] })
}

function flower(p, x, y, z, color) {
  p.box('#3f9e3a', [x, y + 0.4, z], [0.15, 0.8, 0.15])
  p.box(color, [x, y + 0.9, z], [0.5, 0.35, 0.5])
}

function cloud(p, x, y, z, s = 1, color = '#ffffff') {
  p.box(color, [x, y, z], [7 * s, 2.6 * s, 4.6 * s])
  p.box(color, [x - 2.8 * s, y - 0.4 * s, z + 0.4 * s], [4 * s, 2 * s, 3.6 * s])
  p.box(color, [x + 3 * s, y - 0.5 * s, z - 0.3 * s], [4.4 * s, 1.8 * s, 3.8 * s])
  p.box(color, [x + 0.6 * s, y + 1.6 * s, z - 0.3 * s], [4 * s, 1.6 * s, 3 * s])
}

function volcano(p, x, y, z, s = 1) {
  p.cone('#3b302d', [x, y + 6 * s, z], 9 * s, 12 * s, { segments: 7 })
  p.cone('#2d2523', [x, y + 9.5 * s, z], 5 * s, 6 * s, { segments: 7, rot: [0, 0.4, 0] })
  p.cylinder('#ff8a1a', [x, y + 12.3 * s, z], 2.3 * s, 2.3 * s, 0.5 * s, { glow: true, segments: 7 })
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2 + 0.3
    p.box('#ff6a00', [x + Math.cos(a) * 4.3 * s, y + 7.8 * s, z + Math.sin(a) * 4.3 * s], [0.6 * s, 8 * s, 0.6 * s], {
      glow: true,
      rot: [Math.sin(a) * 0.62, 0, -Math.cos(a) * 0.62],
    })
  }
}

function lavaRock(p, x, y, z, s = 1) {
  p.rock('#5a514d', [x, y + 1.4 * s, z], 2 * s, { rot: [0.3, s, 0.2], scale: [1.2, 0.9, 1] })
  p.box('#ff7a1a', [x + 0.8 * s, y + 1.9 * s, z + 1.4 * s], [1.6 * s, 0.25 * s, 0.25 * s], { glow: true, rot: [0, 0.4, 0.3] })
}

function lollipop(p, x, y, z, s = 1, color = '#ff5fa8') {
  p.cylinder('#ffffff', [x, y + 3.5 * s, z], 0.3 * s, 0.3 * s, 7 * s)
  p.cylinder(color, [x, y + 8 * s, z], 2.6 * s, 2.6 * s, 0.6 * s, { rot: [Math.PI / 2, 0, 0], segments: 20 })
  p.cylinder('#ffffff', [x, y + 8 * s, z + 0.05 * s], 1.7 * s, 1.7 * s, 0.62 * s, { rot: [Math.PI / 2, 0, 0], segments: 20 })
  p.cylinder(color, [x, y + 8 * s, z + 0.1 * s], 0.9 * s, 0.9 * s, 0.64 * s, { rot: [Math.PI / 2, 0, 0], segments: 16 })
}

function candyCane(p, x, y, z, s = 1) {
  for (let i = 0; i < 6; i += 1) {
    p.cylinder(i % 2 ? '#ffffff' : '#e8343a', [x, y + (i + 0.5) * 1.3 * s, z], 0.45 * s, 0.45 * s, 1.3 * s)
  }
  p.torus('#e8343a', [x + 1.3 * s, y + 7.8 * s, z], 1.3 * s, 0.45 * s, { arc: Math.PI })
}

function gumdrop(p, x, y, z, s = 1, color = '#7ad8ff') {
  p.sphere(color, [x, y + s, z], 1.8 * s, { scale: [1, 1.1, 1] })
}

function iceCrystal(p, x, y, z, s = 1, color = '#9fe8ff') {
  p.crystal(color, [x, y + 3 * s, z], 2 * s, { scale: [0.8, 2.2, 0.8], rot: [0, s, 0.1] })
  p.crystal('#e2f8ff', [x + 1.8 * s, y + 1.8 * s, z + 0.6 * s], 1.2 * s, { scale: [0.8, 2, 0.8], rot: [0, 0.5, -0.3] })
}

function snowman(p, x, y, z, s = 1) {
  p.sphere('#ffffff', [x, y + 1.6 * s, z], 1.8 * s)
  p.sphere('#ffffff', [x, y + 4.1 * s, z], 1.3 * s)
  p.sphere('#ffffff', [x, y + 6 * s, z], 0.95 * s)
  p.cone('#ff8a1a', [x, y + 6 * s, z + 1.2 * s], 0.22 * s, 1 * s, { rot: [Math.PI / 2, 0, 0] })
  p.box('#222222', [x, y + 7.3 * s, z], [1.4 * s, 1.1 * s, 1.4 * s])
}

function cactus(p, x, y, z, s = 1) {
  p.box('#3f9c3b', [x, y + 3.2 * s, z], [1.3 * s, 6.4 * s, 1.3 * s])
  p.box('#3f9c3b', [x + 1.3 * s, y + 3 * s, z], [1.3 * s, 1 * s, 1 * s])
  p.box('#3f9c3b', [x + 1.8 * s, y + 4 * s, z], [1 * s, 2.4 * s, 1 * s])
  p.box('#3f9c3b', [x - 1.2 * s, y + 2.2 * s, z], [1.1 * s, 0.9 * s, 0.9 * s])
  p.box('#3f9c3b', [x - 1.6 * s, y + 3 * s, z], [0.9 * s, 2 * s, 0.9 * s])
}

function pyramid(p, x, y, z, s = 1) {
  p.cone('#e2b562', [x, y + 6 * s, z], 11 * s, 12 * s, { segments: 4, rot: [0, Math.PI / 4, 0] })
}

function palm(p, x, y, z, s = 1) {
  for (let i = 0; i < 5; i += 1) {
    p.cylinder('#8b5a31', [x + i * 0.25 * s, y + (i + 0.5) * 1.6 * s, z], 0.5 * s, 0.6 * s, 1.6 * s)
  }
  const tx = x + 1.2 * s
  const ty = y + 8 * s
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2
    p.box('#2fa83a', [tx + Math.cos(a) * 2 * s, ty - 0.4 * s, z + Math.sin(a) * 2 * s], [4.2 * s, 0.3 * s, 1.2 * s], { rot: [0, -a, -0.35] })
  }
  p.sphere('#6b4223', [tx, ty - 0.6 * s, z], 0.5 * s)
}

function umbrella(p, x, y, z, s = 1, color = '#ff5f5f') {
  p.cylinder('#f4f4f4', [x, y + 2.5 * s, z], 0.15 * s, 0.15 * s, 5 * s)
  p.cone(color, [x, y + 5.3 * s, z], 3 * s, 1.2 * s, { segments: 8 })
  p.box('#ffffff', [x + 2 * s, y + 0.3 * s, z], [2.2 * s, 0.3 * s, 4 * s])
}

function jungleTree(p, x, y, z, s = 1) {
  p.cylinder('#6b4223', [x, y + 6 * s, z], 0.9 * s, 1.3 * s, 12 * s)
  p.box('#1f7a2c', [x, y + 12 * s, z], [9 * s, 3 * s, 9 * s])
  p.box('#2a8f37', [x + 0.5 * s, y + 14.2 * s, z - 0.3 * s], [6 * s, 2.4 * s, 6 * s])
  for (let i = 0; i < 4; i += 1) {
    p.box('#2f9e3a', [x - 3.5 * s + i * 2.3 * s, y + 8.6 * s, z + 4.2 * s], [0.25 * s, 4 * s, 0.25 * s])
  }
}

function mushroom(p, x, y, z, s = 1, cap = '#e8343a') {
  p.cylinder('#f4ead2', [x, y + 1.5 * s, z], 0.7 * s, 0.9 * s, 3 * s)
  p.sphere(cap, [x, y + 3.2 * s, z], 2.2 * s, { scale: [1, 0.6, 1] })
  p.sphere('#ffffff', [x + 1 * s, y + 3.9 * s, z + 0.8 * s], 0.4 * s)
  p.sphere('#ffffff', [x - 0.9 * s, y + 3.8 * s, z - 0.5 * s], 0.35 * s)
}

function ruin(p, x, y, z, s = 1) {
  p.box('#7d8a6a', [x, y + 4 * s, z], [2.4 * s, 8 * s, 2.4 * s])
  p.box('#7d8a6a', [x + 4 * s, y + 3 * s, z], [2.4 * s, 6 * s, 2.4 * s])
  p.box('#6b775a', [x + 2 * s, y + 8.6 * s, z], [7 * s, 1.4 * s, 2.8 * s], { rot: [0, 0, -0.08] })
}

function barrel(p, x, y, z, s = 1) {
  p.cylinder('#ffd23a', [x, y + 1.6 * s, z], 1.3 * s, 1.3 * s, 3.2 * s, { segments: 14 })
  p.cylinder('#222222', [x, y + 1 * s, z], 1.34 * s, 1.34 * s, 0.35 * s, { segments: 14 })
  p.cylinder('#222222', [x, y + 2.3 * s, z], 1.34 * s, 1.34 * s, 0.35 * s, { segments: 14 })
  p.cylinder('#7dff3a', [x, y + 3.25 * s, z], 1.1 * s, 1.1 * s, 0.12 * s, { glow: true, segments: 14 })
}

function pipe(p, x, y, z, s = 1) {
  p.cylinder('#7f8a97', [x, y + 4 * s, z], 1 * s, 1 * s, 14 * s, { rot: [Math.PI / 2, 0, 0] })
  p.cylinder('#5f6a77', [x, y + 4 * s, z - 6 * s], 1.3 * s, 1.3 * s, 1 * s, { rot: [Math.PI / 2, 0, 0] })
  p.cylinder('#5f6a77', [x, y + 4 * s, z + 6 * s], 1.3 * s, 1.3 * s, 1 * s, { rot: [Math.PI / 2, 0, 0] })
  p.cylinder('#7f8a97', [x, y + 2 * s, z + 6 * s], 1 * s, 1 * s, 4 * s)
}

function chimney(p, x, y, z, s = 1) {
  p.box('#8a4a3a', [x, y + 7 * s, z], [3 * s, 14 * s, 3 * s])
  p.box('#5a5f6a', [x, y + 14.4 * s, z], [3.6 * s, 0.8 * s, 3.6 * s])
  p.box('#ffd23a', [x, y + 4 * s, z + 1.55 * s], [3.02 * s, 0.8 * s, 0.1 * s], { glow: true })
}

function gear(p, x, y, z, s = 1, color = '#9aa3b2') {
  p.cylinder(color, [x, y, z], 3 * s, 3 * s, 0.8 * s, { rot: [0, 0, Math.PI / 2], segments: 16 })
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2
    p.box(color, [x, y + Math.cos(a) * 3.3 * s, z + Math.sin(a) * 3.3 * s], [0.8 * s, 1 * s, 1 * s], { rot: [a, 0, 0] })
  }
  p.cylinder('#5a5f6a', [x, y, z], 0.9 * s, 0.9 * s, 0.9 * s, { rot: [0, 0, Math.PI / 2] })
}

function deadTree(p, x, y, z, s = 1) {
  p.box('#3a2f2a', [x, y + 4 * s, z], [1 * s, 8 * s, 1 * s])
  p.box('#3a2f2a', [x + 1.4 * s, y + 6.4 * s, z], [2.8 * s, 0.6 * s, 0.6 * s], { rot: [0, 0, 0.6] })
  p.box('#3a2f2a', [x - 1.2 * s, y + 5.4 * s, z + 0.3 * s], [2.4 * s, 0.6 * s, 0.6 * s], { rot: [0.2, 0, -0.7] })
}

function gravestone(p, x, y, z, s = 1) {
  p.box('#8a8f99', [x, y + 1.3 * s, z], [1.8 * s, 2.6 * s, 0.5 * s])
  p.cylinder('#8a8f99', [x, y + 2.6 * s, z], 0.9 * s, 0.9 * s, 0.5 * s, { rot: [Math.PI / 2, 0, 0] })
}

function pumpkin(p, x, y, z, s = 1) {
  p.sphere('#ff8a1f', [x, y + s, z], 1.3 * s, { scale: [1.2, 0.9, 1.2] })
  p.box('#3f9e3a', [x, y + 2.1 * s, z], [0.3 * s, 0.6 * s, 0.3 * s])
  p.box('#ffd23a', [x, y + 1.1 * s, z + 1.25 * s], [0.9 * s, 0.25 * s, 0.1 * s], { glow: true })
}

function crystalCluster(p, x, y, z, s = 1, color = '#c9a2ff') {
  p.crystal(color, [x, y + 3 * s, z], 2.2 * s, { scale: [0.7, 2.4, 0.7], glow: true })
  p.crystal('#7ff3ff', [x + 1.8 * s, y + 1.8 * s, z + 0.6 * s], 1.3 * s, { scale: [0.7, 2, 0.7], rot: [0, 0.5, -0.4], glow: true })
  p.crystal('#ff9df5', [x - 1.6 * s, y + 1.5 * s, z - 0.5 * s], 1.1 * s, { scale: [0.7, 2, 0.7], rot: [0.3, 0.2, 0.4], glow: true })
}

function sakuraTree(p, x, y, z, s = 1) {
  p.box('#6b4a3a', [x, y + 2.5 * s, z], [1 * s, 5 * s, 1 * s])
  p.box('#6b4a3a', [x + 1.2 * s, y + 4.8 * s, z], [2.6 * s, 0.6 * s, 0.6 * s], { rot: [0, 0, 0.5] })
  p.sphere('#ffb3dc', [x, y + 6.6 * s, z], 3.2 * s, { scale: [1.3, 0.85, 1.3] })
  p.sphere('#ff9fd2', [x + 2.2 * s, y + 6 * s, z + 0.6 * s], 2.2 * s, { scale: [1.2, 0.85, 1.2] })
}

function lantern(p, x, y, z, s = 1) {
  p.box('#3a2a20', [x, y + 2 * s, z], [0.3 * s, 4 * s, 0.3 * s])
  p.box('#ff4d4d', [x, y + 4.4 * s, z], [1.2 * s, 1.4 * s, 1.2 * s], { glow: true })
}

function holoPillar(p, x, y, z, s = 1, color = '#3dfffa') {
  p.box('#1c1838', [x, y + 6 * s, z], [1.6 * s, 12 * s, 1.6 * s])
  for (let i = 0; i < 4; i += 1) p.box(color, [x, y + (2 + i * 3) * s, z], [1.7 * s, 0.35 * s, 1.7 * s], { glow: true })
  p.torus(color, [x, y + 13 * s, z], 2.2 * s, 0.18 * s, { rot: [Math.PI / 2, 0, 0], glow: true })
}

function goldPillar(p, x, y, z, s = 1) {
  p.cylinder('#ffd447', [x, y + 5 * s, z], 1 * s, 1.2 * s, 10 * s, { segments: 10 })
  p.box('#ffe27a', [x, y + 10.4 * s, z], [3 * s, 0.8 * s, 3 * s])
  p.sphere('#fff3a0', [x, y + 11.6 * s, z], 1 * s, { glow: true })
}

function planet(p, x, y, z, s, rng) {
  const colors = ['#ff9a3a', '#5ad1ff', '#b45cff', '#ff5f8f', '#7dff8a', '#ffd23a']
  p.sphere(colors[Math.floor(rng() * colors.length)], [x, y, z], 6 * s, { segments: 18, rings: 12 })
  if (rng() < 0.6) p.torus('#f4e6c8', [x, y, z], 9 * s, 0.6 * s, { rot: [1.2, 0, 0.3], tubularSegments: 40 })
}

function rainbowArc(p, x, y, z, s = 1, rotY = 0) {
  const colors = ['#ff3b3b', '#ff9a1f', '#ffe23a', '#3bd16b', '#3ba8ff', '#8a4dff']
  colors.forEach((color, i) => {
    p.torus(color, [x, y, z], (14 - i * 1.3) * s, 0.65 * s, { arc: Math.PI, rot: [0, rotY, 0], tubularSegments: 30 })
  })
}

function floatingIsland(p, x, y, z, s, top = '#5cc52f') {
  p.box(top, [x, y, z], [14 * s, 2 * s, 12 * s])
  p.cone('#8b5a31', [x, y - 5 * s, z], 7 * s, 8 * s, { segments: 6, rot: [Math.PI, 0, 0] })
}

function bigHill(p, x, y, z, s, top = '#5cc52f', side = '#8b5a31') {
  for (let t = 0; t < 3; t += 1) {
    const w = (40 - t * 12) * s
    p.box(side, [x, y + (t * 9 + 4) * s, z], [w, 8 * s, w * 0.9])
    p.box(top, [x, y + (t * 9 + 8.5) * s, z], [w + 0.4, 1 * s, w * 0.9 + 0.4])
  }
}

function trophy(p, x, y, z, s = 1) {
  const gold = '#ffcc33'
  p.box('#8a5a2b', [x, y + 1 * s, z], [8 * s, 2 * s, 8 * s])
  p.box(gold, [x, y + 2.6 * s, z], [6 * s, 1.2 * s, 6 * s])
  p.cylinder(gold, [x, y + 5 * s, z], 0.9 * s, 1.4 * s, 3.6 * s)
  p.cylinder(gold, [x, y + 9.5 * s, z], 4.2 * s, 1.6 * s, 6 * s, { segments: 16 })
  p.torus(gold, [x - 4.2 * s, y + 10 * s, z], 1.6 * s, 0.4 * s, { rot: [0, Math.PI / 2, 0] })
  p.torus(gold, [x + 4.2 * s, y + 10 * s, z], 1.6 * s, 0.4 * s, { rot: [0, Math.PI / 2, 0] })
  p.crystal('#fff3a0', [x, y + 14.5 * s, z], 1.6 * s, { glow: true, scale: [1, 1.4, 0.5] })
}

/** A pole with a little flag, lining the lobby road. */
function flagPost(p, x, z, color) {
  p.box('#eef2f8', [x, 3.2, z], [0.4, 6.4, 0.4])
  p.box(color, [x, 5.4, z - 1.3], [0.16, 1.7, 2.6])
  p.sphere('#ffd23a', [x, 6.6, z], 0.35, { glow: true })
}

/** A double chevron painted on the lobby road, pointing towards the course (-Z). */
function roadArrow(p, x, z) {
  for (const [dz, color] of [
    [0, '#ffffff'],
    [4.2, '#ffe23a'],
  ]) {
    const tip = z + dz - 2.6
    for (const side of [-1, 1]) {
      // Each arm runs from the tip back and out to one side.
      const ax = side * 4.4
      const az = 4.6
      const angle = Math.atan2(-az, ax)
      p.box(color, [x + ax / 2, 0.1, tip + az / 2], [Math.hypot(ax, az) + 1.2, 0.07, 1.5], { rot: [0, angle, 0] })
    }
  }
}

function lamp(p, x, y, z, color = '#4ff6ff') {
  p.box('#3b3f4a', [x, y + 3.5, z], [0.6, 7, 0.6])
  p.box('#3b3f4a', [x, y + 7.1, z], [1.6, 0.3, 1.6])
  p.box(color, [x, y + 7.6, z], [1.2, 0.8, 1.2], { glow: true })
}

/* ---------------------------------------------------------------------------
 * Theme tables
 * ------------------------------------------------------------------------- */

/** Small props scattered on the terraces beside a stage. */
const SCATTER = {
  starter: (p, x, y, z, s, rng) => (rng() < 0.7 ? pine(p, x, y, z, s) : bush(p, x, y, z, s)),
  forest: (p, x, y, z, s, rng) => (rng() < 0.75 ? pine(p, x, y, z, s * 1.2) : roundTree(p, x, y, z, s)),
  cloud: (p, x, y, z, s, rng) => cloud(p, x, y + 2 + rng() * 6, z, s * 1.3),
  volcano: (p, x, y, z, s, rng) => (rng() < 0.45 ? volcano(p, x, y, z, s * 0.8) : lavaRock(p, x, y, z, s * 1.4)),
  desert: (p, x, y, z, s, rng) => (rng() < 0.6 ? cactus(p, x, y, z, s) : palm(p, x, y, z, s)),
  ice: (p, x, y, z, s, rng) => {
    const r = rng()
    if (r < 0.45) pine(p, x, y, z, s, true)
    else if (r < 0.85) iceCrystal(p, x, y, z, s * 1.3)
    else snowman(p, x, y, z, s)
  },
  candy: (p, x, y, z, s, rng) => {
    const r = rng()
    if (r < 0.4) lollipop(p, x, y, z, s, ['#ff5fa8', '#7ad8ff', '#ffd23a', '#a46bff'][Math.floor(rng() * 4)])
    else if (r < 0.7) candyCane(p, x, y, z, s)
    else gumdrop(p, x, y, z, s * 1.5, ['#7ad8ff', '#ffd23a', '#7dff8a', '#ff7a7a'][Math.floor(rng() * 4)])
  },
  neon: (p, x, y, z, s, rng) => holoPillar(p, x, y, z, s, rng() < 0.5 ? '#3dfffa' : '#ff3df2'),
  space: (p, x, y, z, s, rng) => p.rock('#8a8f99', [x, y + 1.5 * s, z], (1.5 + rng() * 2) * s, { rot: [rng() * 3, rng() * 3, 0] }),
  rainbow: (p, x, y, z, s, rng) => cloud(p, x, y + 2 + rng() * 6, z, s * 1.2, rng() < 0.5 ? '#ffffff' : '#ffe3f7'),
  finish: (p, x, y, z, s) => goldPillar(p, x, y, z, s),
  jungle: (p, x, y, z, s, rng) => {
    const r = rng()
    if (r < 0.5) jungleTree(p, x, y, z, s * 0.8)
    else if (r < 0.75) mushroom(p, x, y, z, s * 1.4)
    else ruin(p, x, y, z, s)
  },
  beach: (p, x, y, z, s, rng) => (rng() < 0.6 ? palm(p, x, y, z, s * 1.1) : umbrella(p, x, y, z, s, ['#ff5f5f', '#3fa8ff', '#ffd23a'][Math.floor(rng() * 3)])),
  toxic: (p, x, y, z, s, rng) => (rng() < 0.6 ? barrel(p, x, y, z, s * 1.3) : pipe(p, x, y, z, s)),
  haunted: (p, x, y, z, s, rng) => {
    const r = rng()
    if (r < 0.4) deadTree(p, x, y, z, s * 1.2)
    else if (r < 0.75) gravestone(p, x, y, z, s * 1.3)
    else pumpkin(p, x, y, z, s * 1.3)
  },
  crystal: (p, x, y, z, s) => crystalCluster(p, x, y, z, s * 1.2),
  factory: (p, x, y, z, s, rng) => (rng() < 0.5 ? chimney(p, x, y, z, s) : gear(p, x, y + 4 * s, z, s)),
  sakura: (p, x, y, z, s, rng) => (rng() < 0.75 ? sakuraTree(p, x, y, z, s) : lantern(p, x, y, z, s * 1.2)),
  magma: (p, x, y, z, s, rng) => (rng() < 0.5 ? volcano(p, x, y, z, s * 0.9) : lavaRock(p, x, y, z, s * 1.6)),
  galaxy: (p, x, y, z, s, rng) => crystalCluster(p, x, y, z, s, rng() < 0.5 ? '#b45cff' : '#5ad1ff'),
  golden: (p, x, y, z, s) => goldPillar(p, x, y, z, s),
}

/** Huge set pieces out beyond the terraces. `y0` is far below, `top` the plateau. */
const BACKDROP = {
  starter: (p, x, y0, top, z, s) => bigHill(p, x, y0, z, s * 1.6),
  forest: (p, x, y0, top, z, s) => bigHill(p, x, y0, z, s * 1.8, '#4fd83a'),
  jungle: (p, x, y0, top, z, s) => bigHill(p, x, y0, z, s * 1.8, '#2f8f3a', '#5a4630'),
  sakura: (p, x, y0, top, z, s) => bigHill(p, x, y0, z, s * 1.6, '#ff9fd2', '#8a5a34'),
  cloud: (p, x, y0, top, z, s, rng) => cloud(p, x, top + 20 + rng() * 60, z, s * 4),
  rainbow: (p, x, y0, top, z, s, rng) => (rng() < 0.5 ? rainbowArc(p, x, top + 10, z, s * 2.5, Math.PI / 2) : cloud(p, x, top + 30, z, s * 4, '#ffe3f7')),
  finish: (p, x, y0, top, z, s) => floatingIsland(p, x, top + 10, z, s * 2, '#ffd447'),
  golden: (p, x, y0, top, z, s) => floatingIsland(p, x, top + 10, z, s * 2, '#ffd447'),
  crystal: (p, x, y0, top, z, s) => crystalCluster(p, x, top - 20, z, s * 6),
  volcano: (p, x, y0, top, z, s) => volcano(p, x, y0, z, s * 5),
  magma: (p, x, y0, top, z, s) => volcano(p, x, y0, z, s * 6),
  desert: (p, x, y0, top, z, s) => pyramid(p, x, y0 + 10, z, s * 5),
  beach: (p, x, y0, top, z, s) => bigHill(p, x, y0, z, s * 1.5, '#f0d08a', '#d8a65c'),
  ice: (p, x, y0, top, z, s) => p.cone('#e8f6ff', [x, y0 + 40 * s, z], 30 * s, 80 * s, { segments: 6 }),
  candy: (p, x, y0, top, z, s, rng) => lollipop(p, x, top - 30, z, s * 5, ['#ff5fa8', '#7ad8ff', '#ffd23a'][Math.floor(rng() * 3)]),
  neon: (p, x, y0, top, z, s) => holoPillar(p, x, top - 40, z, s * 6, '#ff3df2'),
  space: (p, x, y0, top, z, s, rng) => planet(p, x, top + 30 + rng() * 40, z, s * 3, rng),
  galaxy: (p, x, y0, top, z, s, rng) => planet(p, x, top + 30 + rng() * 40, z, s * 3, rng),
  toxic: (p, x, y0, top, z, s) => chimney(p, x, y0, z, s * 6),
  factory: (p, x, y0, top, z, s) => chimney(p, x, y0, z, s * 7),
  haunted: (p, x, y0, top, z, s) => deadTree(p, x, y0 + 20, z, s * 9),
}

/** Things sitting at the base of the corridor walls, inside the course. */
const CORRIDOR = {
  cloud: (p, x, y, z, s, rng) => cloud(p, x, y + 1.5, z, s * (0.9 + rng() * 0.5)),
  rainbow: (p, x, y, z, s) => cloud(p, x, y + 1.5, z, s, '#ffe3f7'),
  volcano: (p, x, y, z, s, rng) => (rng() < 0.5 ? volcano(p, x, y, z, s * 0.45) : lavaRock(p, x, y, z, s)),
  magma: (p, x, y, z, s) => lavaRock(p, x, y, z, s * 1.2),
  forest: (p, x, y, z, s) => bush(p, x, y, z, s * 1.3, '#3fbf3f'),
  starter: (p, x, y, z, s) => bush(p, x, y, z, s),
  jungle: (p, x, y, z, s) => mushroom(p, x, y, z, s),
  crystal: (p, x, y, z, s) => crystalCluster(p, x, y, z, s * 0.6),
  ice: (p, x, y, z, s) => iceCrystal(p, x, y, z, s * 0.7),
  candy: (p, x, y, z, s) => gumdrop(p, x, y, z, s),
  sakura: (p, x, y, z, s) => lantern(p, x, y, z, s),
  haunted: (p, x, y, z, s) => pumpkin(p, x, y, z, s),
  neon: (p, x, y, z, s) => holoPillar(p, x, y, z, s * 0.5),
}

/* ---------------------------------------------------------------------------
 * Stages
 * ------------------------------------------------------------------------- */

const FLOATS_IN_PIT = new Set(['cloud', 'rainbow'])

/**
 * How each theme's cliffs are finished: the trim colour along every terrace's
 * top edge (`glow` makes it shine), whether grass/snow/icing drips over the
 * edge, and what pours down the cliff face as a waterfall.
 */
const CLIFF_STYLE = {
  starter: { trim: '#55c22c', drips: true, fall: 'water' },
  forest: { trim: '#4fd83a', drips: true, fall: 'water' },
  cloud: { trim: '#ffffff', drips: true, fall: 'water' },
  volcano: { trim: '#e8342a', glow: true, fall: 'lava' },
  desert: { trim: '#c98a3a' },
  ice: { trim: '#ffffff', drips: true, fall: 'icewater' },
  candy: { trim: '#ffffff', drips: true, fall: 'goo' },
  neon: { trim: '#3dfffa', glow: true },
  space: { trim: '#7ff3ff', glow: true },
  rainbow: { trim: 'rainbow', fall: 'water' },
  finish: { trim: '#ffd23a', glow: true },
  jungle: { trim: '#2f9e3a', drips: true, fall: 'water' },
  beach: { trim: '#ffffff', fall: 'water' },
  toxic: { trim: '#8cff3a', glow: true, fall: 'slime' },
  haunted: { trim: '#7a4dff', glow: true },
  crystal: { trim: '#c9a2ff', glow: true },
  factory: { trim: '#ffcc1a' },
  sakura: { trim: '#ff9fd6', drips: true, fall: 'water' },
  magma: { trim: '#ff5a1f', glow: true, fall: 'lava' },
  galaxy: { trim: '#b45cff', glow: true },
  golden: { trim: '#fff3a0', glow: true },
}

const RAINBOW = ['#ff3b3b', '#ff9a1f', '#ffe23a', '#3bd16b', '#3ba8ff', '#8a4dff']
const DETAIL_RANGE = 150

/**
 * Terraced cliffs beside the course, built in blocky segments of varying height
 * like Roblox terrain. Segments are short (detailed) near islands and long in
 * the middle of big gaps, which riders only see from high up.
 */
function buildCliffs(p, batch, stage, rng) {
  const theme = THEMES[stage.theme]
  const style = CLIFF_STYLE[stage.theme] || {}
  const scatter = SCATTER[stage.theme]
  const zone = stage.world * 100 + stage.index
  const ox = stage.originX
  const top = stage.floorY
  const bottom = stage.valleyY - 10
  const wall = surfaceMaterial(theme.wall)
  const cap = surfaceMaterial(theme.side)
  const near = (z) => z < stage.wallZ + DETAIL_RANGE || z > stage.zStart - DETAIL_RANGE
  const fallZ = style.fall ? stage.wallZ - 10 - rng() * 30 : null

  for (const side of [-1, 1]) {
    let segment = 0
    CLIFF_TIERS.forEach(([a, b, h], tier) => {
      let z = stage.zStart
      while (z > stage.plateauZ1 + 0.5) {
        const detailed = near(z)
        const len = detailed ? 22 + rng() * 22 : 70 + rng() * 50
        const zEnd = Math.max(stage.plateauZ1, z - len)
        const height = h + Math.round((rng() - 0.5) * (4 + tier * 4))
        // Tier 0 steps back from the pit a little; higher tiers overlap the one below.
        const inner = tier === 0 ? a + rng() * 2.5 : a - rng() * 3
        const x0 = ox + side * (C + inner)
        const x1 = ox + side * (C + b)
        const lo = Math.min(x0, x1)
        const hi = Math.max(x0, x1)
        const zone2 = `#${zone}`
        batch.add(`${theme.wall}${zone2}`, worldBox([lo, bottom, zEnd], [hi, top + height - 1, z], surfaceTile(theme.wall)), wall)
        batch.add(`${theme.side}${zone2}`, worldBox([lo, top + height - 1, zEnd], [hi, top + height, z], surfaceTile(theme.side)), cap)

        // Trim along the terrace's inner top edge, with drips hanging over it.
        const trim = style.trim === 'rainbow' ? RAINBOW[segment % RAINBOW.length] : style.trim
        segment += 1
        if (trim) {
          const xt = x0 - side * 0.15
          p.box(trim, [xt, top + height - 0.15, (z + zEnd) / 2], [1.1, 0.5, z - zEnd], { glow: style.glow })
          if (style.drips && tier === 0 && detailed) {
            for (let dz = z - 1 - rng() * 2; dz > zEnd + 1; dz -= 2 + rng() * 2.5) {
              const drop = 0.8 + rng() * 2.4
              p.box(trim, [xt - side * 0.2, top + height - drop / 2, dz], [0.7, drop, 1.2 + rng() * 1.2])
            }
          }
        }

        // A waterfall (or lava/slime fall) down the first terrace, near the island.
        if (tier === 0 && fallZ !== null && z >= fallZ && zEnd <= fallZ) {
          const fx = x0 - side * 0.3
          const width = Math.min(8, z - zEnd - 1)
          batch.add(
            `fall:${style.fall}${zone2}`,
            worldBox([Math.min(fx, x0 - side * 0.05), stage.valleyY, fallZ - width / 2], [Math.max(fx, x0 - side * 0.05), top + height, fallZ + width / 2], 8),
            fallMaterial(style.fall),
          )
          for (let k = 0; k < 5; k += 1) {
            p.sphere(style.fall === 'lava' ? '#ffb21f' : '#ffffff', [fx - side * (0.6 + rng() * 2), stage.valleyY + 0.4, fallZ + (rng() - 0.5) * width], 0.9 + rng() * 0.8, {
              scale: [1.2, 0.5, 1.2],
              glow: style.fall === 'lava',
            })
          }
        }

        // Props on the terrace top: plenty near islands, a few in between.
        if (scatter) {
          const count = detailed ? Math.floor((z - zEnd) / 14) : rng() < 0.5 ? 1 : 0
          for (let k = 0; k < count; k += 1) {
            if (tier > 0 && rng() < 0.4) continue
            const px = ox + side * (C + Math.max(inner, a) + 4 + rng() * (b - Math.max(inner, a) - 8))
            scatter(p, px, top + height, zEnd + rng() * (z - zEnd), 0.9 + rng() * 0.6 + tier * 0.15, rng)
          }
        }
        z = zEnd
      }
    })
  }
}

/* ---------------------------------------------------------------------------
 * Rivers
 * ------------------------------------------------------------------------- */

/** Foam (or a glowing rim) where each kind of river meets the island. */
const RIVER_FOAM = {
  water: '#ffffff',
  sea: '#ffffff',
  sakura: '#ffffff',
  icewater: '#ffffff',
  crystal: '#ffffff',
  rainbow: '#ffffff',
  lava: '#ffd23a',
  molten: '#fff07a',
  gold: '#fff3a0',
  neon: '#3dfffa',
  ghost: '#c9b6ff',
  void: '#b59cff',
  slime: '#d6ff7a',
  chocolate: '#f6dcc4',
  swamp: '#a8c26a',
  quicksand: '#e8cf98',
}

const RIVER_ROCK = { lava: '#2f2522', molten: '#3b3f48', chocolate: '#4a2a14', quicksand: '#b98c52', icewater: '#d7f1ff', gold: '#c98a12' }

function lilyPad(p, x, y, z, s, rng, petal = false) {
  p.cylinder(petal ? '#ff9fd2' : '#3fae3a', [x, y + 0.1, z], 2.1 * s, 2.1 * s, 0.16)
  if (rng() < 0.4) p.sphere(petal ? '#ffffff' : '#ff9fd6', [x + 0.6 * s, y + 0.45, z], 0.45 * s)
}

/** Little things floating on each kind of river, near the islands. */
const RIVER_FLOATS = {
  water: (p, x, y, z, s, rng) => lilyPad(p, x, y, z, s, rng),
  swamp: (p, x, y, z, s, rng) => lilyPad(p, x, y, z, s * 1.2, rng),
  sakura: (p, x, y, z, s, rng) => lilyPad(p, x, y, z, s, rng, true),
  sea: (p, x, y, z, s, rng) => (rng() < 0.5 ? p.torus('#ff5a4f', [x, y + 0.3, z], 1.1 * s, 0.4 * s, { rot: [Math.PI / 2, 0, 0] }) : lilyPad(p, x, y, z, s, rng)),
  icewater: (p, x, y, z, s, rng) => p.box(rng() < 0.5 ? '#f4fcff' : '#dff4ff', [x, y + 0.25, z], [4 * s, 0.7, 3 * s], { rot: [0, rng() * Math.PI, 0] }),
  chocolate: (p, x, y, z, s, rng) => p.cylinder(rng() < 0.5 ? '#fff4fb' : '#ffc4e4', [x, y + 0.5, z], 1.1 * s, 1.1 * s, 1.4 * s),
  lava: (p, x, y, z, s) => {
    p.rock('#2f2522', [x, y + 0.2, z], 1.5 * s)
    p.sphere('#ffb21f', [x, y + 1.1 * s, z], 0.35 * s, { glow: true })
  },
  molten: (p, x, y, z, s) => p.rock('#4a4e58', [x, y + 0.2, z], 1.4 * s),
  gold: (p, x, y, z, s) => p.crystal('#fff3a0', [x, y + 0.6, z], 0.9 * s, { glow: true }),
  crystal: (p, x, y, z, s) => p.crystal('#c9a2ff', [x, y + 0.6, z], 1 * s, { glow: true }),
  rainbow: (p, x, y, z, s, rng) => p.sphere(['#ff8a8a', '#fff07a', '#8ff0a6', '#8fd0ff'][Math.floor(rng() * 4)], [x, y + 0.4, z], 0.8 * s, { glow: true, scale: [1, 0.5, 1] }),
  neon: (p, x, y, z, s, rng) => p.sphere(rng() < 0.5 ? '#3dfffa' : '#ff3df2', [x, y + 0.3, z], 0.7 * s, { glow: true, scale: [1, 0.4, 1] }),
  ghost: (p, x, y, z, s) => p.sphere('#c9b6ff', [x, y + 0.3, z], 0.7 * s, { glow: true, scale: [1, 0.4, 1] }),
  slime: (p, x, y, z, s) => p.sphere('#d6ff7a', [x, y + 0.3, z], 0.8 * s, { glow: true, scale: [1, 0.45, 1] }),
}

/** Foam round the island, rocks at the cliff foot and things floating near the islands. */
function decorateRiver(p, stage, rng) {
  const kind = THEMES[stage.theme].river
  const y = stage.valleyY
  const ox = stage.originX
  const glow = Boolean(LIQUIDS[kind]?.glow)
  const foam = RIVER_FOAM[kind] ?? '#ffffff'
  const rock = RIVER_ROCK[kind] ?? '#7f8794'
  const float = RIVER_FLOATS[kind]

  const length = stage.wallZ - stage.plateauZ1
  for (const side of [-1, 1]) p.box(foam, [ox + side * (W + 0.7), y + 0.05, stage.plateauZ1 + length / 2], [1.4, 0.1, length + 1.4], { glow })
  p.box(foam, [ox, y + 0.05, stage.wallZ + 0.7], [W * 2 + 2.8, 0.1, 1.4], { glow })

  const near = (z) => z < stage.wallZ + DETAIL_RANGE || z > stage.zStart - DETAIL_RANGE
  for (let z = stage.zStart - 6; z > stage.plateauZ1 + 4; z -= 9 + rng() * 14) {
    if (!near(z)) continue
    for (const side of [-1, 1]) {
      if (rng() < 0.55) p.rock(rock, [ox + side * (C - 1.5 - rng() * 3), y + 0.2, z], 1.1 + rng() * 1.5)
    }
    if (float && rng() < 0.5) {
      // Beside the island, or anywhere across the gap in front of it.
      const besideIsland = z < stage.wallZ + 2
      const side = rng() < 0.5 ? -1 : 1
      const x = besideIsland ? side * (W + 5 + rng() * (C - W - 12)) : (rng() - 0.5) * 2 * (C - 8)
      float(p, ox + x, y, z, 0.8 + rng() * 0.5, rng)
    }
  }
}

export function decorateStage(p, batch, stage, extras) {
  const theme = THEMES[stage.theme]
  const rng = mulberry32(stage.gid * 7919 + 13)
  const ox = stage.originX
  const top = stage.floorY
  const backdrop = BACKDROP[stage.theme]
  const corridor = CORRIDOR[stage.theme]
  const outer = CLIFF_TIERS[CLIFF_TIERS.length - 1][1]
  const length = stage.zStart - stage.plateauZ1

  buildCliffs(p, batch, stage, rng)
  decorateRiver(p, stage, rng)

  for (const side of [-1, 1]) {
    // Big set pieces far beyond the cliffs.
    const step = Math.max(80, length / 14)
    for (let z = stage.zStart - 20; z > stage.plateauZ1; z -= step * (0.8 + rng() * 0.4)) {
      backdrop?.(p, ox + side * (C + outer + 40 + rng() * 120), stage.valleyY - 30, top, z, 1 + rng() * 0.6, rng)
    }
    // Props along the island's side edges (the landing zone by the pads stays clear).
    if (corridor) {
      for (let z = stage.wallZ - 6; z > stage.plateauZ1 + 4; z -= 14 + rng() * 10) {
        if (z > stage.wallZ - 28) continue
        corridor(p, ox + side * (W - 3 - rng() * 2), top, z, 0.8 + rng() * 0.3, rng)
      }
    }
    // Clouds drifting in the pit beside and in front of the island.
    if (FLOATS_IN_PIT.has(stage.theme)) {
      const cloudStep = Math.max(18, length / 40)
      for (let z = stage.zStart - 4; z > stage.plateauZ1 + 4; z -= cloudStep * (0.8 + rng() * 0.6)) {
        const inGap = z > stage.wallZ
        const x = inGap ? (rng() - 0.5) * 2 * (C - 8) : side * (W + 6 + rng() * (C - W - 12))
        cloud(p, ox + x, stage.valleyY + 2 + rng() * 4, z, 0.9 + rng() * 0.6, stage.theme === 'rainbow' && rng() < 0.5 ? '#ffe3f7' : '#ffffff')
      }
    }
  }

  // Grass hanging over the top edge of the island's front face.
  if (theme.fringe) {
    for (let x = -W; x < W; x += 2) {
      const drop = 0.8 + rng() * 1.8
      p.box(theme.fringe, [ox + x + 1, top - drop / 2, stage.wallZ + 0.35], [2.02, drop + 0.4, 0.7])
    }
  }

  if (stage.trophy) trophy(p, stage.trophy[0], stage.trophy[1], stage.trophy[2], 1.6)
  if (stage.theme === 'space' || stage.theme === 'galaxy') extras.push(starField(stage, rng))
}

function starField(stage, rng) {
  const count = 700
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = stage.originX + (rng() - 0.5) * 700
    positions[i * 3 + 1] = stage.valleyY - 60 + rng() * 260
    positions[i * 3 + 2] = stage.plateauZ1 + rng() * (stage.zStart - stage.plateauZ1)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  const material = new PointsMaterial({ map: getGlowTexture(), size: 2.6, transparent: true, depthWrite: false, color: '#e6dcff', toneMapped: false })
  return new Points(geometry, material)
}

/* ---------------------------------------------------------------------------
 * Lobbies
 * ------------------------------------------------------------------------- */

export function decorateLobby(p, batch, lobby) {
  const { world, originX: ox, halfX, back, hills, spawnZ } = lobby
  const rng = mulberry32(4242 + world)
  const zone = world * 100
  const w2 = world === 2
  const tree = w2 ? sakuraTree : pine

  // Terraced hills ringing the island: both sides and the back.
  const terraces = [
    [-halfX - 70, 40, 70, 160],
    [halfX + 75, 40, 70, 160],
    [-halfX - 40, back + 70, 120, 70],
    [0, back + 75, 140, 70],
    [halfX + 40, back + 70, 120, 70],
  ]
  for (const [x, z, w, d] of terraces) {
    for (let tier = 0; tier < 3; tier += 1) {
      const tw = w - tier * 18
      const td = d - tier * 16
      const top = 6 + tier * 7
      batch.add(`dirt#${zone}`, worldBox([ox + x - tw / 2, -0.3, z - td / 2], [ox + x + tw / 2, top - 1, z + td / 2], 8), surfaceMaterial('dirt'))
      batch.add(`${hills}#${zone}`, worldBox([ox + x - tw / 2, top - 1, z - td / 2], [ox + x + tw / 2, top, z + td / 2], surfaceTile(hills)), surfaceMaterial(hills))
      for (let k = 0; k < 4; k += 1) tree(p, ox + x + (rng() - 0.5) * (tw - 8), top, z + (rng() - 0.5) * (td - 8), 0.9 + rng() * 0.7)
    }
  }

  // Trees and bushes on the open grass around the plaza.
  for (let i = 0; i < 60; i += 1) {
    const side = rng() < 0.5 ? -1 : 1
    const x = side * (halfX + 8 + rng() * 40)
    const z = LOBBY_FRONT_Z + 10 + rng() * (back - LOBBY_FRONT_Z + 20)
    if (rng() < 0.7) tree(p, ox + x, -0.25, z, 0.8 + rng() * 0.6)
    else bush(p, ox + x, -0.25, z, 1 + rng(), w2 ? '#ff9fd2' : '#3caf3c')
  }

  // Lamp posts around the plaza edge.
  const lampColor = w2 ? '#ff7ad9' : '#4ff6ff'
  for (let z = back - 6; z > LOBBY_FRONT_Z + 6; z -= 26) {
    lamp(p, ox - halfX + 2.5, 0, z, lampColor)
    lamp(p, ox + halfX - 2.5, 0, z, lampColor)
  }
  for (let x = -halfX + 20; x < halfX - 10; x += 30) lamp(p, ox + x, 0, back - 2.5, lampColor)

  // The brick road to the course: white edges, flag posts, and arrows painted
  // on it pointing the way to the first jump.
  const roadEnd = spawnZ - 9
  const flags = w2 ? ['#ff7ad9', '#c46bff', '#7ff3ff'] : ['#ff3b5c', '#ffd23a', '#3bd16b', '#3ba8ff']
  for (const side of [-1, 1]) {
    p.box('#ffffff', [ox + side * 9.2, 0.1, (LOBBY_FRONT_Z + roadEnd) / 2], [0.7, 0.08, roadEnd - LOBBY_FRONT_Z])
    let k = side > 0 ? 1 : 0
    for (let z = roadEnd - 8; z > LOBBY_FRONT_Z + 8; z -= 18) flagPost(p, ox + side * 12.5, z, flags[k++ % flags.length])
  }
  for (let z = roadEnd - 10; z > LOBBY_FRONT_Z + 4; z -= 19) roadArrow(p, ox, z)

  // Flower beds and benches by the spawn.
  const colors = w2 ? ['#ff7ad9', '#c46bff', '#7ff3ff'] : ['#ff5f5f', '#ffd23a', '#ff9fd6', '#7ad8ff']
  for (const side of [-1, 1]) {
    const bx = ox + side * 18
    p.box('#8b5a31', [bx, 0.35, spawnZ], [6, 0.7, 14])
    p.box(w2 ? '#ff8cc6' : '#4fbf2a', [bx, 0.75, spawnZ], [5.4, 0.2, 13.4])
    for (let i = 0; i < 14; i += 1) flower(p, bx + (rng() - 0.5) * 4.6, 0.8, spawnZ + (rng() - 0.5) * 12.4, colors[i % colors.length])
    // Benches facing the road.
    const bz = spawnZ - 22
    p.box('#8a5a34', [ox + side * 13, 1.1, bz], [1.4, 0.3, 5])
    p.box('#8a5a34', [ox + side * 13.6, 1.9, bz], [0.3, 1.4, 5])
    p.box('#3b3f4a', [ox + side * 13, 0.55, bz - 2], [1.2, 1.1, 0.3])
    p.box('#3b3f4a', [ox + side * 13, 0.55, bz + 2], [1.2, 1.1, 0.3])
  }

  if (w2) {
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * Math.PI * 2
      crystalCluster(p, ox + Math.cos(a) * 44, 0, Math.sin(a) * 14, 0.6)
    }
  }
}

import { MeshBasicMaterial, MeshStandardMaterial } from 'three'

import { LIQUIDS, getLiquidTexture, getSurfaceTexture } from './textures'

/** Shared materials, created on first use and cached by key. */

const surfaces = new Map()
const liquids = new Map()
const falls = new Map()
const rivers = new Map()

/** Surfaces that glow a little (lava checker, neon grids...), by emissive strength. */
const GLOWING = {
  yellowChecker: 0.22,
  lavaChecker: 0.55,
  neonFloor: 0.7,
  neonWall: 0.6,
  slimeFloor: 0.3,
  magmaTile: 0.35,
  galaxyWall: 0.35,
  spaceTile: 0.3,
}

export function surfaceMaterial(key) {
  let material = surfaces.get(key)
  if (material) return material
  const map = getSurfaceTexture(key)
  if (key === 'neon') {
    material = new MeshBasicMaterial({ color: '#4ff6ff', toneMapped: false })
    material.userData.noShadow = true
  } else if (key === 'standPad') {
    material = new MeshStandardMaterial({ map, emissive: '#22c9ec', emissiveIntensity: 0.45, roughness: 0.6 })
  } else if (key === 'galleryPad') {
    material = new MeshStandardMaterial({ map, emissive: '#2fdc6a', emissiveIntensity: 0.4, roughness: 0.6 })
  } else if (key.startsWith('belt_')) {
    // Each belt owns its texture so it can scroll; see animateMaterials().
    material = new MeshStandardMaterial({ map, roughness: 0.9, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: 0.35 })
    material.userData.belt = true
  } else if (GLOWING[key]) {
    material = new MeshStandardMaterial({ map, roughness: 0.7, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: GLOWING[key] })
  } else if (key === 'crystalTile' || key === 'crystalWall' || key === 'poolTile') {
    material = new MeshStandardMaterial({ map, roughness: 0.3, metalness: 0.05 })
  } else if (key === 'gold' || key === 'goldWall') {
    material = new MeshStandardMaterial({ map, roughness: 0.35, metalness: 0.3, emissive: '#6b4500', emissiveIntensity: 0.2 })
  } else if (key === 'ice' || key === 'iceWall') {
    material = new MeshStandardMaterial({ map, roughness: 0.25, metalness: 0.05 })
  } else if (key.startsWith('train_') || key === 'returnPad' || key === 'doublePad') {
    material = new MeshStandardMaterial({ map, roughness: 0.5, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: 0.12 })
  } else {
    material = new MeshStandardMaterial({ map, roughness: 0.85, metalness: 0 })
  }
  surfaces.set(key, material)
  return material
}

/**
 * Waterfalls (and lava/slime falls) down the cliffs: the liquid texture flowing
 * down. `opaque` is for the little steps between river segments.
 */
export function fallMaterial(kind, opaque = false) {
  const key = `${kind}:${opaque}`
  let material = falls.get(key)
  if (material) return material
  const spec = LIQUIDS[kind] || LIQUIDS.water
  const map = getLiquidTexture(kind).clone()
  map.needsUpdate = true
  material = new MeshStandardMaterial({
    map,
    roughness: 0.25,
    emissive: '#ffffff',
    emissiveMap: map,
    emissiveIntensity: spec.glow ?? 0.25,
    transparent: !spec.glow && !opaque,
    opacity: spec.glow || opaque ? 1 : 0.9,
  })
  material.userData.noShadow = true
  falls.set(key, material)
  return material
}

/** The river through a stage's pit, flowing towards the lobby (+Z). */
export function riverMaterial(kind) {
  let material = rivers.get(kind)
  if (material) return material
  const spec = LIQUIDS[kind] || LIQUIDS.water
  const map = getLiquidTexture(kind).clone()
  map.needsUpdate = true
  material = new MeshStandardMaterial({
    map,
    roughness: spec.glow ? 0.55 : 0.12,
    metalness: 0.05,
    emissive: '#ffffff',
    emissiveMap: map,
    emissiveIntensity: spec.glow ?? 0.14,
  })
  material.userData.flow = spec.flow ?? 0.06
  // Casts no shadow, but riders' shadows still fall on the water.
  material.userData.noShadow = true
  rivers.set(kind, material)
  return material
}

export function liquidMaterial(kind) {
  let material = liquids.get(kind)
  if (material) return material
  const spec = LIQUIDS[kind] || LIQUIDS.water
  const map = getLiquidTexture(kind)
  if (spec.glow) {
    material = new MeshStandardMaterial({
      map,
      emissive: '#ffffff',
      emissiveMap: map,
      emissiveIntensity: spec.glow,
      roughness: 0.6,
    })
  } else {
    material = new MeshStandardMaterial({
      map,
      roughness: 0.18,
      metalness: 0.05,
      transparent: (spec.opacity ?? 1) < 1,
      opacity: spec.opacity ?? 1,
    })
  }
  material.userData.noShadow = true
  material.userData.scroll = spec.speed
  liquids.set(kind, material)
  return material
}

/** Flat-coloured decoration; colours come from the geometry's vertex colours. */
export const propsMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.02 })
/** Unlit vertex-coloured glow (lava streaks, neon trims, crystals). */
export const glowMaterial = new MeshBasicMaterial({ vertexColors: true, toneMapped: false })
glowMaterial.userData.noShadow = true

/** Scrolls every liquid texture, river and treadmill belt; call once per frame. */
export function animateMaterials(dt) {
  for (const material of surfaces.values()) {
    if (material.userData.belt) material.map.offset.y = (material.map.offset.y - dt * 1.4) % 1
  }
  for (const material of falls.values()) {
    material.map.offset.y = (material.map.offset.y + dt * 0.9) % 1
  }
  for (const material of rivers.values()) {
    material.map.offset.y = (material.map.offset.y - dt * material.userData.flow) % 1
  }
  for (const material of liquids.values()) {
    const speed = material.userData.scroll || 0
    material.map.offset.x = (material.map.offset.x + speed * dt) % 1
    material.map.offset.y = (material.map.offset.y + speed * 0.6 * dt) % 1
  }
}

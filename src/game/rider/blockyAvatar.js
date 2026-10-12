import { BoxGeometry, CanvasTexture, Group, Mesh, MeshStandardMaterial, Quaternion, SRGBColorSpace } from 'three'

import { AVATAR_SCALE, DOWN, RIG, UP, applyAim } from './riderPose'

const IDENTITY = new Quaternion()
const qSpine = new Quaternion()
const qUpper = new Quaternion()
const qScratch = new Quaternion()

/**
 * Classic blocky avatar with the same proportions and joints as Bloxity's
 * player.glb. Shown while the real avatar downloads, or instead of it when the
 * avatar CDN can't be reached, and posed with the same IK angles.
 */

const SHIRTS = ['#2f6bff', '#e8433a', '#2fbf55', '#ff9a1f', '#9b4dff', '#1fc7c7', '#ff5fa8', '#3a3f4b']
const HAIR = ['#5a3218', '#c56b1c', '#1d1d1d', '#e8c25a', '#8a3b1a']

function hash(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

let faceTexture = null
function face() {
  if (faceTexture) return faceTexture
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const g = canvas.getContext('2d')
  g.fillStyle = '#f5cd30'
  g.fillRect(0, 0, 128, 128)
  g.fillStyle = '#1b1b1b'
  g.beginPath()
  g.ellipse(44, 52, 7, 12, 0, 0, Math.PI * 2)
  g.ellipse(84, 52, 7, 12, 0, 0, Math.PI * 2)
  g.fill()
  g.lineWidth = 7
  g.lineCap = 'round'
  g.strokeStyle = '#1b1b1b'
  g.beginPath()
  g.arc(64, 72, 24, 0.2 * Math.PI, 0.8 * Math.PI)
  g.stroke()
  faceTexture = new CanvasTexture(canvas)
  faceTexture.colorSpace = SRGBColorSpace
  return faceTexture
}

function part(w, h, d, material, y = -h / 2) {
  const mesh = new Mesh(new BoxGeometry(w, h, d), material)
  mesh.position.y = y
  mesh.castShadow = true
  return mesh
}

export function createBlockyAvatar(seed = 'rider') {
  const h = hash(seed)
  const skin = new MeshStandardMaterial({ color: '#f5cd30', roughness: 0.7 })
  const shirt = new MeshStandardMaterial({ color: SHIRTS[h % SHIRTS.length], roughness: 0.75 })
  const pants = new MeshStandardMaterial({ color: '#2b3140', roughness: 0.8 })
  const hair = new MeshStandardMaterial({ color: HAIR[(h >> 4) % HAIR.length], roughness: 0.9 })
  const headMats = [skin, skin, hair, skin, new MeshStandardMaterial({ map: face(), roughness: 0.7 }), skin]

  const root = new Group()
  root.scale.setScalar(AVATAR_SCALE)

  const joints = {}
  const pivot = (name, parent, x, y, z) => {
    const g = new Group()
    g.position.set(x, y, z)
    parent.add(g)
    joints[name] = g
    return g
  }

  for (const [side, name] of [[1, 'L'], [-1, 'R']]) {
    const hip = pivot(`leg${name}1`, root, RIG.hipX * side, RIG.hipY, 0)
    hip.add(part(1.36, RIG.thigh, 1.5, pants))
    const knee = pivot(`leg${name}2`, hip, 0, -RIG.thigh, 0)
    knee.add(part(1.36, RIG.shin * 0.75, 1.5, pants))
    knee.add(part(1.4, RIG.shin * 0.25, 1.6, new MeshStandardMaterial({ color: '#1b1b1b' }), -RIG.shin * 0.875))
  }

  const spine = pivot('spine', root, 0, RIG.hipY, 0)
  spine.add(part(2.8, 2.4, 1.6, shirt, 1.2))
  const neck = pivot('neck', spine, 0, 2.4, 0)
  const head = new Mesh(new BoxGeometry(1.6, 1.6, 1.6), headMats)
  head.position.y = 0.8
  head.castShadow = true
  neck.add(head)
  const hairCap = new Mesh(new BoxGeometry(1.75, 0.55, 1.75), hair)
  hairCap.position.set(0, 1.55, -0.08)
  neck.add(hairCap)

  for (const [side, name] of [[1, 'L'], [-1, 'R']]) {
    const shoulder = pivot(`arm${name}1`, spine, RIG.shoulder[0] * side, RIG.shoulder[1] - RIG.hipY, RIG.shoulder[2])
    shoulder.add(part(1.2, RIG.upperArm, 1.5, shirt))
    const elbow = pivot(`arm${name}2`, shoulder, 0, -RIG.upperArm, 0)
    elbow.add(part(1.2, RIG.forearm * 0.6, 1.5, shirt))
    elbow.add(part(1.2, RIG.forearm * 0.4, 1.5, skin, -RIG.forearm * 0.8))
  }

  return {
    group: root,
    /** Aims every joint along the IK pose (see riderPose.js). Pivots start unrotated. */
    applyPose(pose) {
      applyAim(joints.spine, IDENTITY, IDENTITY, UP, pose.spine, qSpine)
      applyAim(joints.neck, qSpine, IDENTITY, UP, pose.neck, qScratch)
      for (const [name, arm] of [['L', pose.armL], ['R', pose.armR]]) {
        applyAim(joints[`arm${name}1`], qSpine, IDENTITY, DOWN, arm.upper, qUpper)
        applyAim(joints[`arm${name}2`], qUpper, IDENTITY, DOWN, arm.lower, qScratch)
      }
      for (const [name, leg] of [['L', pose.legL], ['R', pose.legR]]) {
        applyAim(joints[`leg${name}1`], IDENTITY, IDENTITY, DOWN, leg.upper, qUpper)
        applyAim(joints[`leg${name}2`], qUpper, IDENTITY, DOWN, leg.lower, qScratch)
      }
    },
    dispose() {
      root.traverse((node) => {
        node.geometry?.dispose()
      })
    },
  }
}

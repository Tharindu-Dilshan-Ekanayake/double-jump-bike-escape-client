import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import {
  AdditiveBlending,
  BackSide,
  Color,
  Fog,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { OCEAN_Y, mulberry32 } from '../../shared/layout.js'
import { getGlowTexture, getLiquidTexture } from './textures'

const TOP = '#2f86e6'
const HORIZON = '#bfe4ff'
const BELOW = '#d9f1ff'

const skyVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const skyFragment = /* glsl */ `
  uniform vec3 top;
  uniform vec3 horizon;
  uniform vec3 below;
  varying vec3 vDir;
  void main() {
    float h = normalize(vDir).y;
    vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.55)) : mix(horizon, below, pow(-h, 0.6));
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }
`

/** Puffy clouds scattered around (but off) the course, merged into one mesh. */
function buildClouds() {
  const rng = mulberry32(99)
  const parts = []
  // Both worlds' courses (World 2 sits at x = 3000 and runs much further).
  const spans = [
    { x: 0, count: 140, zFar: -8500 },
    { x: 3000, count: 220, zFar: -25500 },
  ]
  for (let i = 0; i < 360; i += 1) {
    const span = i < spans[0].count ? spans[0] : spans[1]
    const side = rng() < 0.5 ? -1 : 1
    const x = span.x + side * (220 + rng() * 1100)
    const z = 600 + rng() * (span.zFar - 600)
    const y = 40 + rng() * 700
    const s = 6 + rng() * 14
    const puffs = 4 + Math.floor(rng() * 4)
    for (let k = 0; k < puffs; k += 1) {
      const g = new SphereGeometry(s * (0.6 + rng() * 0.5), 10, 7)
      g.scale(1.3, 0.7, 1)
      g.translate(x + (k - puffs / 2) * s * 0.9, y + rng() * s * 0.4, z + (rng() - 0.5) * s)
      parts.push(g)
    }
  }
  const geometry = mergeGeometries(parts, false)
  for (const g of parts) g.dispose()
  return new Mesh(geometry, new MeshLambertMaterial({ color: '#ffffff', emissive: '#d6e9ff', emissiveIntensity: 0.45 }))
}

/** Horizon-coloured background and distance fog; returns the cleanup. */
function setAtmosphere(scene) {
  scene.background = new Color(HORIZON)
  // Reaches past the longest gaps (~2900) so the next island is always in sight.
  scene.fog = new Fog(HORIZON, 450, 3400)
  return () => {
    scene.fog = null
  }
}

/** Keeps the dome and sun centred on the camera; drifts the ocean texture. */
function followCamera(dome, sun, ocean, camera, delta) {
  dome.position.copy(camera.position)
  sun.position.set(camera.position.x + 900, camera.position.y + 1100, camera.position.z - 1600)
  const map = ocean.material.map
  map.offset.x = (map.offset.x + delta * 0.02) % 1
}

export function Sky() {
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)

  const dome = useMemo(() => {
    const material = new ShaderMaterial({
      uniforms: {
        top: { value: new Color(TOP) },
        horizon: { value: new Color(HORIZON) },
        below: { value: new Color(BELOW) },
      },
      vertexShader: skyVertex,
      fragmentShader: skyFragment,
      side: BackSide,
      depthWrite: false,
      fog: false,
    })
    const mesh = new Mesh(new SphereGeometry(4000, 32, 16), material)
    mesh.renderOrder = -10
    mesh.frustumCulled = false
    return mesh
  }, [])

  const sun = useMemo(() => {
    const sprite = new Sprite(
      new SpriteMaterial({ map: getGlowTexture(), color: '#fff3c8', blending: AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }),
    )
    sprite.scale.setScalar(520)
    return sprite
  }, [])

  const clouds = useMemo(() => buildClouds(), [])

  const ocean = useMemo(() => {
    const texture = getLiquidTexture('water').clone()
    texture.repeat.set(3900, 3900)
    texture.needsUpdate = true
    const mesh = new Mesh(
      new PlaneGeometry(70000, 70000),
      new MeshStandardMaterial({ map: texture, color: '#9fd8ff', roughness: 0.2, metalness: 0.05 }),
    )
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(1500, OCEAN_Y, -12000)
    mesh.receiveShadow = true
    return mesh
  }, [])

  useEffect(() => setAtmosphere(scene), [scene])

  useFrame((_, delta) => followCamera(dome, sun, ocean, camera, delta))

  return (
    <>
      <primitive object={dome} />
      <primitive object={sun} />
      <primitive object={clouds} />
      <primitive object={ocean} />
    </>
  )
}

export default Sky

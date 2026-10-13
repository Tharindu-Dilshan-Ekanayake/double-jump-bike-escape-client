import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'

import { createParticleSystem, stepParticles } from './burst'
import { createRingSystem, stepRings } from './rings'

/** Renders the particle bursts queued with `burst()` and the rings from `ringBurst()`. */
export function Particles() {
  const system = useMemo(() => createParticleSystem(), [])
  const rings = useMemo(() => createRingSystem(), [])
  useFrame((_, delta) => {
    stepParticles(system, delta)
    stepRings(rings, delta)
  })
  return (
    <>
      <primitive object={system.points} />
      <primitive object={rings.group} />
    </>
  )
}

export default Particles

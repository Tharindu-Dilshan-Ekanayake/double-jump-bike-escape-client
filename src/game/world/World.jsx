import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'

import { useGameStore } from '../../store/gameStore'
import { hazardTime } from '../hazards'
import { buildWorld } from './buildWorld'
import { worldRef } from './worldRef'

/** Lobby, all stages and their moving parts. Built once (needs fonts loaded). */
export function World() {
  const world = useMemo(() => buildWorld(), [])
  const leaderboards = useGameStore((s) => s.leaderboards)
  const me = useGameStore((s) => s.me)

  useEffect(() => {
    worldRef.current = world
    return () => {
      worldRef.current = null
    }
  }, [world])

  useEffect(() => world.updateLeaderboards(leaderboards), [world, leaderboards])
  // Stand labels follow what you own ("OWNED", "+40% faster than your best bike!").
  useEffect(() => world.updateStands(me), [world, me])

  useFrame((state, delta) => world.update(hazardTime(), Math.min(delta, 0.1), state.camera))

  return <primitive object={world.root} />
}

export default World

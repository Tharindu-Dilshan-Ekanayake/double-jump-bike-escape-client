import { PerformanceMonitor } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import { NeutralToneMapping } from 'three'

import { useBloxity } from '../bloxity/BloxityContext'
import { send } from '../net/connection'
import { useGameStore } from '../store/gameStore'
import { cameraRig } from './cameraRig'
import FollowCamera from './FollowCamera'
import { installKeyboard } from './input'
import LocalPlayer from './LocalPlayer'
import { localPlayer } from './playerState'
import Particles from './Particles'
import RemotePlayers from './RemotePlayers'
import SpeedBlur from './SpeedBlur'
import Sky from './world/Sky'
import Weather from './world/Weather'
import World from './world/World'

/** Highest render resolution (device pixels per CSS pixel) per graphics setting. */
const MAX_DPR = { high: 1.5, medium: 1.15, low: 0.85 }

/** Canvas signs are drawn with the game fonts, so wait for them (briefly). */
function useFontsReady() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      setReady(true)
    }
    Promise.all([
      document.fonts.load('700 64px "Fredoka"'),
      document.fonts.load('400 64px "Luckiest Guy"'),
    ]).then(finish, finish)
    const timer = setTimeout(finish, 3000)
    return () => clearTimeout(timer)
  }, [])
  return ready
}

/** Sun + sky light. The shadow camera follows the rider so shadows stay crisp. */
function Lights({ shadowSize }) {
  const light = useRef(null)
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    const l = light.current
    scene.add(l.target)
    return () => scene.remove(l.target)
  }, [scene])
  useFrame(() => {
    const l = light.current
    const p = localPlayer.position
    l.position.set(p.x + 45, p.y + 95, p.z + 30)
    l.target.position.set(p.x, p.y, p.z)
    l.target.updateMatrixWorld()
  })
  return (
    <>
      <hemisphereLight args={['#dcefff', '#86a86a', 1.25]} />
      <directionalLight
        ref={light}
        castShadow
        color="#fff3dc"
        intensity={2.3}
        shadow-mapSize={[shadowSize, shadowSize]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.05}
        shadow-camera-left={-75}
        shadow-camera-right={75}
        shadow-camera-top={75}
        shadow-camera-bottom={-75}
        shadow-camera-near={1}
        shadow-camera-far={300}
      />
    </>
  )
}

/**
 * Fires `onFirstFrame` after the renderer has actually drawn once.
 * `loadingEnd()` should mean "the player can see the game", not "React mounted".
 */
function FirstFrameSignal({ onFirstFrame }) {
  const fired = useRef(false)
  useFrame(() => {
    if (fired.current) return
    fired.current = true
    onFirstFrame()
  })
  return null
}

export function GameScene() {
  const { game } = useBloxity()
  const fontsReady = useFontsReady()
  const phase = useGameStore((s) => s.phase)
  const quality = useGameStore((s) => s.settings.quality)
  const loadingEnded = useRef(false)
  // Render resolution: starts at the quality's maximum and steps down (or back
  // up) when the frame rate drops, so slower devices stay smooth.
  const maxDpr = Math.min(window.devicePixelRatio || 1, MAX_DPR[quality] ?? 1)
  const [dprScale, setDprScale] = useState(1)
  const dpr = Math.max(0.75, maxDpr * dprScale)

  useEffect(() => {
    installKeyboard()
    game.loadingStep('Building the world…')
    // Dev-only handle for automated screenshots and debugging from the console.
    if (import.meta.env.DEV) window.__game = { localPlayer, cameraRig, store: useGameStore, send }
  }, [game])

  const handleFirstFrame = () => {
    if (loadingEnded.current) return
    loadingEnded.current = true
    useGameStore.setState({ worldReady: true })
    game.loadingEnd()
  }

  return (
    <Canvas
      shadows={quality !== 'low'}
      dpr={dpr}
      camera={{ position: [0, 34, 125], fov: 70, near: 0.3, far: 4500 }}
      gl={{ antialias: quality !== 'low', powerPreference: 'high-performance' }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = NeutralToneMapping
        gl.toneMappingExposure = 1.05
        // Dev-only: lets screenshot scripts read draw calls (renderer.info).
        if (import.meta.env.DEV) window.__gl = gl
        if (import.meta.env.DEV) window.__scene = scene
      }}
    >
      <PerformanceMonitor
        flipflops={4}
        onDecline={() => setDprScale((s) => Math.max(0.6, s - 0.15))}
        onIncline={() => setDprScale((s) => Math.min(1, s + 0.1))}
      />
      <Lights shadowSize={quality === 'high' ? 2048 : 1024} />
      <Sky />
      <Weather />
      <Particles />
      <FollowCamera />
      <SpeedBlur />
      {fontsReady && (
        <>
          <World />
          <LocalPlayer />
          {phase === 'playing' && <RemotePlayers />}
          <FirstFrameSignal onFirstFrame={handleFirstFrame} />
        </>
      )}
    </Canvas>
  )
}

export default GameScene

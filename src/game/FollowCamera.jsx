import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Vector3 } from 'three'

import { gameState } from '../store/gameStore'
import { cameraRig } from './cameraRig'
import { speedFeel } from './speedFeel'
import { localPlayer } from './playerState'

/** How high above the rider's feet the camera aims. */
const LOOK_HEIGHT = 3.6

const MIN_DISTANCE = 6
const MAX_DISTANCE = 48

// Pitch limits, in radians. Stops the camera flipping over the top or sinking
// under the track.
const MIN_PITCH = -0.05
const MAX_PITCH = 1.3

const DRAG_SENSITIVITY = 0.0055
const BASE_FOV = 70
/** Extra field of view at full speed: the world rushes past a little more. */
const SPEED_FOV = 14

function setFov(camera, fov) {
  if (Math.abs(camera.fov - fov) < 0.01) return
  camera.fov = fov
  camera.updateProjectionMatrix()
}
const ZOOM_SENSITIVITY = 0.02

/** After a manual orbit, wait this long before swinging back behind the rider. */
const AUTO_FOLLOW_DELAY = 1.4

const _desired = new Vector3()
const _target = new Vector3()

/**
 * Third-person orbit camera.
 *
 * Drag (left or right button, or one finger) orbits, the wheel zooms. While the
 * rider is moving the camera eases back behind them, Roblox "follow" style. In
 * the menu it slowly circles the lobby instead.
 */
export function FollowCamera() {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const look = useRef(new Vector3())
  const state = useRef({ lastDrag: -10, seenTeleport: -1, initialised: false, shakeOffset: new Vector3() })

  useEffect(() => {
    const el = gl.domElement
    let dragging = false
    let pointerId = null
    let lastX = 0
    let lastY = 0

    const onPointerDown = (e) => {
      if (e.button !== 0 && e.button !== 2) return
      dragging = true
      pointerId = e.pointerId
      lastX = e.clientX
      lastY = e.clientY
      el.setPointerCapture?.(e.pointerId)
    }
    const onPointerMove = (e) => {
      if (!dragging || e.pointerId !== pointerId) return
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY
      cameraRig.yaw -= dx * DRAG_SENSITIVITY
      cameraRig.pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, cameraRig.pitch + dy * DRAG_SENSITIVITY))
      state.current.lastDrag = performance.now() / 1000
    }
    const endDrag = (e) => {
      if (!dragging || e.pointerId !== pointerId) return
      dragging = false
      el.releasePointerCapture?.(e.pointerId)
    }
    const onWheel = (e) => {
      // Without this the page scrolls behind the canvas.
      e.preventDefault()
      cameraRig.distance = Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, cameraRig.distance + e.deltaY * ZOOM_SENSITIVITY))
    }
    // Right-dragging otherwise opens the browser context menu mid-orbit.
    const onContextMenu = (e) => e.preventDefault()

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', endDrag)
    el.addEventListener('pointercancel', endDrag)
    el.addEventListener('contextmenu', onContextMenu)
    // passive:false is required for preventDefault() on wheel to take effect.
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', endDrag)
      el.removeEventListener('pointercancel', endDrag)
      el.removeEventListener('contextmenu', onContextMenu)
      el.removeEventListener('wheel', onWheel)
    }
  }, [gl])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const now = performance.now() / 1000
    const s = state.current

    if (gameState().phase !== 'playing') {
      // Menu: a slow cinematic circle over the lobby.
      const a = now * 0.06
      camera.position.set(Math.sin(a) * 85, 34, 40 + Math.cos(a) * 85)
      look.current.set(0, 6, 10)
      camera.lookAt(look.current)
      setFov(camera, BASE_FOV)
      s.initialised = false
      return
    }

    // Undo last frame's shake before following, so it never accumulates.
    camera.position.sub(s.shakeOffset)
    s.shakeOffset.set(0, 0, 0)

    const lp = localPlayer
    _target.copy(lp.position)
    _target.y += LOOK_HEIGHT

    // Snap (no swoop) on the first frame and after any teleport.
    const snap = !s.initialised || lp.teleportedAt !== s.seenTeleport
    const speed = lp.motion.speed
    if (snap) {
      cameraRig.yaw = lp.yaw + Math.PI
    } else if (now - s.lastDrag > AUTO_FOLLOW_DELAY && speed > 4) {
      const behind = lp.yaw + Math.PI
      const diff = Math.atan2(Math.sin(behind - cameraRig.yaw), Math.cos(behind - cameraRig.yaw))
      cameraRig.yaw += diff * (1 - Math.exp(-dt * Math.min(speed / 12, 3)))
    }

    const { yaw, pitch, distance } = cameraRig
    const horizontal = Math.cos(pitch) * distance
    _desired.set(
      _target.x + Math.sin(yaw) * horizontal,
      _target.y + Math.sin(pitch) * distance,
      _target.z + Math.cos(yaw) * horizontal,
    )

    if (snap) {
      s.initialised = true
      s.seenTeleport = lp.teleportedAt
      camera.position.copy(_desired)
      look.current.copy(_target)
    } else {
      look.current.lerp(_target, 1 - Math.exp(-dt * 18))
      camera.position.lerp(_desired, 1 - Math.exp(-dt * 14))
    }
    camera.lookAt(look.current)
    if (cameraRig.shake > 0.003) {
      // A quick, decaying jolt (mostly vertical) after hard landings.
      const k = cameraRig.shake
      s.shakeOffset.set(Math.sin(now * 61) * k * 0.6, Math.sin(now * 83 + 1.7) * k, Math.sin(now * 47 + 0.4) * k * 0.4)
      camera.position.add(s.shakeOffset)
      cameraRig.shake *= Math.exp(-dt * 8)
    } else cameraRig.shake = 0
    const fov = BASE_FOV + SPEED_FOV * speedFeel.amount + 5 * speedFeel.kick
    setFov(camera, camera.fov + (fov - camera.fov) * (1 - Math.exp(-dt * 4)))
  })

  return null
}

export default FollowCamera

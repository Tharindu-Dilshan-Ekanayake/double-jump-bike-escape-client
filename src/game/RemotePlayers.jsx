import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Vector3 } from 'three'

import { chatBubbles, getRoom, parseAvatar } from '../net/connection'
import { formatNumber } from '../shared/gameData.js'
import { Rider } from './rider/Rider'

const SNAP_DISTANCE = 30
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a))

/**
 * Everyone else in the lobby. Transforms arrive ~20x/sec from the room state and
 * are smoothed here; appearance (bike, trail, avatar...) is polled twice a second
 * so it only re-renders when it actually changes.
 */
export function RemotePlayers() {
  const [ids, setIds] = useState([])

  useEffect(() => {
    const timer = setInterval(() => {
      const room = getRoom()
      const next = []
      room?.state.players?.forEach((_, sid) => {
        if (sid !== room.sessionId) next.push(sid)
      })
      setIds((prev) => (prev.length === next.length && prev.every((id, i) => id === next[i]) ? prev : next))
    }, 300)
    return () => clearInterval(timer)
  }, [])

  return ids.map((sid) => <RemotePlayer key={sid} sid={sid} />)
}

/** Eases the displayed rider towards the latest synced transform. */
function followServer(motion, p, state, delta) {
  const dt = Math.min(delta, 0.05)
  const now = performance.now() / 1000
  if (!state.placed || Math.hypot(p.x - motion.position.x, p.z - motion.position.z) > SNAP_DISTANCE) {
    motion.position.set(p.x, p.y, p.z)
    motion.yaw = p.r
    motion.flips = p.flips
    state.placed = true
  } else {
    const k = 1 - Math.exp(-dt * 14)
    motion.position.x += (p.x - motion.position.x) * k
    motion.position.y += (p.y - motion.position.y) * k
    motion.position.z += (p.z - motion.position.z) * k
    motion.yaw += wrapAngle(p.r - motion.yaw) * k
  }
  motion.speed = p.s
  if (motion.air && !p.air) motion.landAt = now
  if (!motion.air && p.air && p.flips === motion.flips) motion.jumpAt = now
  motion.air = p.air
  motion.flips = p.flips
  state.timer += dt
}

function RemotePlayer({ sid }) {
  const motion = useMemo(
    () => ({ position: new Vector3(), yaw: 0, speed: 0, air: false, flips: 0, jumpAt: 0, landAt: 0 }),
    [],
  )
  const [look, setLook] = useState(null)
  const [bubble, setBubble] = useState(null)
  const poll = useRef({ timer: 1, signature: '', placed: false })

  useFrame((_, delta) => {
    const p = getRoom()?.state.players?.get(sid)
    if (!p) return
    const state = poll.current
    followServer(motion, p, state, delta)
    if (state.timer < 0.5) return
    state.timer = 0
    // The fastest rider in the lobby (counting us) gets the crown.
    const room = getRoom()
    let topSid = null
    let topSpeed = -1
    room.state.players.forEach((other, otherSid) => {
      if (other.totalSpeed > topSpeed) {
        topSpeed = other.totalSpeed
        topSid = otherSid
      }
    })
    const crown = topSid === sid && p.totalSpeed > 0
    // The tag shows speed rounded (1.2K), so only re-render when that text changes.
    const signature = `${p.name}|${p.bike}|${p.trail}|${p.aura}|${p.avatar}|${p.level}|${formatNumber(p.totalSpeed)}|${crown}`
    if (signature !== state.signature) {
      state.signature = signature
      const avatar = parseAvatar(p.avatar)
      setLook({
        name: p.name,
        bike: p.bike,
        trail: p.trail,
        aura: p.aura,
        equipped: avatar.equipped ?? null,
        proportions: avatar.proportions,
        seed: p.name,
        level: p.level,
        speed: p.totalSpeed,
        crown,
      })
    }
    const b = chatBubbles.get(sid)
    const text = b && b.until > performance.now() ? b.text : null
    if (text !== bubble) setBubble(text)
  })

  if (!look) return null
  return <Rider motion={motion} look={look} name={look.name} bubble={bubble} />
}

export default RemotePlayers

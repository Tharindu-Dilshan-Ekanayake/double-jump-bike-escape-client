import { useRef, useState } from 'react'

import { input, pressJump, releaseJump } from '../game/input'
import { useGameStore } from '../store/gameStore'

/** How far the knob travels, as a share of the joystick's width. */
const TRAVEL = 0.36
const isTouchDevice = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

/** Virtual joystick + jump button, only on touch screens. */
export function TouchControls() {
  const phase = useGameStore((s) => s.phase)
  // Re-checked whenever the screen changes (rotating, or a browser's device mode).
  useGameStore((s) => s.phone)
  const [knob, setKnob] = useState({ x: 0, y: 0 })
  const origin = useRef(null)
  if (phase !== 'playing' || !isTouchDevice()) return null

  const move = (e) => {
    if (!origin.current) return
    const { radius } = origin.current
    let dx = e.clientX - origin.current.x
    let dy = e.clientY - origin.current.y
    const len = Math.hypot(dx, dy)
    if (len > radius) {
      dx = (dx / len) * radius
      dy = (dy / len) * radius
    }
    input.joyX = dx / radius
    input.joyY = -dy / radius
    setKnob({ x: dx, y: dy })
  }
  const end = () => {
    origin.current = null
    input.joyX = 0
    input.joyY = 0
    setKnob({ x: 0, y: 0 })
  }

  return (
    <>
      <div
        className="joystick"
        onPointerDown={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          origin.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, radius: rect.width * TRAVEL }
          e.currentTarget.setPointerCapture(e.pointerId)
          move(e)
        }}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={end}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="joystick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
      </div>
      <button
        type="button"
        className="jump-touch"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          pressJump()
        }}
        onPointerUp={releaseJump}
        onPointerCancel={releaseJump}
        onLostPointerCapture={releaseJump}
        onContextMenu={(e) => e.preventDefault()}
        aria-label="Jump"
      >
        <span className="jump-touch-icon">⏫</span>
        <span className="jump-touch-label">JUMP</span>
      </button>
    </>
  )
}

export default TouchControls

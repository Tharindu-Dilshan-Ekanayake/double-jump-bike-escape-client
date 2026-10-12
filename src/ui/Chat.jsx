import { useEffect, useRef, useState } from 'react'

import { resetInput } from '../game/input'
import { send } from '../net/connection'
import { useGameStore } from '../store/gameStore'
import { useNow } from './useNow'

const NAME_COLORS = ['#ff6b6b', '#ffd23a', '#5fe08a', '#5fb8ff', '#d27bff', '#ff9a1f', '#3ff0e0', '#ff7ac8']
const VISIBLE_MS = 12_000

function colorFor(name) {
  let h = 0
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return NAME_COLORS[h % NAME_COLORS.length]
}

/** Lobby chat, top-left like Roblox. Enter or "/" to type, Esc to close. */
export function Chat() {
  const chat = useGameStore((s) => s.chat)
  const open = useGameStore((s) => s.chatOpen)
  const [text, setText] = useState('')
  const inputRef = useRef(null)
  const now = useNow(1000)

  useEffect(() => {
    const onKey = (e) => {
      const typing = document.activeElement === inputRef.current
      if (!typing && (e.key === 'Enter' || e.key === '/') && !useGameStore.getState().panel) {
        e.preventDefault()
        resetInput()
        useGameStore.setState({ chatOpen: true })
      } else if (typing && e.key === 'Escape') {
        useGameStore.setState({ chatOpen: false })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) inputRef.current?.focus()
    else inputRef.current?.blur()
  }, [open])

  const submit = () => {
    const message = text.trim()
    if (message) send('chat', { text: message })
    setText('')
    useGameStore.setState({ chatOpen: false })
  }

  const visible = (open ? chat.slice(-12) : chat.filter((m) => now - m.at < VISIBLE_MS).slice(-6))
  if (!open && !visible.length) return null

  return (
    <div className="pointer-events-auto fixed left-3 top-[64px] w-[min(420px,80vw)]">
      <div className={`flex flex-col gap-1 rounded-xl p-2 ${open ? 'bg-black/45' : ''}`}>
        {visible.map((m) => (
          <div key={m.id} className="text-[16px] leading-snug text-white [text-shadow:0_2px_2px_rgba(0,0,0,0.7)]">
            {m.system ? (
              <span className="italic text-[#ffe27a]">{m.text}</span>
            ) : (
              <>
                <span className="font-bold" style={{ color: colorFor(m.name) }}>
                  {m.name}:
                </span>{' '}
                {m.text}
              </>
            )}
          </div>
        ))}
      </div>
      {open && (
        <input
          ref={inputRef}
          value={text}
          maxLength={120}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            e.stopPropagation()
          }}
          onBlur={() => useGameStore.setState({ chatOpen: false })}
          placeholder="Say something… (Enter to send)"
          className="mt-1 w-full rounded-lg border-2 border-white/40 bg-black/60 px-3 py-2 text-[16px] text-white outline-none"
        />
      )}
    </div>
  )
}

export default Chat

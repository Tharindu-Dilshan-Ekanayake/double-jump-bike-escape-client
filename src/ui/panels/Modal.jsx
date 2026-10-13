import { useEffect } from 'react'

import { sound } from '../../audio/sound'
import { formatNumber } from '../../shared/gameData.js'
import { shade } from '../../game/world/textures'
import { gameState } from '../../store/gameStore'
import { CurrencyIcon } from '../icons'

/** Chunky Roblox-style window with a coloured title bar and a red ✕. */
export function Modal({ title, icon, color = '#3ba8ff', tabs, width, children }) {
  const close = () => {
    sound.click()
    gameState().closePanel()
  }
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') gameState().closePanel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div
      className="modal-backdrop pointer-events-auto"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div className="panel ui-scaled" style={width ? { width } : undefined}>
        <div className="panel-header" style={{ background: `linear-gradient(${shade(color, 0.3)}, ${color})` }}>
          <span>{icon}</span>
          <span className="title-text">{title}</span>
          <button type="button" className="panel-close btn-chunky btn-red press" onClick={close} aria-label="Close">
            ✕
          </button>
        </div>
        {tabs}
        <div className="panel-body">{children}</div>
      </div>
    </div>
  )
}

export function Tabs({ tabs, value, onChange, color = '#3ba8ff' }) {
  return (
    <div className="tabs" style={{ background: shade(color, 0.6) }}>
      {tabs.map(([id, label]) => (
        <button
          key={id}
          type="button"
          className="tab press game-text"
          style={{ background: id === value ? color : '#c9d2e0' }}
          onClick={() => {
            sound.click()
            onChange(id)
          }}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export function Grid({ children, min = 180 }) {
  return <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))` }}>{children}</div>
}

export function Price({ currency, value }) {
  return (
    <span className="inline-flex items-center gap-1">
      <CurrencyIcon currency={currency} />
      {formatNumber(value)}
    </span>
  )
}

/** The usual card footer: equipped / equip / buy (red when unaffordable). */
export function OwnButton({ owned, equipped, currency, price, me, onBuy, onEquip, buyLabel }) {
  if (equipped) {
    return (
      <button type="button" className="btn-chunky btn-green card-button equipped-btn game-text" disabled>
        ✓ EQUIPPED
      </button>
    )
  }
  if (owned) {
    return (
      <button type="button" className="btn-chunky btn-blue press card-button game-text" onClick={onEquip}>
        EQUIP
      </button>
    )
  }
  const affordable = (me?.[currency] ?? 0) >= price
  return (
    <button type="button" className={`btn-chunky ${affordable ? 'btn-green' : 'btn-red'} press card-button game-text`} onClick={onBuy}>
      {buyLabel ?? <Price currency={currency} value={price} />}
    </button>
  )
}

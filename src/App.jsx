import { useEffect } from 'react'

import { useBloxity } from './bloxity/BloxityContext'
import GameScene from './game/GameScene'
import { avatarPayload, send } from './net/connection'
import { useGameStore } from './store/gameStore'
import AutoJoin from './ui/AutoJoin'
import Hud from './ui/Hud'
import Panels from './ui/panels/Panels'
import SpeedFx from './ui/SpeedFx'
import { isPhoneScreen, phoneLayout } from './ui/phoneLayout'
import RotatePrompt from './ui/RotatePrompt'
import TouchControls from './ui/TouchControls'

/** HUD size relative to the windows, kept small so the game stays in view. */
const HUD_SCALE = 0.8

/**
 * Shrinks the UI on small windows; the layout is designed at 1600x900. Phones
 * get their own HUD layout (ui/phoneLayout.js): its sizes go into CSS variables
 * and the store, and `<html data-phone>` says which way the phone is held.
 */
function useUiScale() {
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      const scale = Math.max(0.45, Math.min(1.15, w / 1600, h / 900))
      const phone = isPhoneScreen(w, h) ? phoneLayout(w, h) : null
      const root = document.documentElement
      const set = (name, value) => root.style.setProperty(name, value)
      set('--ui-scale', (phone ? phone.ui : scale).toFixed(3))
      set('--hud-scale', (phone ? 0.5 * phone.m : scale * HUD_SCALE).toFixed(3))
      // Full-screen moments (continue?, hatching, rebirth) fill more of a phone.
      set('--overlay-scale', (phone ? Math.max(0.45, Math.min(0.9, w / 620, h / 560)) : scale * HUD_SCALE).toFixed(3))
      if (phone) {
        root.dataset.phone = phone.portrait ? 'portrait' : 'landscape'
        set('--m', phone.m.toFixed(3))
        set('--joy-size', `${phone.joy.size}px`)
        set('--joy-left', `${phone.joy.left}px`)
        set('--joy-bottom', `${phone.joy.bottom}px`)
        set('--jump-size', `${phone.jump.size}px`)
        set('--jump-right', `${phone.jump.right}px`)
        set('--jump-bottom', `${phone.jump.bottom}px`)
      } else {
        delete root.dataset.phone
      }
      useGameStore.setState({ phone })
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
}

/** Keeps other players' view of our avatar current if it changes mid-game. */
function useAvatarSync() {
  const bloxity = useBloxity()
  const phase = useGameStore((s) => s.phase)
  const payload = avatarPayload(bloxity)
  useEffect(() => {
    if (phase === 'playing') send('avatar', { avatar: payload })
  }, [phase, payload])
}

function App() {
  useUiScale()
  useAvatarSync()
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-900 select-none">
      <GameScene />
      <SpeedFx />
      <Hud />
      <Panels />
      <TouchControls />
      <AutoJoin />
      <RotatePrompt />
    </div>
  )
}

export default App

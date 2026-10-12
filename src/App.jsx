import { useEffect } from 'react'

import { useBloxity } from './bloxity/BloxityContext'
import GameScene from './game/GameScene'
import { avatarPayload, send } from './net/connection'
import { useGameStore } from './store/gameStore'
import Hud from './ui/Hud'
import LoadingScreen from './ui/LoadingScreen'
import Panels from './ui/panels/Panels'
import SpeedFx from './ui/SpeedFx'
import TouchControls from './ui/TouchControls'

/** HUD size relative to the windows, kept small so the game stays in view. */
const HUD_SCALE = 0.8

/** Shrinks the UI on small windows; the layout is designed at 1600x900. */
function useUiScale() {
  useEffect(() => {
    const update = () => {
      const scale = Math.max(0.45, Math.min(1.15, window.innerWidth / 1600, window.innerHeight / 900))
      document.documentElement.style.setProperty('--ui-scale', scale.toFixed(3))
      document.documentElement.style.setProperty('--hud-scale', (scale * HUD_SCALE).toFixed(3))
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
      <LoadingScreen />
    </div>
  )
}

export default App

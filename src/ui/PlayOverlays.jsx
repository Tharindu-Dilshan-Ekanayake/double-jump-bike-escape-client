import { useEffect, useState } from 'react'

import { sound } from '../audio/sound'
import { rewardedAdAvailable, showRewardedAd } from '../game/ads'
import { send } from '../net/connection'
import {
  CONTINUE_RULES,
  EGG_BY_ID,
  PET_BY_ID,
  RARITY_COLORS,
  formatDuration,
  formatNumber,
  petBonusText,
} from '../shared/gameData.js'
import { gameState, useGameStore } from '../store/gameStore'
import { confetti } from './confetti'
import { freeContinuesLeft } from './serverClock'
import { useNow } from './useNow'

/* ---------------------------------------------------------------------------
 * After a fall: "Continue from this island?" or why the gate stopped you
 * ------------------------------------------------------------------------- */

/** How long the continue question waits before riding back to the lobby. */
const PROMPT_SECONDS = 10

/** The gate you were short of: what it needs and how long the best treadmill takes. */
function GateInfo({ gate }) {
  return (
    <div className="gate-info">
      <div className="game-text text-[22px]">
        🚧 {gate.stage} needs <span className="text-[#ffe27a]">⚡ {formatNumber(gate.need)}</span> Speed
      </div>
      <div className="game-text text-[19px]">
        You have {formatNumber(gate.have)} · <span className="text-[#ff8a8a]">{formatNumber(gate.missing)} more needed</span>
      </div>
      <div className="game-text text-[17px] text-[#7dff8a]">
        🏋️ About {formatDuration(gate.seconds * 1000)}{' '}
        {gate.padMult > 1 ? `on the ${gate.pad} treadmill (${formatNumber(gate.padMult)}x)` : 'of riding and training'}
      </div>
    </div>
  )
}

/** Countdown ring around the lobby button. */
function useCountdown(at, seconds) {
  const now = useNow(250)
  return Math.max(0, seconds - (now - at) / 1000)
}

function ContinueQuestion({ prompt, me }) {
  const [busy, setBusy] = useState(false)
  const left = useCountdown(prompt.at, PROMPT_SECONDS)
  const free = freeContinuesLeft(me)
  const ad = !free && CONTINUE_RULES.rewardedAds && rewardedAdAvailable()

  const toLobby = () => {
    sound.click()
    useGameStore.setState({ deathPrompt: null })
  }
  useEffect(() => {
    if (left <= 0 && !busy) useGameStore.setState({ deathPrompt: null })
  }, [left, busy])

  const resume = async (via) => {
    sound.click()
    setBusy(true)
    if (via === 'ad' && !(await showRewardedAd())) {
      setBusy(false)
      gameState().toast('The ad did not finish', 'error')
      return
    }
    send('continue', { gid: prompt.gid, via })
    // No answer (or a refusal) in a few seconds: back to the lobby.
    setTimeout(() => {
      if (gameState().deathPrompt?.at === prompt.at) useGameStore.setState({ deathPrompt: null })
    }, 3000)
  }

  return (
    <div className="death-card pointer-events-auto">
      <div className="title-text text-[44px] leading-none">CONTINUE?</div>
      <div className="game-text text-[24px]">
        Start again from <span className="text-[#7fc4ff]">{prompt.islandName}</span>
      </div>
      {free > 0 && (
        <button type="button" className="btn-chunky btn-green btn-shine press game-text death-btn" disabled={busy} onClick={() => resume('free')}>
          ▶ CONTINUE · FREE
          <span className="death-sub">
            {free}/{CONTINUE_RULES.freePerDay} left today
          </span>
        </button>
      )}
      {ad && (
        <button type="button" className="btn-chunky btn-orange press game-text death-btn" disabled={busy} onClick={() => resume('ad')}>
          📺 WATCH AN AD TO CONTINUE
        </button>
      )}
      <button type="button" className="btn-chunky btn-white press game-text death-btn is-small" disabled={busy} onClick={toLobby}>
        🏠 Back to the lobby ({Math.ceil(left)})
      </button>
    </div>
  )
}

/** The fall prompt: continue from your last island, or the gate card (non-blocking). */
export function DeathPrompt({ me }) {
  const prompt = useGameStore((s) => s.deathPrompt)
  const gate = useGameStore((s) => s.gateFail)
  useEffect(() => {
    if (!gate) return undefined
    const timer = setTimeout(() => {
      if (gameState().gateFail === gate) useGameStore.setState({ gateFail: null })
    }, 7000)
    return () => clearTimeout(timer)
  }, [gate])

  if (prompt) {
    return (
      <div className="death-dim pointer-events-auto fixed inset-0 z-[45] grid place-items-center">
        <div className="hud-scaled">
          <ContinueQuestion key={prompt.at} prompt={prompt} me={me} />
        </div>
      </div>
    )
  }
  if (!gate) return null
  return (
    <div key={gate.at} className="hud-scaled gate-card pointer-events-auto fixed left-1/2 top-[20%] z-[45]">
      <button type="button" className="gate-close press" aria-label="Close" onClick={() => useGameStore.setState({ gateFail: null })}>
        ✕
      </button>
      <div className="title-text text-[30px] leading-none text-[#ff8a5a]">NOT ENOUGH SPEED!</div>
      <GateInfo gate={gate} />
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Egg hatching
 * ------------------------------------------------------------------------- */

/** Wobble, crack, then the pet pops out with its rarity. */
export function HatchOverlay() {
  const hatching = useGameStore((s) => s.hatching)
  const [revealed, setRevealed] = useState(null)
  const shown = revealed === hatching?.at

  useEffect(() => {
    if (!hatching) return undefined
    const pet = PET_BY_ID[hatching.pet]
    const reveal = setTimeout(() => {
      setRevealed(hatching.at)
      const rare = ['Epic', 'Legendary', 'Mythic'].includes(pet?.rarity)
      if (rare) {
        sound.fanfare()
        confetti(2)
      } else {
        sound.levelUp()
        if (hatching.isNew) confetti(0.8)
      }
    }, 1900)
    const close = setTimeout(() => {
      if (gameState().hatching?.at === hatching.at) useGameStore.setState({ hatching: null })
    }, 7500)
    return () => {
      clearTimeout(reveal)
      clearTimeout(close)
    }
  }, [hatching])

  if (!hatching) return null
  const egg = EGG_BY_ID[hatching.egg]
  const pet = PET_BY_ID[hatching.pet]
  const color = RARITY_COLORS[pet?.rarity] ?? '#ffffff'
  const close = () => {
    if (!shown) return
    sound.click()
    useGameStore.setState({ hatching: null })
  }

  return (
    <div key={hatching.at} className="hatch-layer pointer-events-auto fixed inset-0 z-50 grid place-items-center" onClick={close}>
      {shown && <div className="rebirth-rays hatch-rays" style={{ '--rarity': color }} />}
      <div className="hud-scaled relative flex flex-col items-center gap-2 text-center">
        {!shown ? (
          <>
            <div className="hatch-egg" style={{ '--egg-a': egg?.colors[0], '--egg-b': egg?.colors[1] }}>
              <span className="hatch-spot" />
              <span className="hatch-spot is-2" />
              <span className="hatch-crack" />
            </div>
            <div className="game-text text-[30px]">Hatching your {egg?.name ?? 'Egg'}…</div>
          </>
        ) : (
          <>
            {hatching.isNew && <div className="hatch-new title-text">NEW!</div>}
            <div className="hatch-pet" style={{ '--rarity': color }}>
              {pet?.emoji}
            </div>
            <div className="title-text text-[64px] leading-none">{pet?.name}</div>
            <div className="hatch-rarity game-text" style={{ background: color }}>
              {pet?.rarity}
            </div>
            <div className="game-text text-[30px] text-[#7dff8a]">{pet && petBonusText(pet)}</div>
            <div className="game-text mt-2 text-[18px] opacity-80">Tap to continue · Pets (P) to equip</div>
          </>
        )}
      </div>
    </div>
  )
}

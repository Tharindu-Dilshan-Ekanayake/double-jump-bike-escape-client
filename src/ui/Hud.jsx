import { useEffect, useRef } from 'react'

import { sound } from '../audio/sound'
import { isTyping } from '../game/input'
import {
  PRODUCTS,
  WORLD2_UNLOCK,
  bikeSpeedFor,
  formatNumber,
  friendBonus,
  rebirthBonus,
  rebirthSpeedFor,
  xpForLevel,
} from '../shared/gameData.js'
import { gameState, useGameStore } from '../store/gameStore'
import Chat from './Chat'
import { RebirthIcon, TrophyIcon } from './icons'
import { rideBike } from './bikeAction'
import { buy2xSpeed, buyProduct, open, petsAlert, toggle, toggleMusic, withClick, worldTwoPending } from './hudActions'
import {
  BikePrompt,
  GiftChip,
  JumpCounter,
  KeyBadge,
  NextBikeBar,
  Overlays,
  ProfileTag,
  ProgressTrack,
  RebirthCelebration,
  SpinTile,
  StatPill,
  Tile,
  TrainingChip,
  WorldTwoBar,
} from './hudParts'
import { claimableDailyQuests, claimableQuests } from './panels/questStatus'
import { PhoneHud } from './PhoneHud'
import { DeathPrompt, HatchOverlay } from './PlayOverlays'

/* ---------------------------------------------------------------------------
 * Left: currencies and the big buttons
 * ------------------------------------------------------------------------- */

function StatsColumn({ me }) {
  const canRebirth = me.totalSpeed >= rebirthSpeedFor(me.rebirths)
  return (
    <div className="hud-scaled hud-stats pointer-events-auto fixed left-3 top-1/2 flex -translate-y-[56%] flex-col gap-4">
      <StatPill icon={<TrophyIcon />} value={formatNumber(me.wins)} onPlus={open('winsShop')} />
      <NextBikeBar me={me} />
      <div className="tile-grid mt-3 grid grid-cols-2 gap-x-5 gap-y-9 pl-1">
        <Tile kind="trails" emoji="☄️" label="TRAILS" hotkey="T" onClick={open('items', { tab: 'trails' })} />
        <Tile kind="auras" emoji="🔮" label="AURAS" hotkey="U" onClick={open('items', { tab: 'auras' })} />
        <Tile kind="rebirth" emoji={<RebirthIcon width="68" height="68" />} label="Rebirth" hotkey="R" alert={canRebirth} onClick={open('rebirth')}>
          {/* Tablets: the World 2 bar doesn't fit by the jump button, so it shrinks to a badge here. */}
          {worldTwoPending(me) && (
            <span className="w2-mini game-text">
              🌍 {me.rebirths}/{WORLD2_UNLOCK.rebirths}
            </span>
          )}
        </Tile>
        <Tile kind="inventory" emoji="🎒" label="INVENTORY" hotkey="I" onClick={open('inventory')} />
        <Tile kind="pets" emoji="🐾" label="PETS" hotkey="P" alert={petsAlert(me)} onClick={open('pets')} />
        <SpinTile me={me} hotkey="L" />
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Right: quests, bike speed, 2x speed, small buttons, gifts
 * ------------------------------------------------------------------------- */

function ActionsColumn({ me }) {
  const music = useGameStore((s) => s.settings.music)
  const quests = claimableQuests(me) + claimableDailyQuests(me)

  return (
    <div className="hud-scaled pointer-events-auto fixed right-3 top-[11%] flex w-[290px] flex-col items-center gap-2">
      <button type="button" className="btn-chunky btn-shine btn-green press relative flex w-full items-center justify-center gap-3 py-2" onClick={open('quests')}>
        <KeyBadge k="Q" />
        <span className="text-[40px]">📜</span>
        <span className="game-text text-[40px]">Quests</span>
        {quests > 0 && <span className="alert-badge">{quests}</span>}
      </button>

      <div className="game-text -mb-1 mt-1 self-end text-[22px]">Max Bike Speed: {Math.round(bikeSpeedFor(me.totalSpeed))}</div>
      <button type="button" className="btn-chunky btn-white press flex w-full items-center justify-center gap-2 py-1" onClick={open('bikeSpeed')}>
        <KeyBadge k="B" />
        <span className="text-[40px]">✏️</span>
        <span className="game-text text-[36px] text-[#7fc4ff]">Bike Speed</span>
      </button>

      <button
        type="button"
        className="btn-chunky btn-shine btn-rainbow press mt-2 w-full py-1"
        onClick={() => buy2xSpeed(me)}
      >
        <KeyBadge k="X" />
        <span className="title-text text-[40px]">2X SPEED</span>
      </button>
      <div className="title-text -mt-1 text-[30px]">
        {me.pass2xSpeed ? <span className="text-[#7dff8a]">ACTIVE ✓</span> : <>ONLY 🏆{PRODUCTS.pass2xSpeed.price}!</>}
      </div>

      <div className="mt-1 flex gap-5">
        <button type="button" className="round-icon round-blue press" title="Settings" onClick={open('settings')}>
          <KeyBadge k="O" />
          <span>⚙️</span>
        </button>
        <button
          type="button"
          className="round-icon round-purple press"
          title="Music"
          onClick={withClick(toggleMusic)}
        >
          <KeyBadge k="M" />
          <span>{music ? '🎵' : '🔇'}</span>
        </button>
      </div>

      <GiftChip me={me} />
      <WorldTwoBar me={me} />
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Bottom: jump counter, total speed, level bar, speed packs
 * ------------------------------------------------------------------------- */

const SPEED_BUTTONS = [
  ['speed100', '+100', 'btn-red'],
  ['speed1k', '+1000', 'btn-green'],
  ['speed10k', '+10k', 'btn-orange'],
  ['speed100k', '+100k', 'btn-purple'],
]

function BottomHud({ me }) {
  const jump = useGameStore((s) => s.jump)
  const players = useGameStore((s) => s.playerCount)
  const need = xpForLevel(me.level)
  const fill = Math.max(0, Math.min(1, me.xp / need))

  return (
    <div className="hud-scaled pointer-events-none fixed bottom-2 left-1/2 flex w-[1040px] -translate-x-1/2 flex-col items-center">
      <JumpCounter jump={jump} />
      <div className="relative w-full">
        <div className="game-text text-center text-[40px]">
          Total Speed:{' '}
          <span key={formatNumber(me.totalSpeed)} className="stat-bump">
            {formatNumber(me.totalSpeed)}
          </span>
        </div>
        <div className="absolute bottom-0 right-0 text-right text-[26px] leading-tight">
          <div className="game-text text-[#4dff6a]">Friend Bonus: {Math.round(friendBonus(players - 1) * 100)}%</div>
          <div className="game-text text-[#d27bff]">Rebirth: {formatNumber(rebirthBonus(me.rebirths) * 100)}%</div>
        </div>
      </div>
      <div className="level-bar mt-1">
        <div className="level-fill" style={{ width: `${fill * 100}%` }} />
        <div className="level-text game-text">
          <span>Lvl {me.level}</span>
          <span>
            {formatNumber(Math.floor(me.xp))}/{formatNumber(Math.ceil(need))}
          </span>
        </div>
      </div>
      <div className="pointer-events-auto mt-2 flex gap-2">
        {SPEED_BUTTONS.map(([id, label, color], i) => (
          <button
            key={id}
            type="button"
            title={`${PRODUCTS[id].name} for ${PRODUCTS[id].price} Wins`}
            className={`btn-chunky ${color} press speed-btn game-text`}
            onClick={() => buyProduct(id)}
          >
            <KeyBadge k={i + 1} />
            <span>{label} ⚡</span>
            <span className="price">🏆 {formatNumber(PRODUCTS[id].price)}</span>
          </button>
        ))}
        <button type="button" className="btn-chunky btn-green press speed-btn game-text" onClick={open('shop')}>
          <KeyBadge k="5" />
          <span>+</span>
        </button>
      </div>
    </div>
  )
}

/** Top: stage progress while on the course. */
function ProgressBar() {
  return (
    <div className="hud-scaled pointer-events-none fixed left-1/2 top-3 w-[1000px] -translate-x-1/2">
      <ProgressTrack />
    </div>
  )
}

/** Every HUD button's keyboard shortcut (shown on its key badge). */
const HOTKEYS = {
  KeyT: () => toggle('items', { tab: 'trails' }),
  KeyU: () => toggle('items', { tab: 'auras' }),
  KeyR: () => toggle('rebirth'),
  KeyI: () => toggle('inventory'),
  KeyP: () => toggle('pets'),
  KeyL: () => toggle('spin'),
  KeyQ: () => toggle('quests'),
  KeyB: () => toggle('bikeSpeed'),
  KeyX: (me) => buy2xSpeed(me),
  KeyM: () => {
    sound.click()
    toggleMusic()
  },
  Digit1: () => buyProduct(SPEED_BUTTONS[0][0]),
  Digit2: () => buyProduct(SPEED_BUTTONS[1][0]),
  Digit3: () => buyProduct(SPEED_BUTTONS[2][0]),
  Digit4: () => buyProduct(SPEED_BUTTONS[3][0]),
  Digit5: () => toggle('shop'),
  KeyE: (me) => {
    const id = gameState().nearBike
    if (id) rideBike(me, id)
  },
  KeyV: () => sound.bell(),
  KeyO: () => toggle('settings'),
  Tab: () => toggle('players'),
  KeyG: () => toggle('worlds'),
}

/** Listens for the HUD shortcuts while playing (not while typing or chatting). */
function useHotkeys(me) {
  const meRef = useRef(me)
  useEffect(() => {
    meRef.current = me
  })
  useEffect(() => {
    const onKey = (e) => {
      const action = HOTKEYS[e.code]
      const me = meRef.current
      if (!action || !me || e.repeat || e.ctrlKey || e.altKey || e.metaKey) return
      if (isTyping() || gameState().chatOpen) return
      e.preventDefault()
      action(me)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

export function Hud() {
  const phase = useGameStore((s) => s.phase)
  const me = useGameStore((s) => s.me)
  const onCourse = useGameStore((s) => s.onCourse)
  // Phones get their own compact layout (see PhoneHud); everything else the full one.
  const phone = useGameStore((s) => s.phone)
  useHotkeys(phase === 'playing' ? me : null)
  if (phase !== 'playing' || !me) return null
  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-20">
        <ProfileTag />
        {phone ? (
          <PhoneHud me={me} phone={phone} onCourse={onCourse} />
        ) : (
          <>
            {onCourse && <ProgressBar />}
            <Chat />
            <StatsColumn me={me} />
            <ActionsColumn me={me} />
            <BottomHud me={me} />
          </>
        )}
        <BikePrompt me={me} />
        <TrainingChip />
        <RebirthCelebration />
        <Overlays />
      </div>
      {/* Above the windows (a hatch starts from the Pets window). */}
      <DeathPrompt me={me} />
      <HatchOverlay />
    </>
  )
}

export default Hud

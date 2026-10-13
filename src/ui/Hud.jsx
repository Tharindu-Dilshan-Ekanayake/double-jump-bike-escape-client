import { useEffect, useRef } from 'react'

import { sound } from '../audio/sound'
import { useBloxity } from '../bloxity/BloxityContext'
import { isTyping } from '../game/input'
import { send } from '../net/connection'
import {
  PRODUCTS,
  WORLDS,
  bikeSpeedFor,
  formatNumber,
  friendBonus,
  rebirthBonus,
  rebirthSpeedFor,
  xpForLevel,
  nextBikeFor,
  parseRecords,
  RARITY_COLORS,
  formatDuration,
} from '../shared/gameData.js'
import { getLayout, starsFor } from '../shared/layout.js'
import { gameState, useGameStore } from '../store/gameStore'
import Chat from './Chat'
import { RebirthIcon, TrophyIcon } from './icons'
import { BIKE_BY_ID } from '../shared/gameData.js'
import { bikeStatus, rideBike } from './bikeAction'
import { claimableDailyQuests, claimableQuests } from './panels/questStatus'
import { useNow } from './useNow'

const withClick = (fn) => () => {
  sound.click()
  fn()
}

const open = (id, props) => withClick(() => gameState().openPanel(id, props))

/** Opens a window, or closes it when that same window (and tab) is already open. */
function toggle(id, props = {}) {
  sound.click()
  const { panel, openPanel, closePanel } = gameState()
  if (panel?.id === id && (!props.tab || panel.props?.tab === props.tab)) closePanel()
  else openPanel(id, props)
}

/** Small key cap in a button's top-left corner showing its shortcut. */
function KeyBadge({ k }) {
  return <span className="key-badge">{k}</span>
}

function buyProduct(id) {
  sound.click()
  send('buy', { cat: 'product', id })
}

/* ---------------------------------------------------------------------------
 * Left: currencies and the four big buttons
 * ------------------------------------------------------------------------- */

function StatPill({ icon, value, onPlus }) {
  return (
    <div className="stat-pill game-text">
      <div className="stat-icon">{icon}</div>
      <button type="button" className="stat-plus press" onClick={onPlus} aria-label="Get more">
        +
      </button>
      <span>{value}</span>
    </div>
  )
}

function Tile({ kind, emoji, label, alert, hotkey, onClick }) {
  return (
    <button type="button" className={`tile tile-${kind} press`} onClick={onClick}>
      <KeyBadge k={hotkey} />
      <span className="tile-icon">{emoji}</span>
      <span className="tile-label game-text">{label}</span>
      {alert && <span className="alert-badge">!</span>}
    </button>
  )
}

/** Always-on progress towards the next bike worth saving for ("67 Bike: 180/225"). */
function NextBikeBar({ me }) {
  const bike = nextBikeFor(me)
  if (!bike) return null
  const fill = Math.min(1, me.wins / bike.price)
  const ready = fill >= 1
  return (
    <button type="button" className={`next-bike press ${ready ? 'is-ready' : ''}`} onClick={open('winsShop')} title="Next bike">
      <div className="next-bike-top">
        <span className="next-bike-name" style={{ color: RARITY_COLORS[bike.rarity] }}>
          🚲 {bike.name}
        </span>
        <span className="next-bike-count">
          {formatNumber(Math.min(me.wins, bike.price))}/{formatNumber(bike.price)} 🏆
        </span>
      </div>
      <div className="next-bike-bar">
        <div style={{ width: `${fill * 100}%` }} />
      </div>
      {ready && <div className="next-bike-ready">Ready! Ride to the Bike Shop</div>}
    </button>
  )
}

function StatsColumn({ me }) {
  const canRebirth = me.totalSpeed >= rebirthSpeedFor(me.rebirths)
  return (
    <div className="hud-scaled hud-stats pointer-events-auto fixed left-3 top-1/2 flex -translate-y-[56%] flex-col gap-4">
      <StatPill icon={<TrophyIcon />} value={formatNumber(me.wins)} onPlus={open('winsShop')} />
      <NextBikeBar me={me} />
      <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-9 pl-1">
        <Tile kind="trails" emoji="☄️" label="TRAILS" hotkey="T" onClick={open('items', { tab: 'trails' })} />
        <Tile kind="auras" emoji="🔮" label="AURAS" hotkey="U" onClick={open('items', { tab: 'auras' })} />
        <Tile kind="rebirth" emoji={<RebirthIcon width="68" height="68" />} label="Rebirth" hotkey="R" alert={canRebirth} onClick={open('rebirth')} />
        <Tile kind="inventory" emoji="🎒" label="INVENTORY" hotkey="I" onClick={open('inventory')} />
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Right: quests, bike speed, 2x speed, small buttons
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

/**
 * "Jump: 7/11" while airborne: pulses on every jump, turns orange then red as
 * jumps run out, and celebrates landing on a new island.
 */
function JumpCounter({ jump }) {
  const cleared = useExpire((s) => s.cleared, 'cleared', 1600)
  const tone = jump && (jump.left === 0 ? 'is-empty' : jump.left <= 2 ? 'is-low' : '')
  return (
    <div className="flex h-[118px] flex-col items-center justify-end">
      {cleared && (
        <div key={cleared} className="jump-cleared title-text">
          GAP CLEARED!
        </div>
      )}
      {jump && (
        <div key={`${jump.left}/${jump.max}/${cleared ?? ''}`} className={`jump-counter game-text ${tone} ${cleared ? 'is-cleared' : ''}`}>
          Jump: {jump.left}/{jump.max}
        </div>
      )}
    </div>
  )
}

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

/* ---------------------------------------------------------------------------
 * Top: stage progress
 * ------------------------------------------------------------------------- */

const NODE_STYLE = (color) =>
  color === 'rainbow'
    ? { background: 'conic-gradient(#ff3b3b, #ffd23a, #3bd16b, #3ba8ff, #a03bff, #ff3b3b)' }
    : { background: color }

/** Best rating for a stage, under its node on the progress bar. */
function ProgressStars({ stars }) {
  return (
    <span className="progress-stars">
      {[1, 2, 3].map((n) => (
        <span key={n} className={n <= stars ? 'on' : ''}>
          ★
        </span>
      ))}
    </span>
  )
}

function ProgressBar() {
  const racers = useGameStore((s) => s.racers)
  const world = useGameStore((s) => s.world)
  const recordsText = useGameStore((s) => s.me?.records)
  const STAGES = WORLDS[world - 1].stages
  const records = parseRecords(recordsText)
  const layoutStages = getLayout().worlds[world - 1].stages
  return (
    <div className="hud-scaled pointer-events-none fixed left-1/2 top-3 w-[1000px] -translate-x-1/2">
      <div className="relative mx-6 h-[60px]">
        <div className="absolute left-0 right-0 top-1/2 h-[14px] -translate-y-1/2 rounded-full border-[3px] border-[#15151d] bg-[#a9d8ff]" />
        {STAGES.map((stage, i) => (
          <div
            key={stage.name}
            className="progress-node game-text absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${(i / (STAGES.length - 1)) * 100}%`, ...NODE_STYLE(stage.color) }}
          >
            {i + 1}
            {records[layoutStages[i].gid] && <ProgressStars stars={starsFor(layoutStages[i], records[layoutStages[i].gid])} />}
          </div>
        ))}
        {racers.map((r) => (
          <div
            key={r.sid}
            className="racer-head"
            title={r.name}
            style={{
              left: `${Math.min(1, r.progress / (STAGES.length - 1)) * 100}%`,
              zIndex: r.isMe ? 3 : 2,
              borderColor: r.isMe ? '#ffd23a' : '#ffffff',
              background: r.isMe ? '#ffd23a' : '#7fc4ff',
            }}
          >
            {r.pfp ? <img src={r.pfp} alt="" draggable={false} /> : <span className="game-text">{r.name.charAt(0).toUpperCase()}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Bike stands: "Press E" to buy or equip the bike you're standing on
 * ------------------------------------------------------------------------- */

const BIKE_PROMPT = {
  locked: (def) => <>🔒 {def.name} · Unlock World 2</>,
  riding: (def) => <>✓ Riding the {def.name}</>,
  equip: (def) => <>Equip {def.name}</>,
  buy: (def) => (
    <>
      Buy {def.name} · {def.price ? <>🏆 {formatNumber(def.price)}</> : 'FREE'}
    </>
  ),
  poor: (def) => (
    <>
      {def.name} · <span className="text-[#ff7a7a]">🏆 {formatNumber(def.price)}</span>
    </>
  ),
}

function BikePrompt({ me }) {
  const id = useGameStore((s) => s.nearBike)
  const def = BIKE_BY_ID[id]
  if (!def) return null
  const status = bikeStatus(me, id)
  const active = status === 'equip' || status === 'buy'
  return (
    <button
      type="button"
      key={id}
      className={`hud-scaled bike-prompt press pointer-events-auto fixed left-1/2 top-[63%] ${active ? 'is-active' : ''}`}
      onClick={() => rideBike(me, id)}
    >
      <span className="bike-prompt-key">E</span>
      <span className="game-text text-[26px]">{BIKE_PROMPT[status](def)}</span>
    </button>
  )
}

/* ---------------------------------------------------------------------------
 * Top right: who you're playing as (Bloxity account or guest)
 * ------------------------------------------------------------------------- */

function ProfileTag() {
  const { identity, isLoggedIn, user } = useBloxity()
  const name = identity?.displayName || identity?.username || 'Guest'
  const handle = isLoggedIn ? `@${user.username || identity.username}` : 'Guest'
  return (
    <div className="hud-scaled profile-tag pointer-events-none fixed right-3 top-3">
      {identity?.pfp ? (
        <img src={identity.pfp} alt="" draggable={false} className="profile-pfp" />
      ) : (
        <span className="profile-pfp game-text grid place-items-center text-[22px]">{name.charAt(0).toUpperCase()}</span>
      )}
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="profile-name">{name}</span>
        <span className={`profile-handle ${isLoggedIn ? 'is-account' : ''}`}>{handle}</span>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Overlays: level up, toasts
 * ------------------------------------------------------------------------- */

function useExpire(selector, key, ms) {
  const value = useGameStore(selector)
  useEffect(() => {
    if (!value) return undefined
    const timer = setTimeout(() => useGameStore.setState({ [key]: null }), ms)
    return () => clearTimeout(timer)
  }, [value, key, ms])
  return value
}

/** Standing on a treadmill: what it's paying, and what this session has earned (AFK is fine). */
function TrainingChip() {
  const training = useGameStore((s) => s.training)
  const now = useNow(1000)
  if (!training) return null
  const seconds = Math.floor((now - training.since) / 1000)
  return (
    <div className="hud-scaled training-chip pointer-events-none fixed left-1/2 top-[64%]" style={{ '--pad': training.color }}>
      <span className="training-icon">🏋️</span>
      <div className="flex flex-col leading-tight">
        <span className="game-text text-[22px]">
          {training.label} treadmill · {formatNumber(training.mult)}x
        </span>
        <span className="game-text text-[17px] text-[#7dff8a]">
          +{formatNumber(training.gained)} Speed in {formatDuration(seconds * 1000)} · AFK training works!
        </span>
      </div>
    </div>
  )
}

/** Full-screen rebirth celebration: the new count, the bonus and everything it unlocked. */
function RebirthCelebration() {
  const party = useGameStore((s) => s.rebirthCelebration)
  if (!party) return null
  const close = () => {
    sound.click()
    useGameStore.setState({ rebirthCelebration: null })
  }
  return (
    <div key={party.at} className="rebirth-party pointer-events-auto fixed inset-0 z-40 grid place-items-center" onClick={close}>
      <div className="rebirth-rays" />
      <div className="hud-scaled relative flex flex-col items-center gap-3 text-center">
        <div className="title-text rebirth-title">REBIRTH {formatNumber(party.rebirths)}!</div>
        <div className="game-text text-[40px]">
          Speed bonus <span className="text-[#d27bff]">+{formatNumber(party.bonusFrom * 100)}%</span> →{' '}
          <span className="text-[#7dff8a]">+{formatNumber(party.bonusTo * 100)}%</span>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          {party.bikes.map((id) => (
            <div key={id} className="party-unlock is-bike">
              <span className="text-[44px]">🚲</span>
              <span className="game-text text-[22px]">{BIKE_BY_ID[id]?.name}</span>
              <span className="game-text text-[16px] text-[#ffe27a]">Exclusive · {formatNumber(BIKE_BY_ID[id]?.mult)}x Speed</span>
            </div>
          ))}
          {party.treadmills.map((pad) => (
            <div key={pad.label} className="party-unlock" style={{ '--pad': pad.color }}>
              <span className="text-[40px]">🏋️</span>
              <span className="game-text text-[22px]">{pad.label} treadmill</span>
              <span className="game-text text-[16px] text-[#7dff8a]">{formatNumber(pad.mult)}x Speed</span>
            </div>
          ))}
        </div>
        <div className="game-text text-[22px] opacity-90">Speed is back to 0: the gates are waiting. Ride!</div>
        <button type="button" className="btn-chunky btn-green press btn-shine game-text mt-2 px-12 py-2 text-[32px]" onClick={close}>
          LET&apos;S GO!
        </button>
      </div>
    </div>
  )
}

function Overlays() {
  const levelUp = useExpire((s) => s.levelUp, 'levelUp', 3000)
  const toasts = useGameStore((s) => s.toasts)

  return (
    <>
      {levelUp && (
        <div key={levelUp.at} className="hud-scaled levelup-pop pointer-events-none fixed left-1/2 top-[9%] -translate-x-1/2 text-center leading-[1.05]">
          <div className="game-text text-[60px] text-[#ffb21f]">
            Level {levelUp.from} &gt; Level {levelUp.to}
          </div>
          {levelUp.bikeSpeedTo !== levelUp.bikeSpeedFrom && (
            <div className="game-text text-[48px] text-[#4fb4ff]">
              Bike Speed {levelUp.bikeSpeedFrom} &gt; {levelUp.bikeSpeedTo}
            </div>
          )}
          <div className="game-text text-[48px] text-[#d46bff]">
            Jump {levelUp.jumpsFrom} &gt; {levelUp.jumpsTo}
          </div>
        </div>
      )}
      <div className="hud-scaled pointer-events-none fixed left-1/2 top-[86px] flex -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind} game-text`}>
            {t.text}
          </div>
        ))}
      </div>
    </>
  )
}

function buy2xSpeed(me) {
  if (me.pass2xSpeed) gameState().toast('2x Speed is active!', 'success')
  else buyProduct('pass2xSpeed')
}

function toggleMusic() {
  const music = !gameState().settings.music
  gameState().setSetting('music', music)
  sound.setMusic(music)
}

/** Every HUD button's keyboard shortcut (shown on its key badge). */
const HOTKEYS = {
  KeyT: () => toggle('items', { tab: 'trails' }),
  KeyU: () => toggle('items', { tab: 'auras' }),
  KeyR: () => toggle('rebirth'),
  KeyI: () => toggle('inventory'),
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
  useHotkeys(phase === 'playing' ? me : null)
  if (phase !== 'playing' || !me) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-20">
      <ProfileTag />
      {onCourse && <ProgressBar />}
      <Chat />
      <StatsColumn me={me} />
      <ActionsColumn me={me} />
      <BottomHud me={me} />
      <BikePrompt me={me} />
      <TrainingChip />
      <RebirthCelebration />
      <Overlays />
    </div>
  )
}

export default Hud

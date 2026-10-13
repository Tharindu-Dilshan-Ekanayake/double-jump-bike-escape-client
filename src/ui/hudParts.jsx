import { sound } from '../audio/sound'
import { useBloxity } from '../bloxity/BloxityContext'
import { send } from '../net/connection'
import {
  BIKE_BY_ID,
  PLAYTIME_GIFTS,
  RARITY_COLORS,
  WORLD2_UNLOCK,
  WORLDS,
  describeReward,
  formatDuration,
  formatNumber,
  nextBikeFor,
  parseRecords,
  resolveReward,
} from '../shared/gameData.js'
import { getLayout, starsFor } from '../shared/layout.js'
import { useGameStore } from '../store/gameStore'
import { bikeStatus, rideBike } from './bikeAction'
import { mmss, open, useExpire, worldTwoPending } from './hudActions'
import { serverNow } from './serverClock'
import { useNow } from './useNow'

/*
 * HUD pieces used by both layouts: the full one (Hud.jsx) and the phone one
 * (PhoneHud.jsx), which shrinks them with its own CSS.
 */

/** Small key cap in a button's top-left corner showing its shortcut. */
export function KeyBadge({ k }) {
  return <span className="key-badge">{k}</span>
}

export function StatPill({ icon, value, onPlus }) {
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

/** Square HUD button; `alert` shows a bouncing "!" (or a count). */
export function Tile({ kind, emoji, label, alert, hotkey, onClick, children }) {
  return (
    <button type="button" className={`tile tile-${kind} press`} onClick={onClick}>
      {hotkey && <KeyBadge k={hotkey} />}
      <span className="tile-icon">{emoji}</span>
      <span className="tile-label game-text">{label}</span>
      {alert ? <span className="alert-badge">{alert === true ? '!' : alert}</span> : null}
      {children}
    </button>
  )
}

/** Always-on progress towards the next bike worth saving for ("67 Bike: 180/225"). */
export function NextBikeBar({ me }) {
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

/** Lucky spin: counts down to the next free spin (it only recharges while you play). */
export function SpinTile({ me, hotkey }) {
  useNow(1000)
  const left = me.spinReadyAt - serverNow()
  const ready = left <= 0
  return <Tile kind="spin" emoji="🎡" label={ready ? 'SPIN!' : formatDuration(left)} hotkey={hotkey} alert={ready} onClick={open('spin')} />
}

/** Playtime gifts: "🎁 Next gift in 04:12", then a CLAIM button. Starts over each session. */
export function GiftChip({ me }) {
  useNow(1000)
  const gift = PLAYTIME_GIFTS[me.giftsClaimed]
  if (!gift) {
    return <div className="gift-chip is-done game-text">🎁 All {PLAYTIME_GIFTS.length} gifts claimed!</div>
  }
  const left = me.sessionStart + gift.minutes * 60_000 - serverNow()
  const ready = left <= 0
  const from = me.giftsClaimed ? PLAYTIME_GIFTS[me.giftsClaimed - 1].minutes : 0
  const fill = ready ? 1 : Math.max(0, 1 - left / ((gift.minutes - from) * 60_000))
  const claim = () => {
    sound.click()
    send('gift')
  }
  return (
    <button type="button" className={`gift-chip press ${ready ? 'is-ready' : ''}`} onClick={ready ? claim : undefined} title="Playtime gifts">
      <span className="gift-icon">🎁</span>
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="gift-title game-text text-[19px]">{ready ? 'CLAIM GIFT!' : `Next gift in ${mmss(left)}`}</span>
        <span className="gift-prize">
          {describeReward(resolveReward(gift, me))} · {me.giftsClaimed + 1}/{PLAYTIME_GIFTS.length}
        </span>
        <span className="gift-bar">
          <span style={{ width: `${fill * 100}%` }} />
        </span>
      </span>
    </button>
  )
}

/** After escaping World 1: how many rebirths World 2 still needs. */
export function WorldTwoBar({ me }) {
  if (!worldTwoPending(me)) return null
  const fill = Math.min(1, me.rebirths / WORLD2_UNLOCK.rebirths)
  return (
    <button type="button" className="w2-bar press" onClick={open('rebirth')} title="World 2">
      <span className="w2-title game-text text-[18px]">
        🌍 Rebirth {me.rebirths}/{WORLD2_UNLOCK.rebirths} to World 2
      </span>
      <span className="next-bike-bar">
        <span className="block h-full" style={{ width: `${fill * 100}%` }} />
      </span>
    </button>
  )
}

/**
 * "Jump: 7/11" while airborne: pulses on every jump, turns orange then red as
 * jumps run out, and celebrates landing on a new island.
 */
export function JumpCounter({ jump }) {
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

/* ---------------------------------------------------------------------------
 * Stage progress
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

/** Stage nodes with every rider's head along them; fills its wrapper's width. */
export function ProgressTrack() {
  const racers = useGameStore((s) => s.racers)
  const world = useGameStore((s) => s.world)
  const recordsText = useGameStore((s) => s.me?.records)
  const STAGES = WORLDS[world - 1].stages
  const records = parseRecords(recordsText)
  const layoutStages = getLayout().worlds[world - 1].stages
  return (
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

export function BikePrompt({ me }) {
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

export function ProfileTag() {
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
 * Overlays: treadmill counter, rebirth celebration, level up, toasts
 * ------------------------------------------------------------------------- */

/** Standing on a treadmill: what it's paying, and what this session has earned (AFK is fine). */
export function TrainingChip() {
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
export function RebirthCelebration() {
  const party = useGameStore((s) => s.rebirthCelebration)
  if (!party) return null
  const close = () => {
    sound.click()
    useGameStore.setState({ rebirthCelebration: null })
  }
  return (
    <div key={party.at} className="rebirth-party pointer-events-auto fixed inset-0 z-40 grid place-items-center" onClick={close}>
      <div className="rebirth-rays" />
      <div className="overlay-scaled relative flex flex-col items-center gap-3 text-center">
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
          {party.wins > 0 && (
            <div className="party-unlock" style={{ '--pad': '#ffd23a' }}>
              <span className="text-[40px]">🏆</span>
              <span className="game-text text-[22px]">+{formatNumber(party.wins)} Wins</span>
              <span className="game-text text-[16px] text-[#ffe27a]">Rebirth reward</span>
            </div>
          )}
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

export function Overlays() {
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
      <div className="toast-stack hud-scaled pointer-events-none fixed left-1/2 top-[86px] flex -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind} game-text`}>
            {t.text}
          </div>
        ))}
      </div>
    </>
  )
}

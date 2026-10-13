import { sound } from '../../audio/sound'
import {
  DAILY_QUEST_ICONS,
  STREAK_DAYS,
  dailyQuestTitle,
  describeReward,
  formatDuration,
  formatNumber,
  nextDayAt,
  streakBroken,
  streakDayFor,
  streakWinsFor,
} from '../../shared/gameData.js'
import { gameState } from '../../store/gameStore'
import { useNow } from '../useNow'
import { rainWins } from '../winsRain'
import { Modal } from './Modal'
import { action } from './actions'
import { dailyQuestRows } from './questStatus'

/* ---------------------------------------------------------------------------
 * Daily login streak
 * ------------------------------------------------------------------------- */

/** The 7-day streak calendar: claimed days ticked, today's glowing. */
export function DailyRewardPanel({ me }) {
  const now = useNow(1000)
  const ready = now >= me.dailyAt
  const broken = streakBroken(me, now)
  // The day the next claim pays, and how many are already ticked this week.
  const nextDay = streakDayFor(me, now)
  const claimedThisWeek = ready ? nextDay - 1 : me.dailyStreak || 0
  return (
    <Modal title="Daily Rewards" icon="📅" color="#ff9a1f" width="min(760px, 94vw)">
      <div className="ink-text mb-3 text-center text-[18px]">
        {broken && ready ? 'Your streak restarted. Come back every day to reach Day 7!' : 'Come back every day: Day 7 is the big one!'}
      </div>
      <div className="streak-row">
        {Array.from({ length: STREAK_DAYS }, (_, i) => {
          const day = i + 1
          const claimed = day <= claimedThisWeek
          const today = ready && day === nextDay
          return (
            <div key={day} className={`streak-day ${claimed ? 'is-claimed' : ''} ${today ? 'is-today' : ''} ${day === STREAK_DAYS ? 'is-big' : ''}`}>
              <div className="game-text text-[18px]">Day {day}</div>
              <div className="text-[34px]">{day === STREAK_DAYS ? '🎁' : '🏆'}</div>
              <div className="game-text text-[20px]">{formatNumber(streakWinsFor(day, me))}</div>
              {claimed && <div className="streak-tick">✓</div>}
            </div>
          )
        })}
      </div>
      <div className="mt-4 flex flex-col items-center gap-2">
        {ready ? (
          <button type="button" className="btn-chunky btn-green press btn-shine game-text px-10 py-2 text-[30px]" onClick={action('claim', { what: 'daily' })}>
            CLAIM DAY {nextDay}
          </button>
        ) : (
          <div className="ink-text text-[20px] font-bold">
            Day {nextDay} in <span className="text-[#ff7a1a]">{formatDuration(me.dailyAt - now)}</span>
          </div>
        )}
      </div>
    </Modal>
  )
}

/* ---------------------------------------------------------------------------
 * Welcome back: offline earnings
 * ------------------------------------------------------------------------- */

function awayText(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`
  return h ? `${h}h ${m}m` : `${m}m`
}

export function OfflinePanel({ props }) {
  const { speed, minutes, countedMinutes, pad, padMult } = props
  const collect = () => {
    sound.fanfare()
    rainWins(Math.min(40, 5 + Math.log10(Math.max(1, speed)) * 4))
    gameState().closePanel()
  }
  return (
    <Modal title="Welcome back!" icon="💤" color="#7a5cff" width="min(560px, 94vw)">
      <div className="card gap-2 px-6">
        <div className="ink-text text-[19px]">You were away for {awayText(minutes)}.</div>
        <div className="ink-text text-[17px] opacity-80">
          Your bike kept training on the {pad} treadmill ({formatNumber(padMult)}x)
          {countedMinutes < minutes ? ` for ${awayText(countedMinutes)}` : ''}:
        </div>
        <div className="title-text offline-amount">⚡ +{formatNumber(speed)}</div>
        <div className="ink-text text-[15px] opacity-70">Better treadmills earn more while you&apos;re away.</div>
        <button type="button" className="btn-chunky btn-green press btn-shine game-text mt-2 px-12 py-2 text-[30px]" onClick={collect}>
          COLLECT
        </button>
      </div>
    </Modal>
  )
}

/* ---------------------------------------------------------------------------
 * Daily quests (shown at the top of the Quests window)
 * ------------------------------------------------------------------------- */

export function DailyQuests({ me }) {
  const now = useNow(1000)
  const rows = dailyQuestRows(me)
  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="game-text text-[26px]">☀️ Daily Quests</h3>
        <span className="ink-text text-[16px] font-bold">New quests in {formatDuration(nextDayAt(now) - now)}</span>
      </div>
      <div className="flex flex-col gap-2">
        {rows.map(({ quest, index, progress, ready }) => (
          <div key={index} className={`card flex-row gap-4 px-4 text-left ${quest.claimed ? 'opacity-60' : ''}`}>
            <div className="text-[40px]">{DAILY_QUEST_ICONS[quest.kind]}</div>
            <div className="flex flex-1 flex-col gap-1">
              <div className="ink-text text-[20px] font-bold">{dailyQuestTitle(quest)}</div>
              <div className="progress-mini">
                <div style={{ width: `${(progress / quest.target) * 100}%` }} />
              </div>
              <div className="ink-text text-[15px]">
                {quest.kind === 'stage' ? (progress ? 'Done!' : 'Land on it today') : `${formatNumber(Math.floor(progress))} / ${formatNumber(quest.target)}`} · Reward:{' '}
                {describeReward(quest.reward)}
              </div>
            </div>
            <button
              type="button"
              className={`btn-chunky ${ready ? 'btn-green press' : 'btn-gray'} game-text w-[130px] py-2 text-[22px]`}
              disabled={!ready}
              onClick={action('dailyQuest', { index })}
            >
              {quest.claimed ? 'DONE' : ready ? 'CLAIM' : 'GO!'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

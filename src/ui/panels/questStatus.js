import { QUESTS, dailyQuestProgress, parseDaily } from '../../shared/gameData.js'

function parse(text) {
  try {
    return JSON.parse(text || '{}') || {}
  } catch {
    return {}
  }
}

/** Progress of every quest line for a player snapshot (mirrors the server rules). */
export function questRows(me) {
  const quests = parse(me.quests)
  const counters = parse(me.counters)
  return QUESTS.map((quest) => {
    const entry = quests[quest.id] || { tier: 0, base: 0 }
    const target = quest.target(entry.tier)
    const done = Boolean(quest.max && target > quest.max)
    const value = quest.counter === 'bestStage' ? me.bestStage || 0 : counters[quest.counter] || 0
    const progress = quest.absolute ? value : value - entry.base
    return {
      quest,
      tier: entry.tier,
      target,
      progress: Math.max(0, Math.min(progress, target)),
      ready: !done && progress >= target,
      done,
      reward: quest.reward(entry.tier),
    }
  })
}

/** Quest lines ready to claim (daily quests: see claimableDailyQuests). */
export const claimableQuests = (me) => questRows(me).filter((row) => row.ready).length

/** Today's daily quests with their progress (mirrors the server rules). */
export function dailyQuestRows(me) {
  const daily = parseDaily(me.daily)
  let counters = {}
  try {
    counters = JSON.parse(me.counters || '{}') || {}
  } catch {
    counters = {}
  }
  return daily.quests.map((quest, index) => {
    const progress = dailyQuestProgress(quest, counters)
    return { quest, index, progress, ready: !quest.claimed && progress >= quest.target }
  })
}

export const claimableDailyQuests = (me) => dailyQuestRows(me).filter((row) => row.ready).length

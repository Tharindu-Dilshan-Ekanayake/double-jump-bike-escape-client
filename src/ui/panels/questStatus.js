import { QUESTS } from '../../shared/gameData.js'

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

export const claimableQuests = (me) => questRows(me).filter((row) => row.ready).length

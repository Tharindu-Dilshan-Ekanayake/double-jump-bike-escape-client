// Progression simulator (npm run balance): replays a solo new player with the
// numbers in config/balance.ts and prints when they reach each stage, buy each
// upgrade and rebirth. Use it after every tuning change.
//
// The player is simple but sensible: rides to the furthest stage their Speed
// clears and banks its Wins (on the purple 2x pad when they can), spends Wins
// on the cheapest upgrade available, trains on a treadmill between runs once
// one beats riding, collects the daily reward, chest and quests, and rebirths
// as soon as they can. Real players are slower (falls, lasers, menus) and
// faster (friends' bonus, tricks), so read the times as a guide.
//
//   node scripts/balance-sim.mjs [hours=3] [--quiet]
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const imp = (p) => import(pathToFileURL(path.join(root, p)).href)
const { BALANCE } = await imp('config/balance.ts')
const G = await imp('src/shared/gameData.js')
const { getLayout } = await imp('src/shared/layout.js')

const hours = Number(process.argv.find((a) => /^\d+(\.\d+)?$/.test(a)) ?? 3)
const quiet = process.argv.includes('--quiet')
const layout = getLayout()

/** Seconds lost per run besides riding: the teleport home, lining up each jump. */
const RUN_OVERHEAD = 3
const PER_GAP_OVERHEAD = 0.6
/** Training between runs once a treadmill beats riding: this many times the run's length. */
const TRAIN_RATIO = 2

const p = {
  speed: 0,
  wins: 0,
  rebirths: 0,
  bike: 'starter',
  aura: 'none',
  trail: 'none',
  bikeUpg: 0,
  pass2xSpeed: false,
  pass2xWins: false,
  padsOwned: '',
  items: '',
  bestStage: 0,
  counters: { gained: 0, wins: 0, tricks: 0, jumps: 0 },
  quests: {},
}
let t = 0
let chestAt = 0
const log = []
const firstReach = new Map()
const say = (text) => {
  log.push(`${clock(t)}  ${text}`)
}
function clock(s) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

const ticksPerSecond = 1000 / BALANCE.speed.tickMs
const rate = (padMult = 1) => BALANCE.speed.perTick * G.speedBreakdown({ ...p, pass2xSpeed: p.pass2xSpeed }, { padMult }).total * ticksPerSecond
const worldOpen = (id) => G.worldUnlocked(id, p)

function addSpeed(amount) {
  p.speed += amount
  p.counters.gained += amount
}

/** `fromPad`: only Wins from stage pads count towards the "Earn Wins" quest. */
function addWins(amount, fromPad = false) {
  p.wins += amount
  if (fromPad) p.counters.wins += amount
}

/** Furthest stage the rider clears now, in the furthest open world. */
function targetStage() {
  let best = null
  for (const stage of layout.stages) {
    if (!worldOpen(stage.world)) continue
    if (stage.world === 2 && !worldOpen(2)) continue
    if (p.speed >= stage.speed) {
      if (!best || stage.world > best.world || (stage.world === best.world && stage.index > best.index)) best = stage
    }
  }
  return best
}

function bestTreadmill() {
  let best = 1
  for (const pad of G.TRAIN_PADS) {
    if (pad.world === 2 && !worldOpen(2)) continue
    if (G.padUnlocked(pad, p)) best = Math.max(best, pad.mult)
  }
  return best
}

const owned = new Set(['bike:starter', 'aura:none', 'trail:none'])
function candidates() {
  const list = []
  const bikeMult = G.BIKE_BY_ID[p.bike].mult
  const nextBike = G.BIKES.filter((b) => b.mult > bikeMult && G.bikeAvailable(b, p)).sort((a, b) => a.price - b.price)[0]
  if (nextBike) list.push({ what: `bike ${nextBike.name} (${nextBike.mult}x)`, price: nextBike.price, buy: () => (p.bike = nextBike.id) })
  const auraMult = G.AURA_BY_ID[p.aura].winsMult
  const nextAura = G.AURAS.filter((a) => a.winsMult > auraMult).sort((a, b) => a.price - b.price)[0]
  if (nextAura) list.push({ what: `aura ${nextAura.name} (${nextAura.winsMult}x Wins)`, price: nextAura.price, buy: () => (p.aura = nextAura.id) })
  const trailBonus = G.TRAIL_BY_ID[p.trail].bonus
  const nextTrail = G.TRAILS.filter((x) => x.bonus > trailBonus).sort((a, b) => a.price - b.price)[0]
  if (nextTrail) list.push({ what: `trail ${nextTrail.name} (+${Math.round(nextTrail.bonus * 100)}%)`, price: nextTrail.price, buy: () => (p.trail = nextTrail.id) })
  if (p.bikeUpg < G.TUNE_UP_MAX) list.push({ what: `tune-up ${p.bikeUpg + 1}`, price: G.tuneUpCost(p.bikeUpg), buy: () => (p.bikeUpg += 1) })
  if (!p.pass2xSpeed) list.push({ what: '2x Speed pass', price: G.PRODUCTS.pass2xSpeed.price, buy: () => (p.pass2xSpeed = true) })
  if (!p.pass2xWins) list.push({ what: '2x Wins pass', price: G.PRODUCTS.pass2xWins.price, buy: () => (p.pass2xWins = true) })
  const current = bestTreadmill()
  for (const pad of G.TRAIN_PADS) {
    if (!pad.wins || pad.mult <= current || G.padUnlocked(pad, p)) continue
    if (pad.world === 2 && !worldOpen(2)) continue
    list.push({ what: `treadmill ${pad.label} (${pad.mult}x)`, price: pad.wins, buy: () => (p.padsOwned = [p.padsOwned, pad.id].filter(Boolean).join(',')) })
  }
  return list.sort((a, b) => a.price - b.price)
}

function shop() {
  for (let guard = 0; guard < 50; guard += 1) {
    const next = candidates()[0]
    if (!next || next.price > p.wins) return
    p.wins -= next.price
    next.buy()
    say(`buy ${next.what} for ${G.formatNumber(next.price)} Wins`)
  }
}

function claimQuests() {
  for (const q of G.QUESTS) {
    for (let guard = 0; guard < 20; guard += 1) {
      const tier = p.quests[q.id] ?? 0
      if (q.max !== undefined && q.target(tier) > q.max) break
      const progress = q.absolute ? p.bestStage : p.counters[q.counter] ?? 0
      if (progress < q.target(tier)) break
      p.quests[q.id] = tier + 1
      const reward = q.reward(tier)
      if (reward.wins) addWins(reward.wins)
      if (reward.speed) addSpeed(reward.speed)
    }
  }
}

function timedRewards() {
  if (t >= chestAt) {
    const { base, perStage } = BALANCE.rewards.chest
    addWins(base + perStage * (1 + p.bestStage))
    chestAt = t + G.CHEST_COOLDOWN_MS / 1000
  }
}

function maybeRebirth() {
  const need = G.rebirthSpeedFor(p.rebirths)
  if (p.speed < need) return
  p.rebirths += G.REBIRTH_GAIN
  p.speed = 0
  for (const { at, bike } of G.REBIRTH_MILESTONES) {
    if (p.rebirths !== at) continue
    if (bike.mult > G.BIKE_BY_ID[p.bike].mult) p.bike = bike.id
    say(`milestone bike: ${bike.name} (${bike.mult}x)`)
  }
  say(`REBIRTH ${p.rebirths}  (needed ⚡${G.formatNumber(need)}; next needs ⚡${G.formatNumber(G.rebirthSpeedFor(p.rebirths))})`)
}

/** Spends `seconds` riding or training at `padMult`. */
function spend(seconds, padMult = 1) {
  addSpeed(rate(padMult) * seconds)
  t += seconds
}

// Day one: the daily reward is collected on join.
addWins(G.streakWinsFor(1, p))
say(`join: daily reward (streak day 1), ${p.wins} Wins`)
// Today's three daily quests: assume they're done by the half-hour mark.
let dailyQuestsPaid = false

const END = hours * 3600
const rowsAtFirstReach = []
while (t < END) {
  if (!dailyQuestsPaid && t >= 1800) {
    dailyQuestsPaid = true
    const { winsBase, winsPerStage } = BALANCE.dailyQuests
    addWins(3 * (winsBase + winsPerStage * p.bestStage))
  }
  timedRewards()
  claimQuests()
  shop()
  maybeRebirth()

  const stage = targetStage()
  if (!stage) {
    // Can't clear stage 1 yet: ride around the lobby.
    spend(1)
    continue
  }
  const dist = layout.worlds[stage.world - 1].spawn.z - (stage.wallZ - 11)
  const time = dist / Math.min(G.bikeSpeedFor(p.speed), G.PHYSICS.maxMoveSpeed) + RUN_OVERHEAD + PER_GAP_OVERHEAD * stage.index
  spend(time)
  const doublePad = G.canUseDoublePad(p)
  const won = Math.max(1, Math.round(stage.wins * G.winsMultiplier(p, { double: doublePad })))
  addWins(won, true)
  const level = G.levelForSpeed(p.speed)
  p.counters.tricks += Math.round(stage.index * (level - 1) * 0.5)
  p.counters.jumps += Math.round(stage.index * (level - 1) * 0.5) + stage.index
  if (stage.gid > p.bestStage) p.bestStage = stage.gid
  // Every stage ridden through on the way counts as reached.
  for (const passed of layout.stages) {
    if (passed.world !== stage.world || passed.index > stage.index || firstReach.has(passed.gid)) continue
    firstReach.set(passed.gid, t)
    const paid = Math.max(1, Math.round(passed.wins * G.winsMultiplier(p, { double: doublePad })))
    const next = candidates().find((c) => c.what.startsWith('bike'))
    rowsAtFirstReach.push({ stage: passed, t, won: paid, next })
    say(`reach W${passed.world} stage ${passed.index} ${passed.name} (⚡${G.formatNumber(passed.speed)}): +${paid} Wins a run`)
  }

  const pad = bestTreadmill()
  if (pad >= 2) spend(time * TRAIN_RATIO, pad)
}

if (!quiet) {
  console.log(log.join('\n'))
  console.log('')
}
console.log(`Simulated ${hours} h of solo play.`)
console.log('')
console.log('First time reaching each stage, and how much of the next bike one run pays for:')
for (const row of rowsAtFirstReach) {
  const share = row.next ? `${Math.round((row.won / row.next.price) * 100)}% of ${row.next.what} (${G.formatNumber(row.next.price)})` : '—'
  console.log(`  ${clock(row.t)}  W${row.stage.world} ${String(row.stage.index).padStart(2)} ${row.stage.name.padEnd(17)} ⚡${G.formatNumber(row.stage.speed).padEnd(6)} +${String(row.won).padEnd(5)} ${share}`)
}
const rebirths = log.filter((l) => l.includes('REBIRTH')).map((l) => l.slice(0, 7))
console.log('')
console.log(`Rebirths at: ${rebirths.join(', ') || 'none'}`)
console.log(`End: ⚡${G.formatNumber(p.speed)} Speed, ${G.formatNumber(p.wins)} Wins, ${p.rebirths} rebirths, best stage ${p.bestStage}, ${G.BIKE_BY_ID[p.bike].name}`)

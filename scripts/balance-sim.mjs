// Progression simulator (npm run balance): replays a solo new player with the
// numbers in config/balance.ts and prints when they reach each stage, buy each
// upgrade and rebirth. Use it after every tuning change.
//
// The player is simple but sensible: rides to the furthest stage their Speed
// clears and banks its Wins (on the purple 2x pad when they can), spends Wins
// on the cheapest upgrade available (eggs included, until a few pets fill
// their slots), trains on a treadmill between runs once one beats riding,
// collects the daily reward, chest, quests, playtime gifts, lucky spins and
// star rewards, and rebirths as soon as they can. Real players are slower
// (falls, lasers, menus) and faster (friends' bonus, tricks), so read the
// times as a guide.
//
// Luck (spins, eggs) comes from a seeded random generator: the detailed log is
// seed 1 (or $SEED), and a summary over several seeds shows how much luck moves
// things.
//
//   node scripts/balance-sim.mjs [hours=3] [--quiet] [--seeds=20]
//   SEED=7 node scripts/balance-sim.mjs 1      # another seed's first hour
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const imp = (p) => import(pathToFileURL(path.join(root, p)).href)
const { BALANCE } = await imp('config/balance.ts')
const G = await imp('src/shared/gameData.js')
const { getLayout, starsFor } = await imp('src/shared/layout.js')

const hours = Number(process.argv.find((a) => /^\d+(\.\d+)?$/.test(a)) ?? 3)
const quiet = process.argv.includes('--quiet')
const seeds = Number(process.argv.find((a) => a.startsWith('--seeds='))?.slice(8) ?? 20)
const layout = getLayout()

/** Seconds lost per run besides riding: the teleport home, lining up each jump. */
const RUN_OVERHEAD = 3
const PER_GAP_OVERHEAD = 0.6
/** Training between runs once a treadmill beats riding: this many times the run's length. */
const TRAIN_RATIO = 2
/** Playtime gifts start over each session; assume a new session every this many minutes. */
const SESSION_MINUTES = 60
/** Eggs the player buys per tier before saving for upgrades again (enough to fill the slots). */
const EGGS_PER_TIER = 3

/** Small seeded random generator (mulberry32) so runs can be repeated. */
function seeded(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let x = Math.imul(a ^ (a >>> 15), 1 | a)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

function clock(s) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function simulate(seed) {
  const random = seeded(seed)
  const p = {
    speed: 0,
    totalSpeed: 0,
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
    pets: '',
    petsEquipped: '',
    bestStage: 0,
    counters: { gained: 0, wins: 0, tricks: 0, jumps: 0 },
    quests: {},
  }
  let t = 0
  let chestAt = 0
  let sessionStart = 0
  let giftsClaimed = 0
  let spinAt = G.SPIN_EVERY_MS / 1000
  let starTiers = 0
  const eggsBought = { basic: 0, golden: 0, cosmic: 0 }
  const bestStars = new Map()
  const log = []
  const firstReach = new Map()
  const extra = { gifts: 0, spins: 0, eggs: 0, rebirthWins: 0, starWins: 0 }
  const say = (text) => {
    log.push(`${clock(t)}  ${text}`)
  }

  const ticksPerSecond = 1000 / BALANCE.speed.tickMs
  const rate = (padMult = 1) => BALANCE.speed.perTick * G.speedBreakdown(p, { padMult }).total * ticksPerSecond
  const worldOpen = (id) => G.worldUnlocked(id, p)

  function addSpeed(amount) {
    p.speed += amount
    p.totalSpeed = p.speed
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

  /** Hatches an egg: the new pet joins, and the best three are equipped. */
  function hatch(eggId, why) {
    const pet = G.rollPet(eggId, random())
    p.pets = [p.pets, pet.id].filter(Boolean).join(',')
    p.petsEquipped = G.bestPets(G.parseList(p.pets)).join(',')
    say(`${why}: ${G.EGG_BY_ID[eggId].name} hatched a ${pet.rarity} ${pet.name} (${G.petBonusText(pet)})`)
  }

  /** Gives a gift/spin reward spec ({ wins | trainMinutes | egg }). */
  function giveSpec(spec, why) {
    const reward = G.resolveReward(spec, p)
    if (reward.egg) return hatch(reward.egg, why)
    if (reward.wins) addWins(reward.wins)
    if (reward.speed) addSpeed(reward.speed)
    return reward
  }

  function candidates() {
    const list = []
    const bikeMult = G.BIKE_BY_ID[p.bike].mult
    const nextBike = G.BIKES.filter((b) => b.mult > bikeMult && G.bikeAvailable(b, p)).sort((a, b) => a.price - b.price)[0]
    if (nextBike) list.push({ what: `bike ${nextBike.name} (${nextBike.mult}x)`, price: nextBike.price, buy: () => (p.bike = nextBike.id) })
    // Star rewards and other exclusives are earned, never bought.
    const auraMult = G.AURA_BY_ID[p.aura].winsMult
    const nextAura = G.AURAS.filter((a) => !a.exclusive && a.winsMult > auraMult).sort((a, b) => a.price - b.price)[0]
    if (nextAura) list.push({ what: `aura ${nextAura.name} (${nextAura.winsMult}x Wins)`, price: nextAura.price, buy: () => (p.aura = nextAura.id) })
    const trailBonus = G.TRAIL_BY_ID[p.trail].bonus
    const nextTrail = G.TRAILS.filter((x) => !x.exclusive && x.bonus > trailBonus).sort((a, b) => a.price - b.price)[0]
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
    // A few eggs of each tier, the next tier once the last one's slots are full.
    const egg = G.EGGS.find((e) => eggsBought[e.id] < EGGS_PER_TIER)
    if (egg) {
      list.push({
        what: `egg ${egg.name}`,
        price: egg.price,
        buy: () => {
          eggsBought[egg.id] += 1
          hatch(egg.id, 'egg')
        },
      })
    }
    return list.sort((a, b) => a.price - b.price)
  }

  function shop() {
    for (let guard = 0; guard < 50; guard += 1) {
      const next = candidates()[0]
      if (!next || next.price > p.wins) return
      p.wins -= next.price
      if (next.what.startsWith('egg')) extra.eggs += next.price
      next.buy()
      if (!next.what.startsWith('egg')) say(`buy ${next.what} for ${G.formatNumber(next.price)} Wins`)
    }
  }

  function claimQuests() {
    for (const q of G.QUESTS) {
      for (let guard = 0; guard < 20; guard += 1) {
        const tier = p.quests[q.id] ?? 0
        if (q.max !== undefined && q.target(tier) > q.max) break
        const progress = q.absolute ? p.bestStage : (p.counters[q.counter] ?? 0)
        if (progress < q.target(tier)) break
        p.quests[q.id] = tier + 1
        const reward = q.reward(tier)
        if (reward.wins) addWins(reward.wins)
        if (reward.speed) addSpeed(reward.speed)
        if (reward.speed) say(`quest ${q.id} ${tier + 1}: ${G.describeReward(reward)}`)
      }
    }
  }

  function timedRewards() {
    if (t >= chestAt) {
      const { base, perStage } = BALANCE.rewards.chest
      addWins(base + perStage * (1 + p.bestStage))
      chestAt = t + G.CHEST_COOLDOWN_MS / 1000
    }
    // Playtime gifts (a fresh set each session).
    if (t - sessionStart >= SESSION_MINUTES * 60) {
      sessionStart = t
      giftsClaimed = 0
    }
    const gift = G.PLAYTIME_GIFTS[giftsClaimed]
    if (gift && t - sessionStart >= gift.minutes * 60) {
      giftsClaimed += 1
      const wins = p.wins
      const reward = giveSpec(gift, `gift ${giftsClaimed}`)
      extra.gifts += p.wins - wins
      if (reward) say(`gift ${giftsClaimed}: ${G.describeReward(reward)}`)
    }
    // Lucky spin.
    if (t >= spinAt) {
      spinAt = t + G.SPIN_EVERY_MS / 1000
      const wins = p.wins
      const reward = giveSpec(G.SPIN_REWARDS[G.rollSpin(random())], 'spin')
      extra.spins += p.wins - wins
      if (reward && !quiet) say(`spin: ${G.describeReward(reward)}`)
    }
  }

  /** Stars from a run: each stage passed is timed from the lobby. */
  function rateRun(stage, speed) {
    for (const passed of layout.stages) {
      if (passed.world !== stage.world || passed.index > stage.index) continue
      const dist = layout.worlds[passed.world - 1].spawn.z - (passed.plateauZ0 - 1)
      const ms = (dist / speed + PER_GAP_OVERHEAD * passed.index) * 1000
      const stars = starsFor(passed, ms)
      if (stars > (bestStars.get(passed.gid) ?? 0)) bestStars.set(passed.gid, stars)
    }
    let total = 0
    for (const stars of bestStars.values()) total += stars
    while (starTiers < G.STAR_REWARDS.length && total >= G.STAR_REWARDS[starTiers].stars) {
      const tier = G.STAR_REWARDS[starTiers]
      starTiers += 1
      if (tier.wins) {
        addWins(tier.wins)
        extra.starWins += tier.wins
      }
      if (tier.trail && G.TRAIL_BY_ID[tier.trail].bonus > G.TRAIL_BY_ID[p.trail].bonus) p.trail = tier.trail
      if (tier.aura && G.AURA_BY_ID[tier.aura].winsMult > G.AURA_BY_ID[p.aura].winsMult) p.aura = tier.aura
      if (tier.bike && G.BIKE_BY_ID[tier.bike].mult > G.BIKE_BY_ID[p.bike].mult) p.bike = tier.bike
      say(`⭐ ${tier.stars} stars: ${G.describeReward(tier)}`)
    }
  }

  function maybeRebirth() {
    const need = G.rebirthSpeedFor(p.rebirths)
    if (p.speed < need) return
    p.rebirths += G.REBIRTH_GAIN
    p.speed = 0
    p.totalSpeed = 0
    const wins = G.rebirthRewardFor(p.rebirths)
    addWins(wins)
    extra.rebirthWins += wins
    for (const { at, bike } of G.REBIRTH_MILESTONES) {
      if (p.rebirths !== at) continue
      if (bike.mult > G.BIKE_BY_ID[p.bike].mult) p.bike = bike.id
      say(`milestone bike: ${bike.name} (${bike.mult}x)`)
    }
    say(`REBIRTH ${p.rebirths}  (needed ⚡${G.formatNumber(need)}; +${wins} Wins; next needs ⚡${G.formatNumber(G.rebirthSpeedFor(p.rebirths))})`)
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
  const rows = []
  const rebirthTimes = []
  while (t < END) {
    if (!dailyQuestsPaid && t >= 1800) {
      dailyQuestsPaid = true
      const { winsBase, winsPerStage } = BALANCE.dailyQuests
      addWins(3 * (winsBase + winsPerStage * p.bestStage))
    }
    timedRewards()
    claimQuests()
    shop()
    const before = p.rebirths
    maybeRebirth()
    if (p.rebirths > before) rebirthTimes.push(t)

    const stage = targetStage()
    if (!stage) {
      // Can't clear stage 1 yet: ride around the lobby.
      spend(1)
      continue
    }
    const speed = Math.min(G.bikeSpeedFor(p.speed), G.PHYSICS.maxMoveSpeed)
    const dist = layout.worlds[stage.world - 1].spawn.z - (stage.wallZ - 11)
    const time = dist / speed + RUN_OVERHEAD + PER_GAP_OVERHEAD * stage.index
    spend(time)
    rateRun(stage, speed)
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
      rows.push({ stage: passed, t, won: paid, next })
      say(`reach W${passed.world} stage ${passed.index} ${passed.name} (⚡${G.formatNumber(passed.speed)}): +${paid} Wins a run`)
    }

    const pad = bestTreadmill()
    if (pad >= 2) spend(time * TRAIN_RATIO, pad)
  }
  return { p, log, rows, rebirthTimes, firstReach, extra, starTiers }
}

const run = simulate(Number(process.env.SEED || 1))
if (!quiet) {
  console.log(run.log.join('\n'))
  console.log('')
}
console.log(`Simulated ${hours} h of solo play (seed 1).`)
console.log('')
console.log('First time reaching each stage, and how much of the next bike one run pays for:')
for (const row of run.rows) {
  const share = row.next ? `${Math.round((row.won / row.next.price) * 100)}% of ${row.next.what} (${G.formatNumber(row.next.price)})` : '—'
  console.log(`  ${clock(row.t)}  W${row.stage.world} ${String(row.stage.index).padStart(2)} ${row.stage.name.padEnd(17)} ⚡${G.formatNumber(row.stage.speed).padEnd(6)} +${String(row.won).padEnd(5)} ${share}`)
}
console.log('')
console.log(`Rebirths at: ${run.rebirthTimes.map(clock).join(', ') || 'none'}`)
const { p, extra } = run
console.log(`End: ⚡${G.formatNumber(p.speed)} Speed, ${G.formatNumber(p.wins)} Wins, ${p.rebirths} rebirths, best stage ${p.bestStage}, ${G.BIKE_BY_ID[p.bike].name}`)
console.log(`Pets: ${p.petsEquipped || 'none'} (${G.parseList(p.pets).length} owned) · star tiers ${run.starTiers}/${G.STAR_REWARDS.length}`)
console.log(
  `Wins from gifts ${G.formatNumber(extra.gifts)} · spins ${G.formatNumber(extra.spins)} · rebirths ${G.formatNumber(extra.rebirthWins)} · stars ${G.formatNumber(extra.starWins)} · spent on eggs ${G.formatNumber(extra.eggs)}`,
)

// Luck: the same player over several seeds.
if (seeds > 1) {
  const pick = (list, q) => list[Math.min(list.length - 1, Math.floor(q * list.length))]
  const spread = (values) => {
    const list = values.filter((v) => v !== undefined).sort((a, b) => a - b)
    if (!list.length) return 'never'
    return `median ${clock(pick(list, 0.5))}  (fastest ${clock(list[0])}, slowest ${clock(list.at(-1))}${list.length < values.length ? `, ${values.length - list.length} never` : ''})`
  }
  const runs = Array.from({ length: seeds }, (_, i) => simulate(i + 1))
  const escape = layout.stages.find((s) => s.world === 1 && s.isFinish).gid
  console.log('')
  console.log(`Over ${seeds} seeds:`)
  console.log(`  first rebirth   ${spread(runs.map((r) => r.rebirthTimes[0]))}`)
  console.log(`  World 1 escaped ${spread(runs.map((r) => r.firstReach.get(escape)))}`)
  console.log(`  rebirth 5       ${spread(runs.map((r) => r.rebirthTimes[4]))}`)
  console.log(`  rebirth 10      ${spread(runs.map((r) => r.rebirthTimes[9]))}`)
}

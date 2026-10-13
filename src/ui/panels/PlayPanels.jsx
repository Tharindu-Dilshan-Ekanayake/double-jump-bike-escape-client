import { useState } from 'react'

import { sound } from '../../audio/sound'
import { send } from '../../net/connection'
import {
  EGGS,
  EGG_BY_ID,
  MAX_PETS_EQUIPPED,
  MAX_PETS_OWNED,
  PETS,
  PET_BY_ID,
  RARITY_COLORS,
  SPIN_EVERY_MS,
  SPIN_REWARDS,
  bestPets,
  eggOdds,
  formatDuration,
  formatNumber,
  parseList,
  petBonus,
  petBonusText,
  petIndex,
  resolveReward,
} from '../../shared/gameData.js'
import { useGameStore } from '../../store/gameStore'
import { serverNow } from '../serverClock'
import { useNow } from '../useNow'
import { Grid, Modal, Price, Tabs } from './Modal'
import { RarityChip } from './ShopPanels'
import { action } from './actions'

/* ---------------------------------------------------------------------------
 * Pets: my pets, eggs, index
 * ------------------------------------------------------------------------- */

/** A pet's round portrait in its rarity colour (greyed out while undiscovered). */
function PetBadge({ pet, size = 84, unknown = false }) {
  const color = RARITY_COLORS[pet.rarity]
  return (
    <div
      className={`pet-badge ${unknown ? 'is-unknown' : ''}`}
      style={{ width: size, height: size, fontSize: size * 0.56, '--rarity': color }}
    >
      <span className={unknown ? 'pet-unknown' : ''}>{pet.emoji}</span>
    </div>
  )
}

/** A CSS egg in the egg's colours. */
export function EggArt({ egg, size = 92 }) {
  return (
    <div className="egg-art" style={{ width: size * 0.78, height: size, '--egg-a': egg.colors[0], '--egg-b': egg.colors[1] }}>
      <span className="hatch-spot" />
      <span className="hatch-spot is-2" />
    </div>
  )
}

/** Value used to sort pets (same weighting as "Equip best"). */
const petValue = (pet) => (pet.speed ?? 0) + ((pet.wins ?? 1) - 1) * 0.8

function MyPets({ me, onEggs }) {
  const owned = parseList(me.pets)
  const equipped = parseList(me.petsEquipped)
  const counts = {}
  for (const id of owned) counts[id] = (counts[id] || 0) + 1
  const species = Object.keys(counts)
    .map((id) => PET_BY_ID[id])
    .filter(Boolean)
    .sort((a, b) => petValue(b) - petValue(a))
  const bonus = petBonus(me)
  const best = bestPets(owned)
  const isBest = best.length === equipped.length && [...best].sort().join() === [...equipped].sort().join()

  const equip = (list) => {
    sound.click()
    send('pets', { equip: list })
  }

  if (!owned.length) {
    return (
      <div className="card gap-3 py-8">
        <div className="text-[64px]">🥚</div>
        <div className="ink-text text-[24px] font-bold">No pets yet!</div>
        <div className="ink-text text-[17px]">Hatch an egg: pets follow your bike and boost your Speed or Wins.</div>
        <button type="button" className="btn-chunky btn-green press game-text px-8 py-2 text-[24px]" onClick={onEggs}>
          🥚 GET AN EGG
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="pets-summary card mb-4 flex-row flex-wrap justify-between gap-3 px-5 text-left">
        <div className="flex flex-col">
          <span className="ink-text text-[22px] font-bold">
            Equipped {equipped.length}/{MAX_PETS_EQUIPPED} · Owned {owned.length}/{MAX_PETS_OWNED}
          </span>
          <span className="ink-text text-[17px] font-bold text-[#2fbf4a]">
            Pets: +{formatNumber(bonus.speed * 100)}% Speed · x{formatNumber(bonus.wins)} Wins
          </span>
        </div>
        <button
          type="button"
          className={`btn-chunky ${isBest ? 'btn-gray' : 'btn-orange press'} game-text px-5 py-2 text-[20px]`}
          disabled={isBest}
          onClick={action('pets', { best: true })}
        >
          ⭐ EQUIP BEST
        </button>
      </div>
      <Grid min={170}>
        {species.map((pet) => {
          const on = equipped.filter((id) => id === pet.id).length
          const have = counts[pet.id]
          const canAdd = on < have && equipped.length < MAX_PETS_EQUIPPED
          const removeOne = () => {
            const list = [...equipped]
            list.splice(list.lastIndexOf(pet.id), 1)
            equip(list)
          }
          return (
            <div key={pet.id} className={`card ${on ? 'is-equipped' : ''}`}>
              {have > 1 && <span className="pet-count game-text">x{have}</span>}
              <PetBadge pet={pet} />
              <RarityChip rarity={pet.rarity} />
              <div className="ink-text text-[20px] font-bold">{pet.name}</div>
              <div className="chip bg-[#e6ffe9] text-[#1d7a2f]">{petBonusText(pet)}</div>
              {canAdd ? (
                <button type="button" className="btn-chunky btn-blue press card-button game-text" onClick={() => equip([...equipped, pet.id])}>
                  EQUIP{on ? ` (${on}/${have})` : ''}
                </button>
              ) : on ? (
                <button type="button" className="btn-chunky btn-white press card-button game-text" onClick={removeOne}>
                  UNEQUIP
                </button>
              ) : (
                <button type="button" className="btn-chunky btn-gray card-button game-text" disabled>
                  SLOTS FULL
                </button>
              )}
              {on > 0 && canAdd && (
                <button type="button" className="pet-link ink-text" onClick={removeOne}>
                  Unequip one
                </button>
              )}
              {have > on && (
                <button type="button" className="pet-link ink-text" onClick={action('pets', { release: pet.id })}>
                  {have > 1 ? 'Release a spare' : 'Release'}
                </button>
              )}
            </div>
          )
        })}
      </Grid>
    </>
  )
}

function EggCard({ me, egg }) {
  const full = parseList(me.pets).length >= MAX_PETS_OWNED
  const affordable = me.wins >= egg.price
  const found = petIndex(me)
  return (
    <div className="card egg-card">
      <EggArt egg={egg} />
      <div className="ink-text text-[24px] font-bold">{egg.name}</div>
      <div className="egg-odds">
        {eggOdds(egg.id).map(({ pet, chance }) => (
          <div key={pet.id} className="egg-odd" title={`${pet.name} · ${petBonusText(pet)}`}>
            <span className={`text-[26px] ${found.has(pet.id) ? '' : 'pet-unknown'}`}>{pet.emoji}</span>
            <span className="text-[13px] font-bold" style={{ color: RARITY_COLORS[pet.rarity] }}>
              {formatNumber(chance * 100)}%
            </span>
          </div>
        ))}
      </div>
      {full ? (
        <button type="button" className="btn-chunky btn-gray card-button game-text" disabled>
          PETS FULL
        </button>
      ) : (
        <button
          type="button"
          className={`btn-chunky ${affordable ? 'btn-green' : 'btn-red'} press card-button game-text`}
          onClick={action('hatch', { egg: egg.id })}
        >
          HATCH · <Price currency="wins" value={egg.price} />
        </button>
      )}
    </div>
  )
}

function PetIndexTab({ me }) {
  const found = petIndex(me)
  return (
    <>
      <div className="collection-counter">
        <span className="game-text">
          📖 Pet Index {found.size}/{PETS.length}
        </span>
        <div className="collection-bar">
          <div style={{ width: `${(found.size / PETS.length) * 100}%` }} />
        </div>
      </div>
      {EGGS.map((egg) => (
        <div key={egg.id} className="mb-4">
          <h3 className="game-text mb-2 text-[22px]">{egg.name}</h3>
          <Grid min={150}>
            {PETS.filter((pet) => pet.egg === egg.id).map((pet) => {
              const known = found.has(pet.id)
              return (
                <div key={pet.id} className="card">
                  <PetBadge pet={pet} size={70} unknown={!known} />
                  <RarityChip rarity={pet.rarity} />
                  <div className="ink-text text-[18px] font-bold">{known ? pet.name : '???'}</div>
                  <div className="ink-text text-[14px] font-bold opacity-80">{known ? petBonusText(pet) : `Hatch from the ${EGG_BY_ID[pet.egg].name}`}</div>
                </div>
              )
            })}
          </Grid>
        </div>
      ))}
    </>
  )
}

export function PetsPanel({ me, props }) {
  const [tab, setTab] = useState(props.tab || (parseList(me.pets).length ? 'mine' : 'eggs'))
  const tabs = (
    <Tabs
      tabs={[
        ['mine', '🐾 My Pets'],
        ['eggs', '🥚 Eggs'],
        ['index', '📖 Index'],
      ]}
      value={tab}
      onChange={setTab}
      color="#ff6fb5"
    />
  )
  return (
    <Modal title="Pets" icon="🐾" color="#ff6fb5" tabs={tabs}>
      {tab === 'mine' && <MyPets me={me} onEggs={() => setTab('eggs')} />}
      {tab === 'eggs' && (
        <>
          <p className="ink-text mb-3 text-center text-[17px]">
            Spend Wins on an egg to hatch a random pet. Up to {MAX_PETS_EQUIPPED} pets follow your bike.
          </p>
          <Grid min={240}>
            {EGGS.map((egg) => (
              <EggCard key={egg.id} me={me} egg={egg} />
            ))}
          </Grid>
        </>
      )}
      {tab === 'index' && <PetIndexTab me={me} />}
    </Modal>
  )
}

/* ---------------------------------------------------------------------------
 * Lucky spin
 * ------------------------------------------------------------------------- */

const SLICE_COLORS = ['#ff4f6d', '#ffb21f', '#3bd16b', '#2fb5ff', '#b45cff', '#ff7a2f', '#ffd23a', '#ff6ef7']

/** What a slot shows on the wheel (amounts scale with your progress). */
function slotLabel(spec, me) {
  const reward = resolveReward(spec, me)
  if (reward.egg) return ['🥚', EGG_BY_ID[reward.egg].name.split(' ')[0]]
  if (reward.speed) return ['⚡', formatNumber(reward.speed)]
  return ['🏆', formatNumber(reward.wins)]
}

const point = (r, deg) => {
  const a = (deg * Math.PI) / 180
  return `${(r * Math.sin(a)).toFixed(2)},${(-r * Math.cos(a)).toFixed(2)}`
}

function Wheel({ me, angle }) {
  const seg = 360 / SPIN_REWARDS.length
  return (
    <div className="spin-wheel-wrap">
      <div className="spin-pointer" />
      <svg viewBox="-110 -110 220 220" className="spin-wheel" style={{ transform: `rotate(${angle}deg)` }}>
        <circle r="108" fill="#15151d" />
        {SPIN_REWARDS.map((spec, i) => {
          const [icon, text] = slotLabel(spec, me)
          const a0 = i * seg
          const a1 = a0 + seg
          return (
            <g key={i}>
              <path d={`M0,0 L${point(100, a0)} A100,100 0 0 1 ${point(100, a1)} Z`} fill={SLICE_COLORS[i % SLICE_COLORS.length]} stroke="#15151d" strokeWidth="2.5" />
              {/* Icon by the rim, the amount along the slice (reading outwards). */}
              <g transform={`rotate(${a0 + seg / 2})`}>
                <text y="-80" textAnchor="middle" dominantBaseline="middle" fontSize="18">
                  {icon}
                </text>
                <text transform="translate(0,-46) rotate(-90)" textAnchor="middle" dominantBaseline="middle" className="spin-text" fontSize={text.length > 5 ? 12 : 15}>
                  {text}
                </text>
              </g>
            </g>
          )
        })}
        <circle r="20" fill="#ffffff" stroke="#15151d" strokeWidth="4" />
        <text y="5" textAnchor="middle" fontSize="13" className="spin-text">
          SPIN
        </text>
      </svg>
    </div>
  )
}

export function SpinPanel({ me }) {
  useNow(500)
  const angle = useGameStore((s) => s.spinAngle)
  const result = useGameStore((s) => s.spinResult)
  const shown = useGameStore((s) => s.spinShown)
  const spinning = Boolean(result && result.at > shown)
  const left = me.spinReadyAt - serverNow()
  const ready = left <= 0 && !spinning
  const total = SPIN_REWARDS.reduce((sum, r) => sum + r.weight, 0)

  return (
    <Modal title="Lucky Spin" icon="🎡" color="#2fb5ff" width="min(620px, 94vw)">
      <div className="flex flex-col items-center gap-3">
        <Wheel me={me} angle={angle} />
        {result && !spinning && result.at === shown && (
          <div key={result.at} className="spin-won game-text">
            You won: {result.hatch ? `${PET_BY_ID[result.hatch.pet]?.emoji} ${PET_BY_ID[result.hatch.pet]?.name}` : slotLabel(SPIN_REWARDS[result.slot], me).join(' ')}!
          </div>
        )}
        {ready ? (
          <button type="button" className="btn-chunky btn-green btn-shine press game-text px-14 py-2 text-[34px]" onClick={action('spin')}>
            🎡 SPIN!
          </button>
        ) : (
          <button type="button" className="btn-chunky btn-gray game-text px-8 py-2 text-[24px]" disabled>
            {spinning ? 'Spinning…' : `Next free spin in ${formatDuration(left)}`}
          </button>
        )}
        <div className="ink-text text-center text-[15px] opacity-80">A free spin every {Math.round(SPIN_EVERY_MS / 60_000)} minutes of playtime (it only charges while you play).</div>
        <div className="spin-odds">
          {SPIN_REWARDS.map((spec, i) => (
            <span key={i} className="ink-text">
              <i style={{ background: SLICE_COLORS[i % SLICE_COLORS.length] }} />
              {slotLabel(spec, me).join(' ')} · {formatNumber((spec.weight / total) * 100)}%
            </span>
          ))}
        </div>
      </div>
    </Modal>
  )
}

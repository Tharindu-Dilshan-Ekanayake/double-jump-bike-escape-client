import { useState } from 'react'

import {
  AURAS,
  BIKES,
  bikeAvailable,
  PRODUCTS,
  TRAILS,
  TRAIN_PADS,
  TRAIN_PAD_BY_ID,
  TUNE_UP_MAX,
  bikeSpeedFor,
  tuneUpBonus,
  tuneUpCost,
  formatNumber,
  parseList,
  COLLECTIBLES,
  RARITY_COLORS,
  collectionCount,
  fasterLabel,
  starsNeededFor,
} from '../../shared/gameData.js'
import { BikeIcon } from '../icons'
import { Grid, Modal, OwnButton, Price, Tabs } from './Modal'
import { action } from './actions'

const owns = (me, cat, id) => parseList(me.owned).includes(`${cat}:${id}`)

/** A greyed-out card button for things that can't be bought ("⭐ 15 STARS"). */
function LockedButton({ children }) {
  return (
    <button type="button" className="btn-chunky btn-gray card-button game-text" disabled>
      {children}
    </button>
  )
}

/** Star rewards and other exclusives aren't sold: say how to earn them instead. */
function ItemButton({ me, cat, item, equipped }) {
  const owned = owns(me, cat, item.id)
  if (item.exclusive === 'stars' && !owned) return <LockedButton>⭐ {starsNeededFor(cat, item.id)} STARS</LockedButton>
  return (
    <OwnButton
      me={me}
      owned={owned}
      equipped={equipped}
      currency={item.currency ?? 'wins'}
      price={item.price}
      onBuy={action('buy', { cat, id: item.id })}
      onEquip={action('equip', { cat, id: item.id })}
    />
  )
}

/* ---------------------------------------------------------------------------
 * Item shop: trails + auras
 * ------------------------------------------------------------------------- */

function TrailPreview({ colors }) {
  if (!colors.length) return <div className="grid h-[70px] w-full place-items-center text-[40px]">🚫</div>
  return (
    <div
      className="h-[70px] w-full rounded-full border-4 border-[#15151d]"
      style={{ background: `linear-gradient(90deg, ${colors.join(', ')})`, boxShadow: `0 0 18px ${colors[0]}` }}
    />
  )
}

function AuraPreview({ color, none }) {
  if (none) return <div className="grid h-[86px] place-items-center text-[40px]">🚫</div>
  return (
    <div
      className="h-[86px] w-[86px] rounded-full border-4 border-[#15151d]"
      style={{ background: `radial-gradient(circle, #ffffff 0%, ${color} 45%, ${color}00 72%)`, boxShadow: `0 0 26px ${color}` }}
    />
  )
}

/** A rarity tag in the rarity's colour. */
export function RarityChip({ rarity }) {
  return (
    <div className="chip rarity-chip text-white" style={{ background: RARITY_COLORS[rarity] }}>
      {rarity.toUpperCase()}
    </div>
  )
}

/** "Collection 7/30": trails and auras collected, with a bar. */
export function CollectionCounter({ me }) {
  const have = collectionCount(me)
  const total = COLLECTIBLES.length
  return (
    <div className="collection-counter">
      <span className="game-text">
        🗂️ Collection {have}/{total}
      </span>
      <div className="collection-bar">
        <div style={{ width: `${(have / total) * 100}%` }} />
      </div>
    </div>
  )
}

export function ItemsPanel({ me, props }) {
  const [tab, setTab] = useState(props.tab || 'trails')
  const tabs = <Tabs tabs={[['trails', '☄️ Trails'], ['auras', '🔮 Auras']]} value={tab} onChange={setTab} color="#2fb5ff" />
  return (
    <Modal title="Trails & Auras" icon="🛒" color="#2fb5ff" tabs={tabs}>
      <CollectionCounter me={me} />
      {tab === 'trails' ? (
        <Grid>
          {TRAILS.map((trail) => (
            <div key={trail.id} className={`card ${me.trail === trail.id ? 'is-equipped' : ''}`}>
              <TrailPreview colors={trail.colors} />
              {trail.id !== 'none' && <RarityChip rarity={trail.rarity} />}
              <div className="ink-text text-[22px] font-bold">{trail.name}</div>
              <div className="chip bg-[#e6ffe9] text-[#1d7a2f]">+{Math.round(trail.bonus * 100)}% Speed</div>
              <ItemButton me={me} cat="trail" item={trail} equipped={me.trail === trail.id} />
            </div>
          ))}
        </Grid>
      ) : (
        <Grid>
          {AURAS.map((aura) => (
            <div
              key={aura.id}
              className={`card ${me.aura === aura.id ? 'is-equipped' : ''} ${props.highlight === aura.id ? 'is-highlight' : ''}`}
            >
              <AuraPreview color={aura.color} none={aura.id === 'none'} />
              {aura.id !== 'none' && <RarityChip rarity={aura.rarity} />}
              <div className="ink-text text-[22px] font-bold">{aura.name}</div>
              <div className="chip bg-[#fff6d6] text-[#9a6a00]">{aura.winsMult}x Wins</div>
              <ItemButton me={me} cat="aura" item={aura} equipped={me.aura === aura.id} />
            </div>
          ))}
        </Grid>
      )}
    </Modal>
  )
}

/* ---------------------------------------------------------------------------
 * Bikes
 * ------------------------------------------------------------------------- */

/** Why a bike can't be bought yet (exclusives are earned, World 2 bikes wait for World 2). */
function bikeLockLabel(bike) {
  if (bike.shop === 'stars') return `⭐ ${starsNeededFor('bike', bike.id)} STARS`
  if (bike.shop === 'rebirth') return `🔒 REBIRTH ${bike.milestone}`
  return '🔒 WORLD 2'
}

export function BikeCard({ me, bike, highlight }) {
  const locked = !owns(me, 'bike', bike.id) && !bikeAvailable(bike, me)
  const faster = fasterLabel(bike, me)
  return (
    <div className={`card ${me.bike === bike.id ? 'is-equipped' : ''} ${highlight ? 'is-highlight' : ''}`}>
      <BikeIcon frame={bike.frame} rim={bike.rim} accent={bike.accent} size={120} />
      <RarityChip rarity={bike.rarity} />
      <div className="ink-text text-[22px] font-bold">{bike.name}</div>
      <div className="chip bg-[#e6f3ff] text-[#1d5aa8]">{formatNumber(bike.mult)}x Speed</div>
      {faster && !owns(me, 'bike', bike.id) && <div className="ink-text text-[14px] font-bold text-[#2fbf4a]">{faster} than your best bike!</div>}
      {locked ? (
        <LockedButton>{bikeLockLabel(bike)}</LockedButton>
      ) : (
      <OwnButton
        me={me}
        owned={owns(me, 'bike', bike.id)}
        equipped={me.bike === bike.id}
        currency={bike.currency}
        price={bike.price}
        onBuy={action('buy', { cat: 'bike', id: bike.id })}
        onEquip={action('equip', { cat: 'bike', id: bike.id })}
      />
      )}
    </div>
  )
}

function BikeSpeedCard({ me }) {
  const count = me.bikeUpg || 0
  const maxed = count >= TUNE_UP_MAX
  const cost = tuneUpCost(count)
  const pct = (n) => `+${Math.round(tuneUpBonus(n) * 100)}%`
  return (
    <div className="card mb-4 flex-row justify-between gap-4 px-5 text-left">
      <div className="text-[64px]">✏️</div>
      <div className="flex-1">
        <div className="ink-text text-[26px] font-bold">
          Tune-ups {count}/{TUNE_UP_MAX}
        </div>
        <div className="game-text text-[38px] text-[#7fc4ff]">
          {pct(count)} Speed{maxed ? '' : ` → ${pct(count + 1)}`}
        </div>
        <div className="ink-text text-[16px] opacity-70">
          Each tune-up makes you gain Speed faster. Your Max Bike Speed ({Math.round(bikeSpeedFor(me.totalSpeed))}) comes from your Speed.
        </div>
      </div>
      <div className="w-[170px]">
        {maxed ? (
          <button type="button" className="btn-chunky btn-gray card-button game-text" disabled>
            MAXED
          </button>
        ) : (
          <OwnButton me={me} currency="wins" price={cost} onBuy={action('buy', { cat: 'bikeSpeed' })} buyLabel={<>Tune up · <Price currency="wins" value={cost} /></>} />
        )}
      </div>
    </div>
  )
}

export function BikeSpeedPanel({ me }) {
  return (
    <Modal title="Bike Speed" icon="✏️" color="#4fa8ff" width="min(640px, 94vw)">
      <BikeSpeedCard me={me} />
    </Modal>
  )
}

export function WinsShopPanel({ me }) {
  return (
    <Modal title="Wins Shop" icon="🏆" color="#35c95a">
      <BikeSpeedCard me={me} />
      <Grid>
        {BIKES.filter((b) => b.shop === 'wins' || (b.shop === 'w2' && bikeAvailable(b, me))).map((bike) => (
          <BikeCard key={bike.id} me={me} bike={bike} />
        ))}
      </Grid>
    </Modal>
  )
}

/* ---------------------------------------------------------------------------
 * Shop: passes, speed packs and treadmills, all paid in Wins
 * ------------------------------------------------------------------------- */

function ProductCard({ me, id, icon, note, highlight }) {
  const product = PRODUCTS[id]
  const owned = (id === 'pass2xSpeed' || id === 'pass2xWins') && me[id]
  return (
    <div className={`card ${owned ? 'is-equipped' : ''} ${highlight ? 'is-highlight' : ''}`}>
      <div className="text-[54px]">{icon}</div>
      <div className="ink-text text-[22px] font-bold">{product.name}</div>
      {note && <div className="ink-text text-[15px] opacity-70">{note}</div>}
      {owned ? (
        <button type="button" className="btn-chunky btn-gray card-button game-text" disabled>
          OWNED
        </button>
      ) : (
        <OwnButton me={me} currency="wins" price={product.price} onBuy={action('buy', { cat: 'product', id })} />
      )}
    </div>
  )
}

export function ShopPanel({ me, props }) {
  return (
    <Modal title="Shop" icon="🏆" color="#35c95a">
      <h3 className="game-text mb-2 text-[28px]">Passes</h3>
      <Grid>
        <ProductCard me={me} id="pass2xSpeed" icon="⚡" note="Double every speed gain" highlight={props.highlight === 'pass2xSpeed'} />
        <ProductCard me={me} id="pass2xWins" icon="🏆" note="Unlocks the purple 2x Wins pads" highlight={props.highlight === 'pass2xWins'} />
      </Grid>
      <h3 className="game-text mb-2 mt-5 text-[28px]">Speed Packs</h3>
      <Grid min={150}>
        {['speed100', 'speed1k', 'speed10k', 'speed100k'].map((id) => (
          <ProductCard key={id} me={me} id={id} icon="👟" />
        ))}
      </Grid>
      <h3 className="game-text mb-2 mt-5 text-[28px]">Training Pads</h3>
      <Grid min={150}>
        {TRAIN_PADS.filter((p) => p.wins).map((pad) => (
          <PadCard key={pad.id} me={me} pad={pad} />
        ))}
      </Grid>
      <div className="card mt-5 items-start text-left">
        <div className="ink-text text-[22px] font-bold">🏆 Earning Wins</div>
        <div className="ink-text text-[17px]">
          Land on a stage's Return pad, claim the daily 📅 reward, open the Group Chest, finish quests 📜 and try codes 🎟️.
        </div>
      </div>
    </Modal>
  )
}

function PadCard({ me, pad }) {
  const owned = parseList(me.padsOwned).includes(pad.id)
  return (
    <div className={`card ${owned ? 'is-equipped' : ''}`}>
      <div className="h-[50px] w-full rounded-xl border-4 border-[#15151d]" style={{ background: pad.color }} />
      <div className="ink-text text-[20px] font-bold">{pad.label}</div>
      <div className="chip bg-[#e6f3ff] text-[#1d5aa8]">{formatNumber(pad.mult)}x Speed</div>
      {owned ? (
        <button type="button" className="btn-chunky btn-gray card-button game-text" disabled>
          UNLOCKED
        </button>
      ) : (
        <OwnButton me={me} currency="wins" price={pad.wins} onBuy={action('buy', { cat: 'pad', id: pad.id })} />
      )}
    </div>
  )
}

export function PadPanel({ me, props }) {
  const pad = TRAIN_PAD_BY_ID[props.pad]
  if (!pad) return null
  return (
    <Modal title={`${pad.label} Pad`} icon="⚡" color="#ffb21f" width="min(420px, 94vw)">
      <PadCard me={me} pad={pad} />
      <p className="ink-text mt-3 text-center text-[18px]">Ride on this pad to gain {formatNumber(pad.mult)}x speed.</p>
    </Modal>
  )
}

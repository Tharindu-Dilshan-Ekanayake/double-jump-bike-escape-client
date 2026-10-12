import { useState } from 'react'

import { sound } from '../../audio/sound'
import { localPlayer } from '../../game/playerState'
import { getRoom, send } from '../../net/connection'
import {
  BIKES,
  ITEM_BY_ID,
  RARITY_COLORS,
  WORLDS,
  describeReward,
  formatNumber,
  itemBonus,
  parseList,
  rebirthBonus,
  rebirthGainFor,
  rebirthLevelFor,
  worldUnlocked,
} from '../../shared/gameData.js'
import { gameState, useGameStore } from '../../store/gameStore'
import { useNow } from '../useNow'
import { BikeCard } from './ShopPanels'
import { Grid, Modal, Tabs } from './Modal'
import { action } from './actions'
import { questRows } from './questStatus'

/* ---------------------------------------------------------------------------
 * Inventory: bikes and items
 * ------------------------------------------------------------------------- */

function ItemsGrid({ me }) {
  const counts = {}
  for (const id of parseList(me.items)) counts[id] = (counts[id] || 0) + 1
  const ids = Object.keys(counts).filter((id) => ITEM_BY_ID[id])
  if (!ids.length) {
    return (
      <div className="card">
        <div className="text-[60px]">🛒</div>
        <div className="ink-text text-[22px]">No items yet — visit the ITEM SHOP in the lobby!</div>
      </div>
    )
  }
  return (
    <>
      <div className="game-text mb-3 text-[24px]">Items give +{Math.round(itemBonus(me.items) * 100)}% Speed in total</div>
      <Grid min={170}>
        {ids.map((id) => {
          const item = ITEM_BY_ID[id]
          return (
            <div key={id} className="card">
              <div className="chip text-white" style={{ background: RARITY_COLORS[item.rarity] }}>
                {item.rarity.toUpperCase()}
              </div>
              <div className="text-[56px] leading-none">{item.icon}</div>
              <div className="ink-text text-[20px] font-bold">
                {item.name} <span className="opacity-60">×{counts[id]}</span>
              </div>
              <div className="chip bg-[#e6ffe9] text-[#1d7a2f]">+{Math.round(item.bonus * counts[id] * 100)}% Speed</div>
            </div>
          )
        })}
      </Grid>
    </>
  )
}

export function InventoryPanel({ me, props }) {
  const [tab, setTab] = useState(props.tab || 'bikes')
  const owned = parseList(me.owned)
  const bikes = BIKES.filter((b) => owned.includes(`bike:${b.id}`))
  const tabs = (
    <Tabs
      tabs={[
        ['bikes', '🚲 Bikes'],
        ['items', '🔔 Items'],
      ]}
      value={tab}
      onChange={setTab}
      color="#7ccf2f"
    />
  )
  return (
    <Modal title="Inventory" icon="🎒" color="#7ccf2f" tabs={tabs}>
      {tab === 'items' ? (
        <ItemsGrid me={me} />
      ) : tab === 'bikes' ? (
        <>
          <Grid>
            {bikes.map((bike) => (
              <BikeCard key={bike.id} me={me} bike={bike} />
            ))}
          </Grid>
          <p className="ink-text mt-4 text-center text-[17px]">Buy more bikes on the pads by the start or in the Wins Shop.</p>
        </>
      ) : null}
    </Modal>
  )
}

/* ---------------------------------------------------------------------------
 * Rebirth
 * ------------------------------------------------------------------------- */

export function RebirthPanel({ me }) {
  const needed = rebirthLevelFor(me.rebirths)
  const ready = me.level >= needed
  const gain = rebirthGainFor(Math.max(me.level, needed))
  return (
    <Modal title="Rebirth" icon="🔄" color="#2f8cff" width="min(620px, 94vw)">
      <div className="card gap-3 px-6">
        <div className="game-text text-[30px]">Rebirths: {formatNumber(me.rebirths)}</div>
        <div className="flex items-center gap-4">
          <span className="game-text text-[44px] text-[#d27bff]">+{formatNumber(rebirthBonus(me.rebirths) * 100)}%</span>
          <span className="game-text text-[44px]">→</span>
          <span className="game-text text-[44px] text-[#7dff8a]">+{formatNumber(rebirthBonus(me.rebirths + gain) * 100)}%</span>
        </div>
        <div className="ink-text text-[19px]">Permanent Speed XP bonus</div>
        {ready ? (
          <div className="game-text mt-1 text-[28px] text-[#ffe27a]">Rebirth now for +{formatNumber(gain)} rebirths!</div>
        ) : (
          <>
            <div className="ink-text mt-2 text-[20px] font-bold">
              Reach Level {needed} ({Math.min(me.level, needed)}/{needed})
            </div>
            <div className="progress-mini">
              <div style={{ width: `${Math.min(1, me.level / needed) * 100}%` }} />
            </div>
          </>
        )}
        <div className="ink-text text-[16px]">The higher your level, the more rebirths you get: Lvl 20 → {rebirthGainFor(20)}, Lvl 40 → {rebirthGainFor(40)}.</div>
        <button
          type="button"
          className={`btn-chunky ${ready ? 'btn-green press' : 'btn-gray'} game-text mt-2 px-10 py-2 text-[34px]`}
          disabled={!ready}
          onClick={action('rebirth')}
        >
          REBIRTH
        </button>
        <div className="ink-text text-[15px] opacity-70">Resets your level (and jumps) to 1. Wins and items stay. World 2 needs 10 rebirths.</div>
      </div>
    </Modal>
  )
}

/* ---------------------------------------------------------------------------
 * Quests
 * ------------------------------------------------------------------------- */

export function QuestsPanel({ me }) {
  const rows = questRows(me)
  return (
    <Modal title="Quests" icon="📜" color="#32c94a" width="min(720px, 94vw)">
      <div className="flex flex-col gap-3">
        {rows.map(({ quest, target, progress, ready, done, reward }) => (
          <div key={quest.id} className="card flex-row gap-4 px-4 text-left">
            <div className="text-[46px]">{quest.icon}</div>
            <div className="flex flex-1 flex-col gap-1">
              <div className="ink-text text-[21px] font-bold">{done ? 'All done!' : quest.title.replace('{n}', formatNumber(target))}</div>
              <div className="progress-mini">
                <div style={{ width: `${done ? 100 : (progress / target) * 100}%` }} />
              </div>
              <div className="ink-text text-[15px]">
                {done ? '—' : `${formatNumber(progress)} / ${formatNumber(target)}`} · Reward: {describeReward(reward)}
              </div>
            </div>
            <button
              type="button"
              className={`btn-chunky ${ready ? 'btn-green press' : 'btn-gray'} game-text w-[130px] py-2 text-[22px]`}
              disabled={!ready}
              onClick={action('claim', { what: 'quest', id: quest.id })}
            >
              {ready ? 'CLAIM' : done ? 'DONE' : 'GO!'}
            </button>
          </div>
        ))}
      </div>
    </Modal>
  )
}

/* ---------------------------------------------------------------------------
 * Codes, settings, players, worlds, welcome
 * ------------------------------------------------------------------------- */

export function CodesPanel() {
  const [code, setCode] = useState('')
  const submit = () => {
    if (!code.trim()) return
    sound.click()
    send('code', { code })
    setCode('')
  }
  return (
    <Modal title="Codes" icon="🎟️" color="#ff5fa8" width="min(560px, 94vw)">
      <div className="card gap-3 px-6">
        <div className="ink-text text-[20px]">Enter a code for free rewards!</div>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="TYPE CODE HERE"
          maxLength={32}
          className="ink-text w-full rounded-xl border-4 border-[#15151d] bg-[#f4f6fb] px-4 py-2 text-center text-[28px] font-bold outline-none"
        />
        <button type="button" className="btn-chunky btn-green press game-text px-10 py-2 text-[28px]" onClick={submit}>
          REDEEM
        </button>
        <div className="ink-text text-[15px] opacity-70">Psst… try RELEASE</div>
      </div>
    </Modal>
  )
}

function Toggle({ label, value, onChange }) {
  return (
    <button
      type="button"
      className="card press w-full flex-row justify-between px-5"
      onClick={() => {
        sound.click()
        onChange(!value)
      }}
    >
      <span className="ink-text text-[22px] font-bold">{label}</span>
      <span className={`chip text-white ${value ? 'bg-[#2fbf4a]' : 'bg-[#9aa3b2]'}`}>{value ? 'ON' : 'OFF'}</span>
    </button>
  )
}

export function SettingsPanel() {
  const settings = useGameStore((s) => s.settings)
  const set = (key) => (value) => {
    gameState().setSetting(key, value)
    if (key === 'music') sound.setMusic(value)
    if (key === 'sfx') sound.setSfx(value)
  }
  return (
    <Modal title="Settings" icon="⚙️" color="#6b7a94" width="min(560px, 94vw)">
      <div className="flex flex-col gap-3">
        <Toggle label="🎵 Music" value={settings.music} onChange={set('music')} />
        <Toggle label="🔊 Sound effects" value={settings.sfx} onChange={set('sfx')} />
        <div className="card flex-row justify-between px-5">
          <span className="ink-text text-[22px] font-bold">🖥️ Graphics</span>
          <div className="flex gap-2">
            {['low', 'medium', 'high'].map((q) => (
              <button
                key={q}
                type="button"
                className={`chip press ${settings.quality === q ? 'bg-[#2f8cff] text-white' : 'bg-white text-[#15151d]'}`}
                onClick={() => set('quality')(q)}
              >
                {q.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div className="card items-start px-5 text-left">
          <div className="ink-text text-[20px] font-bold">Controls</div>
          <div className="ink-text text-[16px]">
            WASD / arrows ride · SPACE jump (tap again in the air, or hold to climb) · drag to look around · scroll to zoom · Enter to chat ·
            the letter on each button opens it
          </div>
        </div>
      </div>
    </Modal>
  )
}

export function PlayersPanel() {
  useNow(1000)
  const lobby = useGameStore((s) => s.lobby)
  const room = getRoom()
  const rows = []
  room?.state.players?.forEach((p, sid) => rows.push({ sid, p, me: sid === room.sessionId }))
  return (
    <Modal title={`Lobby ${lobby?.number ?? ''}`} icon="👥" color="#2fa0ff" width="min(640px, 94vw)">
      <div className="ink-text mb-3 text-center text-[17px]">
        {rows.length}/{lobby?.max ?? 8} riders · a new lobby opens automatically when this one is full
      </div>
      <div className="flex flex-col gap-2">
        {rows.map(({ sid, p, me }) => (
          <div key={sid} className={`card flex-row justify-between px-4 ${me ? 'is-equipped' : ''}`}>
            <span className="ink-text text-[21px] font-bold">{p.name}</span>
            <span className="ink-text text-[17px]">
              Lvl {p.level} · 🏆 {formatNumber(p.wins)} · ⚡ {formatNumber(p.totalSpeed)} · 🚩 {p.bestStage || 0}
            </span>
          </div>
        ))}
      </div>
    </Modal>
  )
}

export function WorldsPanel({ me }) {
  const current = useGameStore((s) => s.world)
  const go = (id) => {
    sound.click()
    localPlayer.requestWorld(id)
    gameState().closePanel()
  }
  return (
    <Modal title="Worlds" icon="🌍" color="#35c95a" width="min(720px, 94vw)">
      <Grid min={260}>
        {WORLDS.map((world) => {
          const open = worldUnlocked(world.id, me)
          const here = current === world.id
          const finishGid = world.gidOffset + world.stages.length + 1
          const progress = Math.max(0, Math.min(1, ((me.bestStage || 0) - world.gidOffset) / (world.stages.length + 1)))
          return (
            <div key={world.id} className={`card gap-2 px-5 ${here ? 'is-equipped' : ''}`}>
              <div className="text-[60px]">{world.id === 1 ? '🌎' : '🌌'}</div>
              <div className="title-text text-[40px]">{world.name}</div>
              <div className="ink-text text-[16px]">
                {world.stages.length} stages · up to +{formatNumber(world.finish.wins)} Wins
              </div>
              <div className="progress-mini">
                <div style={{ width: `${progress * 100}%` }} />
              </div>
              <div className="ink-text text-[15px]">{(me.bestStage || 0) >= finishGid ? 'Escaped! 🏆' : open ? 'In progress' : 'Escape World 1 + reach 10 rebirths'}</div>
              {here ? (
                <button type="button" className="btn-chunky btn-gray card-button game-text" disabled>
                  YOU ARE HERE
                </button>
              ) : open ? (
                <button type="button" className="btn-chunky btn-green press card-button game-text" onClick={() => go(world.id)}>
                  TELEPORT
                </button>
              ) : (
                <button type="button" className="btn-chunky btn-gray card-button game-text" disabled>
                  🔒 LOCKED
                </button>
              )}
            </div>
          )
        })}
      </Grid>
    </Modal>
  )
}

export function WelcomePanel() {
  return (
    <Modal title="Welcome!" icon="🚲" color="#ff9a1f" width="min(680px, 94vw)">
      <div className="flex flex-col gap-2 text-left">
        {[
          ['⚡', 'Gain +1 Speed every time you move. Speed fills your level bar.'],
          ['⏫', 'Every level = +1 jump and faster bike. Tap SPACE in the air to double jump, or hold it to climb.'],
          ['🌉', 'Stages are separated by gaps — the further you go, the bigger the gap. More jumps and a faster bike = longer jumps.'],
          ['🏆', 'Step on a yellow Return pad to bank Wins and ride home.'],
          ['🔴', 'Fall into a gap or touch a laser and you are back in the lobby!'],
          ['🔄', 'Rebirth for a permanent +50% Speed XP. Buy bikes, items, trails and auras to go faster.'],
        ].map(([icon, text]) => (
          <div key={text} className="card flex-row gap-3 px-4 text-left">
            <span className="text-[34px]">{icon}</span>
            <span className="ink-text text-[18px]">{text}</span>
          </div>
        ))}
        <button type="button" className="btn-chunky btn-green press game-text mt-2 py-2 text-[32px]" onClick={() => gameState().closePanel()}>
          LET&apos;S RIDE!
        </button>
      </div>
    </Modal>
  )
}

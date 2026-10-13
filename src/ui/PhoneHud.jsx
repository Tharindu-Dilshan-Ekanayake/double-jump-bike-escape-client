import { useState } from 'react'

import { sound } from '../audio/sound'
import { PRODUCTS, formatNumber, friendBonus, rebirthBonus, rebirthSpeedFor, xpForLevel } from '../shared/gameData.js'
import { gameState, useGameStore } from '../store/gameStore'
import { buy2xSpeed, open, petsAlert, toggleMusic } from './hudActions'
import { GiftChip, JumpCounter, NextBikeBar, ProgressTrack, SpinTile, Tile, WorldTwoBar } from './hudParts'
import { RebirthIcon, TrophyIcon } from './icons'
import { claimableDailyQuests, claimableQuests } from './panels/questStatus'
import { LEFT_W, RIGHT_W } from './phoneLayout'

/*
 * The phone HUD: a compact layout of its own (like other Bloxity games) rather
 * than the full HUD shrunk down. A few buttons on each side keep the middle of
 * the screen for the game; everything else is in the ☰ menu. Positions come
 * from phoneLayout.js in CSS px; each block is drawn at "design" size and
 * zoomed by --m (.m-zoom).
 */

/** Wins, with a + for the Wins Shop. */
function WinsPill({ me }) {
  return (
    <button type="button" className="m-wins game-text press" onClick={open('winsShop')}>
      <TrophyIcon />
      <span>{formatNumber(me.wins)}</span>
      <span className="m-plus">+</span>
    </button>
  )
}

/** Left edge: Wins and the four buttons used most. */
function LeftColumn({ me, at }) {
  const canRebirth = me.totalSpeed >= rebirthSpeedFor(me.rebirths)
  const quests = claimableQuests(me) + claimableDailyQuests(me)
  return (
    <div className="pointer-events-auto fixed" style={{ top: at.top, left: at.left }}>
      <div className="m-zoom flex flex-col items-start gap-[6px]" style={{ width: LEFT_W }}>
        <WinsPill me={me} />
        <div className="m-grid">
          <Tile kind="quests" emoji="📜" label="QUESTS" alert={quests || false} onClick={open('quests')} />
          <Tile kind="rebirth" emoji={<RebirthIcon width="34" height="34" />} label="Rebirth" alert={canRebirth} onClick={open('rebirth')} />
          <Tile kind="pets" emoji="🐾" label="PETS" alert={petsAlert(me)} onClick={open('pets')} />
          <SpinTile me={me} />
        </div>
      </div>
    </div>
  )
}

/** Everything else, in a small sheet under the ☰ button. */
function MenuSheet({ onClose }) {
  const music = useGameStore((s) => s.settings.music)
  const pick = (fn) => () => {
    onClose()
    fn()
  }
  const show = (id, props) => pick(() => gameState().openPanel(id, props))
  return (
    <>
      <div className="pointer-events-auto fixed inset-0" onPointerDown={onClose} />
      <div className="m-menu">
        <Tile kind="trails" emoji="☄️" label="TRAILS" onClick={show('items', { tab: 'trails' })} />
        <Tile kind="auras" emoji="🔮" label="AURAS" onClick={show('items', { tab: 'auras' })} />
        <Tile kind="inventory" emoji="🎒" label="INVENTORY" onClick={show('inventory')} />
        <Tile kind="bikespeed" emoji="✏️" label="UPGRADE" onClick={show('bikeSpeed')} />
        <Tile kind="worlds" emoji="🌍" label="WORLDS" onClick={show('worlds')} />
        <Tile kind="settings" emoji="⚙️" label="SETTINGS" onClick={show('settings')} />
        <Tile kind="music" emoji={music ? '🎵' : '🔇'} label="MUSIC" onClick={pick(toggleMusic)} />
      </div>
    </>
  )
}

/** Right edge, under the profile: 2X Speed and the menu, the gift timer and the next bike. */
function RightColumn({ me, at }) {
  const [menu, setMenu] = useState(false)
  const toggleMenu = () => {
    sound.click()
    setMenu((v) => !v)
  }
  return (
    <div className="pointer-events-auto fixed" style={{ top: at.top, right: at.right }}>
      <div className="m-zoom relative flex flex-col items-end gap-[6px]" style={{ width: RIGHT_W }}>
        <div className="flex w-full items-center gap-[6px]">
          <button type="button" className="m-2x btn-chunky btn-shine btn-rainbow press" onClick={() => buy2xSpeed(me)}>
            <span className="title-text text-[15px] leading-none">2X SPEED</span>
            <span className="game-text text-[9px] leading-none">{me.pass2xSpeed ? 'ACTIVE ✓' : `🏆 ${formatNumber(PRODUCTS.pass2xSpeed.price)}`}</span>
          </button>
          <button type="button" className={`m-menu-btn round-icon round-blue press ${menu ? 'is-open' : ''}`} aria-label="Menu" onClick={toggleMenu}>
            <span>{menu ? '✕' : '☰'}</span>
          </button>
        </div>
        <GiftChip me={me} />
        <NextBikeBar me={me} />
        <WorldTwoBar me={me} />
        {menu && <MenuSheet onClose={() => setMenu(false)} />}
      </div>
    </div>
  )
}

/** Between the joystick and the jump button: jumps, Total Speed, bonuses, level, speed packs. */
function BottomBar({ me, phone }) {
  const jump = useGameStore((s) => s.jump)
  const players = useGameStore((s) => s.playerCount)
  const { bottom: at, m } = phone
  const need = xpForLevel(me.level)
  const fill = Math.max(0, Math.min(1, me.xp / need))
  return (
    <div className="pointer-events-none fixed" style={{ left: at.left, bottom: at.bottom }}>
      <div className="m-zoom relative flex flex-col" style={{ width: at.width / m }}>
        <div className="m-jump">
          <JumpCounter jump={jump} />
        </div>
        <div className="flex items-end justify-between gap-2 whitespace-nowrap">
          <span className="game-text text-[10px] leading-tight text-[#4dff6a]">Friends +{Math.round(friendBonus(players - 1) * 100)}%</span>
          <span className="game-text text-[17px] leading-none">
            Total Speed:{' '}
            <span key={formatNumber(me.totalSpeed)} className="stat-bump">
              {formatNumber(me.totalSpeed)}
            </span>
          </span>
          <span className="game-text text-[10px] leading-tight text-[#d27bff]">Rebirth +{formatNumber(rebirthBonus(me.rebirths) * 100)}%</span>
        </div>
        <div className="mt-[3px] flex items-center gap-[5px]">
          <div className="level-bar">
            <div className="level-fill" style={{ width: `${fill * 100}%` }} />
            <div className="level-text game-text">
              <span>Lvl {me.level}</span>
              <span>
                {formatNumber(Math.floor(me.xp))}/{formatNumber(Math.ceil(need))}
              </span>
            </div>
          </div>
          <button type="button" className="m-plus-btn btn-chunky btn-green press game-text pointer-events-auto" aria-label="Speed packs" onClick={open('shop')}>
            +⚡
          </button>
        </div>
      </div>
    </div>
  )
}

/** Stage progress while on the course, clear of the host menu and the profile. */
function PhoneProgress({ phone }) {
  const { progress: at, m, w } = phone
  const zoom = m * 0.5
  return (
    <div className="pointer-events-none fixed" style={{ top: at.top, left: at.left }}>
      <div style={{ zoom, width: (w - at.left - at.right) / zoom }}>
        <ProgressTrack />
      </div>
    </div>
  )
}

export function PhoneHud({ me, phone, onCourse }) {
  return (
    <div className="m-hud">
      {onCourse && <PhoneProgress phone={phone} />}
      <LeftColumn me={me} at={phone.left} />
      <RightColumn me={me} at={phone.right} />
      <BottomBar me={me} phone={phone} />
    </div>
  )
}

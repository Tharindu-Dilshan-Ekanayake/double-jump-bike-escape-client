import { useState } from 'react'

import { sound } from '../../audio/sound'
import { send } from '../../net/connection'
import {
  ITEM_BY_ID,
  RARITY_COLORS,
  RESTOCK_WINS,
  formatDuration,
  itemBonus,
  nextRestockAt,
  parseList,
  shopCycle,
  shopOffer,
} from '../../shared/gameData.js'
import { gameState } from '../../store/gameStore'
import { useNow } from '../useNow'
import { action } from './actions'
import { Grid, Modal, Price } from './Modal'

function parseShop(text) {
  try {
    return JSON.parse(text || '{}') || {}
  } catch {
    return {}
  }
}

/** The player's view of the current restock (mirrors `currentShop` on the server). */
function readShop(me, now) {
  const shop = parseShop(me.shop)
  const cycle = shopCycle(now)
  if (shop.cycle !== cycle) return { cycle, rerolls: 0, bought: {} }
  return { cycle, rerolls: shop.rerolls || 0, bought: shop.bought || {} }
}

/** Walk-in Item Shop: four items per restock, each a permanent speed boost. */
export function ItemShopPanel({ me }) {
  const now = useNow(1000)
  const shop = readShop(me, now)
  const offer = shopOffer(shop.cycle, shop.rerolls)
  const owned = parseList(me.items)

  return (
    <Modal title="ITEM SHOP" icon="🛒" color="#a14dff">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="game-text text-[26px]">
          Restock in <span className="text-[#ffe27a]">{formatDuration(nextRestockAt(now) - now)}</span>
        </div>
        <button type="button" className="btn-chunky btn-purple press game-text flex items-center gap-2 px-4 py-1 text-[22px]" onClick={action('buy', { cat: 'restock' })}>
          🔄 Restock · <Price currency="wins" value={RESTOCK_WINS} />
        </button>
      </div>
      <Grid min={190}>
        {offer.map((id) => {
          const item = ITEM_BY_ID[id]
          const left = item.stock - (shop.bought[id] || 0)
          const soldOut = left <= 0
          const affordable = me.wins >= item.price
          return (
            <div key={id} className={`card ${soldOut ? 'opacity-60' : ''}`}>
              <div className="chip text-white" style={{ background: RARITY_COLORS[item.rarity] }}>
                {item.rarity.toUpperCase()}
              </div>
              <div className="ink-text absolute right-3 top-3 text-[16px] font-bold">
                {Math.max(left, 0)}/{item.stock}
              </div>
              <div className="text-[64px] leading-none">{item.icon}</div>
              <div className="ink-text text-[22px] font-bold">{item.name}</div>
              <div className="chip bg-[#e6ffe9] text-[#1d7a2f]">+{Math.round(item.bonus * 100)}% Speed</div>
              {soldOut ? (
                <button type="button" className="btn-chunky btn-gray card-button game-text" disabled>
                  SOLD OUT
                </button>
              ) : (
                <button
                  type="button"
                  className={`btn-chunky ${affordable ? 'btn-green' : 'btn-red'} press card-button game-text`}
                  onClick={action('buy', { cat: 'item', id })}
                >
                  <Price currency="wins" value={item.price} />
                </button>
              )}
            </div>
          )
        })}
      </Grid>
      <div className="card mt-4 flex-row justify-between px-5 text-left">
        <span className="ink-text text-[19px] font-bold">Your items: {owned.length}</span>
        <span className="chip bg-[#e6ffe9] text-[#1d7a2f]">+{Math.round(itemBonus(me.items) * 100)}% Speed total</span>
      </div>
    </Modal>
  )
}

/** The mailbox: send a suggestion to the developers. */
export function FeedbackPanel() {
  const [text, setText] = useState('')
  const submit = () => {
    const message = text.trim()
    if (message.length < 3) {
      gameState().toast('Write a little more first!', 'error')
      return
    }
    sound.click()
    send('feedback', { text: message })
    setText('')
    gameState().closePanel()
  }
  return (
    <Modal title="Feedback" icon="💌" color="#2f6bff" width="min(600px, 94vw)">
      <div className="card gap-3 px-5">
        <div className="ink-text text-[19px]">Found a bug or have an idea? Tell us!</div>
        <textarea
          value={text}
          maxLength={1000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder="New bikes, new stages, anything…"
          rows={5}
          className="ink-text w-full resize-none rounded-xl border-4 border-[#15151d] bg-[#f4f6fb] px-4 py-2 text-[18px] outline-none"
        />
        <div className="flex w-full items-center justify-between">
          <span className="ink-text text-[14px] opacity-60">{text.length}/1000</span>
          <button type="button" className="btn-chunky btn-green press game-text px-8 py-1 text-[24px]" onClick={submit}>
            SEND
          </button>
        </div>
      </div>
    </Modal>
  )
}

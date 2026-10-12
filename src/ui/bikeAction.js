import { sound } from '../audio/sound'
import { send } from '../net/connection'
import { BIKE_BY_ID, bikeAvailable, formatNumber, parseList } from '../shared/gameData.js'
import { gameState } from '../store/gameStore'

export const ownsBike = (me, id) => parseList(me.owned).includes(`bike:${id}`)

/** What pressing E on a bike stand does: 'locked' | 'riding' | 'equip' | 'buy' | 'poor'. */
export function bikeStatus(me, id) {
  const def = BIKE_BY_ID[id]
  if (!bikeAvailable(def, me)) return 'locked'
  if (me.bike === id) return 'riding'
  if (ownsBike(me, id)) return 'equip'
  return me.wins >= def.price ? 'buy' : 'poor'
}

/** Buys (if needed) and equips the bike on the stand. */
export function rideBike(me, id) {
  const def = BIKE_BY_ID[id]
  if (!def || !me) return
  const status = bikeStatus(me, id)
  if (status === 'locked') {
    sound.error()
    gameState().toast('Unlock World 2 first: escape World 1 and reach 10 rebirths!', 'error')
  } else if (status === 'riding') {
    gameState().toast(`You're already riding the ${def.name}!`, 'info', 1600)
  } else if (status === 'poor') {
    sound.error()
    gameState().toast(`Need 🏆 ${formatNumber(def.price - me.wins)} more Wins`, 'error')
  } else {
    sound.click()
    send(status === 'equip' ? 'equip' : 'buy', { cat: 'bike', id })
  }
}

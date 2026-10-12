import { formatNumber } from '../shared/gameData.js'

/**
 * Fire-and-forget DOM effects: the "+1" speed popups, reward pops and screen
 * flashes. They live outside React because they fire several times a second and
 * never need re-rendering — each element animates via CSS and removes itself.
 */

let layer = null
let liveGainPops = 0

function getLayer() {
  if (!layer) {
    layer = document.createElement('div')
    layer.className = 'fx-layer'
    document.body.appendChild(layer)
  }
  return layer
}

/** Little yellow rider on a green bike, like the popups in the original. */
export const RIDER_ICON = `
<svg viewBox="0 0 48 40" width="1em" height="0.84em" aria-hidden="true">
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="11" cy="30" r="7.5" fill="#bdf2bd" stroke="#1b1b22" stroke-width="3.2"/>
    <circle cx="37" cy="30" r="7.5" fill="#bdf2bd" stroke="#1b1b22" stroke-width="3.2"/>
    <path d="M11 30 L20 19 L31 19 L37 30 M20 19 L25 30 L31 19 M29 14 L33 14" stroke="#1b1b22" stroke-width="6.5"/>
    <path d="M11 30 L20 19 L31 19 L37 30 M20 19 L25 30 L31 19 M29 14 L33 14" stroke="#3fbf4a" stroke-width="3"/>
  </g>
  <circle cx="24" cy="10" r="7.5" fill="#ffd23a" stroke="#1b1b22" stroke-width="2.6"/>
  <circle cx="21.5" cy="9" r="1.3" fill="#1b1b22"/>
  <circle cx="26.5" cy="9" r="1.3" fill="#1b1b22"/>
  <path d="M21 12.5 Q24 15 27 12.5" fill="none" stroke="#1b1b22" stroke-width="1.6" stroke-linecap="round"/>
</svg>`

export function spawnGainPopup(amount, boosted = false) {
  if (liveGainPops > 14) return
  liveGainPops += 1
  const el = document.createElement('div')
  el.className = `gain-pop game-text${boosted ? ' boosted' : ''}`
  el.innerHTML = `${RIDER_ICON}<span>+${formatNumber(amount)}</span>`
  el.style.left = `${8 + Math.random() * 80}%`
  el.style.top = `${10 + Math.random() * 62}%`
  getLayer().appendChild(el)
  el.addEventListener('animationend', () => {
    el.remove()
    liveGainPops -= 1
  })
}

/** Big centred pop for wins / purchases. `kind`: 'wins' | 'reward'. */
export function spawnRewardPopup(text, kind = 'reward') {
  const el = document.createElement('div')
  el.className = `reward-pop title-text reward-${kind}`
  const icon = kind === 'wins' ? '🏆' : ''
  el.textContent = `${text}${icon ? ` ${icon}` : ''}`
  getLayer().appendChild(el)
  el.addEventListener('animationend', () => el.remove())
}

let lastTrickPop = null

/** Big tilted trick name ("BACKFLIP!") above the rider; replaces the previous one. */
let combo = 0
let lastTrickAt = 0

/** Stunt label for a trick ({ name, colors }); chained tricks show a combo count. */
export function spawnTrickPopup(trick) {
  lastTrickPop?.remove()
  const now = performance.now()
  combo = now - lastTrickAt < 1500 ? combo + 1 : 1
  lastTrickAt = now
  const [c1, c2] = trick.colors || ['#ffe23a', '#ff8a1f']
  const el = document.createElement('div')
  el.className = 'trick-pop'
  el.style.setProperty('--tilt', `${(Math.random() - 0.5) * 12}deg`)
  el.style.setProperty('--c1', c1)
  el.style.setProperty('--c2', c2)
  const burst = document.createElement('span')
  burst.className = 'trick-burst'
  const name = document.createElement('span')
  name.className = 'trick-name'
  name.textContent = trick.name
  name.dataset.text = trick.name
  el.append(burst, name)
  if (combo > 1) {
    const tag = document.createElement('span')
    tag.className = 'trick-combo'
    tag.textContent = `COMBO x${combo}`
    el.append(tag)
  }
  getLayer().appendChild(el)
  lastTrickPop = el
  el.addEventListener('animationend', () => {
    el.remove()
    if (lastTrickPop === el) lastTrickPop = null
  })
}

export function flashScreen(kind = 'death') {
  const el = document.createElement('div')
  el.className = `screen-flash flash-${kind}`
  getLayer().appendChild(el)
  el.addEventListener('animationend', () => el.remove())
}

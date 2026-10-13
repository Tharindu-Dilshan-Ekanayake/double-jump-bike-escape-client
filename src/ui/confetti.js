/**
 * Confetti: two cannons fire tumbling paper from the bottom corners of the
 * screen (the Wins pad fanfare). One 2D canvas over the game, created on first
 * use; it only animates while confetti is in the air.
 */

const COLORS = ['#ff3b5c', '#ffd23a', '#3bd16b', '#3ba8ff', '#b45cff', '#ff8a1f', '#ffffff', '#ff6ef7']
const GRAVITY = 1500
const MAX = 400

let canvas = null
let g = null
let raf = 0
let last = 0
const pieces = []

function setup() {
  if (canvas) return
  canvas = document.createElement('canvas')
  canvas.className = 'confetti-layer'
  document.body.appendChild(canvas)
  g = canvas.getContext('2d')
  const resize = () => {
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
  }
  resize()
  window.addEventListener('resize', resize)
}

/** Fires both cannons; `amount` scales the number of pieces (1 = a normal pad). */
export function confetti(amount = 1) {
  setup()
  const w = canvas.width
  const h = canvas.height
  const scale = Math.max(0.6, Math.min(1.4, h / 900))
  const perSide = Math.round(Math.min(MAX / 2, 100 * amount))
  for (const side of [-1, 1]) {
    for (let i = 0; i < perSide && pieces.length < MAX; i += 1) {
      const speed = (1300 + Math.random() * 900) * scale
      // Up and in towards the middle, fanned out.
      const angle = -Math.PI / 2 + side * -(0.25 + Math.random() * 0.45)
      pieces.push({
        x: side < 0 ? w * 0.04 : w * 0.96,
        y: h + 10,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        w: (14 + Math.random() * 14) * scale,
        h: (7 + Math.random() * 7) * scale,
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 14,
        flip: Math.random() * Math.PI,
        flipSpeed: 6 + Math.random() * 10,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        age: 0,
        delay: Math.random() * 0.18,
      })
    }
  }
  if (!raf) {
    last = performance.now()
    raf = requestAnimationFrame(frame)
  }
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  g.clearRect(0, 0, canvas.width, canvas.height)
  for (let i = pieces.length - 1; i >= 0; i -= 1) {
    const p = pieces[i]
    p.age += dt
    if (p.age < p.delay) continue
    // Air drag makes the paper float down once the burst slows.
    const drag = Math.exp(-dt * 1.6)
    p.vx *= drag
    p.vy = p.vy * drag + GRAVITY * dt * 0.55
    p.x += p.vx * dt + Math.sin(p.age * 3 + p.flip) * 30 * dt
    p.y += p.vy * dt
    p.rot += p.spin * dt
    p.flip += p.flipSpeed * dt
    if (p.y > canvas.height + 40 || p.age > 5) {
      pieces.splice(i, 1)
      continue
    }
    g.save()
    g.translate(p.x, p.y)
    g.rotate(p.rot)
    // Tumbling: the paper's width shrinks and grows as it turns over.
    g.scale(Math.cos(p.flip), 1)
    g.fillStyle = p.color
    g.globalAlpha = Math.min(1, 5 - p.age)
    g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
    g.restore()
  }
  if (pieces.length) raf = requestAnimationFrame(frame)
  else {
    raf = 0
    g.clearRect(0, 0, canvas.width, canvas.height)
  }
}

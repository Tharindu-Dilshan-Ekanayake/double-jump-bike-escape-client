/**
 * Phone HUD geometry, in CSS px (see PhoneHud.jsx).
 *
 * Phones get their own compact layout instead of the full HUD shrunk down:
 * a few buttons on each side so the middle of the screen stays clear, sized by
 * `m` (1 = a phone whose short side is 390px), a joystick and jump button that
 * fit the screen, and nothing under the Bloxity host page's menu bar in the
 * top-left corner. Phones play in landscape (RotatePrompt asks to turn one
 * held upright); the portrait numbers are only a fallback.
 */

/** The host page's menu bar (logo, menu, chat, sound…) covers this much of the top left. */
export const HOST_BAR = { width: 262, height: 56 }
/** Design size (before scaling by `m`) of the left buttons: Wins over a 2x2 grid. */
export const LEFT_W = 114
const LEFT_H = 164
/** Design width of the right column. */
export const RIGHT_W = 176

const PAD = 8
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

/** Touch screens whose short side is phone-sized. */
export const isPhoneScreen = (w, h) => Boolean(window.matchMedia?.('(pointer: coarse)').matches) && Math.min(w, h) < 600

/**
 * Windows on a phone fill most of the screen: `ui` is their zoom (the window
 * is laid out about 560 design px wide in portrait, 860 in landscape) and
 * `panel` their size in design px. Sized in px rather than vw/vh, which
 * browsers zoom differently.
 */
function windowSize(w, h, portrait) {
  const ui = clamp((w * 0.94) / (portrait ? 560 : 860), 0.5, 1)
  return { ui, panel: { width: (w * 0.94) / ui, height: (h * (portrait ? 0.84 : 0.92)) / ui } }
}

/** Where everything goes on a `w` x `h` phone screen. */
export function phoneLayout(w, h) {
  const m = clamp(Math.min(w, h) / 390, 0.72, 1.25)
  if (h > w) {
    const joy = clamp(120 * m, 96, 140)
    const jump = clamp(96 * m, 78, 116)
    const top = HOST_BAR.height + 40
    return {
      w,
      h,
      m,
      portrait: true,
      ...windowSize(w, h, true),
      progress: { top: HOST_BAR.height, left: 10, right: 10 },
      left: { top, left: PAD },
      right: { top, right: PAD },
      joy: { size: joy, left: 18, bottom: 18 },
      jump: { size: jump, right: 18, bottom: 18 + (joy - jump) / 2 },
      bottom: { left: 10, width: w - 20, bottom: 18 + joy + 12 },
    }
  }
  // Landscape: joystick bottom left (beside the buttons if they reach that low),
  // jump bottom right, and the level bar centred between them.
  const joy = clamp(116 * m, 96, 130)
  const jump = clamp(92 * m, 78, 110)
  const buttonsBottom = HOST_BAR.height + LEFT_H * m
  const joyLeft = buttonsBottom + 10 > h - 12 - joy ? PAD + LEFT_W * m + 14 : 16
  const from = joyLeft + joy + 12
  const to = w - (14 + jump + 12)
  const barW = Math.min(to - from, 470 * m)
  return {
    w,
    h,
    m,
    portrait: false,
    ...windowSize(w, h, false),
    progress: { top: 6, left: HOST_BAR.width, right: 100 },
    left: { top: HOST_BAR.height, left: PAD },
    right: { top: 42, right: PAD },
    joy: { size: joy, left: joyLeft, bottom: 12 },
    jump: { size: jump, right: 14, bottom: 14 },
    bottom: { left: from + (to - from - barW) / 2, width: barW, bottom: 8 },
  }
}

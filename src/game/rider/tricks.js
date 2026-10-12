/**
 * Mid-air tricks. Every mid-air jump plays the next one in this list, picked
 * from the rider's jump counter (`flips`, synced through the room state), so
 * every player in the lobby sees the same trick.
 *
 * `spin` is how the whole rider rotates (x = flip, y = 360, z = barrel roll),
 * `whip` spins only the bike, and `pose` names a body pose in riderPose.js.
 */
export const TRICKS = [
  { id: 'frontflip', name: 'FRONT FLIP!', spin: [1, 0, 0], colors: ['#ffe23a', '#ff8a1f'] },
  { id: 'barrel', name: 'BARREL ROLL!', spin: [0, 0, 1], colors: ['#7ff3ff', '#2f8cff'] },
  { id: 'superman', name: 'SUPERMAN!', pose: 'superman', spin: [0.15, 0, 0], once: true, colors: ['#ff8a8a', '#e8243c'] },
  { id: 'backflip', name: 'BACKFLIP!', spin: [-1, 0, 0], colors: ['#e2b5ff', '#9b3bff'] },
  { id: 'spin', name: '360 SPIN!', spin: [0, 1, 0], colors: ['#b6ff7a', '#2fbf4a'] },
  { id: 'nohander', name: 'NO HANDER!', pose: 'nohander', spin: [0, 0, 0], colors: ['#ffc4e4', '#ff4fa8'] },
  { id: 'tailwhip', name: 'TAILWHIP!', pose: 'tailwhip', spin: [0, 0, 0], whip: true, colors: ['#fff3a0', '#ffb21f'] },
  { id: 'cancan', name: 'CAN CAN!', pose: 'cancan', spin: [0, 0, 0.12], once: true, colors: ['#9fe8ff', '#7a5cff'] },
]

/** Seconds a trick takes in the air (they finish faster once you land). */
export const TRICK_DURATION = 0.45

/** The trick for a jump counter value (the value right after that jump). */
export const trickFor = (flips) => TRICKS[(((flips - 1) % TRICKS.length) + TRICKS.length) % TRICKS.length]

export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

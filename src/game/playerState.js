import { Vector3 } from 'three'

import { getLayout, spawnFor } from '../shared/layout.js'

const firstSpawn = spawnFor(getLayout(), 1)

/**
 * The local rider's per-frame state.
 *
 * Plain mutable data rather than React state: the controller writes it every
 * frame and the camera, network sender and HUD read it without re-rendering.
 */
export const localPlayer = {
  position: new Vector3(firstSpawn.x, firstSpawn.y, firstSpawn.z),
  velocity: new Vector3(),
  yaw: firstSpawn.yaw,
  /** 1 or 2 — which world the rider is in. */
  world: 1,
  grounded: true,
  jumpsLeft: 1,
  /** Counts mid-air jumps; sent to the server so other screens play the flip. */
  flips: 0,
  /** performance.now() of the last teleport, so the camera snaps instead of swooping. */
  teleportedAt: 0,
  /** Set by UI buttons; the controller acts on them next frame. */
  wantsTeleport: false,
  wantsWorld: 0,
  /** Visual motion read by the Rider component (same shape as remote riders). */
  motion: {
    position: new Vector3(firstSpawn.x, firstSpawn.y, firstSpawn.z),
    yaw: firstSpawn.yaw,
    speed: 0,
    air: false,
    flips: 0,
    jumpAt: 0,
    landAt: 0,
  },

  /** Send the rider back to the current world's lobby. */
  requestTeleport() {
    this.wantsTeleport = true
  },

  /** Travel to another world's lobby (checked by the caller). */
  requestWorld(worldId) {
    this.wantsWorld = worldId
  },

  respawn(worldId = this.world) {
    const spawn = spawnFor(getLayout(), worldId)
    this.world = worldId
    this.position.set(spawn.x + (Math.random() - 0.5) * 6, spawn.y, spawn.z + (Math.random() - 0.5) * 3)
    this.velocity.set(0, 0, 0)
    this.yaw = spawn.yaw
    this.grounded = true
    this.teleportedAt = performance.now()
    this.motion.position.copy(this.position)
    this.motion.yaw = this.yaw
  },
}

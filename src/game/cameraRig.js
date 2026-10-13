/**
 * Camera orbit state, shared with the controller so W always means "away from
 * the camera". yaw 0 puts the camera on the rider's +Z side.
 */
export const cameraRig = {
  yaw: 0,
  pitch: 0.3,
  distance: 17,
  /** Camera shake amplitude in studs (landings set it; it dies away by itself). */
  shake: 0,
}

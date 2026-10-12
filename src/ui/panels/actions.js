import { sound } from '../../audio/sound'
import { send } from '../../net/connection'

/** Click handler that sends a server action with a click sound. */
export function action(type, payload) {
  return () => {
    sound.click()
    send(type, payload)
  }
}

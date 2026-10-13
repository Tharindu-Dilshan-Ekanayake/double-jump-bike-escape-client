import { useGameStore } from '../store/gameStore'

/** Phones play in landscape: held upright, this covers the game and asks to turn it. */
export function RotatePrompt() {
  const portrait = useGameStore((s) => Boolean(s.phone?.portrait))
  if (!portrait) return null
  return (
    <div className="rotate-prompt fixed inset-0 z-[100] grid place-items-center">
      <div className="flex flex-col items-center gap-6 px-8 text-center">
        <div className="rotate-phone">
          <span />
        </div>
        <div className="title-text text-[32px] leading-tight">Turn your phone sideways</div>
        <div className="game-text text-[17px] opacity-90">+1 Double Jump Bike Escape plays in landscape</div>
      </div>
    </div>
  )
}

export default RotatePrompt

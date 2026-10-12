/** Small hand-made SVG icons for the HUD and shop cards. */

export function TrophyIcon(props) {
  return (
    <svg viewBox="0 0 64 64" {...props}>
      <path d="M14 10h36v8c0 12-7 20-18 20S14 30 14 18z" fill="#ffc21a" stroke="#15151d" strokeWidth="4" strokeLinejoin="round" />
      <path d="M14 14H6c0 10 5 15 12 15M50 14h8c0 10-5 15-12 15" fill="none" stroke="#15151d" strokeWidth="4" />
      <path d="M14 14H6c0 10 5 15 12 15M50 14h8c0 10-5 15-12 15" fill="none" stroke="#ffc21a" strokeWidth="2" />
      <rect x="27" y="37" width="10" height="10" fill="#e8a010" stroke="#15151d" strokeWidth="4" />
      <rect x="18" y="46" width="28" height="9" rx="2" fill="#ffc21a" stroke="#15151d" strokeWidth="4" />
      <path d="M22 15c0 8 3 13 8 15" fill="none" stroke="#fff6c8" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function BikeIcon({ frame = '#2b2f3a', rim = '#f6d33c', accent = '#ffffff', size = 96 }) {
  return (
    <svg viewBox="0 0 120 80" width={size} height={(size * 80) / 120}>
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="27" cy="54" r="19" stroke="#15151d" strokeWidth="9" />
        <circle cx="93" cy="54" r="19" stroke="#15151d" strokeWidth="9" />
        <circle cx="27" cy="54" r="12" stroke={rim} strokeWidth="4" />
        <circle cx="93" cy="54" r="12" stroke={rim} strokeWidth="4" />
        <path d="M27 54 50 30h30l13 24M50 30l8 24 22-24M76 18h12M82 18l-2 12M46 22h10" stroke="#15151d" strokeWidth="10" />
        <path d="M27 54 50 30h30l13 24M50 30l8 24 22-24M76 18h12M82 18l-2 12M46 22h10" stroke={frame} strokeWidth="5" />
        <circle cx="58" cy="54" r="5" fill={accent} stroke="#15151d" strokeWidth="3" />
      </g>
    </svg>
  )
}

/** Wins are the only currency, so every price shows a trophy. */
export function CurrencyIcon() {
  return <TrophyIcon width="1.1em" height="1.1em" />
}

/**
 * Rewarded ads: the hook for "watch an ad to continue".
 *
 * Not wired up yet. When an ad provider (e.g. the Bloxity SDK) offers rewarded
 * ads, implement these two functions and set `continue.rewardedAds: true` in
 * config/balance.ts so the server accepts ad continues. Until then the button
 * stays hidden and the server refuses `via: 'ad'`.
 */

/** Whether a rewarded ad can be shown right now. */
export const rewardedAdAvailable = () => false

/** Shows a rewarded ad; resolves true only if it was watched to the end. */
export async function showRewardedAd() {
  return false
}

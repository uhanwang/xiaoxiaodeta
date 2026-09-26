export function autoStateForIdleTime(inactiveMs) {
  if (inactiveMs >= 60_000) return "sleep";
  if (inactiveMs >= 25_000) return "sit";
  return "idle";
}

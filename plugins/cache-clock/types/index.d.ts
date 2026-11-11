export type CacheClock = {
  /** When the cache was last read or written (ms, $.clock time). */
  lastAt: number
  /** Cache lifetime in ms. */
  ttlMs: number
  /** Tokens in the cached prefix at the last request. */
  cachedTokens: number
  /** The clock's last tick, so the band redraws as time passes. */
  now: number
  /** Keep-warm pings sent this session. */
  pings: number
  /** A ping is in flight. */
  isPinging: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'cache-clock': { clock: CacheClock | null }
  }
}

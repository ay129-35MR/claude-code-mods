# cache-clock

A Claude Code mod that shows how long the session's prompt cache stays warm, and keeps it warm on demand.

Every main-loop request reads or writes the prompt cache and restarts its lifetime: 5 minutes by
default on API keys, 1 hour on Claude subscriptions. cache-clock times that window and draws a
countdown above the prompt (`● cache warm 42:10 · ~150k tokens`), turning yellow near expiry and
red once cold.

`/keepwarm`, or the band's **Keep warm** button, sends one tool-less fork over the main thread's
last request. That is a cache read of the whole prefix (about a tenth of the normal input price),
which restarts the lifetime. Letting the cache expire instead means the next prompt re-writes the
prefix at 1.25× (5-minute cache) or 2× (1-hour cache) the input price.

- `/cache-clock status`, `/cache-clock auto on`, `/cache-clock auto off`
- Options (`userConfig`): `ttl` (`auto`, `5m`, `1h`), `auto_keepwarm` (default off), `max_auto_pings` (default 3).
  With auto keep-warm on, it pings once just before expiry while the session is idle, at most
  `max_auto_pings` times in a row before your next prompt.

An `enabled` setting (default on) turns the whole mod off or on; switchboard shows it as an ON/OFF switch.

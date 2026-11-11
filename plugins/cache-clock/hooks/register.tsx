import { atom, read, update } from 'claude-code'
import type { Register, EngineInterface } from 'claude-code'

import type { CacheClock } from '../types'

// cache-clock: the prompt cache keeps the conversation's prefix for a fixed time
// after each request reads or writes it (5 minutes by default on API keys, 1 hour
// on Claude subscriptions). This mod times that window from the main loop's
// requests, draws a countdown above the prompt, and refreshes the window on
// demand with one tool-less fork over the same prefix (/keepwarm or the button).

const clock = atom({ plugin: 'cache-clock', key: 'clock' } as const, null)

const HOUR = 60 * 60 * 1000
const FIVE_MIN = 5 * 60 * 1000
const PING_PROMPT =
  'Keep-alive ping from the cache-clock mod. You have no tools. Reply with the single word OK, straight away, without thinking it over.'

// Module state: reset when the mod reloads.
let ttlMs = HOUR
let isTurnRunning = false
let autoPingsLeft = 0
let maxAutoPings = 3
let isAuto = false

function fmtLeft(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

function fmtTokens(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n)
}

// One fork over the main thread's last request: a cache read of the whole
// prefix (about a tenth of the input price), which restarts the cache's lifetime.
async function keepWarm($: EngineInterface): Promise<string> {
  const before = await read($, clock)
  if (before === null) return 'Nothing is cached yet: no request has been sent this session.'
  if (before.isPinging) return 'A keep-warm ping is already running.'
  if (isTurnRunning) return 'A turn is running, which keeps the cache warm by itself.'

  await update($, clock, c => (c === null ? c : { ...c, isPinging: true }))
  const r = await $.model.fork({ prompt: PING_PROMPT })
  const now = await $.clock.now()

  if (!r.isAnswered && r.reason === 'nothing-to-fork') {
    await update($, clock, c => (c === null ? c : { ...c, isPinging: false }))
    return 'Nothing to keep warm: the conversation is empty (new session or after /clear).'
  }

  const hit = r.usage.cache_read_input_tokens
  const wrote = r.usage.cache_creation_input_tokens
  await update($, clock, c =>
    c === null
      ? c
      : {
          ...c,
          isPinging: false,
          lastAt: hit + wrote > 0 ? now : c.lastAt,
          cachedTokens: hit + wrote > 0 ? hit + wrote : c.cachedTokens,
          now,
          pings: c.pings + 1,
        },
  )

  if (!r.isAnswered && r.reason !== 'empty-reply') {
    return `Keep-warm ping failed (${r.reason}); the countdown is unchanged.`
  }
  if (hit === 0) {
    return `The cache had already gone cold: the ping re-wrote ~${fmtTokens(wrote)} tokens, so it is warm again for ${fmtLeft(ttlMs)}.`
  }
  return `Cache kept warm: read ~${fmtTokens(hit)} cached tokens; ${fmtLeft(ttlMs)} on the clock again.`
}

export const register: Register = (on, options) => {
  if (options.enabled === false) return // switched off (e.g. from switchboard)

  maxAutoPings =
    typeof options.max_auto_pings === 'number' && options.max_auto_pings >= 0
      ? Math.floor(options.max_auto_pings)
      : 3
  isAuto = options.auto_keepwarm === true
  autoPingsLeft = maxAutoPings

  on('session.start', async ($, e, next) => {
    const ttl = options.ttl
    if (ttl === '5m') ttlMs = FIVE_MIN
    else if (ttl === '1h') ttlMs = HOUR
    else ttlMs = (await $.env.get('ANTHROPIC_API_KEY')) ? FIVE_MIN : HOUR

    await $.command.register({ name: 'keepwarm', description: 'Refresh the prompt cache before it expires (cache-clock)' })
    await $.command.register({ name: 'cache-clock', description: 'cache-clock: status | auto on | auto off' })

    // Tick the band once a second; near expiry, ping by itself if asked to.
    $.clock.every(1000, () => {
      void (async () => {
        const now = await $.clock.now()
        const c = await read($, clock)
        if (c === null) return
        await update($, clock, v => (v === null ? v : { ...v, now }))
        const left = c.lastAt + c.ttlMs - now
        const margin = Math.min(60_000, c.ttlMs / 10)
        if (isAuto && !isTurnRunning && !c.isPinging && autoPingsLeft > 0 && left > 0 && left < margin) {
          autoPingsLeft -= 1
          const said = await keepWarm($)
          $.ui.toast(`cache-clock (auto, ${autoPingsLeft} left): ${said}`)
        }
      })()
    })

    return next(e)
  })

  on('command.run', { command: 'keepwarm' }, async $ => ({ text: await keepWarm($) }))

  on('command.run', { command: 'cache-clock' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'auto on') isAuto = true
    if (arg === 'auto off') isAuto = false
    const c = await read($, clock)
    const now = await $.clock.now()
    const state =
      c === null
        ? 'no request yet'
        : c.lastAt + c.ttlMs > now
          ? `warm, ${fmtLeft(c.lastAt + c.ttlMs - now)} left, ~${fmtTokens(c.cachedTokens)} tokens cached`
          : `cold since ${fmtLeft(now - c.lastAt - c.ttlMs)} ago`
    return {
      text:
        `cache-clock: ${state}. Lifetime ${ttlMs === HOUR ? '1 hour' : '5 minutes'}; ` +
        `auto keep-warm ${isAuto ? `on (${autoPingsLeft} of ${maxAutoPings} left)` : 'off'}; ` +
        `${c?.pings ?? 0} pings sent.`,
    }
  })

  on('prompt.submit', ($, e, next) => {
    autoPingsLeft = maxAutoPings // the person is back: a new idle stretch starts later
    return next(e)
  })

  on('turn.start', ($, e, next) => {
    if (e.agentId === undefined) isTurnRunning = true
    return next(e)
  })

  on('turn.complete', ($, e, next) => {
    if (e.agentId === undefined) isTurnRunning = false
    return next(e)
  })

  // Every main-loop request restarts the clock; its usage says how big the prefix is.
  on('turn.step', async function* ($, e, next) {
    const res = yield* next(e)
    if (e.agentId !== undefined || res.usage === null) return res

    const now = await $.clock.now()
    const prev = await read($, clock)
    const cached = res.usage.cache_read_input_tokens + res.usage.cache_creation_input_tokens
    if (cached > 0) {
      const wentCold =
        prev !== null && prev.cachedTokens > 10_000 && res.usage.cache_read_input_tokens < prev.cachedTokens / 10
      if (wentCold && prev.lastAt + prev.ttlMs < now) {
        $.ui.toast(`cache-clock: the cache had expired; this request re-wrote ~${fmtTokens(res.usage.cache_creation_input_tokens)} tokens.`)
      }
      const fresh: CacheClock = {
        lastAt: now,
        ttlMs,
        cachedTokens: cached,
        now,
        pings: prev?.pings ?? 0,
        isPinging: false,
      }
      await update($, clock, () => fresh)
    }
    return res
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const c = await read($, clock)
    if (c === null || e.props.hasSurvey) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const left = c.lastAt + c.ttlMs - c.now
    const isWarm = left > 0
    const isLow = isWarm && left < Math.max(60_000, c.ttlMs / 5)

    return (
      <Box>
        {isWarm ? (
          <Text color={isLow ? 'warning' : 'success'}>
            ● cache warm {fmtLeft(left)} · ~{fmtTokens(c.cachedTokens)} tokens{' '}
          </Text>
        ) : (
          <Text color="error">
            ○ cache cold · next prompt re-writes ~{fmtTokens(c.cachedTokens)} tokens{' '}
          </Text>
        )}
        <Button
          key="keepwarm"
          label={c.isPinging ? 'Pinging…' : isWarm ? 'Keep warm' : 'Re-warm'}
          onPress={async () => {
            $.ui.toast(await keepWarm($))
          }}
        />
      </Box>
    )
  })
}

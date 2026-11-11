import { expect, mock, test } from 'claude-code/testing'

type T$ = Parameters<Parameters<typeof test>[1]>[0]
type TOn = Parameters<Parameters<typeof test>[1]>[1]

const BAND = {
  plugin: 'cache-clock',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 3, bodyColumns: 80 },
} as const

const usage = (read: number, wrote: number) => ({
  input_tokens: 10, output_tokens: 5, cache_read_input_tokens: read, cache_creation_input_tokens: wrote, model: 'claude-opus-5-5',
})

const world = (on: TOn, forkRead = 150_000) => {
  const clock = mock.clock(on)
  const toasts: string[] = []
  let forks = 0
  on('ui.toast', (_, e) => { toasts.push(String((e as { text: string }).text)); return { value: undefined } as never })
  on('command.register', () => ({ value: { command: 'x' } }) as never)
  on('env.get', () => ({ value: undefined }) as never) // no API key: 1-hour lifetime
  on('session.start', (_, e) => ({ cwd: e.cwd }) as never)
  on('model.fork', () => {
    forks += 1
    return { value: { isAnswered: true, text: 'OK', usage: { input_tokens: 5, output_tokens: 1, cache_read_input_tokens: forkRead, cache_creation_input_tokens: 0 } } } as never
  })
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: usage(0, 150_000), id: 'm' } as never
  })
  return { clock, toasts, forks: () => forks }
}

const step = async ($: T$) => {
  const s = $.turn.step({ turnId: 't', index: 0, model: 'claude-opus-5-5', messageCount: 1 })
  for await (const _ of s) { /* drain */ }
}

test('a request starts the countdown, and the band shows it', async ($, on) => {
  const w = world(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true } as never)
  await step($)
  await w.clock.advance(10 * 60 * 1000)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface } as never)
    const text = await ui.find({ type: 'Text', text: /cache warm/ })
    expect(text?.text).toContain('50:00')
    expect(text?.text).toContain('150k')
    await ui.unmount()
  }
})

test('/keepwarm forks over the cache and restarts the clock', async ($, on) => {
  const w = world(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true } as never)
  await step($)
  await w.clock.advance(55 * 60 * 1000)

  const r = await $.command.run({ command: 'keepwarm' } as never)
  expect(w.forks()).toBe(1)
  expect(JSON.stringify(r)).toContain('kept warm')

  await w.clock.advance(1000)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' } as never)
  expect((await ui.find({ type: 'Text', text: /cache warm/ }))?.text).toContain('59:59')
  await ui.unmount()
})

test('the band says cold once the hour has passed', async ($, on) => {
  const w = world(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true } as never)
  await step($)
  await w.clock.advance(61 * 60 * 1000)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' } as never)
  expect((await ui.find({ type: 'Text', text: /cache cold/ }))?.text).toContain('150k')
  await ui.unmount()
})

test('auto keep-warm pings once just before expiry', { options: { auto_keepwarm: true } }, async ($, on) => {
  const w = world(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true } as never)
  await step($)
  await w.clock.advance(59 * 60 * 1000 + 30_000)
  expect(w.forks()).toBe(1)
})

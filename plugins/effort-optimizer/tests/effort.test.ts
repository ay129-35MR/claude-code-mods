import { expect, mock, test } from 'claude-code/testing'

const USAGE = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

const world = (on: Parameters<Parameters<typeof test>[1]>[1], reply: string, seen: string[]) => {
  const clock = mock.clock(on)
  on('prompt.submit', (_, e) => ({ text: e.text }) as never)
  on('ui.status', () => ({ value: undefined }) as never)
  on('ui.toast', () => ({ value: undefined }) as never)
  on('model.complete', () => ({ value: { isAnswered: true, text: reply, usage: USAGE } }))
  on('turn.step', async function* (_, e) {
    seen.push(String(e.effort))
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null, id: 'm1' } as never
  })
  return clock
}

const step = async ($: Parameters<Parameters<typeof test>[1]>[0], index: number) => {
  const s = $.turn.step({ turnId: 't1', index, model: 'claude-opus-5-5', effort: 'medium', messageCount: 1 })
  for await (const _ of s) { /* drain */ }
  return s.result
}

test('set mode sends the turn at the rated level', { options: { mode: 'set' } }, async ($, on) => {
  const seen: string[] = []
  const clock = world(on, '{"level":"high","reason":"multi-file refactor"}', seen)

  await $.prompt.submit({ text: 'Refactor the auth layer across all services' } as never)
  await clock.advance(1)
  await step($, 0)
  await step($, 1)
  expect(seen).toEqual(['high', 'high'])
})

test('suggest mode leaves the effort alone', async ($, on) => {
  const seen: string[] = []
  const clock = world(on, '{"level":"low","reason":"typo fix"}', seen)

  await $.prompt.submit({ text: 'fix the typo in README' } as never)
  await clock.advance(1)
  await step($, 0)
  expect(seen).toEqual(['medium'])
})

test('set mode never lowers a manual xhigh', { options: { mode: 'set' } }, async ($, on) => {
  const seen: string[] = []
  const clock = world(on, '{"level":"low","reason":"easy"}', seen)

  await $.prompt.submit({ text: 'hi' } as never)
  await clock.advance(1)
  const s = $.turn.step({ turnId: 't9', index: 0, model: 'claude-opus-5-5', effort: 'xhigh', messageCount: 1 })
  for await (const _ of s) { /* drain */ }
  expect(seen).toEqual(['xhigh'])
})

test('an unparseable rating changes nothing', { options: { mode: 'set', wait_ms: 10 } }, async ($, on) => {
  const seen: string[] = []
  const clock = world(on, 'no idea', seen)

  await $.prompt.submit({ text: 'something' } as never)
  await clock.advance(1)
  const s = $.turn.step({ turnId: 't2', index: 0, model: 'claude-opus-5-5', effort: 'medium', messageCount: 1 })
  const done = (async () => { for await (const _ of s) { /* drain */ } })()
  await clock.advance(20)
  await done
  expect(seen).toEqual(['medium'])
})

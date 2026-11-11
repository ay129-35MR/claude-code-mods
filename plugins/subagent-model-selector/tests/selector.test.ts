import { expect, test } from 'claude-code/testing'

const USAGE = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

const world = (on: Parameters<Parameters<typeof test>[1]>[1], reply: string, seen: (string | undefined)[]) => {
  on('ui.status', () => ({ value: undefined }) as never)
  on('model.complete', () => ({ value: { isAnswered: true, text: reply, usage: USAGE } }))
  on('agent.spawn', (_, e) => {
    seen.push(e.model)
    return { model: e.model ?? 'inherited' } as never
  })
}

for (const [tier, model] of [
  ['basic', 'claude-haiku-5-5'],
  ['intermediate', 'claude-sonnet-5-5'],
  ['heavy', 'claude-opus-5-5'],
] as const) {
  test(`a ${tier} task runs on ${model}`, async ($, on) => {
    const seen: (string | undefined)[] = []
    world(on, `{"tier":"${tier}","reason":"r"}`, seen)
    await $.agent.spawn({ prompt: 'do the thing', description: 'thing', subagentType: 'general-purpose' })
    expect(seen).toEqual([model])
  })
}

test('an explicit model is kept unless override_explicit is on', async ($, on) => {
  const seen: (string | undefined)[] = []
  world(on, '{"tier":"heavy","reason":"r"}', seen)
  await $.agent.spawn({ prompt: 'x', model: 'haiku' })
  expect(seen).toEqual(['haiku'])
})

test('override_explicit re-routes a named model', { options: { override_explicit: true } }, async ($, on) => {
  const seen: (string | undefined)[] = []
  world(on, '{"tier":"heavy","reason":"r"}', seen)
  await $.agent.spawn({ prompt: 'x', model: 'haiku' })
  expect(seen).toEqual(['claude-opus-5-5'])
})

test('an unreadable rating leaves the model to the engine', async ($, on) => {
  const seen: (string | undefined)[] = []
  world(on, 'hmm', seen)
  await $.agent.spawn({ prompt: 'x' })
  expect(seen).toEqual([undefined])
})

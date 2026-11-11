import { expect, mock, test } from 'claude-code/testing'

type TOn = Parameters<Parameters<typeof test>[1]>[1]
type T$ = Parameters<Parameters<typeof test>[1]>[0]

const SUMMARY = '## Goal\nShip it\n## Next steps\n1. Test'

const world = (on: TOn) => {
  const clock = mock.clock(on)
  const files: Record<string, string> = {}
  const toasts: string[] = []
  let forkPrompt = ''
  on('ui.status', () => ({ value: undefined }) as never)
  on('ui.toast', (_, e) => { toasts.push(String((e as { text: string }).text)); return { value: undefined } as never })
  on('env.get', () => ({ value: '/work' }) as never)
  on('process.run', () => ({ value: { exitCode: 128, stdout: '', stderr: 'not a git repo' } }) as never)
  on('fs.write', (_, e) => { const w = e as { path: string; text: string }; files[w.path] = w.text; return { value: undefined } as never })
  on('model.fork', (_, e) => {
    forkPrompt = (e as { prompt: string }).prompt
    return { value: { isAnswered: true, text: SUMMARY, usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } } as never
  })
  on('tool.call', () => ({ result: {} }) as never)
  on('turn.complete', (_, e) => ({ text: (e as { text: string }).text }) as never)
  return { clock, files, toasts, forkPrompt: () => forkPrompt }
}

const step = async ($: T$, _tokens: number) => {
  const s = $.turn.step({ turnId: 't', index: 0, model: 'claude-opus-5-5', messageCount: 1 })
  for await (const _ of s) { /* drain */ }
}

test('/handoff writes a handover that names the edited files and installs', async ($, on) => {
  const w = world(on)
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: { input_tokens: 10, output_tokens: 1, cache_read_input_tokens: 90_000, cache_creation_input_tokens: 0, model: 'm' }, id: 'm' } as never
  })
  await $.tool.call({ tool: 'Edit', file_path: '/work/src/app.ts', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Write', file_path: '/work/package.json', content: '{}' })
  await $.tool.call({ tool: 'Bash', command: 'npm install zod' })
  await step($, 0)

  const r = await $.command.run({ command: 'handoff' } as never)
  expect(JSON.stringify(r)).toContain('.claude/handoffs/handoff-')
  const [path, body] = Object.entries(w.files)[0] ?? []
  expect(path).toMatch(/\.claude\/handoffs\/handoff-\d{8}-\d{6}\.md$/)
  expect(body).toContain('## Goal')
  expect(body).toContain('/work/src/app.ts (Edit)')
  expect(body).toContain('npm install zod')
  expect(w.forkPrompt()).toContain('Dependency manifests among them: /work/package.json')
})

test('crossing 250k writes one handover after the turn', async ($, on) => {
  const w = world(on)
  let tokens = 120_000
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: { input_tokens: 0, output_tokens: 1, cache_read_input_tokens: tokens, cache_creation_input_tokens: 0, model: 'm' }, id: 'm' } as never
  })
  const turn = async () => {
    await step($, tokens)
    await $.turn.complete({ turnId: 't', reason: 'answer', text: '' } as never)
    await w.clock.advance(5)
  }
  await turn()
  expect(Object.keys(w.files).length).toBe(0)
  tokens = 260_000
  await turn()
  expect(Object.keys(w.files).length).toBe(1)
  expect(w.toasts.join(' ')).toContain('Handover written')
  await turn() // still above: no second handover
  expect(Object.keys(w.files).length).toBe(1)
})

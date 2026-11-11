import { expect, test } from 'claude-code/testing'

type TOn = Parameters<Parameters<typeof test>[1]>[1]

const PANE = {
  plugin: 'switchboard',
  component: 'Pane',
  requestId: 'switchboard',
  props: {
    title: 'Switchboard', isFocused: true, bodyColumns: 60, placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 }, view: {},
  },
} as const

const prov = (plugin: string) => ({ plugin, tier: 'user' })

const world = (on: TOn) => {
  const values: Record<string, unknown> = {
    'cache-clock.enabled': true,
    'cache-clock.ttl': 'auto',
    'cache-clock.max_auto_pings': 3,
    'handoff.enabled': false,
  }
  const sets: [string, unknown][] = []
  on('config.list', () => ({
    value: [
      { key: 'theme', label: 'Theme', kind: 'choice', value: 'dark', options: ['dark', 'light'], provider: prov('engine'), isLocked: false },
      { key: 'cache-clock.enabled', label: 'Enabled', kind: 'boolean', value: values['cache-clock.enabled'], provider: prov('cache-clock'), isLocked: false },
      { key: 'cache-clock.ttl', label: 'Cache lifetime', kind: 'choice', value: values['cache-clock.ttl'], options: ['auto', '5m', '1h'], provider: prov('cache-clock'), isLocked: false },
      { key: 'cache-clock.max_auto_pings', label: 'Pings', kind: 'number', value: values['cache-clock.max_auto_pings'], provider: prov('cache-clock'), isLocked: false },
      { key: 'handoff.enabled', label: 'Enabled', kind: 'boolean', value: values['handoff.enabled'], provider: prov('handoff'), isLocked: false },
    ],
  }) as never)
  on('config.set', (_, e) => {
    const s = e as { key: string; value: unknown }
    sets.push([s.key, s.value])
    values[s.key] = s.value
    return { value: s.value } as never
  })
  on('command.list', () => ({ value: [{ name: 'deploy', description: 'd', source: 'plugin', plugin: 'deployer' }] }) as never)
  on('settings.read', () => ({ value: { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'x' }] }] } } }) as never)
  return { sets, values }
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`lists mods with switches and flips one (${surface})`, async ($, on) => {
    const w = world(on)
    const ui = await $.ui.mount({ ...PANE, surface } as never)

    expect((await ui.find({ type: 'Text', text: /cache-clock/ }))?.text).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /deployer/ }))?.text).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /PreToolUse \(1\)/ }))?.text).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /theme/i })).toBeUndefined()

    await ui.press({ key: 'toggle:cache-clock' })
    await ui.press({ key: 'toggle:handoff' })
    expect(w.sets).toEqual([['cache-clock.enabled', false], ['handoff.enabled', true]])
    expect((await ui.find({ type: 'Text', text: /handoff switched ON/ }))?.text).toBeDefined()
    await ui.unmount()
  })
}

test('settings expand and change in place', async ($, on) => {
  const w = world(on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' } as never)
  await ui.press({ key: 'expand:cache-clock' })
  await ui.select({ key: 'set:cache-clock.ttl', value: '1h' })
  await ui.input({ key: 'set:cache-clock.max_auto_pings', text: '5' })
  expect(w.sets).toEqual([['cache-clock.ttl', '1h'], ['cache-clock.max_auto_pings', 5]])
  await ui.unmount()
})

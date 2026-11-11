import { atom, read, update } from 'claude-code'
import type { Register, EngineInterface, ConfigRow, ConfigValue } from 'claude-code'

// switchboard: one side panel for every plugin and mod in the session.
//
// - A plugin whose manifest declares an `enabled` boolean setting gets an ON/OFF
//   switch. Flipping it writes that setting, and the engine reloads the plugin
//   with the new value: no restart. (All five mods of this session have one.)
// - Every other setting a plugin declares is editable in place: switches for
//   booleans, a picker for choices, a field for text and numbers.
// - Plugins with no settings (seen through their slash commands) and the
//   settings-file hooks are listed read-only, since nothing at runtime can
//   switch them off.

const PANE = 'switchboard'
const rev = atom({ plugin: 'switchboard', key: 'rev' } as const, 0)
const note = atom({ plugin: 'switchboard', key: 'note' } as const, '')
const expanded = atom({ plugin: 'switchboard', key: 'expanded' } as const, [] as readonly string[])

type PluginGroup = { name: string; enabled?: ConfigRow; rows: ConfigRow[] }

function groupRows(rows: readonly ConfigRow[]): PluginGroup[] {
  const groups = new Map<string, PluginGroup>()
  for (const row of rows) {
    const name = row.provider.plugin
    if (name === 'engine') continue
    const g = groups.get(name) ?? { name, rows: [] }
    if (row.key === `${name}.enabled` && row.kind === 'boolean') g.enabled = row
    else g.rows.push(row)
    groups.set(name, g)
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name))
}

async function setRow($: EngineInterface, row: ConfigRow, value: ConfigValue): Promise<void> {
  const r = await $.config.set({ key: row.key, value })
  const shown = typeof value === 'boolean' ? (value ? 'ON' : 'OFF') : String(value)
  const text =
    r.deny !== undefined
      ? `${row.key}: not changed (${r.deny})`
      : row.key.endsWith('.enabled')
        ? `${row.key.slice(0, -'.enabled'.length)} switched ${shown}; it reloads with the change.`
        : `${row.key} set to ${shown}.`
  await update($, note, () => text)
  await update($, rev, n => n + 1)
}

async function toggleExpanded($: EngineInterface, name: string): Promise<void> {
  await update($, expanded, list => (list.includes(name) ? list.filter(n => n !== name) : [...list, name]))
}

function hookSummary(hooks: unknown): string[] {
  if (hooks === null || typeof hooks !== 'object') return []
  return Object.entries(hooks as Record<string, unknown>).map(([event, entries]) => {
    const n = Array.isArray(entries)
      ? entries.reduce((sum: number, m) => sum + (Array.isArray((m as { hooks?: unknown }).hooks) ? (m as { hooks: unknown[] }).hooks.length : 1), 0)
      : 1
    return `${event} (${n})`
  })
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'switchboard',
      description: 'Open the switchboard: turn plugins and mods on or off and change their settings',
    })
    if (options.open_on_start !== false) void $.ui.open({ id: PANE, title: 'Switchboard' })
    return next(e)
  })

  on('command.run', { command: 'switchboard' }, async $ => {
    const opened = await $.ui.open({ id: PANE, title: 'Switchboard' })
    if (opened.isPlaced) return { text: 'Switchboard opened.' }
    // No surface places panes: answer in text instead.
    const groups = groupRows(await $.config.list())
    const lines = groups.map(g => {
      const state = g.enabled === undefined ? 'no switch' : g.enabled.value === true ? 'ON' : 'OFF'
      return `- ${g.name}: ${state}${g.rows.length ? `, ${g.rows.length} settings` : ''}`
    })
    return {
      text:
        `This surface shows no panels. Plugins with settings:\n${lines.join('\n') || '(none)'}\n` +
        'Change them with /config (rows named <plugin>.<setting>).',
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Input, Select } = $.ui.resolve(e)
    await read($, rev) // redraw after each change
    const lastNote = await read($, note)
    const open = await read($, expanded)

    const groups = groupRows(await $.config.list())
    const withSettings = new Set(groups.map(g => g.name))
    const commandOnly = [
      ...new Set(
        (await $.command.list())
          .map(c => c.plugin)
          .filter((p): p is string => typeof p === 'string' && p !== '' && !withSettings.has(p)),
      ),
    ].sort()
    const settingsHooks = hookSummary(await $.settings.read({ key: 'hooks' }))

    const rowControl = (row: ConfigRow) => {
      const label = row.label || row.key.split('.').slice(1).join('.')
      if (row.isLocked) {
        return (
          <Text dimColor>
            {'  '}
            {label}: {String(row.value)} (locked by policy)
          </Text>
        )
      }
      if (row.kind === 'boolean') {
        const isTrue = row.value === true
        return (
          <Box>
            <Text>
              {'  '}
              {label}{' '}
            </Text>
            <Button key={`set:${row.key}`} label={isTrue ? "● ON" : "○ OFF"} onPress={() => setRow($, row, !isTrue)} />
          </Box>
        )
      }
      if (row.kind === 'choice' && row.options !== undefined) {
        return (
          <Select
            key={`set:${row.key}`}
            label={`  ${label}`}
            value={String(row.value)}
            options={row.options.map(o => ({ value: o, label: o }))}
            onSelect={v => setRow($, row, v)}
          />
        )
      }
      return (
        <Input
          key={`set:${row.key}`}
          label={`  ${label}`}
          value={String(row.value)}
          submitLabel="Set"
          onSubmit={v => setRow($, row, row.kind === 'number' ? Number(v) : v)}
        />
      )
    }

    return (
      <Box flexDirection="column">
        <Text bold>Plugins and mods</Text>
        {groups.length === 0 && <Text dimColor>No plugin declares settings in this session.</Text>}
        {groups.map(g => {
          const isOn = g.enabled === undefined || g.enabled.value === true
          const isOpen = open.includes(g.name)
          return (
            <Box flexDirection="column">
              <Box>
                {g.enabled === undefined ? (
                  <Text dimColor>[no switch] </Text>
                ) : g.enabled.isLocked ? (
                  <Text dimColor>{isOn ? '● ON' : '○ OFF'} (locked) </Text>
                ) : (
                  <Button
                    key={`toggle:${g.name}`}
                    label={isOn ? '● ON ' : '○ OFF'}
                    onPress={() => setRow($, g.enabled as ConfigRow, !isOn)}
                  />
                )}
                <Text bold={isOn} dimColor={!isOn}>
                  {' '}
                  {g.name}{' '}
                </Text>
                {g.rows.length > 0 && (
                  <Button
                    key={`expand:${g.name}`}
                    label={isOpen ? `▾ settings (${g.rows.length})` : `▸ settings (${g.rows.length})`}
                    onPress={() => toggleExpanded($, g.name)}
                  />
                )}
              </Box>
              {isOpen && g.rows.map(rowControl)}
            </Box>
          )
        })}

        {commandOnly.length > 0 && (
          <Box flexDirection="column">
            <Text bold>Other plugins (no settings to change)</Text>
            {commandOnly.map(p => (
              <Text dimColor>· {p}</Text>
            ))}
          </Box>
        )}

        <Box flexDirection="column">
          <Text bold>Settings-file hooks (read-only)</Text>
          {settingsHooks.length === 0 ? (
            <Text dimColor>None.</Text>
          ) : (
            settingsHooks.map(line => <Text dimColor>· {line}</Text>)
          )}
        </Box>

        {lastNote !== '' && <Text color="success">{lastNote}</Text>}
      </Box>
    )
  })
}

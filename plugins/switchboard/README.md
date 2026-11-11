# switchboard

A Claude Code mod that puts every plugin and mod of the session in one side panel.

- **ON/OFF switch** for each plugin whose manifest declares an `enabled` boolean setting. Flipping
  it writes that setting, and the engine reloads the plugin with the new value, so there is no
  restart. Off means the plugin's `register` adds no hooks; on brings them back.
- **Settings in place**: press `▸ settings` to expand a plugin's `userConfig` fields. Booleans are
  switches, choices are pickers, text and numbers are fields. Rows locked by policy are shown read-only.
- **Read-only listings**: plugins that declare no settings (found through their slash commands),
  and the hooks configured in settings files, which nothing can switch off at runtime.

The panel opens when the session starts (`open_on_start`, default on) and with `/switchboard`.
On a surface that draws no panels, `/switchboard` answers with a text summary instead.

To give your own mod a switch, add to its `plugin.json`:

    "userConfig": { "enabled": { "type": "boolean", "title": "Enabled", "description": "...", "default": true } }

and start its `register` with `if (options.enabled === false) return`.

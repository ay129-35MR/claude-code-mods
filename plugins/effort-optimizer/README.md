# effort-optimizer

A Claude Code mod that picks a reasoning effort level for each prompt.

When you submit a prompt (not a slash command), effort-optimizer asks Claude Sonnet 5.5, in the
background, to rate it `low`, `medium` or `high`. The submission is never held up.

- **suggest** (default): the rating shows in the status line, and a toast appears when it differs
  from the level the turn is running at.
- **set**: the main loop's model requests for that turn are sent at the rated level. The first
  request waits up to `wait_ms` (default 4000) for the rating, then goes ahead at the session's level.
  Subagents keep their own level, and a level you chose as `xhigh` or `max` is never lowered.
- **off**: does nothing.

Switch with `/effort-optimizer suggest|set|off`, or `/effort-optimizer status` to see the last rating.
Options (`userConfig`): `mode`, `model` (default `claude-sonnet-5-5`), `wait_ms`.

An `enabled` setting (default on) turns the whole mod off or on; switchboard shows it as an ON/OFF switch.

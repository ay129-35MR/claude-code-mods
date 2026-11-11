# subagent-model-selector

A Claude Code mod that picks the model each subagent runs on.

When a subagent is about to start, its task (agent type, description and prompt) is rated by
Claude Haiku 5.5 as `basic`, `intermediate` or `heavy`, and the subagent is started on:

- basic → `claude-haiku-5-5` (searches, lookups, summaries, mechanical edits)
- intermediate → `claude-sonnet-5-5` (ordinary implementation, tests, contained reviews)
- heavy → `claude-opus-5-5` (architecture, multi-file refactors, subtle bugs, planning)

Forks always keep the parent's model. A spawn whose Agent call already named a model keeps it,
unless `override_explicit` is on. If the rating fails, the engine picks the model as usual.

`/subagent-model-selector on|off|status` toggles it and lists the recent routes.
Options (`userConfig`): `basic_model`, `intermediate_model`, `heavy_model`, `rater_model`, `override_explicit`.

An `enabled` setting (default on) turns the whole mod off or on; switchboard shows it as an ON/OFF switch.

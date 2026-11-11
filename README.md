# claude-code-mods

Six Claude Code mods (function-hook plugins), published as one plugin marketplace.

| Mod | What it does |
| --- | --- |
| [input-router](plugins/input-router) | Read and MCP outputs over ~2,000 tokens are condensed by Claude Haiku 5.5 to the excerpts relevant to your request, plus a summary. |
| [effort-optimizer](plugins/effort-optimizer) | Each prompt is rated by Claude Sonnet 5.5 in the background; it suggests (default) or sets low, medium or high effort for the turn. |
| [subagent-model-selector](plugins/subagent-model-selector) | Each subagent's task is rated as it spawns and run on Haiku (basic), Sonnet (intermediate) or Opus (heavy). |
| [cache-clock](plugins/cache-clock) | A countdown of the prompt cache's lifetime above the prompt, with `/keepwarm` and a Keep warm button. |
| [handoff](plugins/handoff) | At 250k tokens of context, or on `/handoff`, writes a structured handover prompt for a fresh session. |
| [switchboard](plugins/switchboard) | A side panel listing every mod with ON/OFF switches and its settings, changed live. |

## Install

This repository is private: installing needs read access to it on GitHub and a git credential for
github.com on your machine (an SSH key, or `gh auth login` then `gh auth setup-git`).

At the prompt of a terminal session, one line per mod:

```
/plugin install input-router --marketplace ay129-35MR/claude-code-mods
/plugin install effort-optimizer --marketplace ay129-35MR/claude-code-mods
/plugin install subagent-model-selector --marketplace ay129-35MR/claude-code-mods
/plugin install cache-clock --marketplace ay129-35MR/claude-code-mods
/plugin install handoff --marketplace ay129-35MR/claude-code-mods
/plugin install switchboard --marketplace ay129-35MR/claude-code-mods
```

From a shell, the same with `claude plugin install <mod> --marketplace ay129-35MR/claude-code-mods`.

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins,
Add marketplace with `ay129-35MR/claude-code-mods`, then Add plugin.

Answer `y` to add the marketplace the first time. Each mod's README lists its commands and settings;
every mod has an `enabled` setting, shown as a switch in switchboard.

## Development

`claude plugin validate plugins/<mod>` checks a mod; `claude plugin test plugins/<mod>` runs its tests.

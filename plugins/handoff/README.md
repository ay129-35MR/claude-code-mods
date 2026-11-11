# handoff

A Claude Code mod that writes a handover prompt so a new session can pick up where a long one left off.

It tracks the main conversation's context size from each request's usage (shown in the status line
as `context 212k / 250k`). When the context reaches 250,000 tokens, or when you run `/handoff`, it
writes a Markdown handover to `.claude/handoffs/handoff-<UTC time>.md` with these sections:
Goal, Current state, Key decisions and constraints, Modified files, Active dependencies,
Open problems, Next steps.

The summary is written by one fork over the session's own transcript, so it sees the whole
conversation. The mod also records, independently of the model, every file changed by
Edit/Write/NotebookEdit, every dependency-install command run in Bash, and `git status` /
`git diff --stat` when the folder is a git repository. These go into the prompt and an appendix.

Start the new session with:

    claude "$(cat .claude/handoffs/handoff-<time>.md)"

The automatic handover fires once per crossing and re-arms when the context drops below 80% of
the threshold (for example after `/compact`).
Options (`userConfig`): `threshold_tokens` (default 250000), `auto` (default on), `folder`.

An `enabled` setting (default on) turns the whole mod off or on; switchboard shows it as an ON/OFF switch.

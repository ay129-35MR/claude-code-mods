# input-router

A Claude Code mod that keeps oversized tool outputs out of the main context.

When a built-in `Read` or any MCP connector tool (`mcp__*`) returns more than ~2,000 tokens
(estimated at 4 characters per token), input-router sends the payload, the tool call and your
latest prompt to Claude Haiku 5.5. Haiku returns only the verbatim excerpts relevant to the
current request (with original line ranges for files) plus a short summary. That condensed text
replaces the raw output that the main model reads.

- Targeted reads (`offset`, `limit`, `pages`) pass through raw, so the model can still get exact lines to edit.
- Images, PDFs, notebooks, errors and denied calls pass through untouched.
- If Haiku fails or times out (60 s), the raw output passes through. No data is lost.
- `/input-router off`, `/input-router on`, `/input-router status` toggle it for the session.

Options (`userConfig`): `threshold_tokens` (default 2000) and `model` (default `claude-haiku-5-5`).

An `enabled` setting (default on) turns the whole mod off or on; switchboard shows it as an ON/OFF switch.

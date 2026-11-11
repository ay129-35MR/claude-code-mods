import type { Register, EngineInterface } from 'claude-code'

// handoff: watches how large the main conversation's context is (from each
// request's usage). At the threshold (default 250k tokens), or on /handoff, it
// writes a structured handover prompt for a fresh session: goals, decisions,
// modified files, active dependencies, open problems and next steps.
// The summary is written by one fork over the session's own transcript, so it
// sees everything; the file list and dependency commands are tracked directly
// so they don't depend on the model remembering them.

// Module state: reset when the mod reloads.
let threshold = 250_000
let isAuto = true
let folder = '.claude/handoffs'
let contextTokens = 0
let isArmed = true // fires once per crossing; re-armed when context drops (e.g. after /compact)
let isDue = false
let isWriting = false
const modified = new Map<string, string>() // path -> last tool that changed it
const depCommands: string[] = []

const DEP_COMMAND =
  /\b((npm|pnpm|yarn|bun)\s+(i|install|add)\b|pip3?\s+install|uv\s+(add|pip\s+install)|poetry\s+add|cargo\s+add|go\s+get|gem\s+install|bundle\s+add|composer\s+require|brew\s+install|apt(-get)?\s+install|dotnet\s+add\s+package)/
const MANIFEST =
  /(^|\/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|requirements[^/]*\.txt|pyproject\.toml|poetry\.lock|uv\.lock|Cargo\.toml|Cargo\.lock|go\.mod|go\.sum|Gemfile(\.lock)?|composer\.json|\.csproj|build\.gradle(\.kts)?|pom\.xml)$/

const INSTRUCTIONS = `Write a handover for a NEW Claude Code session that will continue this work with none of this conversation.
Answer straight away, without tools, in Markdown with exactly these sections:

## Goal
What the user is ultimately trying to achieve, in 2-4 sentences, in their terms.
## Current state
What is done, what is half-done, and what was verified (tests/builds run and their results).
## Key decisions and constraints
Choices made and why, user preferences and instructions that still apply, approaches that were tried and rejected.
## Modified files
Each file changed this session with one line on what changed and why. Use the tracked list below as the source of truth.
## Active dependencies
Packages, services, environment variables, credentials (names only, never values), commands and tooling the work relies on, including anything installed this session.
## Open problems
Bugs, failing tests, unanswered questions, risks.
## Next steps
A numbered list, most important first, concrete enough to start on immediately.

Be specific: exact paths, function names, commands, error messages. No preamble.`

function stamp(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`
}

function fmt(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n)
}

async function gitFacts($: EngineInterface): Promise<string> {
  try {
    const status = await $.process.run(['git', 'status', '--short', '--branch'], { timeoutMs: 10_000 })
    if (status.exitCode !== 0) return ''
    const stat = await $.process.run(['git', 'diff', '--stat', 'HEAD'], { timeoutMs: 10_000 })
    return `git status:\n${status.stdout.trim()}\n\ngit diff --stat HEAD:\n${stat.stdout.trim() || '(none)'}`
  } catch {
    return '' // not a git repository, or git is missing
  }
}

async function writeHandoff($: EngineInterface, why: string): Promise<{ path?: string; text: string }> {
  if (isWriting) return { text: 'A handover is already being written.' }
  isWriting = true
  try {
    const files = [...modified.entries()].map(([path, tool]) => `- ${path} (${tool})`).join('\n') || '(none tracked)'
    const manifests = [...modified.keys()].filter(p => MANIFEST.test(p))
    const deps = depCommands.length > 0 ? depCommands.map(c => `- \`${c}\``).join('\n') : '(none seen)'
    const git = await gitFacts($)

    const facts =
      `Tracked facts from this session (authoritative):\n` +
      `Files changed by Edit/Write/NotebookEdit:\n${files}\n` +
      `Dependency manifests among them: ${manifests.join(', ') || 'none'}\n` +
      `Dependency commands run:\n${deps}\n` +
      (git ? `\n${git}\n` : '')

    const r = await $.model.fork({ prompt: `${INSTRUCTIONS}\n\n${facts}` })
    if (!r.isAnswered) return { text: `Could not write the handover: ${r.reason}.` }

    const now = await $.clock.now()
    const cwd = (await $.env.get('PWD')) ?? '.'
    const body =
      `# Session handover\n\n` +
      `You are continuing work from an earlier Claude Code session (${why}; context was ~${fmt(contextTokens)} tokens). ` +
      `Read this handover, check the files and state it names before trusting it, then carry on with the next steps.\n\n` +
      `Working directory: \`${cwd}\`\n\n` +
      `${r.text.trim()}\n\n` +
      `---\n\n## Appendix: tracked by the handoff mod\n\n### Files changed\n${files}\n\n### Dependency commands\n${deps}\n` +
      (git ? `\n### Git\n\n\`\`\`\n${git}\n\`\`\`\n` : '')

    const path = `${folder.replace(/\/+$/, '')}/handoff-${stamp(now)}.md`
    await $.fs.write(path, body)
    return { path, text: body }
  } finally {
    isWriting = false
  }
}

export const register: Register = (on, options) => {
  if (options.enabled === false) return // switched off (e.g. from switchboard)

  threshold =
    typeof options.threshold_tokens === 'number' && options.threshold_tokens > 0
      ? options.threshold_tokens
      : 250_000
  isAuto = options.auto !== false
  folder = typeof options.folder === 'string' && options.folder.trim() !== '' ? options.folder.trim() : '.claude/handoffs'

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'handoff',
      description: 'Write a handover prompt for a new session (goals, files, dependencies, next steps)',
    })
    return next(e)
  })

  on('command.run', { command: 'handoff' }, async $ => {
    const r = await writeHandoff($, 'requested with /handoff')
    if (r.path === undefined) return { text: r.text }
    return {
      text:
        `Handover written to ${r.path} (~${fmt(contextTokens)} tokens of context summarised).\n` +
        `Start the new session with:  claude "$(cat ${r.path})"`,
    }
  })

  // Track what changed on disk and what was installed.
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError === true || e.agentId !== undefined) return ran
    const input = e as unknown as { file_path?: unknown; notebook_path?: unknown; command?: unknown }
    if (e.tool === 'Edit' || e.tool === 'Write' || e.tool === 'NotebookEdit') {
      const path = input.file_path ?? input.notebook_path
      if (typeof path === 'string') modified.set(path, e.tool)
    }
    if (e.tool === 'Bash' && typeof input.command === 'string' && DEP_COMMAND.test(input.command)) {
      depCommands.push(input.command.trim().slice(0, 200))
      if (depCommands.length > 40) depCommands.shift()
    }
    return ran
  }).catch(($, e, next) => next(e)) // tracking must never block a tool

  // Context size = everything the last main-loop request was answered over.
  on('turn.step', async function* ($, e, next) {
    const res = yield* next(e)
    if (e.agentId !== undefined || res.usage === null) return res
    const u = res.usage
    contextTokens = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
    $.ui.status(`context ${fmt(contextTokens)} / ${fmt(threshold)}`)
    if (contextTokens < threshold * 0.8) isArmed = true
    if (isAuto && isArmed && contextTokens >= threshold) {
      isArmed = false
      isDue = true
    }
    return res
  })

  // Write the automatic handover once the turn is over, off the turn's path.
  on('turn.complete', ($, e, next) => {
    if (e.agentId === undefined && isDue) {
      isDue = false
      $.clock.after(1, () => {
        void writeHandoff($, `context reached ${fmt(threshold)} tokens`).then(r => {
          $.ui.toast(
            r.path === undefined
              ? `handoff: ${r.text}`
              : `handoff: context at ~${fmt(contextTokens)} tokens. Handover written to ${r.path}. Start fresh with: claude "$(cat ${r.path})"`,
            { timeoutMs: 15_000 },
          )
        })
      })
    }
    return next(e)
  })
}

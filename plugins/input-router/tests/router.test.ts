import { expect, test } from 'claude-code/testing'

const BIG = Array.from({ length: 1500 }, (_, i) => `line ${i}: const value${i} = compute(${i})`).join('\n')
const USAGE = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

const readRecord = (content: string) => ({
  type: 'text' as const,
  file: { filePath: '/a.ts', content, numLines: content.split('\n').length, startLine: 1, totalLines: 1500 },
})

test('a large Read is condensed by Haiku', async ($, on) => {
  let asked = ''
  on('model.complete', (_, e) => {
    asked = e.prompt
    return { value: { isAnswered: true, text: '## Relevant excerpts\nL3-L3: line 2\n## Summary\n- stuff', usage: USAGE } }
  })
  on('tool.call', () => ({ result: readRecord(BIG) }))

  const r = await $.tool.call({ tool: 'Read', file_path: '/a.ts' })
  const content = (r.result as { file: { content: string } }).file.content
  expect(content).toContain('[input-router]')
  expect(content).toContain('## Relevant excerpts')
  expect(content.length).toBeLessThan(1000)
  expect(asked).toContain('<tool_output')
})

test('small reads, targeted reads and failures pass through raw', async ($, on) => {
  on('model.complete', () => ({ value: { isAnswered: false, reason: 'aborted', usage: USAGE } }))
  on('tool.call', () => ({ result: readRecord(BIG) }))

  const targeted = await $.tool.call({ tool: 'Read', file_path: '/a.ts', offset: 10, limit: 2000 })
  expect((targeted.result as { file: { content: string } }).file.content).toBe(BIG)

  const failed = await $.tool.call({ tool: 'Read', file_path: '/a.ts' })
  expect((failed.result as { file: { content: string } }).file.content).toBe(BIG)
})

test('a large MCP output is condensed, keeping its shape', async ($, on) => {
  on('model.complete', () => ({ value: { isAnswered: true, text: 'condensed!', usage: USAGE } }))
  on('tool.call', () => ({ result: [{ type: 'text', text: BIG }], text: BIG }))

  const r = await $.tool.call({ tool: 'mcp__drive__read_file', id: 'x' })
  const blocks = r.result as { type: string; text: string }[]
  expect(blocks.length).toBe(1)
  expect(blocks[0]?.text).toContain('condensed!')
})

test('Bash is never touched', async ($, on) => {
  on('tool.call', () => ({ result: { stdout: BIG, stderr: '' } }))
  const r = await $.tool.call({ tool: 'Bash', command: 'cat a' })
  expect((r.result as { stdout: string }).stdout).toBe(BIG)
})

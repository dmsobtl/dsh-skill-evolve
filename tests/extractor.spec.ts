import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdCompressSync } from 'node:zlib'
import { extractWorkflow } from '../src/extractor.ts'
import { generateSkill, generateSkillFilename } from '../src/generator.ts'
import { parseSessionFile } from '../src/session.ts'

const events = [
  { type: 'user/message', seq: 1, time: 1, data: { content: [{ type: 'text', text: 'deploy the app' }] } },
  { type: 'turn/start', seq: 2, time: 2, data: { turn: 1 } },
  { type: 'tool/call', seq: 3, time: 3, data: { name: 'bash', arguments: JSON.stringify({ command: 'git pull' }) } },
  { type: 'tool/call', seq: 4, time: 4, data: { name: 'read', arguments: JSON.stringify({ path: 'config.json' }) } },
  { type: 'tool/call', seq: 5, time: 5, data: { name: 'write', arguments: JSON.stringify({ path: 'out.txt', content: 'hello' }) } },
  { type: 'turn/end', seq: 6, time: 6, data: { turn: 1, reason: { kind: 'completed' } } },
] as any[]

describe('extractWorkflow', () => {
  it('extracts steps, tools, and success from events', () => {
    const w = extractWorkflow(events)
    expect(w.success).toBe(true)
    expect(w.turnCount).toBe(1)
    expect(w.steps).toHaveLength(3)
    expect(w.toolsUsed).toEqual(['bash', 'read', 'write'])
    expect(w.taskDescription).toBe('deploy the app')
  })

  it('marks incomplete sessions as unsuccessful', () => {
    const w = extractWorkflow(events.slice(0, -1))
    expect(w.success).toBe(false)
  })
})

describe('generateSkill', () => {
  it('produces a markdown skill with steps', () => {
    const w = extractWorkflow(events)
    const md = generateSkill(w, { name: 'deploy', description: 'd', generatedFrom: 's.jsonl', generatedAt: '2026-08-14' })
    expect(md).toContain('# Skill: deploy')
    expect(md).toContain('### 1. Execute: git pull')
    expect(md).toContain('- `bash`')
  })
})

describe('generateSkillFilename', () => {
  it('sanitizes names', () => {
    expect(generateSkillFilename('Deploy Staging!')).toBe('deploy-staging.md')
  })
})

describe('parseSessionFile', () => {
  it('decodes a zstd-compressed session log', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'skill-evolve-'))
    const path = join(dir, 'session.jsonl.zstd')
    const content = '{"type":"session","version":0,"id":"s","createdAt":1}\n' +
      '{"type":"turn/start","seq":1,"time":1,"data":{"turn":1}}\n' +
      '{"type":"tool/call","seq":2,"time":2,"data":{"name":"read","arguments":"{}"}}\n' +
      '{"type":"turn/end","seq":3,"time":3,"data":{"turn":1,"reason":{"kind":"completed"}}}\n'
    writeFileSync(path, zstdCompressSync(Buffer.from(content, 'utf8')))
    try {
      const events = await parseSessionFile(path)
      expect(events).toHaveLength(3)
      expect(events[1].type).toBe('tool/call')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

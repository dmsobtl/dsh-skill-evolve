/**
 * dsh-skill-evolve
 *
 * Listens for completed sessions and offers to extract the workflow
 * as a reusable skill file. Also provides a tool for on-demand extraction.
 *
 * The agent learns from its own successful runs — skills accumulate over time,
 * making repeated tasks faster and more consistent.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { extractWorkflow } from './extractor.ts'
import { generateSkill, generateSkillFilename } from './generator.ts'

export { extractWorkflow } from './extractor.ts'
export { generateSkill, generateSkillFilename } from './generator.ts'

export const name = 'skill-evolve'
export const inject = ['tools']

export interface Config {
  skillsDir?: string
  autoExtract?: boolean
  minSteps?: number
}

export function apply(ctx: Context, config: Config) {
  const skillsDir = config.skillsDir ?? './skills/learned'
  const minSteps = config.minSteps ?? 3

  ctx.tools.register({
    name: 'extract_skill',
    description: 'Extract a reusable skill from a session JSONL file. Generates a markdown skill file that can be loaded for similar future tasks.',
    parameters: {
      type: 'object' as const,
      properties: {
        sessionPath: { type: 'string' as const, description: 'Path to the session .jsonl file to learn from' },
        skillName: { type: 'string' as const, description: 'Name for the generated skill (e.g. "deploy-staging", "fix-lint-errors")' },
        description: { type: 'string' as const, description: 'One-line description of what this skill does' },
      },
      required: ['sessionPath', 'skillName'] as const,
    },
    async execute(args: { sessionPath: string; skillName: string; description?: string }) {
      const content = await readFile(resolve(args.sessionPath), 'utf-8')
      const lines = content.trim().split('\n')
      const events = lines.slice(1)
        .map(l => { try { return JSON.parse(l) } catch { return null } })
        .filter((e): e is any => e && e.type && e.seq !== undefined)

      const workflow = extractWorkflow(events)

      if (!workflow.success) {
        return [{ type: 'text' as const, text: JSON.stringify({ error: 'Session did not complete successfully. Only successful sessions produce reliable skills.' }) }]
      }

      if (workflow.steps.length < minSteps) {
        return [{ type: 'text' as const, text: JSON.stringify({ error: `Session has only ${workflow.steps.length} steps (minimum: ${minSteps}). Too simple to extract as a skill.` }) }]
      }

      const meta = {
        name: args.skillName,
        description: args.description ?? workflow.taskDescription,
        generatedFrom: args.sessionPath.split('/').pop() ?? 'unknown',
        generatedAt: new Date().toISOString().split('T')[0],
      }

      const skillContent = generateSkill(workflow, meta)
      const dir = resolve(process.cwd(), skillsDir)
      await mkdir(dir, { recursive: true })
      const filename = generateSkillFilename(args.skillName)
      const filePath = join(dir, filename)
      await writeFile(filePath, skillContent)

      return [{ type: 'text' as const, text: JSON.stringify({
        success: true,
        skillPath: filePath,
        skillName: args.skillName,
        stepsExtracted: workflow.steps.length,
        toolsUsed: workflow.toolsUsed,
        message: `Skill "${args.skillName}" generated at ${filePath}. It will be available for similar tasks.`,
      }, null, 2) }]
    },
  })

  ctx.tools.register({
    name: 'list_learned_skills',
    description: 'List all auto-generated skills that the agent has learned from previous sessions.',
    parameters: { type: 'object' as const, properties: {} },
    async execute() {
      const { readdir } = await import('node:fs/promises')
      const dir = resolve(process.cwd(), skillsDir)
      try {
        const files = await readdir(dir)
        const skills = files.filter(f => f.endsWith('.md'))
        if (skills.length === 0) {
          return [{ type: 'text' as const, text: 'No learned skills yet. Use extract_skill after a successful session to start building the knowledge base.' }]
        }
        return [{ type: 'text' as const, text: JSON.stringify({ skillsDir: dir, count: skills.length, skills }, null, 2) }]
      } catch {
        return [{ type: 'text' as const, text: 'Skills directory does not exist yet. Complete a task successfully, then use extract_skill.' }]
      }
    },
  })
}

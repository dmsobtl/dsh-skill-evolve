/**
 * dsh-skill-evolve
 *
 * Extracts reusable skills from successful sessions and generates skill
 * markdown files the agent can load for similar future tasks.
 */

import { writeFile, mkdir, readdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { parseSessionFile } from './session.js'
import { extractWorkflow } from './extractor.js'
import { generateSkill, generateSkillFilename } from './generator.js'
import type { ResolvedConfig } from './config.js'

export { parseSessionFile } from './session.js'
export { extractWorkflow } from './extractor.js'
export { generateSkill, generateSkillFilename } from './generator.js'

export const name = 'skill-evolve'
export const inject = ['tools']

export const Config = z.object({
  skillsDir: z.string().default('./skills/learned'),
  minSteps: z.number().default(3),
})

export function apply(ctx: Context, config: ResolvedConfig) {
  ctx.tools.register(extractSkillTool(config))
  ctx.tools.register(listLearnedSkillsTool(config))
}

function extractSkillTool(config: ResolvedConfig) {
  return defineTool({
    name: 'extract_skill',
    description: 'Extract a reusable skill from a session log file (.jsonl or .jsonl.zstd). Generates a markdown skill file that can be loaded for similar future tasks.',
    parameters: {
      sessionPath: { type: 'string', required: true, description: 'Path to the session .jsonl or .jsonl.zstd file to learn from' },
      skillName: { type: 'string', required: true, description: 'Name for the generated skill (e.g. "deploy-staging", "fix-lint-errors")' },
      description: { type: 'string', description: 'One-line description of what this skill does' },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args) {
      let workflow
      try {
        const events = await parseSessionFile(resolve(args.sessionPath))
        workflow = extractWorkflow(events)
      } catch (err) {
        return { error: `Cannot read session: ${(err as Error).message}` }
      }

      if (!workflow.success) {
        return { error: 'Session did not complete successfully. Only successful sessions produce reliable skills.' }
      }
      if (workflow.steps.length < config.minSteps) {
        return { error: `Session has only ${workflow.steps.length} steps (minimum: ${config.minSteps}). Too simple to extract as a skill.` }
      }

      const meta = {
        name: args.skillName,
        description: args.description ?? workflow.taskDescription,
        generatedFrom: args.sessionPath.split(/[\\/]/).pop() ?? 'unknown',
        generatedAt: new Date().toISOString().split('T')[0],
      }

      const skillContent = generateSkill(workflow, meta)
      const dir = resolve(process.cwd(), config.skillsDir)
      await mkdir(dir, { recursive: true })
      const filename = generateSkillFilename(args.skillName)
      const filePath = join(dir, filename)
      await writeFile(filePath, skillContent)

      return JSON.parse(JSON.stringify({
        success: true,
        skillPath: filePath,
        skillName: args.skillName,
        stepsExtracted: workflow.steps.length,
        toolsUsed: workflow.toolsUsed,
        message: `Skill "${args.skillName}" generated at ${filePath}. It will be available for similar tasks.`,
      }))
    },
  })
}

function listLearnedSkillsTool(config: ResolvedConfig) {
  return defineTool({
    name: 'list_learned_skills',
    description: 'List all auto-generated skills that the agent has learned from previous sessions.',
    parameters: {},
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute() {
      const dir = resolve(process.cwd(), config.skillsDir)
      let result: Record<string, unknown>
      try {
        const files = await readdir(dir)
        const skills = files.filter(f => f.endsWith('.md'))
        result = skills.length === 0
          ? { skillsDir: dir, count: 0, skills: [], message: 'No learned skills yet. Use extract_skill after a successful session to start building the knowledge base.' }
          : { skillsDir: dir, count: skills.length, skills, message: `Found ${skills.length} learned skill(s).` }
      } catch {
        result = { skillsDir: dir, count: 0, skills: [], message: 'Skills directory does not exist yet. Complete a task successfully, then use extract_skill.' }
      }
      return JSON.parse(JSON.stringify(result))
    },
  })
}

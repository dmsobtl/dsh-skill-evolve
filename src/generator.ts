/**
 * Generate a skill markdown file from an extracted workflow.
 */

import type { ExtractedWorkflow } from './extractor.ts'

export interface SkillMetadata {
  name: string
  description: string
  generatedFrom: string
  generatedAt: string
}

export function generateSkill(workflow: ExtractedWorkflow, meta: SkillMetadata): string {
  const lines: string[] = []

  lines.push(`# Skill: ${meta.name}`)
  lines.push('')
  lines.push(`> Auto-generated from session \`${meta.generatedFrom}\` on ${meta.generatedAt}`)
  lines.push('')

  lines.push('## 触发条件')
  lines.push('')
  lines.push(`当用户的需求类似于以下任务时使用：`)
  lines.push(`> ${workflow.taskDescription}`)
  lines.push('')

  lines.push('## 执行步骤')
  lines.push('')
  for (let i = 0; i < workflow.steps.length; i++) {
    const step = workflow.steps[i]
    lines.push(`### ${i + 1}. ${step.purpose}`)
    lines.push('')
    lines.push('```')
    lines.push(`工具: ${step.tool}`)
    if (Object.keys(step.argsPattern).length > 0) {
      lines.push(`参数模式:`)
      for (const [key, pattern] of Object.entries(step.argsPattern)) {
        lines.push(`  ${key}: ${pattern}`)
      }
    }
    lines.push('```')
    lines.push('')
  }

  lines.push('## 使用的工具')
  lines.push('')
  for (const tool of workflow.toolsUsed) {
    lines.push(`- \`${tool}\``)
  }
  lines.push('')

  lines.push('## 统计')
  lines.push('')
  lines.push(`- 原始会话轮数: ${workflow.turnCount}`)
  lines.push(`- 去重后步骤数: ${workflow.steps.length}`)
  lines.push(`- 任务完成: ${workflow.success ? '✓' : '✗'}`)
  lines.push('')

  lines.push('## 注意事项')
  lines.push('')
  lines.push('- 本 skill 由 Agent 会话自动提炼，可能需要人工审查和调整')
  lines.push('- 参数模式中的占位符（如 `<url>`, `<path>`）需要根据实际情况替换')
  lines.push('- 如果环境或需求有变化，请更新对应步骤')
  lines.push('')

  return lines.join('\n')
}

export function generateSkillFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9一-龥]+/g, '-')
    .replace(/^-|-$/g, '')
    + '.md'
}

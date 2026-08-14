/**
 * Extract a workflow pattern from a successful session's events.
 * Identifies the sequence of tool calls that led to task completion.
 */

export interface SessionEvent {
  type: string
  seq: number
  time: number
  data: Record<string, unknown>
}

export interface WorkflowStep {
  tool: string
  purpose: string
  argsPattern: Record<string, string>
  order: number
}

export interface ExtractedWorkflow {
  taskDescription: string
  steps: WorkflowStep[]
  toolsUsed: string[]
  turnCount: number
  success: boolean
}

export function extractWorkflow(events: SessionEvent[]): ExtractedWorkflow {
  const steps: WorkflowStep[] = []
  const toolsUsed = new Set<string>()
  let taskDescription = ''
  let turnCount = 0
  let success = false
  let stepOrder = 0

  for (const event of events) {
    if (event.type === 'user/message') {
      const content = (event.data as any).content
      if (Array.isArray(content)) {
        const textBlock = content.find((b: any) => b.type === 'text')
        if (textBlock && !taskDescription) {
          taskDescription = textBlock.text.slice(0, 200)
        }
      }
    }

    if (event.type === 'turn/start') turnCount++

    if (event.type === 'tool/call') {
      const data = event.data as { name: string; arguments: string }
      toolsUsed.add(data.name)
      stepOrder++

      let parsedArgs: Record<string, unknown> = {}
      try { parsedArgs = JSON.parse(data.arguments) } catch {}

      const argsPattern: Record<string, string> = {}
      for (const [key, value] of Object.entries(parsedArgs)) {
        argsPattern[key] = typeof value === 'string' ? generalizeValue(value) : typeof value
      }

      steps.push({
        tool: data.name,
        purpose: inferPurpose(data.name, parsedArgs),
        argsPattern,
        order: stepOrder,
      })
    }

    if (event.type === 'turn/end') {
      const reason = (event.data as any).reason
      if (reason?.kind === 'completed') success = true
    }
  }

  return {
    taskDescription,
    steps: deduplicateSteps(steps),
    toolsUsed: [...toolsUsed],
    turnCount,
    success,
  }
}

function generalizeValue(value: string): string {
  if (value.startsWith('http')) return '<url>'
  if (value.startsWith('/') || value.includes('/')) return '<path>'
  if (/^\d+$/.test(value)) return '<number>'
  if (value.length > 50) return '<long_text>'
  return `"${value}"`
}

function inferPurpose(tool: string, args: Record<string, unknown>): string {
  switch (tool) {
    case 'bash': return `Execute: ${String(args.command ?? '').slice(0, 60)}`
    case 'read': return `Read file: ${args.path ?? 'unknown'}`
    case 'write': return `Write file: ${args.path ?? 'unknown'}`
    case 'edit': return `Edit file: ${args.file_path ?? 'unknown'}`
    case 'web_fetch': return `Fetch URL: ${args.url ?? 'unknown'}`
    case 'web_search': return `Search: ${args.query ?? 'unknown'}`
    case 'app_launch': return `Launch app: ${args.target ?? 'unknown'}`
    case 'app_click': return `Click: ${args.selector ?? 'unknown'}`
    case 'app_verify': return `Verify: ${args.assertion ?? 'unknown'} on ${args.selector ?? ''}`
    case 'app_screenshot': return 'Take screenshot'
    case 'app_screenshot_diff': return `Compare with baseline: ${args.baseline ?? ''}`
    case 'market_quote': return `Get quote: ${args.symbol ?? 'unknown'}`
    case 'market_kline': return `Get K-line: ${args.symbol ?? 'unknown'}`
    case 'run_backtest': return `Backtest: ${args.strategyName ?? 'unknown'}`
    default: return `Use ${tool}`
  }
}

function deduplicateSteps(steps: WorkflowStep[]): WorkflowStep[] {
  const seen = new Map<string, WorkflowStep>()
  const result: WorkflowStep[] = []

  for (const step of steps) {
    const key = `${step.tool}::${JSON.stringify(step.argsPattern)}`
    if (!seen.has(key)) {
      seen.set(key, step)
      result.push(step)
    }
  }
  return result
}

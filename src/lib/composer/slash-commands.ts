interface CommandCatalogCategory {
  name: string
  pairs: [string, string][]
}

export interface CommandsCatalogResponse {
  canon?: Record<string, string>
  categories?: CommandCatalogCategory[]
  pairs?: [string, string][]
  skill_count?: number
  sub?: Record<string, string[]>
  warning?: string
}

export interface SlashCommandItem {
  category?: string
  command: string
  description: string
}

export interface SlashExecResponse {
  output?: string
  warning?: string
}

export type CommandDispatchResponse =
  | { output?: string; type: 'exec' | 'plugin' }
  | { target: string; type: 'alias' }
  | { message?: string; name: string; notice?: string; type: 'skill' }
  | { message: string; notice?: string; type: 'send' }

function inlineCommandErrorMessage(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : fallback

  return (raw.match(/Error invoking remote method '[^']+': Error: (.+)$/)?.[1] ?? raw).replace(/^Error:\s*/, '').trim()
}

export function commandPairs(catalog: CommandsCatalogResponse): SlashCommandItem[] {
  const seen = new Set<string>()
  const items: SlashCommandItem[] = []

  for (const category of catalog.categories ?? []) {
    for (const [command, description] of category.pairs ?? []) {
      if (!command || seen.has(command)) continue
      seen.add(command)
      items.push({ category: category.name, command, description })
    }
  }

  for (const [command, description] of catalog.pairs ?? []) {
    if (!command || seen.has(command)) continue
    seen.add(command)
    items.push({ command, description })
  }

  return items
}

export function renderSlashOutput(command: string, result: SlashExecResponse | undefined): string {
  const output = result?.output?.trim() || '(no output)'
  const warning = result?.warning?.trim()

  return [`slash:${command}`, warning ? `warning: ${warning}` : '', output].filter(Boolean).join('\n')
}

export function parseSlashCommand(command: string): { arg: string; name: string } {
  const match = command.replace(/^\/+/, '').match(/^(\S+)\s*(.*)$/)
  return match ? { arg: match[2].trim(), name: match[1] } : { arg: '', name: '' }
}

export function isCommandNotFoundError(error: unknown): boolean {
  const message = inlineCommandErrorMessage(error, '').toLowerCase()

  return (
    /not a quick\/plugin\/skill command/.test(message) ||
    /unknown (slash )?command/.test(message) ||
    /command not found/.test(message) ||
    /not a slash command/.test(message)
  )
}

export function commandNotFoundMessage(name: string): string {
  return `Command not found: /${name}`
}

export function slashExecCommand(command: string): string {
  return command.replace(/^\/+/, '')
}

export function isReloadMcpCommand(command: string): boolean {
  const normalized = slashExecCommand(command).split(/\s+/, 1)[0]?.toLowerCase() ?? ''

  return normalized === 'reload-mcp' || normalized === 'reload_mcp'
}

export function parseCommandDispatch(raw: unknown): CommandDispatchResponse | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null

  const record = raw as Record<string, unknown>
  const type = typeof record.type === 'string' ? record.type : ''

  if (type === 'exec' || type === 'plugin') {
    return {
      output: typeof record.output === 'string' ? record.output : undefined,
      type
    }
  }

  if (type === 'alias') {
    const target = typeof record.target === 'string' ? record.target : ''
    return target ? { target, type } : null
  }

  if (type === 'skill') {
    const name = typeof record.name === 'string' ? record.name : ''
    return {
      message: typeof record.message === 'string' ? record.message : undefined,
      name,
      notice: typeof record.notice === 'string' ? record.notice : undefined,
      type
    }
  }

  if (type === 'send') {
    const message = typeof record.message === 'string' ? record.message : ''
    return {
      message,
      notice: typeof record.notice === 'string' ? record.notice : undefined,
      type
    }
  }

  return null
}

export function shouldDispatchSlashImmediately(draft: string, busy = false): boolean {
  void busy
  return draft.trim().startsWith('/')
}

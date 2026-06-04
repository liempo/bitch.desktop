const THINKING_STATUS_PREFIX_RE =
  /^\s*(?:(?:[^\s.]{1,16})\s+)?(?:processing|thinking|reasoning|analyzing|pondering|contemplating|musing|cogitating|ruminating|deliberating|mulling|reflecting|computing|synthesizing|formulating|brainstorming)\.\.\.\s*/i

const EMPTY_THINKING_PLACEHOLDER_RE =
  /\b(?:current rewritten thinking|next thinking to process|provide the thinking content|don't see any .*thinking)\b/i

/**
 * Normalize gateway payload text from strings, OpenAI-style content parts, or
 * small structured payloads. Mirrors the upstream Hermes desktop helper but
 * keeps this repo's dependency surface surgical. Chrome restraint, for once.
 */
export function coerceGatewayText(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  if (value === null || value === undefined) {
    return ''
  }

  if (Array.isArray(value)) {
    return value
      .map(item => {
        if (typeof item === 'string') {
          return item
        }

        if (item && typeof item === 'object') {
          const row = item as Record<string, unknown>

          if (typeof row.text === 'string') {
            return row.text
          }

          if (typeof row.output_text === 'string') {
            return row.output_text
          }
        }

        return ''
      })
      .join('')
  }

  if (typeof value === 'object') {
    const row = value as Record<string, unknown>

    if (typeof row.text === 'string') {
      return row.text
    }

    if (typeof row.output_text === 'string') {
      return row.output_text
    }

    try {
      return JSON.stringify(value)
    } catch {
      return ''
    }
  }

  return String(value)
}

/**
 * Normalize real reasoning/thinking payloads. We strip spinner-ish prefixes and
 * known placeholder echoes but preserve whitespace between token deltas.
 */
export function coerceThinkingText(value: unknown): string {
  const raw = coerceGatewayText(value).replace(THINKING_STATUS_PREFIX_RE, '')

  return EMPTY_THINKING_PLACEHOLDER_RE.test(raw) ? '' : raw
}

export function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

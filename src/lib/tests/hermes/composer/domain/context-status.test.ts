import { describe, expect, it } from 'vitest'

import { buildContextStatusViewModel, type ContextStatusViewModel } from '$lib/hermes/composer'

function rowsByLabel(viewModel: ContextStatusViewModel): Record<string, string> {
  return Object.fromEntries(viewModel.sections.flatMap(section => section.rows.map(row => [row.label, row.value])))
}

describe('context status metadata normalization', () => {
  it('summarizes populated runtime, model, token, attachment, and lineage metadata', () => {
    const viewModel = buildContextStatusViewModel({
      attachmentsCount: 2,
      connected: true,
      conversation: {
        branch: 'feat/context-usage-popover',
        busy: true,
        cwd: '/box/project',
        fast: true,
        model: 'gpt-5.5',
        provider: 'openai',
        reasoningEffort: 'high',
        usage: {
          calls: 3,
          context_max: 32_000,
          context_percent: 27.5,
          context_used: 8_800,
          cost_usd: 0.123456,
          input: 2_500,
          output: 900,
          total: 3_400
        }
      },
      lineageSegmentCount: 3,
      modelInfo: {
        auto_context_length: 32_000,
        config_context_length: 128_000,
        effective_context_length: 32_000,
        model: 'gpt-5.5',
        provider: 'openai'
      },
      profileName: 'ops',
      runtimeSessionId: 'live-456',
      selectedSession: {
        id: 'stored-123',
        input_tokens: 2_000,
        is_active: true,
        message_count: 9,
        model: 'claude-stored',
        output_tokens: 500,
        tool_call_count: 4
      },
      sessionId: 'stored-123',
      storedSessionId: 'stored-123'
    })

    expect(viewModel.trigger.label).toBe('CTX 27.5%')
    expect(viewModel.trigger.tone).toBe('active')
    expect(viewModel.summary).toBe('openai / gpt-5.5 · 8.8K / 32K tokens (27.5%)')
    expect(rowsByLabel(viewModel)).toMatchObject({
      Attachments: '2 staged',
      Compression: 'lineage visible (3 segments); exact compression state unavailable',
      'Context usage': '8.8K / 32K tokens (27.5%)',
      'Message tokens': '2.5K in / 900 out / 3.4K total',
      Model: 'openai / gpt-5.5',
      'Model context': '32K effective (128K config, 32K auto)',
      Profile: 'ops',
      Reasoning: 'high · fast on',
      Session: 'stored-123 → live-456',
      Status: 'running',
      Workspace: '/box/project @ feat/context-usage-popover'
    })
  })

  it('falls back to persisted session metadata when live runtime fields are partial', () => {
    const viewModel = buildContextStatusViewModel({
      attachmentsCount: 0,
      connected: true,
      conversation: null,
      lineageSegmentCount: 1,
      modelInfo: null,
      profileName: 'default',
      runtimeSessionId: null,
      selectedSession: {
        id: 'stored-partial',
        input_tokens: 640,
        is_active: false,
        message_count: 5,
        model: 'claude-stored',
        output_tokens: 160,
        tool_call_count: 2
      },
      sessionId: 'stored-partial',
      storedSessionId: 'stored-partial'
    })

    expect(viewModel.trigger.label).toBe('CTX ?')
    expect(viewModel.trigger.tone).toBe('warning')
    expect(viewModel.summary).toBe('claude-stored · context usage unavailable')
    expect(rowsByLabel(viewModel)).toMatchObject({
      Attachments: 'none staged',
      Compression: 'unavailable — Hermes has not reported compression state',
      'Context usage': 'unavailable — no context usage reported by Hermes dashboard/gateway',
      'Message tokens': '640 in / 160 out / 800 total',
      Model: 'claude-stored',
      'Model context': 'unavailable — /api/model/info has not returned context length',
      Profile: 'default',
      Reasoning: 'unavailable — runtime did not report reasoning or fast mode',
      Session: 'stored-partial',
      Status: 'idle',
      Workspace: 'unavailable — runtime did not report cwd or branch'
    })
  })

  it('renders an explicit unavailable state instead of inventing numbers', () => {
    const viewModel = buildContextStatusViewModel({
      attachmentsCount: 0,
      connected: false,
      conversation: null,
      lineageSegmentCount: 0,
      modelError: 'dashboard unavailable',
      modelInfo: null,
      profileName: null,
      runtimeSessionId: null,
      selectedSession: null,
      sessionId: null,
      storedSessionId: null
    })

    expect(viewModel.trigger.label).toBe('CTX N/A')
    expect(viewModel.trigger.tone).toBe('unavailable')
    expect(viewModel.summary).toBe('gateway disconnected · context usage unavailable')
    expect(rowsByLabel(viewModel)).toMatchObject({
      Attachments: 'none staged',
      Compression: 'unavailable — no active session lineage',
      'Context usage': 'unavailable — no active session',
      'Message tokens': 'unavailable — no stored session token counters',
      Model: 'unavailable — dashboard unavailable',
      'Model context': 'unavailable — /api/model/info has not returned context length',
      Profile: 'unavailable — no profile selected',
      Reasoning: 'unavailable — runtime did not report reasoning or fast mode',
      Session: 'no active session',
      Status: 'gateway disconnected',
      Workspace: 'unavailable — runtime did not report cwd or branch'
    })
  })
})

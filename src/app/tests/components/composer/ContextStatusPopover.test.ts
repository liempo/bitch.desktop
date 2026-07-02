import { render } from 'svelte/server'
import { describe, expect, it } from 'vitest'

import ContextStatusPopover from '../../../components/composer/ContextStatusPopover.svelte'
import type { ContextStatusViewModel } from '$lib/hermes/composer'

function viewModel(overrides: Partial<ContextStatusViewModel> = {}): ContextStatusViewModel {
  return {
    sections: [
      {
        id: 'runtime',
        title: 'Runtime',
        rows: [
          { label: 'Model', tone: 'available', value: 'openai / gpt-5.5' },
          { label: 'Context usage', tone: 'available', value: '8.8K / 32K tokens (27.5%)' },
          {
            label: 'Compression',
            tone: 'warning',
            value: 'lineage visible (3 segments); exact compression state unavailable'
          }
        ]
      }
    ],
    summary: 'openai / gpt-5.5 · 8.8K / 32K tokens (27.5%)',
    trigger: { label: 'CTX 27.5%', title: 'Context usage: 8.8K / 32K tokens (27.5%)', tone: 'active' },
    ...overrides
  }
}

describe('ContextStatusPopover UI', () => {
  it('renders populated context metadata in the popover body', () => {
    const { body } = render(ContextStatusPopover, { props: { viewModel: viewModel() } })

    expect(body).toContain('CTX 27.5%')
    expect(body).toContain('Context usage')
    expect(body).toContain('8.8K / 32K tokens (27.5%)')
    expect(body).toContain('lineage visible (3 segments); exact compression state unavailable')
  })

  it('renders partial metadata warnings without dropping the popover rows', () => {
    const { body } = render(ContextStatusPopover, {
      props: {
        viewModel: viewModel({
          sections: [
            {
              id: 'runtime',
              title: 'Runtime',
              rows: [
                { label: 'Model', tone: 'available', value: 'claude-stored' },
                {
                  label: 'Context usage',
                  tone: 'warning',
                  value: 'unavailable — no context usage reported by Hermes dashboard/gateway'
                }
              ]
            }
          ],
          summary: 'claude-stored · context usage unavailable',
          trigger: { label: 'CTX ?', title: 'Context usage unavailable', tone: 'warning' }
        })
      }
    })

    expect(body).toContain('CTX ?')
    expect(body).toContain('claude-stored')
    expect(body).toContain('unavailable — no context usage reported by Hermes dashboard/gateway')
  })

  it('renders the explicit unavailable state when no active session data exists', () => {
    const { body } = render(ContextStatusPopover, {
      props: {
        viewModel: viewModel({
          sections: [
            {
              id: 'runtime',
              title: 'Runtime',
              rows: [
                { label: 'Status', tone: 'unavailable', value: 'gateway disconnected' },
                { label: 'Session', tone: 'unavailable', value: 'no active session' },
                { label: 'Context usage', tone: 'unavailable', value: 'unavailable — no active session' }
              ]
            }
          ],
          summary: 'gateway disconnected · context usage unavailable',
          trigger: { label: 'CTX N/A', title: 'Context usage unavailable', tone: 'unavailable' }
        })
      }
    })

    expect(body).toContain('CTX N/A')
    expect(body).toContain('gateway disconnected')
    expect(body).toContain('no active session')
    expect(body).toContain('unavailable — no active session')
  })
})

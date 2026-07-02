// @vitest-environment jsdom
import { render, screen } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import ContextStatusPopover from '../../../components/composer/ContextStatusPopover.svelte'
import type { ContextStatusViewModel } from '$lib/hermes/composer'

afterEach(() => {
  document.body.innerHTML = ''
})

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
  it('renders populated context metadata in the popover body', async () => {
    const user = userEvent.setup()
    render(ContextStatusPopover, { viewModel: viewModel() })

    const trigger = screen.getByRole('button', { name: 'Open context status popover' })
    expect(trigger).toHaveTextContent('CTX 27.5%')

    await user.click(trigger)

    expect(screen.getByText('Context usage')).toBeInTheDocument()
    expect(screen.getByText('8.8K / 32K tokens (27.5%)')).toBeInTheDocument()
    expect(screen.getByText('lineage visible (3 segments); exact compression state unavailable')).toBeInTheDocument()
  })

  it('renders partial metadata warnings without dropping the popover rows', async () => {
    const user = userEvent.setup()
    render(ContextStatusPopover, {
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
    })

    const trigger = screen.getByRole('button', { name: 'Open context status popover' })
    expect(trigger).toHaveTextContent('CTX ?')

    await user.click(trigger)

    expect(screen.getByText('claude-stored')).toBeInTheDocument()
    expect(screen.getByText('unavailable — no context usage reported by Hermes dashboard/gateway')).toBeInTheDocument()
  })

  it('renders the explicit unavailable state when no active session data exists', async () => {
    const user = userEvent.setup()
    render(ContextStatusPopover, {
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
    })

    const trigger = screen.getByRole('button', { name: 'Open context status popover' })
    expect(trigger).toHaveTextContent('CTX N/A')

    await user.click(trigger)

    expect(screen.getByText('gateway disconnected')).toBeInTheDocument()
    expect(screen.getByText('no active session')).toBeInTheDocument()
    expect(screen.getByText('unavailable — no active session')).toBeInTheDocument()
  })
})

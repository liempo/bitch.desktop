// @vitest-environment jsdom
import { render, screen } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import UiFoundationFixture from './UiFoundationFixture.svelte'

describe('shared UI component DOM harness', () => {
  it('renders accessible shared controls and handles real user interaction', async () => {
    const user = userEvent.setup()

    render(UiFoundationFixture)

    expect(screen.getByRole('region', { name: 'Foundation component panel' })).toBeInTheDocument()
    expect(screen.getByText('Foundation Panel')).toBeInTheDocument()
    expect(screen.getByText('dom')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Activate harness' }))

    expect(screen.getByText('count: 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Profile picker' })).toHaveTextContent(/PROFILE\s*:\s*default/)
  })
})

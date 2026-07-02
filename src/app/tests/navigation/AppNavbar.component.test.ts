// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import AppNavbar from '../../navigation/AppNavbar.svelte'
import { appRouterState } from '../../router.svelte'
import { sessionState } from '$lib/hermes/sessions'

function resetNavigationState(): void {
  appRouterState.page = 'main'
  sessionState.storedSessionId = null
}

beforeEach(resetNavigationState)

afterEach(() => {
  cleanup()
  resetNavigationState()
})

describe('AppNavbar UI', () => {
  it('renders text-only BITCH branding and the canonical desktop navigation links', () => {
    const { container } = render(AppNavbar)
    const nav = screen.getByRole('navigation', { name: 'Primary navigation' })

    expect(screen.getByRole('link', { name: 'BITCH' })).toHaveAttribute('href', '#/main')
    expect(within(nav).queryByRole('img')).not.toBeInTheDocument()
    expect(container.querySelector('canvas')).not.toBeInTheDocument()

    for (const label of ['AGENT', 'ASSETS', 'CALENDAR', 'CRON', 'KANBAN']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument()
    }
  })

  it('points AGENT navigation at the last selected stored session', () => {
    sessionState.storedSessionId = 'stored-session'

    render(AppNavbar)

    expect(screen.getByRole('link', { name: 'AGENT' })).toHaveAttribute('href', '#/agent/stored-session')
  })

  it('marks the active page and exposes Settings as an accessible icon link', () => {
    appRouterState.page = 'settings'

    render(AppNavbar)

    const settingsLinks = screen.getAllByRole('link', { name: 'Open settings' })
    expect(settingsLinks).toHaveLength(2)
    for (const link of settingsLinks) {
      expect(link).toHaveAttribute('href', '#/settings')
      expect(link).toHaveAttribute('aria-current', 'page')
    }
  })

  it('opens the mobile navigation popover and closes it after choosing a destination', async () => {
    const user = userEvent.setup()

    render(AppNavbar)

    const trigger = screen.getByRole('button', { name: 'Open navigation menu' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await user.click(trigger)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(await screen.findByText('navigation')).toBeInTheDocument()
    expect(screen.getAllByText('MAIN').at(-1)?.closest('a')).toHaveAttribute('aria-current', 'page')
    expect(screen.getAllByText('SETTINGS').at(-1)?.closest('a')).toHaveAttribute('href', '#/settings')

    const assetsLink = screen.getAllByText('ASSETS').at(-1)?.closest('a')
    expect(assetsLink).toHaveAttribute('href', '#/assets')
    await user.click(assetsLink!)

    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'false')
    })
  })
})

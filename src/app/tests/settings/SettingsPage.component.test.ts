// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'

import SettingsPage from '../../settings/SettingsPage.svelte'
import { namespacedStorageKey } from '$lib/storage'

const notificationPreferencesKey = namespacedStorageKey('notificationPreferences.v1')

describe('Settings notification controls', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('persists per-category notification toggles from the Settings page', async () => {
    const user = userEvent.setup()

    render(SettingsPage)

    const cronFailed = screen.getByRole('checkbox', { name: /Cron failed/i })
    const kanbanUpdate = screen.getByRole('checkbox', { name: /Kanban update/i })

    expect(cronFailed).toBeChecked()
    expect(kanbanUpdate).toBeChecked()

    await user.click(cronFailed)
    await user.click(kanbanUpdate)

    expect(cronFailed).not.toBeChecked()
    expect(kanbanUpdate).not.toBeChecked()
    expect(JSON.parse(window.localStorage.getItem(notificationPreferencesKey) ?? '{}')).toMatchObject({
      cronFailed: false,
      kanbanUpdate: false
    })
  })
})

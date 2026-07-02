import { describe, expect, it, vi } from 'vitest'

const invokeTauriCommand = vi.fn()

vi.mock('$lib/platform/tauri', () => ({
  invokeTauriCommand: (command: string) => invokeTauriCommand(command)
}))

describe('source updater platform adapter', () => {
  it('checks and runs source updates through native updater commands', async () => {
    const { checkSourceUpdate, runSourceUpdate } = await import('$lib/platform/updater')
    invokeTauriCommand.mockResolvedValueOnce({
      sourceDir: '/dev/bitch',
      installPath: '/Users/me/Applications/BITCH.app',
      sourceExists: true,
      dirty: false,
      updateAvailable: true
    })
    invokeTauriCommand.mockResolvedValueOnce({
      sourceDir: '/dev/bitch',
      installPath: '/Users/me/Applications/BITCH.app',
      updated: true,
      steps: []
    })

    await expect(checkSourceUpdate()).resolves.toMatchObject({ updateAvailable: true, sourceDir: '/dev/bitch' })
    await expect(runSourceUpdate()).resolves.toMatchObject({ updated: true })

    expect(invokeTauriCommand).toHaveBeenNthCalledWith(1, 'check_source_update')
    expect(invokeTauriCommand).toHaveBeenNthCalledWith(2, 'run_source_update')
  })
})

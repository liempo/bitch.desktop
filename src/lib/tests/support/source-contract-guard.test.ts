import { describe, expect, it } from 'vitest'

type SourceContractGuard = {
  evaluateSourceContractInventory: (input: {
    allowlist: Array<{
      path: string
      disposition: string
      owner: string
      rationale: string
    }>
    discovered: Array<{ path: string; markers: string[] }>
    docsText: string
  }) => {
    ok: boolean
    counts: { discovered: number; keep: number; migration: number }
    unlisted: string[]
    staleAllowlist: string[]
    undocumented: string[]
    invalidAllowlistEntries: string[]
  }
  findSourceContractMarkers: (source: string) => string[]
}

async function loadGuard(): Promise<SourceContractGuard> {
  const moduleUrl = new URL('../../../../scripts/check-source-contracts.mjs', import.meta.url).href
  return (await import(/* @vite-ignore */ moduleUrl)) as SourceContractGuard
}

describe('source-contract validation guard', () => {
  it('recognizes raw-source and file-text test markers without matching ordinary assertions', async () => {
    const guard = await loadGuard()

    expect(guard.findSourceContractMarkers("import source from './Widget.svelte?raw'\n")).toEqual(['?raw'])
    expect(guard.findSourceContractMarkers("readFileSync('docs/testing.md', 'utf8')\n")).toEqual(['readFileSync('])
    expect(guard.findSourceContractMarkers("expect(label).toContain('real DOM text')\n")).toEqual([])
  })

  it('fails new raw-source/file-text tests that are not in the allowlist', async () => {
    const guard = await loadGuard()

    const result = guard.evaluateSourceContractInventory({
      allowlist: [
        {
          path: 'src/lib/tests/support/architecture-boundaries.test.ts',
          disposition: 'KEEP',
          owner: 'architecture boundary support',
          rationale: 'forbidden import source tripwire'
        }
      ],
      discovered: [
        {
          path: 'src/lib/tests/support/architecture-boundaries.test.ts',
          markers: ['?raw']
        },
        {
          path: 'src/app/tests/new-page.test.ts',
          markers: ['?raw']
        }
      ],
      docsText: 'src/lib/tests/support/architecture-boundaries.test.ts'
    })

    expect(result.ok).toBe(false)
    expect(result.unlisted).toEqual(['src/app/tests/new-page.test.ts'])
    expect(result.staleAllowlist).toEqual([])
  })

  it('requires every retained source-contract test to be metadata-rich and documented', async () => {
    const guard = await loadGuard()

    const result = guard.evaluateSourceContractInventory({
      allowlist: [
        {
          path: 'src/app/tests/startup-branding.test.ts',
          disposition: 'KEEP',
          owner: 'startup branding / native packaging',
          rationale: 'pre-bundle splash markup and generated icon list are source artifacts'
        },
        {
          path: 'src/app/tests/undocumented.test.ts',
          disposition: 'KEEP',
          owner: '   ',
          rationale: ''
        }
      ],
      discovered: [
        {
          path: 'src/app/tests/startup-branding.test.ts',
          markers: ['?raw']
        },
        {
          path: 'src/app/tests/undocumented.test.ts',
          markers: ['readFileSync(']
        }
      ],
      docsText: 'src/app/tests/startup-branding.test.ts'
    })

    expect(result.ok).toBe(false)
    expect(result.undocumented).toEqual(['src/app/tests/undocumented.test.ts'])
    expect(result.invalidAllowlistEntries).toEqual(['src/app/tests/undocumented.test.ts'])
  })

  it('reports before/after-ready counts for keep and migration dispositions', async () => {
    const guard = await loadGuard()

    const result = guard.evaluateSourceContractInventory({
      allowlist: [
        {
          path: 'src/lib/tests/support/architecture-boundaries.test.ts',
          disposition: 'KEEP',
          owner: 'architecture boundary support',
          rationale: 'forbidden import source tripwire'
        },
        {
          path: 'src/app/tests/main/MainPage.test.ts',
          disposition: 'REPLACE_WITH_UI',
          owner: 'MAIN route',
          rationale: 'route behavior should move to Playwright coverage'
        }
      ],
      discovered: [
        {
          path: 'src/lib/tests/support/architecture-boundaries.test.ts',
          markers: ['?raw']
        },
        {
          path: 'src/app/tests/main/MainPage.test.ts',
          markers: ['?raw']
        }
      ],
      docsText: 'src/lib/tests/support/architecture-boundaries.test.ts\nsrc/app/tests/main/MainPage.test.ts'
    })

    expect(result.ok).toBe(true)
    expect(result.counts).toEqual({ discovered: 2, keep: 1, migration: 1 })
  })
})

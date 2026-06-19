/// <reference types="node" />

import { execFile } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'

import agentsSource from '../../../AGENTS.md?raw'
import upstreamSyncGuide from '../../../docs/upstream-sync.md?raw'
import packageJsonSource from '../../../package.json?raw'
import manifestSource from '../../../scripts/hermes-upstream-sync.json?raw'

const execFileAsync = promisify(execFile)
const syncScript = join(process.cwd(), 'scripts/sync-hermes-upstream.mjs')

type PackageJson = {
  scripts: Record<string, string>
}

type UpstreamSyncManifest = {
  groups: Record<
    string,
    {
      cadence: string
      description: string
      mirrors: Array<{
        format?: string
        id: string
        local: string
        upstream: string
      }>
    }
  >
}

const packageJson = JSON.parse(packageJsonSource) as PackageJson
const manifest = JSON.parse(manifestSource) as UpstreamSyncManifest

describe('Hermes upstream sync contract', () => {
  it('exposes transport sync, transport drift detection, and the type-sync companion path', () => {
    expect(packageJson.scripts['sync:transport']).toBe('node scripts/sync-hermes-upstream.mjs --group transport')
    expect(packageJson.scripts['check:transport-drift']).toBe(
      'node scripts/sync-hermes-upstream.mjs --group transport --check'
    )
    expect(packageJson.scripts['sync:types']).toBe('node scripts/sync-hermes-upstream.mjs --group types')
    expect(packageJson.scripts['check:upstream-sync']).toBe('node scripts/sync-hermes-upstream.mjs --group all --check')
  })

  it('registers the vendored JSON-RPC transport and reserves an explicit type-mirror group', () => {
    const transportMirror = manifest.groups.transport.mirrors.find(
      mirror => mirror.local === 'src/lib/gateway/json-rpc-gateway.ts'
    )

    expect(transportMirror).toMatchObject({
      id: 'json-rpc-gateway',
      format: 'prettier'
    })
    expect(transportMirror?.upstream).toBe(
      'https://raw.githubusercontent.com/NousResearch/hermes-agent/main/apps/shared/src/json-rpc-gateway.ts'
    )
    expect(manifest.groups.transport.cadence).toContain('monthly')
    expect(manifest.groups.types.description).toContain('TypeScript types')
    expect(manifest.groups.types.mirrors).toEqual([])
  })

  it('documents the monthly cadence, drift check, type-sync no-op, and manual Tauri bridge review', () => {
    expect(upstreamSyncGuide).toContain('monthly')
    expect(upstreamSyncGuide).toContain('npm run check:transport-drift')
    expect(upstreamSyncGuide).toContain('npm run sync:transport')
    expect(upstreamSyncGuide).toContain('npm run sync:types')
    expect(upstreamSyncGuide).toContain('src-tauri/src/lib.rs')
    expect(upstreamSyncGuide).toContain('git diff -- src/lib/gateway/json-rpc-gateway.ts')
    expect(agentsSource).toContain('npm run check:transport-drift')
    expect(agentsSource).toContain('docs/upstream-sync.md')
  })
})

describe('sync-hermes-upstream CLI', () => {
  it('fails check mode on drift, writes the mirrored file on sync, then passes check mode', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bitch-upstream-sync-'))
    const upstream = join(root, 'upstream.ts')
    const local = join(root, 'local.ts')
    const manifestPath = join(root, 'manifest.json')

    await writeFile(upstream, "export const fromUpstream = 'new'\n", 'utf8')
    await writeFile(local, "export const fromUpstream = 'old'\n", 'utf8')
    await writeFile(
      manifestPath,
      JSON.stringify({
        version: 1,
        groups: {
          transport: {
            description: 'fixture transport mirror',
            cadence: 'fixture cadence',
            mirrors: [
              {
                id: 'fixture-transport',
                upstream: pathToFileURL(upstream).href,
                local,
                format: false
              }
            ]
          },
          types: {
            description: 'fixture type mirrors',
            cadence: 'fixture cadence',
            mirrors: []
          }
        }
      }),
      'utf8'
    )

    await expect(
      execFileAsync(process.execPath, [syncScript, '--manifest', manifestPath, '--group', 'transport', '--check'])
    ).rejects.toMatchObject({ code: 1 })

    await execFileAsync(process.execPath, [syncScript, '--manifest', manifestPath, '--group', 'transport'])
    await expect(readFile(local, 'utf8')).resolves.toBe("export const fromUpstream = 'new'\n")
    await expect(
      execFileAsync(process.execPath, [syncScript, '--manifest', manifestPath, '--group', 'transport', '--check'])
    ).resolves.toMatchObject({ stdout: expect.stringContaining('No upstream drift detected') })
  })

  it('keeps the companion type-sync path as a successful no-op until mirrored types are registered', async () => {
    const { stdout } = await execFileAsync(process.execPath, [syncScript, '--group', 'types', '--check'])

    expect(stdout).toContain('No upstream mirrors registered for group "types"')
    expect(stdout).toContain('TypeScript types')
  })
})

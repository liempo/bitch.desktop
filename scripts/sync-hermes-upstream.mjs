#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_MANIFEST = path.join(ROOT, 'scripts/hermes-upstream-sync.json')

function usage() {
  return `Usage: node scripts/sync-hermes-upstream.mjs [--group transport|types|all] [--check] [--manifest path]

Synchronizes Hermes upstream files declared in scripts/hermes-upstream-sync.json.

Modes:
  --check    Detect drift and exit non-zero without writing files.
  sync       Default mode; writes mirrored files and prints the manual review checklist.
`
}

function parseArgs(argv) {
  const args = {
    check: false,
    group: 'transport',
    manifest: DEFAULT_MANIFEST
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--check') {
      args.check = true
      continue
    }

    if (arg === '--help' || arg === '-h') {
      args.help = true
      continue
    }

    if (arg === '--group') {
      args.group = argv[index + 1]
      index += 1
      continue
    }

    if (arg.startsWith('--group=')) {
      args.group = arg.slice('--group='.length)
      continue
    }

    if (arg === '--manifest') {
      args.manifest = argv[index + 1]
      index += 1
      continue
    }

    if (arg.startsWith('--manifest=')) {
      args.manifest = arg.slice('--manifest='.length)
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  if (!args.group) {
    throw new Error('--group requires a value')
  }

  if (!args.manifest) {
    throw new Error('--manifest requires a value')
  }

  return args
}

function resolveFromRoot(value) {
  return path.isAbsolute(value) ? value : path.join(ROOT, value)
}

async function loadManifest(manifestPath) {
  const resolved = resolveFromRoot(manifestPath)
  const raw = await readFile(resolved, 'utf8')
  const manifest = JSON.parse(raw)

  if (!manifest.groups || typeof manifest.groups !== 'object') {
    throw new Error(`Manifest ${resolved} must define a groups object`)
  }

  return manifest
}

async function fetchUpstream(upstream) {
  if (upstream.startsWith('file:')) {
    return readFile(fileURLToPath(upstream), 'utf8')
  }

  if (upstream.startsWith('http://') || upstream.startsWith('https://')) {
    const response = await fetch(upstream)

    if (!response.ok) {
      throw new Error(`Failed to fetch ${upstream}: ${response.status} ${response.statusText}`)
    }

    return response.text()
  }

  return readFile(resolveFromRoot(upstream), 'utf8')
}

async function normalizeContent(content, mirror, localPath) {
  if (mirror.format !== 'prettier') {
    return content
  }

  const prettier = await import('prettier')
  const config = (await prettier.resolveConfig(localPath)) ?? {}

  return prettier.format(content, {
    ...config,
    filepath: localPath
  })
}

function selectedGroupNames(manifest, group) {
  if (group === 'all') {
    return Object.keys(manifest.groups)
  }

  if (!manifest.groups[group]) {
    throw new Error(`Unknown sync group "${group}". Available groups: ${Object.keys(manifest.groups).join(', ')}`)
  }

  return [group]
}

async function readExisting(localPath) {
  try {
    return await readFile(localPath, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null
    }

    throw error
  }
}

async function processMirror({ check, mirror }) {
  const localPath = resolveFromRoot(mirror.local)
  const upstream = await fetchUpstream(mirror.upstream)
  const normalized = await normalizeContent(upstream, mirror, localPath)
  const existing = await readExisting(localPath)

  if (check) {
    if (existing !== normalized) {
      console.error(`Upstream drift detected for ${mirror.local} (${mirror.id})`)
      return false
    }

    console.log(`No drift: ${mirror.local}`)
    return true
  }

  await mkdir(path.dirname(localPath), { recursive: true })

  if (existing === normalized) {
    console.log(`Already current: ${mirror.local}`)
    return true
  }

  await writeFile(localPath, normalized, 'utf8')
  console.log(`Synced ${mirror.local} from ${mirror.upstream}`)
  return true
}

function printReviewChecklist(manifest) {
  const checklist = Array.isArray(manifest.reviewChecklist) ? manifest.reviewChecklist : []

  if (checklist.length === 0) {
    return
  }

  console.log('\nManual review required before committing:')
  for (const item of checklist) {
    console.log(`- ${item}`)
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (args.help) {
    console.log(usage())
    return
  }

  const manifest = await loadManifest(args.manifest)
  const groupNames = selectedGroupNames(manifest, args.group)
  let allClean = true

  for (const groupName of groupNames) {
    const group = manifest.groups[groupName]
    const mirrors = Array.isArray(group.mirrors) ? group.mirrors : []

    if (mirrors.length === 0) {
      console.log(`No upstream mirrors registered for group "${groupName}" (${group.description}).`)
      continue
    }

    console.log(`${args.check ? 'Checking' : 'Syncing'} ${groupName}: ${group.description}`)
    for (const mirror of mirrors) {
      const clean = await processMirror({ check: args.check, mirror })
      allClean = clean && allClean
    }
  }

  if (args.check) {
    if (allClean) {
      console.log('No upstream drift detected for selected Hermes mirrors.')
    } else {
      console.error(
        '\nRun npm run sync:transport, inspect the diff, and adapt local Tauri bridge code before committing.'
      )
      process.exitCode = 1
    }

    return
  }

  printReviewChecklist(manifest)
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})

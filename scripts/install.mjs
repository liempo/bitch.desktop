#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

const KNOWN_KEYS = new Set([
  'BITCH_DASHBOARD_AUTH_PROVIDER',
  'BITCH_DASHBOARD_PROVIDER',
  'BITCH_DASHBOARD_SESSION_TOKEN',
  'BITCH_DASHBOARD_URL',
  'BITCH_DASHBOARD_USERNAME',
  'BITCH_DASHBOARD_PASSWORD',
  'CALDAV_DISPLAY_NAME',
  'CALDAV_PASSWORD',
  'CALDAV_SYNC_INTERVAL',
  'CALDAV_URL',
  'CALDAV_USER',
  'CALDAV_USERNAME',
  'HERMES_DASHBOARD_AUTH_PROVIDER',
  'HERMES_DASHBOARD_PROVIDER',
  'HERMES_DASHBOARD_SESSION_TOKEN',
  'HERMES_DASHBOARD_URL',
  'HERMES_DASHBOARD_USERNAME',
  'HERMES_DASHBOARD_PASSWORD',
  'MONITORING_AUTH_TOKEN',
  'MONITORING_EMAIL',
  'MONITORING_IDENTITY',
  'MONITORING_PASSWORD',
  'MONITORING_SYSTEM_ID',
  'MONITORING_URL'
])

function parseArgs(argv) {
  const options = {
    bundlePaths: [],
    configOnly: false,
    dryRun: false,
    envPaths: [],
    forceConfig: false,
    home: os.homedir(),
    skipBuild: false,
    skipCopy: false
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    switch (arg) {
      case '--bundle-path':
        options.bundlePaths.push(requireValue(argv, ++index, arg))
        break
      case '--config-only':
        options.configOnly = true
        options.skipBuild = true
        options.skipCopy = true
        break
      case '--dry-run':
        options.dryRun = true
        break
      case '--env':
        options.envPaths.push(requireValue(argv, ++index, arg))
        break
      case '--force-config':
        options.forceConfig = true
        break
      case '--home':
        options.home = path.resolve(requireValue(argv, ++index, arg))
        break
      case '--skip-build':
        options.skipBuild = true
        break
      case '--skip-copy':
        options.skipCopy = true
        break
      case '--help':
      case '-h':
        printHelp()
        process.exit(0)
        break
      default:
        throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return options
}

function requireValue(argv, index, flag) {
  const value = argv[index]
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`)
  }
  return value
}

function printHelp() {
  console.log(`Usage: npm run install -- [options]

Build BITCH, copy the app bundle to ~/Applications, and migrate legacy .env values
into ~/.bitch/config.yaml when the YAML file does not exist.

Options:
  --skip-build       Do not run npm run build
  --skip-copy        Do not copy the built bundle into ~/Applications
  --config-only      Only run config migration; implies --skip-build --skip-copy
  --force-config     Rewrite ~/.bitch/config.yaml from .env values if they exist
  --env <path>       Read a specific legacy .env file; can be repeated
  --bundle-path <p>  Copy a specific built bundle path; can be repeated
  --home <path>      Override HOME for config and Applications destinations
  --dry-run          Print actions without writing files or running build
`)
}

function log(message) {
  console.log(`[install] ${message}`)
}

function run(command, args, options = {}) {
  log(`running ${[command, ...args].join(' ')}`)
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
    ...options
  })

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status ?? 'unknown'}`)
  }
}

function defaultEnvCandidates() {
  return [path.join(repoRoot, '.env'), path.join(repoRoot, 'src-tauri', '.env')]
}

function parseDotenv(contents) {
  const values = new Map()

  for (const rawLine of contents.split(/\r?\n/)) {
    let line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    if (line.startsWith('export ')) line = line.slice('export '.length).trimStart()

    const equalsIndex = line.indexOf('=')
    if (equalsIndex <= 0) continue

    const key = line.slice(0, equalsIndex).trim()
    const value = unquoteDotenvValue(line.slice(equalsIndex + 1).trim())
    if (key) values.set(key, value)
  }

  return values
}

function unquoteDotenvValue(value) {
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1)
  }

  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value
      .slice(1, -1)
      .replaceAll('\\n', '\n')
      .replaceAll('\\r', '\r')
      .replaceAll('\\t', '\t')
      .replaceAll('\\"', '"')
      .replaceAll('\\\\', '\\')
  }

  return value
}

function readLegacyEnv(envPaths) {
  const candidates = envPaths.length ? envPaths : defaultEnvCandidates()
  const values = new Map()
  const readPaths = []

  for (const candidate of candidates) {
    const filePath = path.resolve(candidate)
    if (!fs.existsSync(filePath)) continue

    const parsed = parseDotenv(fs.readFileSync(filePath, 'utf8'))
    for (const [key, value] of parsed) {
      if (!values.has(key)) values.set(key, value)
    }
    readPaths.push(filePath)
  }

  return { readPaths, values }
}

function clean(value) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function firstValue(values, keys) {
  for (const key of keys) {
    const value = clean(values.get(key))
    if (value) return value
  }
  return undefined
}

function objectWithoutEmptyEntries(object) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== undefined && value !== null && value !== '')
  )
}

function configFromEnv(values) {
  const connectionUrl = firstValue(values, ['HERMES_DASHBOARD_URL', 'BITCH_DASHBOARD_URL'])
  const connectionToken = firstValue(values, ['HERMES_DASHBOARD_SESSION_TOKEN', 'BITCH_DASHBOARD_SESSION_TOKEN'])
  const username = firstValue(values, ['HERMES_DASHBOARD_USERNAME', 'BITCH_DASHBOARD_USERNAME'])
  const password = firstValue(values, ['HERMES_DASHBOARD_PASSWORD', 'BITCH_DASHBOARD_PASSWORD'])
  const authMode = connectionToken || !username || !password ? 'token' : 'session'
  const connection = objectWithoutEmptyEntries({
    authMode,
    mode: connectionUrl || connectionToken || username || password ? 'remote' : undefined,
    token: connectionToken,
    url: connectionUrl
  })
  const hermes = objectWithoutEmptyEntries({
    authProvider: firstValue(values, ['HERMES_DASHBOARD_AUTH_PROVIDER', 'BITCH_DASHBOARD_AUTH_PROVIDER']),
    password,
    provider: firstValue(values, ['HERMES_DASHBOARD_PROVIDER', 'BITCH_DASHBOARD_PROVIDER']),
    username
  })
  const monitoring = objectWithoutEmptyEntries({
    authToken: firstValue(values, ['MONITORING_AUTH_TOKEN']),
    email: firstValue(values, ['MONITORING_EMAIL']),
    identity: firstValue(values, ['MONITORING_IDENTITY']),
    password: firstValue(values, ['MONITORING_PASSWORD']),
    systemId: firstValue(values, ['MONITORING_SYSTEM_ID']),
    url: firstValue(values, ['MONITORING_URL'])
  })
  const syncInterval = firstValue(values, ['CALDAV_SYNC_INTERVAL'])
  const calendar = objectWithoutEmptyEntries({
    displayName: firstValue(values, ['CALDAV_DISPLAY_NAME']),
    password: firstValue(values, ['CALDAV_PASSWORD']),
    syncIntervalSeconds: syncInterval && /^\d+$/.test(syncInterval) ? Number(syncInterval) : undefined,
    url: firstValue(values, ['CALDAV_URL']),
    user: firstValue(values, ['CALDAV_USER']),
    username: firstValue(values, ['CALDAV_USERNAME'])
  })
  const unknown = new Map([...values].filter(([key]) => !KNOWN_KEYS.has(key)))

  const config = {}
  if (Object.keys(connection).length) config.connection = connection
  if (Object.keys(hermes).length) config.hermes = hermes
  if (Object.keys(monitoring).length) config.monitoring = monitoring
  if (Object.keys(calendar).length) config.calendar = calendar
  for (const [key, value] of unknown) config[key] = value

  return config
}

function scalarToYaml(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'

  const text = String(value)
  if (/^[A-Za-z0-9_./:@-]+$/.test(text) && !['true', 'false', 'null', '~'].includes(text)) {
    return text
  }

  return JSON.stringify(text)
}

function appendYaml(lines, key, value, indent = 0) {
  const prefix = ' '.repeat(indent)
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    lines.push(`${prefix}${key}:`)
    for (const [childKey, childValue] of Object.entries(value)) {
      appendYaml(lines, childKey, childValue, indent + 2)
    }
    return
  }

  lines.push(`${prefix}${key}: ${scalarToYaml(value)}`)
}

function serializeYaml(config) {
  const lines = [
    '# BITCH desktop configuration migrated from legacy .env by scripts/install.mjs.',
    '# Secrets live here; do not commit this file.',
    ''
  ]

  for (const [key, value] of Object.entries(config)) {
    appendYaml(lines, key, value)
    lines.push('')
  }

  return `${lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()}\n`
}

function migrateConfig(options) {
  const configPath = path.join(options.home, '.bitch', 'config.yaml')
  const configExists = fs.existsSync(configPath)
  if (configExists && !options.forceConfig) {
    log(`${configPath} already exists; leaving it untouched`)
    return { configPath, migrated: false, reason: 'exists' }
  }

  const { readPaths, values } = readLegacyEnv(options.envPaths)
  if (!values.size) {
    log(`no legacy .env values found; ${configPath} not created`)
    return { configPath, migrated: false, reason: 'missing-env' }
  }

  const config = configFromEnv(values)
  if (!Object.keys(config).length) {
    log(`legacy .env files had no migratable values; ${configPath} not created`)
    return { configPath, migrated: false, reason: 'empty' }
  }

  const yaml = serializeYaml(config)
  const sections = Object.keys(config).join(', ')
  log(`migrating ${readPaths.length} legacy .env file(s) into ${configPath}`)
  log(`migrated config sections/keys: ${sections}`)

  if (!options.dryRun) {
    fs.mkdirSync(path.dirname(configPath), { recursive: true, mode: 0o700 })
    fs.writeFileSync(configPath, yaml, { mode: 0o600 })
  }

  return { configPath, migrated: true, reason: 'created' }
}

function findBuiltBundles(extraBundlePaths = []) {
  const explicit = extraBundlePaths
    .map(bundlePath => path.resolve(bundlePath))
    .filter(bundlePath => fs.existsSync(bundlePath))
  if (explicit.length) return explicit

  const targetDir = path.join(repoRoot, 'src-tauri', 'target')
  const bundles = []
  walk(targetDir, entry => {
    if (entry.endsWith(`${path.sep}BITCH.app`)) bundles.push(entry)
    if (/BITCH.*\.(AppImage|dmg)$/i.test(path.basename(entry))) bundles.push(entry)
  })

  return bundles.sort((left, right) => scoreBundle(right) - scoreBundle(left))
}

function scoreBundle(bundlePath) {
  const name = path.basename(bundlePath).toLowerCase()
  if (name === 'bitch.app') return 100
  if (name.endsWith('.dmg')) return 80
  if (name.endsWith('.appimage')) return 60
  return 0
}

function walk(root, visit) {
  if (!fs.existsSync(root)) return
  const stack = [root]
  while (stack.length) {
    const current = stack.pop()
    let entries = []
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      const entryPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        visit(entryPath)
        stack.push(entryPath)
      } else if (entry.isFile()) {
        visit(entryPath)
      }
    }
  }
}

function copyBundleToApplications(options) {
  const bundles = findBuiltBundles(options.bundlePaths)
  if (!bundles.length) {
    throw new Error(
      'No built BITCH bundle found under src-tauri/target. Run npm run build first or pass --bundle-path <path>.'
    )
  }

  const source = bundles[0]
  const applicationsDir = path.join(options.home, 'Applications')
  const destination = path.join(applicationsDir, path.basename(source))

  log(`copying ${source} to ${destination}`)
  if (!options.dryRun) {
    fs.mkdirSync(applicationsDir, { recursive: true })
    fs.rmSync(destination, { force: true, recursive: true })
    fs.cpSync(source, destination, { recursive: true })
    if (destination.endsWith('.AppImage')) fs.chmodSync(destination, 0o755)
  }

  return { destination, source }
}

function main() {
  if (process.env.npm_command === 'install') {
    log('skipping app install during npm install lifecycle; run npm run install to build/copy/migrate')
    return
  }

  const options = parseArgs(process.argv.slice(2))

  if (!options.skipBuild) run('npm', ['run', 'build'])
  if (!options.skipCopy) copyBundleToApplications(options)
  migrateConfig(options)

  log('done')
}

try {
  main()
} catch (error) {
  console.error(`[install] ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}

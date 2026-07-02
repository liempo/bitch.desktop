# BITCH

BITCH is a minimal Tauri + Svelte client for Hermes remote dashboard gateway access. It stays remote-only: the desktop app connects to existing Hermes dashboard backends instead of starting local Hermes processes.

## Configuration

BITCH reads local desktop configuration from:

```bash
~/.bitch/config.yaml
```

Start from the tracked example:

```bash
mkdir -p ~/.bitch
cp config.example.yaml ~/.bitch/config.yaml
```

If `~/.bitch/config.yaml` does not exist, the Tauri bridge performs a one-time import from an existing project `.env`: known BITCH keys are mapped into the sections below and unknown keys are preserved in the YAML. After that import, runtime reads the YAML file only.

The primary sections are:

```yaml
connection:
  mode: remote
  url: http://127.0.0.1:9119
  authMode: token
  token: replace-me

monitoring:
  url: http://homestation:8090
  # systemId: replace-with-beszel-system-id
  # authToken: replace-me
  # email: beszel-user@example.com
  # password: replace-me

calendar:
  url: https://calendar.example.test/dav/user/
  username: replace-me
  password: replace-me
  syncIntervalSeconds: 1800
```

`connection.url` points at the Hermes dashboard HTTP origin. Remote file preview and inline media use authenticated Hermes filesystem APIs through the Tauri bridge; the renderer does not fetch a public file-server origin or own dashboard auth headers. `connection.token` is consumed by the Tauri backend so the browser renderer does not need to set Hermes auth headers directly.

`monitoring.url` points at the Beszel hub HTTP origin used by the main dashboard. It should include the scheme and port in one value, for example `https://monitoring.airplane-skilift.ts.net` or `http://homestation:8090`; do not add a separate port setting. If you accidentally paste a Beszel page URL such as `/system/<id>`, the app will use the origin and derive the system ID.

Beszel metrics come from PocketBase collection records, not `/api/health`. The health endpoint only proves the hub is alive; `systems` and `system_stats` records usually require auth. Set either `monitoring.authToken` or `monitoring.email`/`monitoring.password` in `~/.bitch/config.yaml`. These secrets are consumed by the Tauri bridge and are not exposed through Vite. `monitoring.systemId` is optional but useful when the dashboard should target one known system.

## Development

```bash
npm install
npm run dev
```

## Local app install

```bash
npm run install
```

That command is intentionally the simple path: it runs `npm run build`, copies the built BITCH bundle into `~/Applications`, then migrates legacy `.env` values into `~/.bitch/config.yaml` if the YAML file does not already exist.

The migration is one-time and non-destructive by default:

- if `~/.bitch/config.yaml` already exists, it is left untouched;
- if a repo `.env` or `src-tauri/.env` exists, known keys are moved into `connection`, `hermes`, `monitoring`, and `calendar` sections;
- unknown legacy keys are preserved as top-level YAML keys;
- secret values are written to the local YAML file but are not printed in installer output.

Useful installer options:

```bash
npm run install -- --config-only      # migrate .env only
npm run install -- --skip-build       # copy an existing build and migrate config
npm run install -- --force-config     # rewrite config.yaml from legacy .env
```

## Useful scripts

- `npm run dev` — run the Tauri app in development mode.
- `npm run build` — build the Tauri app.
- `npm run frontend:build` — build the Vite renderer only.
- `npm run type-check` — run `svelte-check`.
- `npm run lint` — lint renderer source.
- `npm test` — run the default Vitest unit/source-contract and component sweep.
- `npm run test:unit` — run pure unit and source-contract tests only.
- `npm run test:component` — run Svelte component DOM tests with jsdom.
- `npm run test:ui` — run Playwright route-level UI tests with mocked Tauri/dashboard services.
- `npm run test:source-contracts` — inventory raw-source/file-text tests and fail when a non-allowlisted source-contract check appears.
- `npm run test:all` — run the full test pyramid: unit, component, then route UI.
- `npm run validate:full` — run the full PR validation stack: format, type-check, lint, source-contract guard, tests, build, npm audit, Knip, and whitespace checks.

See [`docs/testing.md`](docs/testing.md) for behavior-first testing, mock ownership, remote-only fixture rules, the source-contract allowlist, and the full validation sequence.

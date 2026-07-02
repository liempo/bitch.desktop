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

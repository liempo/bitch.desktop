# 07 — Deferred features (documentation only)

Not part of the first implementation pass. Captured here so the order and
upstream sources are known when they are picked up later.

## Candidates

- **Voice:** mic capture + `/api/audio/transcribe`, TTS via `/api/audio/speak`,
  and conversation mode. The HTTP bridge from plan 01 already makes the audio
  endpoints reachable.
- **Session branch:** `/branch` slash command and fork semantics
  (`session.create` with seed messages).
- **Right-rail preview:** web / file / tool-output preview pane, without the
  Electron-only terminal.
- **Settings / skills / cron / messaging:** admin routes.
- **Subagent / delegate progress:** richer nested progress UI.
- **Sync cadence:** schedule `npm run sync:transport` and consider an upstream
  type-sync script.

## Upstream files

- [composer/voice-activity.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/chat/composer/voice-activity.tsx), [use-voice-conversation.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/chat/composer/hooks/use-voice-conversation.ts)
- [hermes.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/hermes.ts) (`transcribeAudio`, `speakText`)
- [right-rail/preview-pane.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/chat/right-rail/preview-pane.tsx), [use-preview-routing.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/session/hooks/use-preview-routing.ts)
- [app/settings/](https://github.com/NousResearch/hermes-agent/tree/main/apps/desktop/src/app/settings), [app/skills/](https://github.com/NousResearch/hermes-agent/tree/main/apps/desktop/src/app/skills), [app/cron/](https://github.com/NousResearch/hermes-agent/tree/main/apps/desktop/src/app/cron)

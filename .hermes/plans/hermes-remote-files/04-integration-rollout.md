# Integration Rollout

## Documentation

Update README, AGENTS guidance, env examples, and wiki pages to describe authenticated Hermes remote-file routing. Avoid naming retired implementation plumbing as required setup.

## Validation

Run focused source-contract tests for:

- file reference parsing
- media directive rewriting
- preview sidebar hydration
- Files page authenticated API use
- message-store canvas/media extraction

Then run the standard validation stack before opening any final integration PR.

## Manual probes

Use a real remote dashboard path, not a fabricated renderer URL:

```text
@file:/tmp/hermes-remote-probe.txt
@file:`/tmp/hermes remote probe.txt`
MEDIA:/tmp/hermes-remote-probe.png
MEDIA:/tmp/hermes-remote-probe.mp3
```

The probe passes only if preview/media bytes are fetched through the authenticated remote-file bridge and missing or unsupported files produce clear UI states.

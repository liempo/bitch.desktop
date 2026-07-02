import { describe, expect, it } from 'vitest'
import { extractDiffCardSegments, parseDiffCards } from '../../../../hermes/conversations/domain/diff-cards'

const MULTI_FILE_PATCH = `diff --git a/src/app.ts b/src/app.ts
index 1111111..2222222 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,3 +1,4 @@
 import { boot } from './boot'
-const mode = 'old'
+const mode = 'new'
+const preview = true
 boot(mode)
diff --git a/docs/notes.md b/docs/notes.md
index 3333333..4444444 100644
--- a/docs/notes.md
+++ b/docs/notes.md
@@ -1,2 +1,2 @@
 # Notes
-old note
+new note
`

describe('diff card parser', () => {
  it('groups a multi-file unified patch into file cards with hunk line counts', () => {
    const card = parseDiffCards(MULTI_FILE_PATCH)

    expect(card.files).toHaveLength(2)
    expect(card.files[0]).toMatchObject({
      additions: 2,
      changeKind: 'modified',
      deletions: 1,
      displayPath: 'src/app.ts',
      newPath: 'src/app.ts',
      oldPath: 'src/app.ts'
    })
    expect(card.files[0]?.hunks[0]?.lines.map(line => [line.kind, line.oldLine, line.newLine, line.content])).toEqual([
      ['context', 1, 1, " import { boot } from './boot'"],
      ['delete', 2, null, "-const mode = 'old'"],
      ['add', null, 2, "+const mode = 'new'"],
      ['add', null, 3, '+const preview = true'],
      ['context', 3, 4, ' boot(mode)']
    ])
    expect(card.files[1]).toMatchObject({ additions: 1, deletions: 1, displayPath: 'docs/notes.md' })
  })

  it('recognizes renamed, deleted, and binary-ish file changes without losing raw patch text', () => {
    const patch = `diff --git a/old name.txt b/new name.txt
similarity index 91%
rename from old name.txt
rename to new name.txt
--- a/old name.txt
+++ b/new name.txt
@@ -1 +1 @@
-old
+new
diff --git a/src/dead.ts b/src/dead.ts
deleted file mode 100644
index 5555555..0000000
--- a/src/dead.ts
+++ /dev/null
@@ -1 +0,0 @@
-gone
diff --git a/assets/logo.png b/assets/logo.png
new file mode 100644
index 0000000..6666666
Binary files /dev/null and b/assets/logo.png differ
`

    const card = parseDiffCards(patch)

    expect(card.files.map(file => [file.displayPath, file.changeKind])).toEqual([
      ['new name.txt', 'renamed'],
      ['src/dead.ts', 'deleted'],
      ['assets/logo.png', 'binary']
    ])
    expect(card.files[0]?.oldPath).toBe('old name.txt')
    expect(card.files[0]?.newPath).toBe('new name.txt')
    expect(card.files[1]).toMatchObject({ additions: 0, deletions: 1 })
    expect(card.files[2]?.rawText).toContain('Binary files /dev/null and b/assets/logo.png differ')
  })

  it('keeps absolute remote paths available for preview routing', () => {
    const card = parseDiffCards(`--- /opt/data/src/server.ts
+++ /opt/data/src/server.ts
@@ -8,2 +8,3 @@
 const port = 9119
+const preview = true
 start(port)
`)

    expect(card.files).toHaveLength(1)
    expect(card.files[0]).toMatchObject({
      absolutePath: '/opt/data/src/server.ts',
      displayPath: '/opt/data/src/server.ts',
      newPath: '/opt/data/src/server.ts',
      oldPath: '/opt/data/src/server.ts'
    })
  })

  it('does not manufacture cards from malformed prose', () => {
    const card = parseDiffCards('not a diff\n@@ this hunk has no file\n+corpo confetti')

    expect(card.files).toEqual([])
    expect(card.malformed).toBe(true)
  })

  it('extracts fenced diff blocks while leaving surrounding markdown intact', () => {
    const segments = extractDiffCardSegments(`Before the patch.

\`\`\`diff
${MULTI_FILE_PATCH}\`\`\`

After the patch.`)

    expect(segments.map(segment => segment.type)).toEqual(['markdown', 'diff', 'markdown'])
    expect(segments[0]).toMatchObject({ type: 'markdown', text: 'Before the patch.\n\n' })
    expect(segments[1].type === 'diff' ? segments[1].card.files.map(file => file.displayPath) : []).toEqual([
      'src/app.ts',
      'docs/notes.md'
    ])
    expect(segments[2]).toMatchObject({ type: 'markdown', text: '\n\nAfter the patch.' })
  })

  it('treats standalone unified patch text as one diff segment', () => {
    const segments = extractDiffCardSegments(MULTI_FILE_PATCH)

    expect(segments).toHaveLength(1)
    expect(segments[0].type).toBe('diff')
  })
})

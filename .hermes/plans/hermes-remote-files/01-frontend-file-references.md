# Frontend File References

## Task 1: Parse explicit file directives

Use a parser that accepts:

- `@file:/opt/data/report.pdf`
- ``@file:`/opt/data/report 1.pdf` ``
- `@file:/opt/data/source.py:10-30`
- `file:///opt/data/report%201.pdf` as an input path form

The parser should return a normalized remote path, optional line range, and original source text. Non-absolute values should remain normal markdown text unless the backend later provides session-cwd resolution metadata.

## Task 2: Keep raw paths inert

Standalone absolute paths are not preview syntax. Do not auto-link them, even when they point at image or document files.

Expected source-contract examples:

```ts
expect(renderPreviewMediaReferences('/opt/data/report.pdf')).toBe('/opt/data/report.pdf')
expect(renderPreviewMediaReferences('See @file:/opt/data/report.pdf')).toContain('#preview')
expect(renderPreviewMediaReferences('MEDIA:/opt/data/render.png')).not.toContain('#preview')
```

## Task 3: Open the preview rail

Links produced from explicit file directives should carry preview metadata and call the shared preview opener. The preview sidebar then fetches text or data URLs through authenticated dashboard routes for the active profile.

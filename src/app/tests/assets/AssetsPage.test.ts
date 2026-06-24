import { describe, expect, it } from 'vitest'

import assetsPageSource from '../../assets/AssetsPage.svelte?raw'

function expectAll(source: string, needles: string[]): void {
  for (const needle of needles) {
    expect(source).toContain(needle)
  }
}

describe('Assets page remote file action UX contract', () => {
  it('wires Hermes files lane actions without desktop-local or public file-server shortcuts', () => {
    expectAll(assetsPageSource, [
      'createRemoteDirectory',
      'deleteRemotePath',
      'readRemoteManagedFileDataUrl',
      'uploadRemoteFile'
    ])

    expect(assetsPageSource).not.toMatch(/@tauri-apps\/api\/fs|VITE_BOX_BASE_URL|Dufs|public file-server/i)
  })

  it('shows current directory controls and dense action buttons with busy-disabled states', () => {
    expectAll(assetsPageSource, [
      'Current directory',
      'bind:value={pathDraft}',
      'applyPathDraft',
      'refreshCurrentDirectory',
      'Create folder',
      'Upload',
      'Download',
      'Delete',
      'actionsDisabled',
      'actionBusy !== null'
    ])
  })

  it('supports file picker and drag/drop uploads into the current remote directory', () => {
    expectAll(assetsPageSource, [
      'bind:this={fileInputElement}',
      'type="file"',
      'multiple',
      'handleFileInput',
      'handleDropUpload',
      'ondragover={allowUploadDrop}',
      'ondrop={(event) => void handleDropUpload(event)}',
      'await uploadRemoteFile({'
    ])
  })

  it('keeps create, delete, and download flows explicit and refreshes only after remote action success', () => {
    expectAll(assetsPageSource, [
      'await createRemoteDirectory(folderPath)',
      "await deleteRemotePath(selectedActionPath, { recursive: selectedActionKind === 'directory' })",
      'const download = await readRemoteManagedFileDataUrl(selectedFile.path)',
      'triggerBrowserDownload(download)',
      'await refreshCurrentDirectory()',
      'lastActionMessage'
    ])
  })

  it('requires destructive confirmation with selected path copy before deleting', () => {
    expectAll(assetsPageSource, [
      '<Dialog bind:open={deleteDialogOpen}',
      'Delete remote path',
      'This cannot be undone.',
      '{selectedActionPath}',
      'confirmDeleteSelectedPath'
    ])
  })

  it('preserves remote previews and unknown-file text fallback behavior while adding actions', () => {
    expectAll(assetsPageSource, [
      'readRemoteFileText',
      'readRemoteFileDataUrl',
      "selectedViewerKind === 'image'",
      "selectedViewerKind === 'pdf'",
      "selectedViewerKind === 'video'",
      "selectedViewerKind === 'audio'",
      "selectedViewerKind === 'html'",
      "selectedViewerKind === 'text'",
      'textPreview = response.text'
    ])

    expect(assetsPageSource).not.toContain('Remote file is binary; text preview is unavailable.')
    expect(assetsPageSource).not.toContain('No inline viewer for this file type')
  })
})

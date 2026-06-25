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

  it('moves file actions into right-click menus and removes header location controls', () => {
    expectAll(assetsPageSource, [
      'ContextMenu.Root',
      'ContextMenu.Trigger',
      'ContextMenu.Content',
      'open folder',
      'pin folder',
      'unpin folder',
      'new folder',
      'upload files',
      'download',
      'delete file',
      'delete folder',
      'actionsDisabled',
      'actionBusy !== null'
    ])

    expect(assetsPageSource).not.toContain('Right-click files or folders for actions')
    expect(assetsPageSource).not.toContain('Current directory')
    expect(assetsPageSource).not.toContain('bind:value={pathDraft}')
    expect(assetsPageSource).not.toContain('applyPathDraft')
    expect(assetsPageSource).not.toContain('Selected path')
    expect(assetsPageSource).not.toContain('refreshCurrentDirectory')
    expect(assetsPageSource).not.toContain('downloadSelectedFile')
    expect(assetsPageSource).not.toContain('requestDeleteSelectedPath')
  })

  it('toggles folder expansion on single click without a double-click requirement', () => {
    expect(assetsPageSource).toContain('toggleTreeRow(row)\n      return')
    expect(assetsPageSource).toContain('onclick={() => selectTreeRow(row)}')
    expect(assetsPageSource).not.toContain('ondblclick')
  })

  it('keeps uploads available from context menus without the old drop-upload panel', () => {
    expectAll(assetsPageSource, [
      'bind:this={fileInputElement}',
      'type="file"',
      'multiple',
      'uploadTargetDirectory',
      'requestFileUpload(row.entry.path)',
      'requestFileUpload(entry.path)',
      'handleFileInput',
      'await uploadRemoteFile({'
    ])

    expect(assetsPageSource).not.toContain('Drop files to upload')
    expect(assetsPageSource).not.toContain('drop files here to upload')
    expect(assetsPageSource).not.toContain('Drag files into the tree')
  })

  it('keeps create, delete, and download flows explicit and refreshes only after remote action success', () => {
    expectAll(assetsPageSource, [
      'await createRemoteDirectory(folderPath)',
      "await deleteRemotePath(deletedPath, { recursive: deletedKind === 'directory' })",
      'const download = await readRemoteManagedFileDataUrl(entry.path)',
      'triggerBrowserDownload(download)',
      'await refreshDirectory(createTargetDirectory)',
      'await refreshDirectory(directory)',
      'lastActionMessage'
    ])
  })

  it('does not render a Tree header action label', () => {
    expect(assetsPageSource).toContain('Panel title="Tree"')
    expect(assetsPageSource).not.toContain('actions={treeActions}')
    expect(assetsPageSource).not.toContain('{#snippet treeActions()}')
    expect(assetsPageSource).not.toContain('text-ink-faint">remote</span>')
  })

  it('repurposes the right pane as a folder/file viewer with a location field', () => {
    expectAll(assetsPageSource, [
      'Panel title="Viewer"',
      'bind:value={locationDraft}',
      'applyLocationDraft',
      'openLocationPath',
      'currentFolderEntries',
      'Folder contents',
      'This remote folder is empty.',
      'openViewerEntry(entry)',
      'viewerEntryKindLabel(entry)'
    ])

    expect(assetsPageSource).not.toContain('<span>Location</span>')
    expect(assetsPageSource).not.toContain('viewerEntrySizeLabel')
    expect(assetsPageSource).not.toContain('role="columnheader" class="text-right">Size</span>')
    expect(assetsPageSource).not.toContain('grid-cols-[minmax(0,1fr)_7rem_6rem]')
    expect(assetsPageSource).not.toContain('Remote root')
    expect(assetsPageSource).not.toContain('>Go</Button>')
    expect(assetsPageSource).not.toContain('Asset Viewer')
  })

  it('hides the tree entirely on mobile without a drawer or toggle', () => {
    expectAll(assetsPageSource, [
      '{#snippet treePanelContent()}',
      '{@render treePanelContent()}',
      'id="assets-tree-panel"',
      'class="hidden min-h-0 min-w-0 md:block"',
      'md:grid md:grid-cols-[minmax(15rem,21rem)_minmax(0,1fr)]'
    ])

    expect(assetsPageSource).not.toContain('treePanelOpen')
    expect(assetsPageSource).not.toContain('toggleTreePanel')
    expect(assetsPageSource).not.toContain('treeDrawerDialogClass')
    expect(assetsPageSource).not.toContain('assets-tree-drawer')
    expect(assetsPageSource).not.toContain('aria-controls="assets-tree-drawer"')
    expect(assetsPageSource).not.toContain('treeBackdropClass')
  })

  it('adds location history, parent navigation, and file download arrow controls', () => {
    expectAll(assetsPageSource, [
      'locationHistory',
      'locationHistoryIndex',
      'pushLocationHistory',
      'replaceLocationHistory',
      'canNavigateBack',
      'canNavigateForward',
      'canNavigateUp',
      'canDownloadCurrentFile',
      'navigateBack',
      'navigateForward',
      'navigateUp',
      'downloadCurrentFile',
      'aria-label="Location navigation"',
      'aria-label="Back"',
      'aria-label="Forward"',
      'aria-label="Up one level"',
      'aria-label="Download selected file"',
      'name="arrowLeft"',
      'name="arrowRight"',
      'name="arrowUp"',
      'name="download"'
    ])
  })

  it('persists and manages pinned folders', () => {
    expectAll(assetsPageSource, [
      'PINNED_FOLDERS_STORAGE_SUFFIX',
      'readNamespacedStorageItem',
      'writeNamespacedStorageItem',
      'removeNamespacedStorageItem',
      'readPinnedFolders',
      'setPinnedFolders',
      'togglePinnedFolder',
      'removePinnedFolderTree',
      'Pinned folders',
      'Unpin ${folder.path}',
      'isPinnedFolder(entry.path)'
    ])
  })

  it('requires destructive confirmation with selected path copy before deleting', () => {
    expectAll(assetsPageSource, [
      '<Dialog bind:open={deleteDialogOpen}',
      'Delete remote path',
      'This cannot be undone.',
      '{deleteActionPath}',
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

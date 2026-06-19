<script lang="ts">
  import { onMount } from 'svelte'
  import Button from '@/components/ui/Button.svelte'
  import Loader from '@/components/ui/Loader.svelte'
  import Panel from '@/components/ui/Panel.svelte'
  import TextArea from '@/components/ui/TextArea.svelte'
  import TextInput from '@/components/ui/TextInput.svelte'
  import {
    createSkill,
    getConfigRaw,
    getConfigSchema,
    getGlobalModelInfo,
    getMessagingPlatforms,
    getModelOptions,
    getSkillContent,
    getSkills,
    getToolsets,
    saveConfigRaw,
    setModelAssignment,
    testMessagingPlatform,
    toggleSkill,
    toggleToolset,
    uninstallSkillFromHub,
    updateMessagingPlatform,
    updateSkillContent
  } from '$lib/api/dashboard'
  import { profileState } from '$lib/stores/profile.svelte'
  import type {
    ConfigFieldSchema,
    MessagingEnvVarInfo,
    MessagingPlatformInfo,
    ModelInfoResponse,
    ModelOptionsResponse,
    SkillInfo,
    ToolsetInfo
  } from '$lib/types/hermes'

  type AdminTab = 'settings' | 'skills' | 'messaging'
  type NoticeTone = 'success' | 'danger' | 'warning'

  interface NoticeState {
    message: string
    tone: NoticeTone
  }

  const TABS: Array<{ id: AdminTab; label: string }> = [
    { id: 'settings', label: 'Settings' },
    { id: 'skills', label: 'Skills' },
    { id: 'messaging', label: 'Messaging' }
  ]
  const CONTROL_CLASS =
    'min-h-8 rounded-control border border-line bg-surface-raised px-2 py-1 text-xs text-ink-bright focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2'
  const LABEL_CLASS = 'font-hud text-[0.63rem] font-bold uppercase tracking-[0.16em] text-ink-muted'

  const adminProfile = $derived(profileState.activeGatewayProfile || 'default')
  let activeTab = $state<AdminTab>('settings')
  let notice = $state<NoticeState | null>(null)

  let loadingSettings = $state(false)
  let savingSettings = $state(false)
  let modelInfo = $state<ModelInfoResponse | null>(null)
  let modelOptions = $state<ModelOptionsResponse | null>(null)
  let selectedProvider = $state('')
  let selectedModel = $state('')
  let configYaml = $state('')
  let configPath = $state('')
  let configSchema = $state<Record<string, ConfigFieldSchema>>({})
  let toolsets = $state<ToolsetInfo[]>([])
  let savingToolset = $state<string | null>(null)

  let loadingSkills = $state(false)
  let savingSkill = $state<string | null>(null)
  let skills = $state<SkillInfo[]>([])
  let selectedSkillName = $state('')
  let skillEditorContent = $state('')
  let skillEditorPath = $state('')
  let skillEditorLoading = $state(false)
  let newSkillName = $state('')
  let newSkillCategory = $state('')
  let newSkillContent = $state(defaultSkillContent('admin-utility'))

  let loadingMessaging = $state(false)
  let messagingPlatforms = $state<MessagingPlatformInfo[]>([])
  let selectedMessagingId = $state('')
  let messagingEdits = $state<Record<string, Record<string, string>>>({})
  let savingMessaging = $state<string | null>(null)
  let messagingTestResults = $state<Record<string, string>>({})

  const providerRows = $derived(modelOptions?.providers ?? [])
  const selectedProviderModels = $derived(providerRows.find(provider => provider.slug === selectedProvider)?.models ?? [])
  const sortedToolsets = $derived([...toolsets].sort((a, b) => toolsetLabel(a).localeCompare(toolsetLabel(b))))
  const sortedSkills = $derived([...skills].sort((a, b) => a.name.localeCompare(b.name)))
  const selectedSkill = $derived(skills.find(skill => skill.name === selectedSkillName) ?? null)
  const selectedMessagingPlatform = $derived(
    messagingPlatforms.find(platform => platform.id === selectedMessagingId) ?? messagingPlatforms[0] ?? null
  )
  const configFieldCount = $derived(Object.keys(configSchema).length)

  onMount(() => {
    void refreshAll()
  })

  async function refreshAll(): Promise<void> {
    await Promise.all([refreshSettings(), refreshSkills(), refreshMessaging()])
  }

  function messageForError(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }

  function reportSuccess(message: string): void {
    notice = { message, tone: 'success' }
  }

  function reportFailure(prefix: string, error: unknown): void {
    notice = { message: `${prefix}: ${messageForError(error)}`, tone: 'danger' }
  }

  function noticeClass(tone: NoticeTone): string {
    const base = 'rounded-panel border px-3 py-2 text-xs leading-5'
    if (tone === 'success') return `${base} border-success/45 bg-success/10 text-success`
    if (tone === 'warning') return `${base} border-warning/45 bg-warning/10 text-warning`
    return `${base} border-danger/45 bg-danger/10 text-danger`
  }

  function tabClass(tab: AdminTab): string {
    const base = 'rounded-control border px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2'
    return activeTab === tab
      ? `${base} border-primary/50 bg-primary/10 text-primary`
      : `${base} border-line bg-surface-raised/50 text-ink-muted hover:border-line-strong hover:text-ink-bright`
  }

  async function refreshSettings(): Promise<void> {
    loadingSettings = true
    try {
      const [nextModelInfo, nextModelOptions, rawConfig, schema, nextToolsets] = await Promise.all([
        getGlobalModelInfo(adminProfile),
        getModelOptions(adminProfile),
        getConfigRaw(adminProfile),
        getConfigSchema(),
        getToolsets(adminProfile)
      ])
      modelInfo = nextModelInfo
      modelOptions = nextModelOptions
      configYaml = rawConfig.yaml
      configPath = rawConfig.path
      configSchema = schema.fields
      toolsets = nextToolsets
      const options = nextModelOptions.providers ?? []
      const provider = nextModelInfo.provider || nextModelOptions.provider || options[0]?.slug || ''
      selectedProvider = provider
      selectedModel = nextModelInfo.model || nextModelOptions.model || options.find(row => row.slug === provider)?.models?.[0] || ''
    } catch (error) {
      reportFailure('Admin settings unavailable', error)
    } finally {
      loadingSettings = false
    }
  }

  function handleProviderChange(event: Event): void {
    const nextProvider = (event.currentTarget as HTMLSelectElement).value
    selectedProvider = nextProvider
    selectedModel = providerRows.find(row => row.slug === nextProvider)?.models?.[0] ?? ''
  }

  async function applyModelAssignment(): Promise<void> {
    if (!selectedProvider || !selectedModel) {
      notice = { message: 'Pick a provider and model before applying.', tone: 'warning' }
      return
    }
    savingSettings = true
    try {
      const result = await setModelAssignment({ model: selectedModel, provider: selectedProvider, scope: 'main' }, adminProfile)
      modelInfo = {
        ...(modelInfo ?? { model: selectedModel, provider: selectedProvider }),
        model: result.model ?? selectedModel,
        provider: result.provider ?? selectedProvider
      }
      reportSuccess(`Model assignment saved for ${adminProfile}.`)
    } catch (error) {
      reportFailure('Model assignment failed', error)
    } finally {
      savingSettings = false
    }
  }

  async function saveRawConfig(): Promise<void> {
    savingSettings = true
    try {
      await saveConfigRaw(configYaml, adminProfile)
      reportSuccess(`Saved raw config for ${adminProfile}.`)
    } catch (error) {
      reportFailure('Raw config save failed', error)
    } finally {
      savingSettings = false
    }
  }

  function toolsetLabel(toolset: ToolsetInfo): string {
    return toolset.label || toolset.name
  }

  async function toggleToolsetEnabled(toolset: ToolsetInfo): Promise<void> {
    savingToolset = toolset.name
    try {
      const enabled = !toolset.enabled
      await toggleToolset(toolset.name, enabled, adminProfile)
      toolsets = toolsets.map(row => (row.name === toolset.name ? { ...row, enabled, available: enabled } : row))
      reportSuccess(`${toolsetLabel(toolset)} ${enabled ? 'enabled' : 'disabled'} for new sessions.`)
    } catch (error) {
      reportFailure(`Could not update ${toolsetLabel(toolset)}`, error)
    } finally {
      savingToolset = null
    }
  }

  async function refreshSkills(): Promise<void> {
    loadingSkills = true
    try {
      skills = await getSkills(adminProfile)
      if (!selectedSkillName && skills[0]) selectedSkillName = skills[0].name
    } catch (error) {
      reportFailure('Skill list unavailable', error)
    } finally {
      loadingSkills = false
    }
  }

  async function selectSkill(name: string): Promise<void> {
    selectedSkillName = name
    skillEditorLoading = true
    skillEditorContent = ''
    skillEditorPath = ''
    try {
      const response = await getSkillContent(name, adminProfile)
      skillEditorContent = response.content
      skillEditorPath = response.path
    } catch (error) {
      reportFailure(`Could not load skill ${name}`, error)
    } finally {
      skillEditorLoading = false
    }
  }

  async function toggleSkillEnabled(skill: SkillInfo): Promise<void> {
    savingSkill = skill.name
    try {
      const enabled = !skill.enabled
      await toggleSkill(skill.name, enabled, adminProfile)
      skills = skills.map(row => (row.name === skill.name ? { ...row, enabled } : row))
      reportSuccess(`${skill.name} ${enabled ? 'enabled' : 'disabled'} for future sessions.`)
    } catch (error) {
      reportFailure(`Could not toggle ${skill.name}`, error)
    } finally {
      savingSkill = null
    }
  }

  async function saveSkillEditor(): Promise<void> {
    if (!selectedSkillName) return
    savingSkill = selectedSkillName
    try {
      await updateSkillContent(selectedSkillName, skillEditorContent, adminProfile)
      await refreshSkills()
      reportSuccess(`Saved ${selectedSkillName}.`)
    } catch (error) {
      reportFailure(`Could not save ${selectedSkillName}`, error)
    } finally {
      savingSkill = null
    }
  }

  async function removeSelectedSkill(): Promise<void> {
    if (!selectedSkillName) return
    const name = selectedSkillName
    savingSkill = name
    try {
      await uninstallSkillFromHub(name, adminProfile)
      selectedSkillName = ''
      skillEditorContent = ''
      skillEditorPath = ''
      await refreshSkills()
      reportSuccess(`Uninstall started for ${name}.`)
    } catch (error) {
      reportFailure(`Could not uninstall ${name}`, error)
    } finally {
      savingSkill = null
    }
  }

  function defaultSkillContent(name: string): string {
    return `---\nname: ${name}\ndescription: Describe what this skill teaches the agent.\n---\n\n# ${name}\n\n## When to use\n\n- Describe the trigger.\n\n## Procedure\n\n1. Add reusable steps.\n`
  }

  function updateNewSkillName(value: string): void {
    newSkillName = value
    if (!newSkillContent.trim() || newSkillContent === defaultSkillContent('admin-utility')) {
      newSkillContent = defaultSkillContent(value.trim() || 'admin-utility')
    }
  }

  async function createNewSkill(): Promise<void> {
    const name = newSkillName.trim()
    if (!name) {
      notice = { message: 'Skill name is required.', tone: 'warning' }
      return
    }
    savingSkill = name
    try {
      await createSkill({ category: newSkillCategory.trim() || null, content: newSkillContent, name }, adminProfile)
      newSkillName = ''
      newSkillCategory = ''
      newSkillContent = defaultSkillContent('admin-utility')
      await refreshSkills()
      await selectSkill(name)
      reportSuccess(`Created ${name}.`)
    } catch (error) {
      reportFailure(`Could not create ${name}`, error)
    } finally {
      savingSkill = null
    }
  }

  async function refreshMessaging(): Promise<void> {
    loadingMessaging = true
    try {
      const response = await getMessagingPlatforms(adminProfile)
      messagingPlatforms = response.platforms
      if (!selectedMessagingId && response.platforms[0]) selectedMessagingId = response.platforms[0].id
    } catch (error) {
      reportFailure('Messaging platform list unavailable', error)
    } finally {
      loadingMessaging = false
    }
  }

  function statusClass(platform: MessagingPlatformInfo): string {
    const base = 'rounded-full px-2 py-0.5 font-mono text-[0.62rem] uppercase tracking-[0.12em]'
    if (!platform.enabled) return `${base} bg-surface-muted text-ink-muted`
    if (platform.state === 'connected') return `${base} bg-success/10 text-success`
    if (platform.state === 'fatal' || platform.state === 'startup_failed') return `${base} bg-danger/10 text-danger`
    return `${base} bg-warning/10 text-warning`
  }

  function messagingEditValue(platformId: string, key: string): string {
    return messagingEdits[platformId]?.[key] ?? ''
  }

  function setMessagingEdit(platformId: string, key: string, value: string): void {
    messagingEdits = { ...messagingEdits, [platformId]: { ...(messagingEdits[platformId] ?? {}), [key]: value } }
  }

  function envLabel(field: MessagingEnvVarInfo): string {
    return field.prompt || field.key
  }

  async function toggleMessaging(platform: MessagingPlatformInfo): Promise<void> {
    savingMessaging = `toggle:${platform.id}`
    try {
      const enabled = !platform.enabled
      await updateMessagingPlatform(platform.id, { enabled }, adminProfile)
      messagingPlatforms = messagingPlatforms.map(row =>
        row.id === platform.id
          ? { ...row, enabled, state: enabled ? (row.configured ? 'pending_restart' : 'not_configured') : 'disabled' }
          : row
      )
      reportSuccess(`${platform.name} ${enabled ? 'enabled' : 'disabled'}. Restart gateway to apply.`)
    } catch (error) {
      reportFailure(`Could not update ${platform.name}`, error)
    } finally {
      savingMessaging = null
    }
  }

  async function saveMessagingEnv(platform: MessagingPlatformInfo): Promise<void> {
    const env = Object.fromEntries(
      Object.entries(messagingEdits[platform.id] ?? {})
        .map(([key, value]) => [key, value.trim()])
        .filter(([, value]) => value)
    )
    if (Object.keys(env).length === 0) {
      notice = { message: 'No channel credential edits to save.', tone: 'warning' }
      return
    }
    savingMessaging = `env:${platform.id}`
    try {
      await updateMessagingPlatform(platform.id, { env }, adminProfile)
      messagingEdits = { ...messagingEdits, [platform.id]: {} }
      await refreshMessaging()
      reportSuccess(`${platform.name} channel settings saved.`)
    } catch (error) {
      reportFailure(`Could not save ${platform.name}`, error)
    } finally {
      savingMessaging = null
    }
  }

  async function clearMessagingEnv(platform: MessagingPlatformInfo, key: string): Promise<void> {
    savingMessaging = `clear:${platform.id}:${key}`
    try {
      await updateMessagingPlatform(platform.id, { clear_env: [key] }, adminProfile)
      await refreshMessaging()
      reportSuccess(`Cleared ${key} for ${platform.name}.`)
    } catch (error) {
      reportFailure(`Could not clear ${key}`, error)
    } finally {
      savingMessaging = null
    }
  }

  async function testMessaging(platform: MessagingPlatformInfo): Promise<void> {
    savingMessaging = `test:${platform.id}`
    try {
      const result = await testMessagingPlatform(platform.id, adminProfile)
      messagingTestResults = { ...messagingTestResults, [platform.id]: result.message }
      notice = { message: result.message, tone: result.ok ? 'success' : 'warning' }
    } catch (error) {
      reportFailure(`Could not test ${platform.name}`, error)
    } finally {
      savingMessaging = null
    }
  }
</script>

<section class="flex h-full min-h-0 flex-col gap-4 bg-chat-scroll/40 p-4" aria-label="Admin utilities">
  <div class="flex shrink-0 flex-col gap-3 rounded-panel border border-line bg-canvas/80 p-4 md:flex-row md:items-end md:justify-between">
    <div class="min-w-0">
      <p class="font-hud text-[11px] font-bold uppercase tracking-[0.22em] text-primary">Admin Utilities</p>
      <h1 class="mt-2 text-xl font-semibold uppercase tracking-[0.12em] text-ink-bright">Settings, Skills, Messaging</h1>
      <p class="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">
        Remote-only dashboard administration for profile <span class="font-mono text-ink-bright">{adminProfile}</span>. All reads and writes go through the authenticated Tauri dashboard bridge.
      </p>
    </div>
    <Button size="sm" variant="primary" onclick={() => void refreshAll()}>Refresh all</Button>
  </div>

  <div class="grid shrink-0 gap-2 md:grid-cols-3" role="tablist" aria-label="Admin sections">
    {#each TABS as tab (tab.id)}
      <button type="button" class={tabClass(tab.id)} onclick={() => (activeTab = tab.id)} aria-selected={activeTab === tab.id} role="tab">
        <span class="block font-hud text-[0.68rem] font-bold uppercase tracking-[0.16em]">{tab.label}</span>
      </button>
    {/each}
  </div>

  {#if notice}
    <div class={noticeClass(notice.tone)} role="status">{notice.message}</div>
  {/if}

  {#if activeTab === 'settings'}
    <div class="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(20rem,28rem)_minmax(0,1fr)]">
      <div class="grid min-h-0 gap-4">
        <Panel title="Model provider" padded={false} contentClass="flex min-h-0 flex-col gap-4 p-4 pt-5" class="min-h-[18rem]">
          {#if loadingSettings}
            <div class="flex flex-1 items-center justify-center gap-2 text-sm text-ink-muted"><Loader /> Loading model settings…</div>
          {:else}
            <div class="grid gap-3">
              <div>
                <p class={LABEL_CLASS}>Current assignment</p>
                <p class="font-mono text-[0.72rem] text-ink-bright">{modelInfo?.provider ?? 'unknown'} / {modelInfo?.model ?? 'unknown'}</p>
              </div>
              <label class="grid gap-1">
                <span class={LABEL_CLASS}>Provider</span>
                <select class={CONTROL_CLASS} bind:value={selectedProvider} onchange={handleProviderChange}>
                  {#each providerRows as provider (provider.slug)}
                    <option value={provider.slug}>{provider.name || provider.slug}</option>
                  {/each}
                </select>
              </label>
              <label class="grid gap-1">
                <span class={LABEL_CLASS}>Model</span>
                <select class={CONTROL_CLASS} bind:value={selectedModel} disabled={selectedProviderModels.length === 0}>
                  {#each selectedProviderModels as model (model)}
                    <option value={model}>{model}</option>
                  {/each}
                </select>
              </label>
              <Button variant="primary" disabled={savingSettings || !selectedProvider || !selectedModel} onclick={() => void applyModelAssignment()}>Apply model</Button>
            </div>
          {/if}
        </Panel>

        <Panel title="Toolsets" badge={`${toolsets.filter(row => row.enabled).length}/${toolsets.length}`} padded={false} contentClass="min-h-0 overflow-auto p-3 pt-5">
          {#if loadingSettings}
            <div class="flex h-full items-center justify-center gap-2 text-sm text-ink-muted"><Loader /> Loading toolsets…</div>
          {:else if sortedToolsets.length === 0}
            <div class="rounded-panel border border-dashed border-line p-4 text-sm text-ink-muted">No configurable toolsets reported.</div>
          {:else}
            <div class="space-y-2">
              {#each sortedToolsets as toolset (toolset.name)}
                <div class="rounded-control border border-line bg-surface-raised/45 p-3">
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <p class="overflow-hidden text-ellipsis whitespace-nowrap text-sm font-semibold text-ink-bright">{toolsetLabel(toolset)}</p>
                      <p class="mt-1 line-clamp-2 text-xs leading-5 text-ink-muted">{toolset.description || 'No description supplied.'}</p>
                    </div>
                    <Button size="sm" variant={toolset.enabled ? 'warning' : 'success'} disabled={savingToolset === toolset.name} onclick={() => void toggleToolsetEnabled(toolset)}>
                      {toolset.enabled ? 'Disable' : 'Enable'}
                    </Button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </Panel>
      </div>

      <Panel title="Raw config" badge={`${configFieldCount} schema fields`} padded={false} contentClass="flex min-h-0 flex-col gap-3 p-4 pt-5">
        <div class="flex shrink-0 flex-col gap-2 border-b border-line pb-3 md:flex-row md:items-center md:justify-between">
          <div class="min-w-0">
            <p class={LABEL_CLASS}>Config path</p>
            <p class="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[0.68rem] text-ink-muted" title={configPath}>{configPath || 'unknown'}</p>
          </div>
          <Button size="sm" variant="primary" disabled={savingSettings} onclick={() => void saveRawConfig()}>Save YAML</Button>
        </div>
        <TextArea bind:value={configYaml} class="min-h-[20rem] flex-1 font-mono text-xs leading-5" spellcheck={false} />
      </Panel>
    </div>
  {:else if activeTab === 'skills'}
    <div class="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">
      <Panel title="Skill list" badge={`${skills.length}`} padded={false} contentClass="min-h-0 overflow-auto p-3 pt-5">
        {#if loadingSkills}
          <div class="flex h-full items-center justify-center gap-2 text-sm text-ink-muted"><Loader /> Loading skills…</div>
        {:else if sortedSkills.length === 0}
          <div class="rounded-panel border border-dashed border-line p-4 text-sm text-ink-muted">No skills found for this profile.</div>
        {:else}
          <div class="space-y-2">
            {#each sortedSkills as skill (skill.name)}
              <div class={`rounded-control border p-2 ${selectedSkillName === skill.name ? 'border-primary/45 bg-primary/10' : 'border-line bg-surface-raised/45'}`}>
                <div class="flex items-start justify-between gap-2">
                  <button type="button" class="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2" onclick={() => void selectSkill(skill.name)}>
                    <span class="block overflow-hidden text-ellipsis whitespace-nowrap text-sm font-semibold text-ink-bright">{skill.name}</span>
                    <span class="mt-1 block overflow-hidden text-ellipsis whitespace-nowrap text-[0.68rem] text-ink-muted">{skill.category || 'general'} · {skill.description || 'No description'}</span>
                  </button>
                  <Button size="sm" variant={skill.enabled ? 'warning' : 'success'} disabled={savingSkill === skill.name} onclick={() => void toggleSkillEnabled(skill)}>
                    {skill.enabled ? 'Disable' : 'Enable'}
                  </Button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </Panel>

      <div class="grid min-h-0 gap-4 lg:grid-rows-[minmax(0,1fr)_auto]">
        <Panel title="Skill editor" badge={selectedSkillName || 'none'} padded={false} contentClass="flex min-h-0 flex-col gap-3 p-4 pt-5">
          {#if !selectedSkill}
            <div class="flex flex-1 items-center justify-center rounded-panel border border-dashed border-line p-6 text-center text-sm text-ink-muted">Select a skill to edit its SKILL.md, or create a new one below.</div>
          {:else if skillEditorLoading}
            <div class="flex flex-1 items-center justify-center gap-2 text-sm text-ink-muted"><Loader /> Loading {selectedSkillName}…</div>
          {:else}
            <div class="shrink-0 border-b border-line pb-3">
              <p class={LABEL_CLASS}>Source</p>
              <p class="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[0.68rem] text-ink-muted" title={skillEditorPath}>{skillEditorPath || 'unknown'}</p>
            </div>
            <TextArea bind:value={skillEditorContent} class="min-h-[20rem] flex-1 font-mono text-xs leading-5" spellcheck={false} />
            <div class="flex shrink-0 flex-wrap gap-2">
              <Button variant="primary" disabled={savingSkill === selectedSkillName} onclick={() => void saveSkillEditor()}>Save skill</Button>
              <Button variant="danger" disabled={savingSkill === selectedSkillName} onclick={() => void removeSelectedSkill()}>Uninstall</Button>
            </div>
          {/if}
        </Panel>

        <Panel title="Create skill" padded={false} fullHeight={false} contentClass="grid gap-3 p-4 pt-5 md:grid-cols-[minmax(8rem,14rem)_minmax(8rem,14rem)_1fr_auto] md:items-end">
          <label class="grid gap-1">
            <span class={LABEL_CLASS}>Name</span>
            <TextInput value={newSkillName} oninput={(event) => updateNewSkillName((event.currentTarget as HTMLInputElement).value)} placeholder="ops-drill" />
          </label>
          <label class="grid gap-1">
            <span class={LABEL_CLASS}>Category</span>
            <TextInput bind:value={newSkillCategory} placeholder="devops" />
          </label>
          <label class="grid gap-1">
            <span class={LABEL_CLASS}>SKILL.md</span>
            <TextArea bind:value={newSkillContent} class="min-h-24 font-mono text-xs" spellcheck={false} />
          </label>
          <Button variant="success" disabled={savingSkill === newSkillName.trim()} onclick={() => void createNewSkill()}>Create</Button>
        </Panel>
      </div>
    </div>
  {:else}
    <div class="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">
      <Panel title="Channels" badge={`${messagingPlatforms.length}`} padded={false} contentClass="min-h-0 overflow-auto p-3 pt-5">
        {#if loadingMessaging}
          <div class="flex h-full items-center justify-center gap-2 text-sm text-ink-muted"><Loader /> Loading channels…</div>
        {:else if messagingPlatforms.length === 0}
          <div class="rounded-panel border border-dashed border-line p-4 text-sm text-ink-muted">No messaging platforms reported.</div>
        {:else}
          <div class="space-y-2">
            {#each messagingPlatforms as platform (platform.id)}
              <button type="button" class={`w-full rounded-control border p-3 text-left focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2 ${selectedMessagingPlatform?.id === platform.id ? 'border-primary/45 bg-primary/10' : 'border-line bg-surface-raised/45 hover:border-line-strong'}`} onclick={() => (selectedMessagingId = platform.id)}>
                <span class="flex items-center justify-between gap-2">
                  <span class="overflow-hidden text-ellipsis whitespace-nowrap text-sm font-semibold text-ink-bright">{platform.name}</span>
                  <span class={statusClass(platform)}>{platform.state || (platform.enabled ? 'unknown' : 'disabled')}</span>
                </span>
                <span class="mt-1 block line-clamp-2 text-xs leading-5 text-ink-muted">{platform.description || 'No description supplied.'}</span>
              </button>
            {/each}
          </div>
        {/if}
      </Panel>

      <Panel title="Channel status" badge={selectedMessagingPlatform?.name ?? 'none'} padded={false} contentClass="flex min-h-0 flex-col gap-4 p-4 pt-5">
        {#if !selectedMessagingPlatform}
          <div class="flex flex-1 items-center justify-center rounded-panel border border-dashed border-line p-6 text-center text-sm text-ink-muted">Select a platform to inspect its status and credentials.</div>
        {:else}
          <div class="grid shrink-0 gap-3 rounded-panel border border-line bg-surface-raised/45 p-4 md:grid-cols-4">
            <div><p class={LABEL_CLASS}>Enabled</p><p class="font-mono text-[0.72rem] text-ink-bright">{selectedMessagingPlatform.enabled ? 'yes' : 'no'}</p></div>
            <div><p class={LABEL_CLASS}>Configured</p><p class="font-mono text-[0.72rem] text-ink-bright">{selectedMessagingPlatform.configured ? 'yes' : 'no'}</p></div>
            <div><p class={LABEL_CLASS}>Gateway</p><p class="font-mono text-[0.72rem] text-ink-bright">{selectedMessagingPlatform.gateway_running ? 'running' : 'stopped'}</p></div>
            <div><p class={LABEL_CLASS}>State</p><p class="font-mono text-[0.72rem] text-ink-bright">{selectedMessagingPlatform.state || 'unknown'}</p></div>
          </div>

          {#if selectedMessagingPlatform.error_message}
            <div class="rounded-panel border border-danger/40 bg-danger/10 p-3 text-sm leading-6 text-danger" role="alert">{selectedMessagingPlatform.error_message}</div>
          {/if}

          <div class="flex shrink-0 flex-wrap gap-2">
            <Button variant={selectedMessagingPlatform.enabled ? 'warning' : 'success'} disabled={savingMessaging === `toggle:${selectedMessagingPlatform.id}`} onclick={() => void toggleMessaging(selectedMessagingPlatform)}>{selectedMessagingPlatform.enabled ? 'Disable' : 'Enable'}</Button>
            <Button variant="secondary" disabled={savingMessaging === `test:${selectedMessagingPlatform.id}`} onclick={() => void testMessaging(selectedMessagingPlatform)}>Test status</Button>
            <Button variant="primary" disabled={savingMessaging === `env:${selectedMessagingPlatform.id}`} onclick={() => void saveMessagingEnv(selectedMessagingPlatform)}>Save credentials</Button>
          </div>

          {#if messagingTestResults[selectedMessagingPlatform.id]}
            <div class="rounded-panel border border-warning/40 bg-warning/10 p-3 text-sm leading-6 text-warning">{messagingTestResults[selectedMessagingPlatform.id]}</div>
          {/if}

          <div class="min-h-0 flex-1 overflow-auto rounded-panel border border-line bg-canvas/50 p-3">
            {#if (selectedMessagingPlatform.env_vars ?? []).length === 0}
              <div class="rounded-panel border border-dashed border-line p-4 text-sm text-ink-muted">This platform has no editable environment fields.</div>
            {:else}
              <div class="grid gap-3">
                {#each selectedMessagingPlatform.env_vars ?? [] as field (field.key)}
                  <div class="grid gap-2 rounded-control border border-line bg-surface-raised/45 p-3 lg:grid-cols-[minmax(10rem,18rem)_minmax(0,1fr)_auto] lg:items-end">
                    <div class="min-w-0">
                      <p class="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[0.72rem] text-ink-bright">{field.key}</p>
                      <p class="mt-1 text-xs leading-5 text-ink-muted">{envLabel(field)}</p>
                      <p class="mt-1 font-mono text-[0.62rem] uppercase tracking-[0.12em] text-ink-muted">{field.required ? 'required' : 'optional'} · {field.is_set ? 'set' : 'unset'}</p>
                    </div>
                    <TextInput
                      value={messagingEditValue(selectedMessagingPlatform.id, field.key)}
                      type={field.is_password ? 'password' : 'text'}
                      placeholder={field.redacted_value || field.prompt || field.key}
                      oninput={(event) => setMessagingEdit(selectedMessagingPlatform.id, field.key, (event.currentTarget as HTMLInputElement).value)}
                    />
                    <Button size="sm" variant="danger" disabled={savingMessaging === `clear:${selectedMessagingPlatform.id}:${field.key}` || !field.is_set} onclick={() => void clearMessagingEnv(selectedMessagingPlatform, field.key)}>Clear</Button>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      </Panel>
    </div>
  {/if}
</section>

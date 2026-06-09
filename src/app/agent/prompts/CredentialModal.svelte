<script lang="ts" module>
  export type CredentialTone = 'primary' | 'danger'
</script>

<script lang="ts">
  import Button from '@/components/ui/Button.svelte'
  import Panel from '@/components/ui/Panel.svelte'
  import SectionTitle from '@/components/ui/SectionTitle.svelte'
  import TextInput from '@/components/ui/TextInput.svelte'

  interface Props {
    autocomplete?: 'current-password' | 'off'
    disabled?: boolean
    description: string
    error?: null | string
    heading: string
    id: string
    onSubmit: () => void | Promise<unknown>
    placeholder: string
    submitting?: boolean
    submitLabel: string
    submittingLabel?: string
    title: string
    tone: CredentialTone
    value?: string
  }

  let {
    autocomplete = 'off',
    disabled = false,
    description,
    error = null,
    heading,
    id,
    onSubmit,
    placeholder,
    submitting = false,
    submitLabel,
    submittingLabel = 'Sending',
    title,
    tone,
    value = $bindable('')
  }: Props = $props()

  const toneClass: Record<CredentialTone, string> = {
    primary: 'text-primary',
    danger: 'text-danger'
  }

  const borderClass: Record<CredentialTone, string> = {
    primary: 'border-primary/45',
    danger: 'border-danger/45'
  }

  function submit(event: SubmitEvent): void {
    event.preventDefault()
    void onSubmit()
  }
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center bg-overlay px-4" role="presentation">
  <Panel
    title={title}
    titleClass={toneClass[tone]}
    class={`w-full max-w-md ${borderClass[tone]}`}
    contentClass="p-5"
    padded={false}
    fullHeight={false}
    role="dialog"
    aria-modal="true"
    aria-labelledby={id}
  >
    <SectionTitle tone={tone}>Credential required</SectionTitle>
    <h2 {id} class="mt-2 text-lg font-semibold tracking-[0.08em] text-ink-bright">{heading}</h2>
    <p class="mt-2 text-sm leading-6 text-ink-muted">{description}</p>
    <form class="mt-4 grid gap-3" onsubmit={submit}>
      <TextInput
        class="px-3 py-2 text-sm"
        bind:value
        disabled={submitting}
        {placeholder}
        type="password"
        {autocomplete}
      />
      {#if error}
        <p class="text-xs text-danger">{error}</p>
      {/if}
      <div class="flex justify-end gap-2">
        <Button variant={tone} disabled={submitting || disabled} type="submit">
          {submitting ? submittingLabel : submitLabel}
        </Button>
      </div>
    </form>
  </Panel>
</div>

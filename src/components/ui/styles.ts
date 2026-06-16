export const panelSurfaceClass = 'relative rounded-panel border border-line bg-surface'

export const flatPanelSurfaceClass = 'relative rounded-panel border border-transparent bg-transparent'

export const cardClass = 'rounded-panel border border-line bg-surface-raised'

export const terminalClass = 'rounded-control border border-line bg-canvas font-mono text-ink'

export const popoverClass = 'rounded-panel border border-line-strong bg-canvas'

export const menuItemClass = [
  'flex cursor-pointer items-center gap-2 rounded-control border border-transparent text-ink',
  'hover:border-line-strong hover:bg-primary/10 focus-visible:border-line-strong focus-visible:bg-primary/10 focus-visible:outline-none',
  'data-[highlighted]:border-line-strong data-[highlighted]:bg-primary/10 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40'
].join(' ')

export const inputClass = [
  'w-full rounded-control border border-line bg-input text-ink-bright outline-none',
  'placeholder:text-ink-muted/75 focus:border-focus focus:outline-2 focus:outline-focus focus:outline-offset-0',
  'disabled:cursor-not-allowed disabled:opacity-50'
].join(' ')

export const textareaClass = `${inputClass} resize-none leading-[1.55]`

export const sectionTitleClass = [
  'inline-flex items-center gap-1 font-hud text-[0.64rem] font-bold uppercase tracking-[0.18em]',
  "text-ink-muted before:text-line-strong before:content-['['] after:text-line-strong after:content-[']']"
].join(' ')

export const tagClass = [
  'inline-flex items-center gap-1 rounded-control border border-line',
  'bg-surface-raised',
  'px-1.5 py-1 font-hud text-[0.62rem] font-bold uppercase leading-none tracking-[0.13em] text-ink-muted'
].join(' ')

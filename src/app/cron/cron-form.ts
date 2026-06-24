export interface CronForm {
  context_from: string
  deliver: string
  enabled_toolsets: string
  model: string
  name: string
  no_agent: boolean
  profile: string
  prompt: string
  provider: string
  schedule: string
  script: string
  skills: string
  workdir: string
}

export function emptyCronForm(profile = 'default'): CronForm {
  return {
    context_from: '',
    deliver: 'local',
    enabled_toolsets: '',
    model: '',
    name: '',
    no_agent: false,
    profile,
    prompt: '',
    provider: '',
    schedule: 'every 1h',
    script: '',
    skills: '',
    workdir: ''
  }
}

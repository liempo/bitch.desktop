import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockDashboardRequest } = vi.hoisted(() => ({
  mockDashboardRequest: vi.fn()
}))

vi.mock('$lib/hermes/shared/adapters/dashboard-api-client', () => ({
  dashboardRequest: mockDashboardRequest
}))

import {
  createCronJob,
  deleteCronJob,
  getCronDeliveryTargets,
  getCronJobRuns,
  getCronJobs,
  normalizeCronJobPayload,
  pauseCronJob,
  resumeCronJob,
  runCronJob,
  updateCronJob
} from '$lib/hermes/cron'

describe('cron dashboard API bridge', () => {
  beforeEach(() => {
    mockDashboardRequest.mockReset()
  })

  it('lists cron jobs across profiles through the authenticated dashboard bridge', async () => {
    mockDashboardRequest.mockResolvedValueOnce([{ id: 'job-1', enabled: true }])

    await expect(getCronJobs()).resolves.toEqual([{ id: 'job-1', enabled: true }])

    expect(mockDashboardRequest).toHaveBeenCalledWith({
      path: '/api/cron/jobs?profile=all',
      profile: undefined
    })
  })

  it('loads delivery target metadata for the form datalist', async () => {
    mockDashboardRequest.mockResolvedValueOnce({ targets: [{ id: 'local', name: 'Local (save only)' }] })

    await expect(getCronDeliveryTargets()).resolves.toEqual({ targets: [{ id: 'local', name: 'Local (save only)' }] })

    expect(mockDashboardRequest).toHaveBeenCalledWith({ path: '/api/cron/delivery-targets' })
  })

  it('creates jobs with the backend create shape and patches advanced fields for older dashboard backends', async () => {
    mockDashboardRequest.mockResolvedValueOnce({ id: 'job-1', enabled: true })
    mockDashboardRequest.mockResolvedValueOnce({ id: 'job-1', enabled: true, no_agent: true })

    await expect(
      createCronJob(
        {
          context_from: ['collector'],
          deliver: 'telegram:-100:42',
          enabled_toolsets: ['web', 'terminal'],
          model: 'anthropic/claude-sonnet-4.6',
          name: 'Watchdog',
          no_agent: true,
          prompt: '',
          provider: 'openrouter',
          schedule: 'every 5m',
          script: 'watchdog.sh',
          skills: ['service-endpoint-probing'],
          workdir: '/opt/data/project'
        },
        'ops/profile'
      )
    ).resolves.toMatchObject({ id: 'job-1', no_agent: true })

    expect(mockDashboardRequest).toHaveBeenNthCalledWith(1, {
      body: {
        deliver: 'telegram:-100:42',
        name: 'Watchdog',
        prompt: '',
        schedule: 'every 5m',
        skills: ['service-endpoint-probing']
      },
      method: 'POST',
      path: '/api/cron/jobs?profile=ops%2Fprofile',
      profile: 'ops/profile'
    })
    expect(mockDashboardRequest).toHaveBeenNthCalledWith(2, {
      body: {
        updates: {
          context_from: ['collector'],
          enabled_toolsets: ['web', 'terminal'],
          model: 'anthropic/claude-sonnet-4.6',
          no_agent: true,
          provider: 'openrouter',
          script: 'watchdog.sh',
          workdir: '/opt/data/project'
        }
      },
      method: 'PUT',
      path: '/api/cron/jobs/job-1?profile=ops%2Fprofile',
      profile: 'ops/profile'
    })
  })

  it('does not patch blank advanced fields when creating a normal agent job', async () => {
    mockDashboardRequest.mockResolvedValueOnce({ id: 'job-2', enabled: true })

    await createCronJob(
      {
        context_from: '',
        deliver: 'local',
        enabled_toolsets: '',
        name: '',
        no_agent: false,
        prompt: 'Say status',
        schedule: 'every 1h',
        script: '',
        skills: ''
      },
      'default'
    )

    expect(mockDashboardRequest).toHaveBeenCalledTimes(1)
    expect(mockDashboardRequest).toHaveBeenCalledWith({
      body: {
        deliver: 'local',
        name: '',
        prompt: 'Say status',
        schedule: 'every 1h',
        skills: []
      },
      method: 'POST',
      path: '/api/cron/jobs?profile=default',
      profile: 'default'
    })
  })

  it('updates every editable cron field through the dashboard PUT shape', async () => {
    mockDashboardRequest.mockResolvedValueOnce({ id: 'job-3', name: 'Updated' })

    await updateCronJob(
      'job 3',
      {
        context_from: ['job-1', 'job-0'],
        deliver: 'local',
        enabled_toolsets: ['web'],
        model: 'gpt-5.5',
        name: 'Updated',
        no_agent: false,
        prompt: 'new prompt',
        provider: 'openai-codex',
        schedule: '0 9 * * *',
        script: '',
        skills: [],
        workdir: ''
      },
      'default'
    )

    expect(mockDashboardRequest).toHaveBeenCalledWith({
      body: {
        updates: {
          context_from: ['job-1', 'job-0'],
          deliver: 'local',
          enabled_toolsets: ['web'],
          model: 'gpt-5.5',
          name: 'Updated',
          no_agent: false,
          prompt: 'new prompt',
          provider: 'openai-codex',
          schedule: '0 9 * * *',
          script: null,
          skills: [],
          workdir: null
        }
      },
      method: 'PUT',
      path: '/api/cron/jobs/job%203?profile=default',
      profile: 'default'
    })
  })

  it('routes row actions and recent run output through cron endpoints', async () => {
    mockDashboardRequest.mockResolvedValue({ ok: true })

    await pauseCronJob('job/4', 'default')
    await resumeCronJob('job/4', 'default')
    await runCronJob('job/4', 'default')
    await deleteCronJob('job/4', 'default')
    await getCronJobRuns('job/4', 'default', 7)

    expect(mockDashboardRequest).toHaveBeenNthCalledWith(1, {
      method: 'POST',
      path: '/api/cron/jobs/job%2F4/pause?profile=default',
      profile: 'default'
    })
    expect(mockDashboardRequest).toHaveBeenNthCalledWith(2, {
      method: 'POST',
      path: '/api/cron/jobs/job%2F4/resume?profile=default',
      profile: 'default'
    })
    expect(mockDashboardRequest).toHaveBeenNthCalledWith(3, {
      method: 'POST',
      path: '/api/cron/jobs/job%2F4/trigger?profile=default',
      profile: 'default'
    })
    expect(mockDashboardRequest).toHaveBeenNthCalledWith(4, {
      method: 'DELETE',
      path: '/api/cron/jobs/job%2F4?profile=default',
      profile: 'default'
    })
    expect(mockDashboardRequest).toHaveBeenNthCalledWith(5, {
      path: '/api/cron/jobs/job%2F4/runs?profile=default&limit=7',
      profile: 'default'
    })
  })
})

describe('normalizeCronJobPayload', () => {
  it('normalizes comma/newline-separated form values into arrays and null clears', () => {
    expect(
      normalizeCronJobPayload({
        context_from: 'alpha, beta\ngamma',
        enabled_toolsets: 'web,terminal',
        model: '',
        provider: '',
        script: '',
        skills: 'maps, blogwatcher',
        workdir: ''
      })
    ).toEqual({
      context_from: ['alpha', 'beta', 'gamma'],
      enabled_toolsets: ['web', 'terminal'],
      model: null,
      provider: null,
      script: null,
      skills: ['maps', 'blogwatcher'],
      workdir: null
    })
  })
})

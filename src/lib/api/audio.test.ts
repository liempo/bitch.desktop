import { describe, expect, it, vi } from 'vitest'

const { mockDashboardRequest } = vi.hoisted(() => ({
  mockDashboardRequest: vi.fn()
}))

vi.mock('$lib/api/dashboard', () => ({
  dashboardRequest: mockDashboardRequest
}))

import { getElevenLabsVoices, speakText, transcribeAudio } from '$lib/api/audio'

describe('audio dashboard API helpers', () => {
  it('posts captured browser audio to the transcribe endpoint', async () => {
    mockDashboardRequest.mockResolvedValueOnce({ ok: true, provider: 'whisper', transcript: 'hello operator' })

    await expect(
      transcribeAudio({ dataUrl: 'data:audio/webm;base64,AAAA', mimeType: 'audio/webm' }, 'default')
    ).resolves.toEqual({
      ok: true,
      provider: 'whisper',
      transcript: 'hello operator'
    })

    expect(mockDashboardRequest).toHaveBeenCalledWith({
      body: { data_url: 'data:audio/webm;base64,AAAA', mime_type: 'audio/webm' },
      method: 'POST',
      path: '/api/audio/transcribe',
      profile: 'default'
    })
  })

  it('sends text and optional server-side voice selection to the speak endpoint', async () => {
    mockDashboardRequest.mockResolvedValueOnce({
      data_url: 'data:audio/mpeg;base64,SUQz',
      mime_type: 'audio/mpeg',
      ok: true,
      provider: 'elevenlabs'
    })

    await expect(speakText({ text: 'System online', voiceId: 'voice-123' }, 'speech')).resolves.toMatchObject({
      data_url: 'data:audio/mpeg;base64,SUQz',
      ok: true
    })

    expect(mockDashboardRequest).toHaveBeenCalledWith({
      body: { text: 'System online', voice_id: 'voice-123' },
      method: 'POST',
      path: '/api/audio/speak',
      profile: 'speech'
    })
  })

  it('loads non-secret ElevenLabs voice metadata through the remote dashboard bridge', async () => {
    mockDashboardRequest.mockResolvedValueOnce({
      available: true,
      voices: [{ label: 'Rachel (premade)', name: 'Rachel', voice_id: '21m00Tcm4TlvDq8ikWAM' }]
    })

    await expect(getElevenLabsVoices('default')).resolves.toMatchObject({ available: true })

    expect(mockDashboardRequest).toHaveBeenCalledWith({
      path: '/api/audio/elevenlabs/voices',
      profile: 'default'
    })
  })
})

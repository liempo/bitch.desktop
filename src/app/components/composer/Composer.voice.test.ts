import { describe, expect, it } from 'vitest'

import composerSource from './Composer.svelte?raw'

describe('Composer voice source contract', () => {
  it('captures microphone audio in the browser and transcribes through the remote dashboard bridge', () => {
    expect(composerSource).toContain('navigator.mediaDevices.getUserMedia')
    expect(composerSource).toContain('new MediaRecorder')
    expect(composerSource).toContain('transcribeAudio')
    expect(composerSource).toContain('mergeTranscriptIntoDraft')
    expect(composerSource).toContain('aria-label="Record voice prompt"')
  })

  it('keeps conversation mode explicit: voice in, submit, and spoken assistant playback', () => {
    expect(composerSource).toContain('voiceConversationEnabled')
    expect(composerSource).toContain('Voice conversation')
    expect(composerSource).toContain('submitPrompt(sessionId, { text: nextDraft })')
    expect(composerSource).toContain('speakText')
    expect(composerSource).toContain('assistantTextForSpeech')
  })

  it('exposes server-side ElevenLabs voice choices only through dashboard audio metadata', () => {
    expect(composerSource).toContain('getElevenLabsVoices')
    expect(composerSource).toContain('/api/audio/elevenlabs/voices')
    expect(composerSource).toContain('selectedVoiceId')
    expect(composerSource).toContain('<select')
  })

  it('stops microphone and playback resources without transcribing discarded recordings on teardown', () => {
    expect(composerSource).toContain('stopVoiceResources')
    expect(composerSource).toContain('discardVoiceRecording = true')
    expect(composerSource).toContain('const shouldDiscard = discardVoiceRecording')
    expect(composerSource).toContain('if (!shouldDiscard)')
  })
})

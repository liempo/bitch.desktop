import { describe, expect, it, vi } from 'vitest'

import { assistantTextForSpeech, mergeTranscriptIntoDraft, preferredRecordingMimeType, voiceOptionLabel } from './voice'

describe('voice capture helpers', () => {
  it('chooses the first MediaRecorder MIME type supported by the browser', () => {
    const recorder = {
      isTypeSupported: vi.fn((mimeType: string) => mimeType === 'audio/webm;codecs=opus')
    }

    expect(preferredRecordingMimeType({ MediaRecorder: recorder })).toBe('audio/webm;codecs=opus')
    expect(recorder.isTypeSupported).toHaveBeenCalledWith('audio/webm;codecs=opus')
  })

  it('falls back to the browser default when MediaRecorder has no advertised type support', () => {
    expect(preferredRecordingMimeType({ MediaRecorder: undefined })).toBe('')
    expect(preferredRecordingMimeType({ MediaRecorder: { isTypeSupported: () => false } })).toBe('')
  })

  it('merges transcripts into the composer without crushing an existing draft', () => {
    expect(mergeTranscriptIntoDraft('', 'Launch the test')).toBe('Launch the test')
    expect(mergeTranscriptIntoDraft('Existing context', 'then summarize')).toBe('Existing context\nthen summarize')
    expect(mergeTranscriptIntoDraft('Existing context\n', 'then summarize')).toBe('Existing context\nthen summarize')
    expect(mergeTranscriptIntoDraft('Do not change this', '   ')).toBe('Do not change this')
  })

  it('extracts only completed assistant text for spoken playback', () => {
    expect(assistantTextForSpeech({ error: 'bad', pending: false, role: 'assistant', text: 'nope' })).toBeNull()
    expect(assistantTextForSpeech({ pending: true, role: 'assistant', text: 'still streaming' })).toBeNull()
    expect(assistantTextForSpeech({ pending: false, role: 'user', text: 'user text' })).toBeNull()
    expect(assistantTextForSpeech({ pending: false, role: 'assistant', text: '  Ready.  ' })).toBe('Ready.')
  })

  it('builds readable labels for server-side ElevenLabs voices', () => {
    expect(voiceOptionLabel({ label: 'Rachel (premade)', name: 'Rachel', voice_id: '21m00Tcm4TlvDq8ikWAM' })).toBe(
      'Rachel (premade)'
    )
    expect(voiceOptionLabel({ name: 'Domi', voice_id: 'AZnzlk1XvdvUeBnXmlld' })).toBe('Domi')
    expect(voiceOptionLabel({ voice_id: 'EXAVITQu4vr4xnSDxMaL' })).toBe('EXAVITQu4vr4xnSDxMaL')
  })
})

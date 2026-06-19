interface MediaRecorderLike {
  isTypeSupported?: (mimeType: string) => boolean
}

export interface VoiceCaptureRuntime {
  MediaRecorder?: MediaRecorderLike
}

export interface SpeechCandidate {
  error?: null | string
  pending?: boolean
  role: string
  text?: null | string
}

export interface VoiceOptionLike {
  label?: null | string
  name?: null | string
  voice_id?: null | string
}

const RECORDING_MIME_TYPE_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/ogg',
  'audio/mp4'
]

export function preferredRecordingMimeType(runtime: VoiceCaptureRuntime = globalThis): string {
  const recorder = runtime.MediaRecorder
  const supports = recorder?.isTypeSupported

  if (typeof supports !== 'function') {
    return ''
  }

  return RECORDING_MIME_TYPE_CANDIDATES.find(mimeType => supports.call(recorder, mimeType)) ?? ''
}

export function mergeTranscriptIntoDraft(draft: string, transcript: string): string {
  const cleanTranscript = transcript.trim()

  if (!cleanTranscript) return draft

  const cleanDraft = draft.trimEnd()
  return cleanDraft ? `${cleanDraft}\n${cleanTranscript}` : cleanTranscript
}

export function assistantTextForSpeech(message: SpeechCandidate | null | undefined): null | string {
  if (!message || message.role !== 'assistant' || message.pending || message.error) return null

  const text = message.text?.trim() ?? ''
  return text || null
}

export function voiceOptionLabel(voice: VoiceOptionLike): string {
  return voice.label?.trim() || voice.name?.trim() || voice.voice_id?.trim() || 'Voice'
}

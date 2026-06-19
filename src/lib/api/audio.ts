import { dashboardRequest } from '$lib/api/dashboard'

export interface AudioTranscriptionRequest {
  dataUrl: string
  mimeType?: string
}

export interface AudioTranscriptionResponse {
  ok: boolean
  provider?: null | string
  transcript: string
}

export interface AudioSpeakRequest {
  text: string
  voiceId?: null | string
}

export interface AudioSpeakResponse {
  data_url: string
  mime_type?: string
  ok: boolean
  provider?: null | string
}

export interface ElevenLabsVoice {
  label?: string
  name?: string
  voice_id: string
}

export interface ElevenLabsVoicesResponse {
  available: boolean
  voices: ElevenLabsVoice[]
}

export function transcribeAudio(
  { dataUrl, mimeType }: AudioTranscriptionRequest,
  profile?: null | string
): Promise<AudioTranscriptionResponse> {
  return dashboardRequest<AudioTranscriptionResponse>({
    body: { data_url: dataUrl, mime_type: mimeType },
    method: 'POST',
    path: '/api/audio/transcribe',
    profile
  })
}

export function speakText({ text, voiceId }: AudioSpeakRequest, profile?: null | string): Promise<AudioSpeakResponse> {
  const body: Record<string, string> = { text }
  const selectedVoice = voiceId?.trim()

  if (selectedVoice) {
    body.voice_id = selectedVoice
  }

  return dashboardRequest<AudioSpeakResponse>({
    body,
    method: 'POST',
    path: '/api/audio/speak',
    profile
  })
}

export function getElevenLabsVoices(profile?: null | string): Promise<ElevenLabsVoicesResponse> {
  return dashboardRequest<ElevenLabsVoicesResponse>({
    path: '/api/audio/elevenlabs/voices',
    profile
  })
}

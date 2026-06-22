import type {
  PaginatedSessions,
  SessionCreateResponse,
  SessionMessagesResponse,
  SessionResumeResponse,
  SessionSearchResponse
} from '$lib/types/hermes'

export interface DashboardSessionPort {
  listSessions(offset?: number, limit?: number, profile?: null | string): Promise<PaginatedSessions>
  searchSessions(query: string, profile?: null | string): Promise<SessionSearchResponse>
}

export interface SessionResumePort {
  createSession?(preview?: null | string, profile?: null | string): Promise<SessionCreateResponse>
  getSessionMessages?(sessionId: string, profile?: null | string): Promise<SessionMessagesResponse>
  resumeSession(sessionId: string, profile?: null | string): Promise<SessionResumeResponse | null>
}

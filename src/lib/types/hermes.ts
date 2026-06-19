export interface UsageStats {
  calls: number
  context_max?: number
  context_percent?: number
  context_used?: number
  cost_usd?: number
  input: number
  output: number
  total: number
}

interface SessionRuntimeInfo {
  branch?: string
  config_warning?: string
  credential_warning?: string
  cwd?: string
  desktop_contract?: number
  fast?: boolean
  model?: string
  personality?: string
  provider?: string
  reasoning_effort?: string
  running?: boolean
  service_tier?: string
  skills?: Record<string, string[]> | string[]
  tools?: Record<string, string[]>
  usage?: Partial<UsageStats>
  version?: string
  yolo?: boolean
}

export interface SessionInfo {
  archived?: boolean
  cwd?: null | string
  ended_at: null | number
  id: string
  /** Original root id of a compression chain, when this entry is a projected
   *  continuation tip. Stable across compressions — used as the durable id for
   *  pins so a pinned conversation survives auto-compression. */
  _lineage_root_id?: null | string
  /** Alternate lineage root shape returned by some session/search payloads. */
  lineage_root?: null | string
  input_tokens: number
  is_active: boolean
  last_active: number
  message_count: number
  model: null | string
  output_tokens: number
  preview: null | string
  source: null | string
  started_at: number
  title: null | string
  tool_call_count: number
  /** Owning profile name, set by /api/profiles/sessions. Legacy single-profile
   *  responses omit this and are treated as the default profile. */
  profile?: string
  /** True when profile is the default/root Hermes profile. */
  is_default_profile?: boolean
}

export interface SessionMessage {
  codex_reasoning_items?: unknown
  content: unknown
  context?: unknown
  name?: string
  reasoning?: null | string
  reasoning_content?: null | string
  reasoning_details?: unknown
  role: 'assistant' | 'system' | 'tool' | 'user'
  text?: unknown
  timestamp?: number
  tool_call_id?: null | string
  tool_calls?: unknown
  tool_name?: string
}

export interface SessionMessagesResponse {
  messages: SessionMessage[]
  session_id: string
}

export interface SessionSearchResult {
  /** Lineage root of the matched conversation. Stable across compression and
   *  used as the durable pin id; falls back to session_id when absent. */
  lineage_root?: string | null
  model: string | null
  /** Matching query preview/snippet returned by search, normalized by the UI when present. */
  preview?: string | null
  /** Owning profile name, present on multi-profile search payloads or inferred locally. */
  profile?: string
  role: string | null
  /** Live compression tip of the matched conversation — resume by this id. */
  session_id: string
  session_started: number | null
  snippet: string
  source: string | null
  /** Stable session title returned by search, or inferred from the loaded session index. */
  title?: string | null
}

export interface SessionSearchResponse {
  results: SessionSearchResult[]
}

export interface PaginatedSessions {
  limit: number
  offset: number
  sessions: SessionInfo[]
  total: number
  /** Listable conversation count per profile, keyed by profile name. Present on
   *  /api/profiles/sessions and used for scoped pagination. */
  profile_totals?: Record<string, number>
  /** Per-profile read failures from the cross-profile aggregator. */
  errors?: Array<{ profile: string; error: string }>
}

export interface SessionCreateResponse {
  info?: SessionRuntimeInfo
  message_count?: number
  messages?: SessionMessage[]
  session_id: string
  stored_session_id?: string
}

export interface SessionResumeResponse {
  info?: SessionRuntimeInfo
  message_count: number
  messages: SessionMessage[]
  resumed: string
  session_id: string
}

export interface ModelInfoResponse {
  auto_context_length?: number
  capabilities?: Record<string, unknown>
  config_context_length?: number
  effective_context_length?: number
  model: string
  provider: string
}

interface ModelPricing {
  /** Formatted $/Mtok input price, e.g. "$3.00", or "free", or "" if unknown. */
  input: string
  /** Formatted $/Mtok output price. */
  output: string
  /** Formatted $/Mtok cached-input price, or null when the model has none. */
  cache: string | null
  /** True when the model costs nothing (free tier eligible). */
  free: boolean
}

interface ModelCapabilities {
  fast: boolean
  reasoning: boolean
}

export interface ModelOptionProvider {
  authenticated?: boolean
  auth_type?: string
  key_env?: string
  is_current?: boolean
  is_user_defined?: boolean
  models?: string[]
  name: string
  slug: string
  total_models?: number
  warning?: string
  /** Per-model pricing keyed by model id (present when the picker requested
   *  pricing and the provider supports live pricing). */
  pricing?: Record<string, ModelPricing>
  /** Nous only: whether the current account is on the free tier. */
  free_tier?: boolean
  /** Nous only: paid models a free-tier user cannot select (shown disabled). */
  unavailable_models?: string[]
  /** Per-model option support, keyed by model id (present when the picker
   *  requested capabilities). Lets the UI gate fast/reasoning controls. */
  capabilities?: Record<string, ModelCapabilities>
}

export interface ModelOptionsResponse {
  model?: string
  provider?: string
  providers?: ModelOptionProvider[]
}

export interface ProfileInfo {
  has_env: boolean
  is_default: boolean
  model: null | string
  name: string
  path: string
  provider: null | string
  skill_count: number
}

export interface ProfilesResponse {
  profiles: ProfileInfo[]
}

export interface ConfigRawResponse {
  path: string
  yaml: string
}

export interface ConfigFieldSchema {
  category?: string
  description?: string
  options?: unknown[]
  type?: 'boolean' | 'list' | 'number' | 'select' | 'string' | 'text'
}

export interface ConfigSchemaResponse {
  category_order?: string[]
  fields: Record<string, ConfigFieldSchema>
}

export interface SkillInfo {
  category?: string
  description?: string
  enabled: boolean
  name: string
}

export interface SkillContentResponse {
  content: string
  name: string
  path: string
}

export interface ToolsetInfo {
  available?: boolean
  configured?: boolean
  description?: string
  enabled: boolean
  label?: string
  name: string
  tools?: string[]
}

export interface MessagingEnvVarInfo {
  advanced?: boolean
  description?: string
  is_password?: boolean
  is_set?: boolean
  key: string
  prompt?: string
  redacted_value?: null | string
  required?: boolean
  url?: null | string
}

interface MessagingHomeChannel {
  chat_id: string
  name: string
  platform: string
  thread_id?: string
}

export interface MessagingPlatformInfo {
  configured: boolean
  description?: string
  docs_url?: string
  enabled: boolean
  env_vars?: MessagingEnvVarInfo[]
  error_code?: null | string
  error_message?: null | string
  gateway_running?: boolean
  home_channel?: MessagingHomeChannel | null
  id: string
  name: string
  state?: null | string
  updated_at?: null | string
}

export interface MessagingPlatformsResponse {
  env_path?: string
  gateway_start_command?: string
  platforms: MessagingPlatformInfo[]
}

export interface MessagingPlatformUpdate {
  clear_env?: string[]
  enabled?: boolean
  env?: Record<string, string>
}

export interface MessagingPlatformTestResponse {
  message: string
  ok: boolean
  state?: null | string
}

export interface ModelAssignmentRequest {
  api_key?: string
  base_url?: string
  model: string
  provider: string
  scope: 'auxiliary' | 'main'
  task?: string
}

export interface ModelAssignmentResponse {
  base_url?: string
  gateway_tools?: string[]
  model?: string
  ok: boolean
  provider?: string
  reset?: boolean
  scope?: string
  stale_aux?: Array<{ model: string; provider: string; task: string }>
  task?: string
}

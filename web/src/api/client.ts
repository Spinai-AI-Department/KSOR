const BASE_URL = import.meta.env.VITE_API_BASE_URL
const API_PREFIX = '/api'

type RequestOptions = {
  method?: string
  body?: unknown
  token?: string
  headers?: HeadersInit
}

interface ApiEnvelope<T> {
  status: string
  message: string
  data: T
}

// ── Validation error with field info ──
export interface FieldError {
  field: string
  message: string
  type: string
}

export class ApiValidationError extends Error {
  fields: FieldError[]
  constructor(message: string, fields: FieldError[]) {
    super(message)
    this.name = 'ApiValidationError'
    this.fields = fields
  }
}

const _msgKo: Record<string, string> = {
  'Input should be a valid UUID': '올바른 형식이 아닙니다',
  'Field required': '필수 항목입니다',
  'Input should be a valid integer': '정수를 입력해주세요',
  'Input should be a valid number': '숫자를 입력해주세요',
  'Input should be a valid date': '올바른 날짜를 입력해주세요',
  'Input should be a valid string': '문자를 입력해주세요',
  'Input should be a valid boolean': '올바른 값을 선택해주세요',
  'String should have at least 1 character': '1자 이상 입력해주세요',
  'Value error, value is not a valid integer': '정수를 입력해주세요',
}

export function translateValidationMsg(msg: string): string {
  // Exact match first
  if (_msgKo[msg]) return _msgKo[msg]
  // Prefix match for messages with extra detail (e.g. "Input should be a valid UUID, invalid length: ...")
  for (const [en, ko] of Object.entries(_msgKo)) {
    if (msg.startsWith(en)) return ko
  }
  if (msg.startsWith('Input should be greater than or equal to')) {
    const num = msg.match(/(\d+)/)?.[1]
    return `${num} 이상의 값을 입력해주세요`
  }
  if (msg.startsWith('Input should be less than or equal to')) {
    const num = msg.match(/(\d+)/)?.[1]
    return `${num} 이하의 값을 입력해주세요`
  }
  if (msg.startsWith('String should have at most')) {
    const num = msg.match(/(\d+)/)?.[1]
    return `${num}자 이하로 입력해주세요`
  }
  if (msg.startsWith('String should have at least')) {
    const num = msg.match(/(\d+)/)?.[1]
    return `${num}자 이상 입력해주세요`
  }
  if (msg.startsWith('Value error')) return '올바르지 않은 값입니다'
  return msg
}

function parseErrorResponse(status: number, error: Record<string, unknown>): Error {
  if (status === 422 && Array.isArray(error.data)) {
    const fields = error.data as FieldError[]
    return new ApiValidationError(
      String(error.message ?? '입력값 검증에 실패했습니다.'),
      fields,
    )
  }
  return new Error(String(error.message ?? error.detail ?? 'Request failed'))
}

// ── Token refresh hook (set by AuthProvider) ──
let _tokenRefresher: (() => Promise<string | null>) | null = null

export function setTokenRefresher(fn: (() => Promise<string | null>) | null) {
  _tokenRefresher = fn
}

// Paths that should never trigger auto-refresh (to avoid loops)
const NO_REFRESH_PATHS = ['/auth/login', '/auth/refresh', '/auth/logout']

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token, headers: extraHeaders } = options

  const headers: HeadersInit = { 'Content-Type': 'application/json', ...extraHeaders }
  if (token) (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE_URL}${API_PREFIX}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  // On 401, attempt a token refresh and retry once
  if (res.status === 401 && token && _tokenRefresher && !NO_REFRESH_PATHS.some(p => path.startsWith(p))) {
    const newToken = await _tokenRefresher()
    if (newToken) {
      const retryHeaders: HeadersInit = { 'Content-Type': 'application/json', ...extraHeaders }
      ;(retryHeaders as Record<string, string>)['Authorization'] = `Bearer ${newToken}`

      const retry = await fetch(`${BASE_URL}${API_PREFIX}${path}`, {
        method,
        headers: retryHeaders,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })

      if (!retry.ok) {
        const error = await retry.json().catch(() => ({ message: retry.statusText }))
        throw new Error(error.message ?? error.detail ?? 'Request failed')
      }
      if (retry.status === 204) return undefined as T
      const envelope: ApiEnvelope<T> = await retry.json()
      return envelope.data
    }
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }))
    throw parseErrorResponse(res.status, error)
  }

  if (res.status === 204) return undefined as T

  const envelope: ApiEnvelope<T> = await res.json()
  return envelope.data
}

export const api = {
  get: <T>(path: string, token?: string) => request<T>(path, { token }),
  post: <T>(path: string, body: unknown, token?: string) => request<T>(path, { method: 'POST', body, token }),
  put: <T>(path: string, body: unknown, token?: string) => request<T>(path, { method: 'PUT', body, token }),
  patch: <T>(path: string, body: unknown, token?: string) => request<T>(path, { method: 'PATCH', body, token }),
  delete: <T>(path: string, token?: string) => request<T>(path, { method: 'DELETE', token }),
  /** Raw fetch with API prefix (for blob downloads) */
  rawFetch: (path: string, init?: RequestInit) => fetch(`${BASE_URL}${API_PREFIX}${path}`, init),
}

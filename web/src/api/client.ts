const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'
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

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token, headers: extraHeaders } = options

  const headers: HeadersInit = { 'Content-Type': 'application/json', ...extraHeaders }
  if (token) (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE_URL}${API_PREFIX}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(error.message ?? error.detail ?? 'Request failed')
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

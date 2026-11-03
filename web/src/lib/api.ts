import type { ApiEnvelope, Upload } from '@shared/types'

export type QueryValue = string | number | boolean | null | undefined | Array<string | number>
export type Query = Record<string, QueryValue>

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** JSON body (objects) or FormData. */
  body?: unknown
  /** Query string params; `undefined`/`null` are skipped, arrays are joined with ','. */
  query?: Query
  signal?: AbortSignal
  headers?: Record<string, string>
}

export interface ApiErrorShape {
  code: string
  message: string
  fields?: Record<string, string>
  data?: unknown
  status: number
}

/** Thrown by `api()` for any non-ok envelope, HTTP error or network failure. */
export class ApiError extends Error implements ApiErrorShape {
  code: string
  fields?: Record<string, string>
  data?: unknown
  status: number
  constructor(e: ApiErrorShape) {
    super(e.message)
    this.name = 'ApiError'
    this.code = e.code
    this.fields = e.fields
    this.data = e.data
    this.status = e.status
  }
  /** True for network-level failures (no response). */
  get isNetwork() {
    return this.status === 0
  }
}

export function isApiError(e: unknown, code?: string): e is ApiError {
  return e instanceof ApiError && (code === undefined || e.code === code)
}

export function buildQuery(query?: Query): string {
  if (!query) return ''
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue
    sp.set(k, Array.isArray(v) ? v.join(',') : String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

/** Fired on `window` when any request returns 401 so the auth store can drop the session. */
export const UNAUTHORIZED_EVENT = 'anwo:unauthorized'

/**
 * Fetch wrapper that unwraps the `{ ok, data }` envelope and throws `ApiError` otherwise.
 * Sends the CSRF header, same-origin cookies and JSON automatically.
 */
export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { method = opts.body !== undefined ? 'POST' : 'GET', body, query, signal, headers = {} } = opts
  const url = path + buildQuery(query)
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData
  const init: RequestInit = {
    method,
    credentials: 'same-origin',
    signal,
    headers: {
      Accept: 'application/json',
      'X-Requested-With': 'fetch',
      ...(body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
  }

  let res: Response
  try {
    res = await fetch(url, init)
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e
    throw new ApiError({ code: 'NETWORK', message: 'Network request failed', status: 0 })
  }

  if (res.status === 204) return undefined as T

  let json: ApiEnvelope<T> | null = null
  const text = await res.text()
  if (text) {
    try {
      json = JSON.parse(text) as ApiEnvelope<T>
    } catch {
      json = null
    }
  }

  if (json && json.ok === true) return json.data
  if (json && json.ok === false) {
    const err = new ApiError({ ...json.error, status: res.status })
    if (res.status === 401 && err.code === 'UNAUTHORIZED' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT, { detail: { path } }))
    }
    throw err
  }
  throw new ApiError({
    code: res.ok ? 'BAD_RESPONSE' : res.status === 404 ? 'NOT_FOUND' : 'HTTP_ERROR',
    message: res.ok ? 'Malformed response' : `HTTP ${res.status}`,
    status: res.status,
  })
}

export interface UploadOptions {
  signal?: AbortSignal
  /** 0..1 progress for the whole batch (uses XHR when provided). */
  onProgress?: (fraction: number) => void
}

/**
 * Upload 1..10 files to `POST /api/uploads` (multipart `file` repeated).
 * Returns the `Upload[]` DTOs. Private uploads (verification) are forced private by the server.
 */
export async function uploadFiles(
  files: File[] | FileList,
  purpose: string,
  isPrivate = false,
  opts: UploadOptions = {},
): Promise<Upload[]> {
  const list = Array.from(files)
  const form = new FormData()
  for (const f of list) form.append('file', f, f.name)
  form.append('purpose', purpose)
  form.append('private', isPrivate ? '1' : '0')

  if (!opts.onProgress) return api<Upload[]>('/api/uploads', { method: 'POST', body: form, signal: opts.signal })

  return new Promise<Upload[]>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/uploads')
    xhr.withCredentials = true
    xhr.setRequestHeader('X-Requested-With', 'fetch')
    xhr.setRequestHeader('Accept', 'application/json')
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) opts.onProgress?.(ev.loaded / ev.total)
    }
    xhr.onerror = () => reject(new ApiError({ code: 'NETWORK', message: 'Upload failed', status: 0 }))
    xhr.onabort = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    xhr.onload = () => {
      let json: ApiEnvelope<Upload[]> | null = null
      try {
        json = JSON.parse(xhr.responseText)
      } catch {
        json = null
      }
      if (json?.ok) resolve(json.data)
      else if (json && json.ok === false) reject(new ApiError({ ...json.error, status: xhr.status }))
      else reject(new ApiError({ code: 'HTTP_ERROR', message: `HTTP ${xhr.status}`, status: xhr.status }))
    }
    opts.signal?.addEventListener('abort', () => xhr.abort())
    xhr.send(form)
  })
}

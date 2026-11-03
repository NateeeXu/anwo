import { create } from 'zustand'
import { useAuthStore } from './auth'

/** WS_EVENTS.md client. One socket per tab, cookie auth, envelope frames, acks, heartbeat, jittered backoff. */

export type WsStatus = 'idle' | 'connecting' | 'open' | 'ready' | 'polling' | 'closed' | 'suspended'

export interface Frame<T = unknown> {
  type: string
  id?: string
  ts: string
  data?: T
}

export class WsError extends Error {
  code: string
  fields?: Record<string, string>
  data?: unknown
  constructor(code: string, message: string, extra: { fields?: Record<string, string>; data?: unknown } = {}) {
    super(message)
    this.name = 'WsError'
    this.code = code
    this.fields = extra.fields
    this.data = extra.data
  }
}

export type Handler<T = unknown> = (data: T, frame: Frame<T>) => void

interface WsState {
  status: WsStatus
  /** consecutive failed attempts */
  attempts: number
  /** ts of the last processed server frame (for `/api/chat/sync?since=`) */
  lastEventTs: string | null
  readyData: ReadyData | null
}

export interface ReadyData {
  userId: string
  connectionId: string
  serverTime: string
  unread: { notifications: number; messages: number }
  flags: Record<string, boolean>
  resumeFrom: string
}

export const useWsStore = create<WsState>(() => ({ status: 'idle', attempts: 0, lastEventTs: null, readyData: null }))

const FIRE_AND_FORGET = new Set(['chat.typing', 'presence.ping', 'ping'])
const ACK_TIMEOUT = 10_000
const HEARTBEAT_MS = 30_000
const PONG_TIMEOUT = 10_000
const STABLE_MS = 30_000

interface Pending {
  resolve: (v: unknown) => void
  reject: (e: WsError) => void
  timer: ReturnType<typeof setTimeout>
}

export interface WsClient {
  subscribe: (topic: string) => void
  unsubscribe: (topic: string) => void
  /** Send a frame; resolves with the `ack` data (or immediately for fire-and-forget types). */
  send: <R = unknown>(type: string, data?: unknown, opts?: { timeoutMs?: number }) => Promise<R>
  /** Listen to a server frame type (`'*'` for all). Returns `off()`. */
  on: <T = unknown>(type: string, handler: Handler<T>) => () => void
  readonly status: WsStatus
  readonly isReady: boolean
  readonly lastEventTs: string | null
  connect: () => void
  disconnect: () => void
  /** Reconnect now (visibility / online / manual retry). */
  reconnect: () => void
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

function createClient(): WsClient {
  let socket: WebSocket | null = null
  let stopped = true
  let permanentlyStopped = false
  let openedAt = 0
  let everOpened = false
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let pongTimer: ReturnType<typeof setTimeout> | null = null
  let busyRetry4429 = false
  const desired = new Set<string>()
  const pending = new Map<string, Pending>()
  const handlers = new Map<string, Set<Handler<never>>>()

  const setStatus = (status: WsStatus) => useWsStore.setState({ status })

  function emit(frame: Frame) {
    const run = (set?: Set<Handler<never>>) => {
      if (!set) return
      for (const h of Array.from(set)) {
        try {
          ;(h as Handler)(frame.data, frame)
        } catch (e) {
          console.error('[ws] handler error', frame.type, e)
        }
      }
    }
    run(handlers.get(frame.type))
    run(handlers.get('*'))
  }

  function clearTimers() {
    if (heartbeatTimer) clearInterval(heartbeatTimer)
    heartbeatTimer = null
    if (pongTimer) clearTimeout(pongTimer)
    pongTimer = null
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  function rejectAll(code: string, message: string) {
    for (const [id, p] of pending) {
      clearTimeout(p.timer)
      p.reject(new WsError(code, message))
      pending.delete(id)
    }
  }

  function rawSend(frame: Frame) {
    if (!socket || socket.readyState !== WebSocket.OPEN) throw new WsError('NOT_CONNECTED', 'Socket is not open')
    socket.send(JSON.stringify(frame))
  }

  function startHeartbeat() {
    if (heartbeatTimer) clearInterval(heartbeatTimer)
    heartbeatTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      if (!socket || socket.readyState !== WebSocket.OPEN) return
      try {
        rawSend({ type: 'ping', ts: new Date().toISOString(), data: {} })
      } catch {
        return
      }
      if (pongTimer) clearTimeout(pongTimer)
      pongTimer = setTimeout(() => {
        // half-open socket: force close & reconnect
        socket?.close(4000, 'pong timeout')
      }, PONG_TIMEOUT)
    }, HEARTBEAT_MS)
  }

  function scheduleReconnect(immediate = false) {
    if (stopped || permanentlyStopped) return
    if (reconnectTimer) clearTimeout(reconnectTimer)
    const { attempts } = useWsStore.getState()
    const delay = immediate ? 0 : Math.min(30_000, 1000 * 2 ** attempts) * (0.5 + Math.random())
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      open()
    }, delay)
  }

  async function checkSessionThenRetry() {
    // The browser hides HTTP 401 on upgrade (close 1006). After repeated handshake failures, ask REST.
    try {
      const res = await fetch('/api/auth/me', { credentials: 'same-origin', headers: { 'X-Requested-With': 'fetch' } })
      if (res.status === 401) {
        useAuthStore.getState().setUser(null)
        stop('closed')
        return
      }
    } catch {
      /* offline: keep backing off */
    }
    scheduleReconnect()
  }

  function open() {
    if (stopped || permanentlyStopped) return
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    setStatus(useWsStore.getState().attempts >= 3 ? 'polling' : 'connecting')
    let ws: WebSocket
    try {
      ws = new WebSocket(`${proto}://${location.host}/ws`)
    } catch {
      useWsStore.setState((s) => ({ attempts: s.attempts + 1 }))
      scheduleReconnect()
      return
    }
    socket = ws
    let gotOpen = false

    ws.onopen = () => {
      gotOpen = true
      everOpened = true
      openedAt = Date.now()
      setStatus('open')
    }

    ws.onmessage = (ev) => {
      let frame: Frame
      try {
        frame = JSON.parse(String(ev.data)) as Frame
      } catch {
        return
      }
      if (!frame || typeof frame.type !== 'string') return
      if (frame.ts) useWsStore.setState({ lastEventTs: frame.ts })

      switch (frame.type) {
        case 'ready': {
          useWsStore.setState({ status: 'ready', attempts: 0, readyData: frame.data as ReadyData })
          startHeartbeat()
          if (desired.size) {
            void client.send('subscribe', { topics: Array.from(desired) }).catch(() => {})
          }
          break
        }
        case 'pong': {
          if (pongTimer) clearTimeout(pongTimer)
          pongTimer = null
          break
        }
        case 'ack': {
          if (frame.id && pending.has(frame.id)) {
            const p = pending.get(frame.id)!
            clearTimeout(p.timer)
            pending.delete(frame.id)
            p.resolve(frame.data)
          }
          break
        }
        case 'error': {
          const d = (frame.data ?? {}) as { code?: string; message?: string; fields?: Record<string, string>; data?: unknown }
          if (frame.id && pending.has(frame.id)) {
            const p = pending.get(frame.id)!
            clearTimeout(p.timer)
            pending.delete(frame.id)
            p.reject(new WsError(d.code ?? 'INTERNAL', d.message ?? 'error', { fields: d.fields, data: d.data }))
          }
          if (d.code === 'BANNED') permanentlyStopped = true
          break
        }
        case 'session.expired': {
          void useAuthStore.getState().refresh()
          break
        }
        default:
          break
      }
      emit(frame)
    }

    ws.onerror = () => {
      /* onclose follows */
    }

    ws.onclose = (ev) => {
      if (socket === ws) socket = null
      if (heartbeatTimer) clearInterval(heartbeatTimer)
      heartbeatTimer = null
      if (pongTimer) clearTimeout(pongTimer)
      pongTimer = null
      rejectAll('DISCONNECTED', 'Socket closed')
      useWsStore.setState({ readyData: null })
      if (stopped) {
        setStatus('closed')
        return
      }
      const stable = gotOpen && Date.now() - openedAt >= STABLE_MS
      useWsStore.setState((s) => ({ attempts: stable ? 0 : s.attempts + 1 }))
      const attempts = useWsStore.getState().attempts
      setStatus(attempts >= 3 ? 'polling' : 'closed')

      switch (ev.code) {
        case 1000:
          // normal close requested by us
          if (!stopped) scheduleReconnect()
          return
        case 1001:
          scheduleReconnect(true)
          return
        case 4401:
          stop('closed')
          void useAuthStore.getState().refresh()
          return
        case 4403:
          permanentlyStopped = true
          stop('suspended')
          return
        case 4429:
          if (busyRetry4429) {
            setStatus('polling')
            stopped = true
            return
          }
          busyRetry4429 = true
          reconnectTimer = setTimeout(() => open(), 5000)
          return
        default:
          if (!gotOpen && !everOpened && attempts >= 3) void checkSessionThenRetry()
          else scheduleReconnect()
      }
    }
  }

  function stop(status: WsStatus) {
    stopped = true
    clearTimers()
    if (socket) {
      const s = socket
      socket = null
      try {
        s.close(1000)
      } catch {
        /* ignore */
      }
    }
    rejectAll('DISCONNECTED', 'Socket closed')
    useWsStore.setState({ status, readyData: null })
  }

  const client: WsClient = {
    get status() {
      return useWsStore.getState().status
    },
    get isReady() {
      return useWsStore.getState().status === 'ready'
    },
    get lastEventTs() {
      return useWsStore.getState().lastEventTs
    },
    subscribe(topic) {
      if (desired.has(topic)) return
      desired.add(topic)
      if (client.isReady) void client.send('subscribe', { topics: [topic] }).catch(() => {})
    },
    unsubscribe(topic) {
      if (!desired.delete(topic)) return
      if (client.isReady) void client.send('unsubscribe', { topics: [topic] }).catch(() => {})
    },
    send<R>(type: string, data?: unknown, opts: { timeoutMs?: number } = {}) {
      return new Promise<R>((resolve, reject) => {
        const frame: Frame = { type, ts: new Date().toISOString(), data: data ?? {} }
        if (FIRE_AND_FORGET.has(type)) {
          try {
            rawSend(frame)
            resolve(undefined as R)
          } catch (e) {
            reject(e as WsError)
          }
          return
        }
        const id = uuid()
        frame.id = id
        try {
          rawSend(frame)
        } catch (e) {
          reject(e as WsError)
          return
        }
        const timer = setTimeout(() => {
          pending.delete(id)
          reject(new WsError('TIMEOUT', `No ack for ${type} within ${opts.timeoutMs ?? ACK_TIMEOUT} ms`))
        }, opts.timeoutMs ?? ACK_TIMEOUT)
        pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer })
      })
    },
    on(type, handler) {
      let set = handlers.get(type)
      if (!set) {
        set = new Set()
        handlers.set(type, set)
      }
      set.add(handler as Handler<never>)
      return () => {
        set!.delete(handler as Handler<never>)
      }
    },
    connect() {
      if (permanentlyStopped) return
      stopped = false
      busyRetry4429 = false
      open()
    },
    disconnect() {
      stop('closed')
    },
    reconnect() {
      if (permanentlyStopped || stopped) return
      if (socket && socket.readyState === WebSocket.OPEN) return
      useWsStore.setState({ attempts: 0 })
      if (reconnectTimer) clearTimeout(reconnectTimer)
      reconnectTimer = null
      if (socket) {
        try {
          socket.close(1000)
        } catch {
          /* ignore */
        }
        socket = null
      }
      open()
    },
  }

  if (typeof window !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') client.reconnect()
    })
    window.addEventListener('online', () => client.reconnect())
    // Follow the auth store: connect when authed, disconnect when anon.
    const follow = (status: string) => {
      if (status === 'authed') client.connect()
      else if (status === 'anon') client.disconnect()
    }
    follow(useAuthStore.getState().status)
    useAuthStore.subscribe((s, prev) => {
      if (s.status !== prev.status) {
        if (s.status === 'authed') permanentlyStopped = false
        follow(s.status)
      }
    })
  }

  return client
}

let instance: WsClient | null = null

/** Singleton ws client. Connects automatically while the auth store is `authed`. */
export function getWs(): WsClient {
  if (!instance) instance = createClient()
  return instance
}

/** Reactive status: 'idle' | 'connecting' | 'open' | 'ready' | 'polling' | 'closed' | 'suspended'. */
export function useWsStatus(): WsStatus {
  return useWsStore((s) => s.status)
}

/** True when the UI should show the "reconnecting / polling" pill and modules should poll REST. */
export function useWsPolling(): boolean {
  const status = useWsStore((s) => s.status)
  const authed = useAuthStore((s) => s.status === 'authed')
  return authed && (status === 'polling' || status === 'closed')
}

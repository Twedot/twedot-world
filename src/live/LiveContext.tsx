import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { LiveStreamService } from './LiveStreamService'
import type { LiveRoom, ChatMessage, PaymentGate, JoinedInfo, FollowUpdate, BuildingUser, BuildingChatMessage, StreamPurchaseRequest } from './LiveStreamService'

const STREAM_WS = import.meta.env.VITE_STREAM_WS_URL ?? (
  import.meta.env.DEV
    ? `ws://${typeof window !== 'undefined' ? window.location.host : 'localhost:5173'}/stream-api/ws`
    : 'wss://prodapi.twedot.com/stream-api/ws'
)
const STREAM_API = import.meta.env.VITE_STREAM_API_URL ?? (
  import.meta.env.DEV ? '/stream-api' : 'https://prodapi.twedot.com/stream-api'
)

interface LiveCtx {
  service: LiveStreamService
  liveRooms: LiveRoom[]
  refreshRooms: () => void
}

const Ctx = createContext<LiveCtx | null>(null)

export function LiveProvider({ children }: { children: React.ReactNode }) {
  const serviceRef = useRef<LiveStreamService | null>(null)
  const [liveRooms, setLiveRooms] = useState<LiveRoom[]>([])

  if (!serviceRef.current) {
    serviceRef.current = new LiveStreamService(STREAM_WS)
  }

  const fetchRooms = async () => {
    try {
      const res = await fetch(`${STREAM_API}/streams/live`)
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data)) {
          setLiveRooms(data.map((r: Record<string, unknown>) => ({
            roomId: r.id as string,
            hostId: r.hostId as string,
            hostName: r.hostName as string,
            hostPhoto: (r.hostPhoto as string) ?? '',
            title: r.title as string,
            category: (r.category as string) ?? '',
            price: (r.price as number) ?? 0,
            viewers: (r.viewers as number) ?? 0,
            startedAt: (r.startedAt as number) ?? 0,
          })))
        }
      }
    } catch {}
  }

  useEffect(() => {
    serviceRef.current!.connect()
    fetchRooms()
    const interval = setInterval(fetchRooms, 10000)
    return () => {
      clearInterval(interval)
      serviceRef.current!.dispose()
    }
  }, [])

  return (
    <Ctx.Provider value={{ service: serviceRef.current!, liveRooms, refreshRooms: fetchRooms }}>
      {children}
    </Ctx.Provider>
  )
}

export function useLive() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useLive must be inside LiveProvider')
  return ctx
}

export type { LiveRoom, ChatMessage, PaymentGate, JoinedInfo, FollowUpdate, BuildingUser, BuildingChatMessage, StreamPurchaseRequest }

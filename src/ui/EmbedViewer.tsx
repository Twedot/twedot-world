/**
 * Minimal LiveKit viewer for <iframe> embedding in the Twedot web feed.
 * Loaded via world.twedot.com/?stream=ROOM_ID&embed=1
 * Uses the same service.joinStream() + event-handler pattern as ViewerStreamOverlay.
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { useLive } from '../live/LiveContext'
import type { PaymentGate, JoinedInfo, ChatMessage } from '../live/LiveContext'

const STREAM_API = import.meta.env.VITE_STREAM_API_URL ?? (
  import.meta.env.DEV ? '/stream-api' : 'https://prodapi.twedot.com/stream-api'
)

interface ChatMsg { id: number; user: string; color: string; text: string }
let _msgId = 0

interface Props { roomId: string }

export default function EmbedViewer({ roomId }: Props) {
  const { service } = useLive()
  const screenRef = useRef<HTMLVideoElement>(null)
  const cameraRef = useRef<HTMLVideoElement>(null)
  const audioRef  = useRef<HTMLAudioElement>(null)

  const [phase,     setPhase]     = useState<'connecting' | 'payment' | 'live' | 'ended'>('connecting')
  const [hostName,  setHostName]  = useState('')
  const [viewers,   setViewers]   = useState(0)
  const [title,     setTitle]     = useState('')
  const [hasCam,    setHasCam]    = useState(false)
  const [viewMode,  setViewMode]  = useState<'house' | 'camera'>('house')
  const [payGate,   setPayGate]   = useState<PaymentGate | null>(null)
  const [messages,  setMessages]  = useState<ChatMsg[]>([])

  const addMsg = useCallback((msg: Omit<ChatMsg, 'id'>) => {
    setMessages(prev => [...prev.slice(-30), { ...msg, id: ++_msgId }])
  }, [])

  // Track camera video availability
  useEffect(() => {
    const iv = setInterval(() => {
      const cam = cameraRef.current
      if (cam && (cam.srcObject || (cam.src && cam.src !== window.location.href && cam.readyState > 0))) {
        setHasCam(true)
      }
    }, 800)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    service.on({
      onJoined: async (info: JoinedInfo) => {
        setHostName(info.hostName)
        setTitle((info.title || '').replace(/^#+/, '').trim())
        setViewers(info.viewers)
        setPhase('live')
        // Give React a tick to mount video elements
        await new Promise(r => setTimeout(r, 80))
        service.setMediaElements(screenRef.current, cameraRef.current, audioRef.current)
        service.connectRoom(info.token, info.livekitUrl).catch(() => {})
      },

      onPaymentRequired: async (gate: PaymentGate) => {
        // Check localStorage guest session / already-paid status
        try {
          const uid = service.myUserId ?? ''
          const res = await fetch(
            `${STREAM_API}/payments/status?roomId=${encodeURIComponent(gate.roomId)}&userId=${encodeURIComponent(uid)}`,
            { credentials: 'include' },
          )
          if (res.ok) {
            const { paid } = await res.json() as { paid: boolean }
            if (paid) {
              setPhase('connecting')
              service.joinStream(gate.roomId)
              return
            }
          }
        } catch {}
        setHostName(gate.hostName)
        setTitle(gate.title)
        setPayGate(gate)
        setPhase('payment')
      },

      onChat: (msg: ChatMessage) => {
        const isMe = msg.userId === service.myUserId
        addMsg({ user: isMe ? 'You' : msg.user, color: msg.color, text: msg.text })
      },

      onViewerCount: (count) => {
        if (typeof count === 'number' && !isNaN(count)) setViewers(count)
      },

      onStreamEnded: () => setPhase('ended'),

      onError: (msg: string) => {
        if (msg === 'stream not found') setPhase('ended')
      },
    })

    service.joinStream(roomId)

    return () => {
      service.leaveStream()
      service.setMediaElements(null, null, null)
      service.on({
        onJoined: undefined, onPaymentRequired: undefined, onChat: undefined,
        onViewerCount: undefined, onStreamEnded: undefined, onError: undefined,
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId])

  /* ── Payment gate ── */
  if (phase === 'payment' && payGate) {
    const priceNaira = payGate.price > 0
      ? `₦${(payGate.price / 100).toLocaleString('en-NG')} to watch`
      : 'Paid stream'
    return (
      <div style={s.root}>
        <div style={s.gate}>
          <div style={s.gateLock}>🔒</div>
          <p style={s.gateTitle}>{hostName || 'Live'}{title ? ` · #${title}` : ''}</p>
          <p style={s.gatePrice}>{priceNaira}</p>
          <a href={`https://world.twedot.com/?stream=${roomId}`} target="_top" style={s.gateBtn}>
            Pay & Watch on Twedot World
          </a>
        </div>
      </div>
    )
  }

  /* ── Connecting ── */
  if (phase === 'connecting') {
    return (
      <div style={s.root}>
        <div style={s.center}>
          <div style={s.spinner} />
          <p style={{ color: '#aaa', fontSize: 13, marginTop: 12 }}>Joining stream…</p>
        </div>
        <style>{`@keyframes emb-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  /* ── Ended ── */
  if (phase === 'ended') {
    return (
      <div style={s.root}>
        <div style={s.center}>
          <p style={{ color: '#aaa', fontSize: 14 }}>Stream ended</p>
        </div>
      </div>
    )
  }

  /* ── Live ── */
  return (
    <div style={s.root}>
      {/* House / screen video */}
      <video
        ref={screenRef}
        autoPlay
        playsInline
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'contain', background: '#000',
          display: viewMode === 'house' ? 'block' : 'none' }}
      />
      {/* Camera track */}
      <video
        ref={cameraRef}
        autoPlay
        playsInline
        muted
        style={{
          position: 'absolute',
          ...(viewMode === 'camera'
            ? { inset: 0, width: '100%', height: '100%', objectFit: 'cover' }
            : { bottom: 8, right: 8, width: 76, height: 76, borderRadius: 38,
                objectFit: 'cover', border: '2px solid rgba(255,255,255,0.3)' }),
          display: hasCam ? 'block' : 'none',
          background: '#111',
        }}
      />
      <audio ref={audioRef} autoPlay playsInline style={{ display: 'none' }} />

      {/* Top bar */}
      <div style={s.topBar}>
        <span style={s.liveBadge}><span style={s.liveDot} />LIVE</span>
        <span style={s.topMeta}>{hostName}{title ? ` · #${title}` : ''}</span>
        <span style={s.viewerCount}>👁 {viewers}</span>
        {hasCam && (
          <button onClick={() => setViewMode(v => v === 'house' ? 'camera' : 'house')} style={s.viewBtn}>
            {viewMode === 'house' ? 'Camera' : 'House'}
          </button>
        )}
        <a href={`https://world.twedot.com/?stream=${roomId}`} target="_top" style={s.expandBtn} title="Open full">⛶</a>
      </div>

      {/* Chat overlay — last 5 messages, bottom-left, transparent */}
      {messages.length > 0 && (
        <div style={s.chatOverlay}>
          {messages.slice(-5).map(m => (
            <div key={m.id} style={s.chatRow}>
              <span style={{ ...s.chatUser, color: m.color || '#a78bfa' }}>{m.user}</span>
              <span style={s.chatText}>{m.text}</span>
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes emb-spin  { to { transform: rotate(360deg); } }
        @keyframes emb-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root: {
    position: 'fixed', inset: 0, background: '#000', overflow: 'hidden',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  center: {
    position: 'absolute', inset: 0,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  },
  spinner: {
    width: 28, height: 28,
    border: '3px solid rgba(255,255,255,0.15)',
    borderTop: '3px solid #FF0040',
    borderRadius: '50%',
    animation: 'emb-spin 0.8s linear infinite',
  },
  gate: {
    position: 'absolute', inset: 0,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 12, padding: 24,
    background: 'linear-gradient(135deg,#1a0a2e,#0a0a1a)',
  },
  gateLock: { fontSize: 40 },
  gateTitle: { color: '#fff', fontSize: 15, fontWeight: 700, margin: 0, textAlign: 'center' },
  gatePrice: { color: '#f59e0b', fontSize: 13, fontWeight: 600, margin: 0 },
  gateBtn: {
    marginTop: 8, padding: '10px 24px',
    background: '#FF0040', color: '#fff',
    borderRadius: 8, fontWeight: 700, fontSize: 14,
    textDecoration: 'none', display: 'inline-block',
  },
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '6px 10px',
    background: 'linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)',
  },
  liveBadge: {
    display: 'flex', alignItems: 'center', gap: 4,
    background: '#FF0040', color: '#fff',
    padding: '2px 7px', borderRadius: 4,
    fontSize: 10, fontWeight: 800, letterSpacing: 0.5, flexShrink: 0,
  },
  liveDot: {
    width: 5, height: 5, borderRadius: '50%', background: '#fff',
    animation: 'emb-pulse 1.5s ease-in-out infinite',
    display: 'inline-block',
  },
  topMeta: {
    color: '#fff', fontSize: 11, fontWeight: 600,
    flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  viewerCount: { color: 'rgba(255,255,255,0.8)', fontSize: 11, flexShrink: 0 },
  viewBtn: {
    background: 'rgba(255,255,255,0.12)', color: '#fff',
    border: 'none', borderRadius: 4, padding: '2px 8px',
    fontSize: 10, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
  },
  expandBtn: {
    color: 'rgba(255,255,255,0.6)', fontSize: 18, textDecoration: 'none',
    lineHeight: 1, flexShrink: 0, paddingLeft: 2,
  },
  /* Chat overlay */
  chatOverlay: {
    position: 'absolute', bottom: 12, left: 10,
    display: 'flex', flexDirection: 'column', gap: 4,
    maxWidth: '70%', pointerEvents: 'none',
  },
  chatRow: {
    display: 'flex', alignItems: 'baseline', gap: 5, flexWrap: 'wrap',
    background: 'rgba(0,0,0,0.35)',
    borderRadius: 6, padding: '3px 8px',
    backdropFilter: 'blur(4px)',
  },
  chatUser: {
    fontSize: 11, fontWeight: 700, flexShrink: 0,
    textShadow: '0 1px 3px rgba(0,0,0,0.8)',
  },
  chatText: {
    color: '#fff', fontSize: 11,
    textShadow: '0 1px 3px rgba(0,0,0,0.8)',
    wordBreak: 'break-word',
  },
}

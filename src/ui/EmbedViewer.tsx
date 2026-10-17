/**
 * Lightweight full-screen LiveKit viewer for mobile WebView embedding.
 * Loaded via world.twedot.com/?stream=ROOM_ID&embed=1
 * TikTok-style: full-screen video, floating transparent chat, comment input, action buttons.
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
  const chatEndRef = useRef<HTMLDivElement>(null)

  const [phase,    setPhase]    = useState<'connecting' | 'payment' | 'live' | 'ended'>('connecting')
  const [hostName, setHostName] = useState('')
  const [viewers,  setViewers]  = useState(0)
  const [title,    setTitle]    = useState('')
  const [hasCam,   setHasCam]   = useState(false)
  const [viewMode, setViewMode] = useState<'house' | 'camera'>('house')
  const [payGate,  setPayGate]  = useState<PaymentGate | null>(null)
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input,    setInput]    = useState('')

  const addMsg = useCallback((msg: Omit<ChatMsg, 'id'>) => {
    setMessages(prev => [...prev.slice(-50), { ...msg, id: ++_msgId }])
  }, [])

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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
        await new Promise(r => setTimeout(r, 80))
        service.setMediaElements(screenRef.current, cameraRef.current, audioRef.current)
        service.connectRoom(info.token, info.livekitUrl).catch(() => {})
      },

      onPaymentRequired: async (gate: PaymentGate) => {
        try {
          const uid = service.myUserId ?? ''
          const res = await fetch(
            `${STREAM_API}/payments/status?roomId=${encodeURIComponent(gate.roomId)}&userId=${encodeURIComponent(uid)}`,
            { credentials: 'include' },
          )
          if (res.ok) {
            const { paid } = await res.json() as { paid: boolean }
            if (paid) { setPhase('connecting'); service.joinStream(gate.roomId); return }
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

  const sendChat = () => {
    const text = input.trim()
    if (!text) return
    service.sendChat(text)
    setInput('')
  }

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
      {/* Full-screen video — covers entire viewport */}
      <video
        ref={screenRef}
        autoPlay
        playsInline
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'cover', background: '#000',
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
            : { bottom: 90, right: 12, width: 72, height: 72, borderRadius: 36,
                objectFit: 'cover', border: '2px solid rgba(255,255,255,0.4)' }),
          display: hasCam ? 'block' : 'none',
          background: '#111',
        }}
      />
      <audio ref={audioRef} autoPlay playsInline style={{ display: 'none' }} />

      {/* Top gradient scrim */}
      <div style={s.topScrim} />
      {/* Bottom gradient scrim */}
      <div style={s.bottomScrim} />

      {/* Top bar: host info left, viewers + close right */}
      <div style={s.topBar}>
        <div style={s.hostRow}>
          <div style={s.liveBadge}><span style={s.liveDot} />LIVE</div>
          <span style={s.hostName}>{hostName}{title ? ` · #${title}` : ''}</span>
          <button style={s.followBtn}>+ Follow</button>
        </div>
        <div style={s.topRight}>
          <span style={s.viewerCount}>👥 {viewers}</span>
          {hasCam && (
            <button onClick={() => setViewMode(v => v === 'house' ? 'camera' : 'house')} style={s.camToggle}>
              {viewMode === 'house' ? '📷' : '🏠'}
            </button>
          )}
        </div>
      </div>

      {/* Floating chat messages — bottom left, transparent TikTok style */}
      <div style={s.chatOverlay}>
        {messages.slice(-8).map(m => (
          <div key={m.id} style={s.chatRow}>
            <div style={{ ...s.chatAvatar, background: m.color || '#a78bfa' }}>
              {(m.user[0] ?? '?').toUpperCase()}
            </div>
            <div style={s.chatBody}>
              <span style={{ ...s.chatUser, color: m.color || '#a78bfa' }}>{m.user} </span>
              <span style={s.chatText}>{m.text}</span>
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* Bottom bar: comment input + action buttons */}
      <div style={s.bottomBar}>
        <div style={s.inputWrap}>
          <input
            style={s.commentInput}
            placeholder="Add comment…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendChat()}
          />
        </div>
        <div style={s.actions}>
          <button style={s.actionBtn} title="Subscribe">
            <span style={s.actionIcon}>⭐</span>
            <span style={s.actionLabel}>Subscr...</span>
          </button>
          <button style={s.actionBtn} title="Gift">
            <span style={s.actionIcon}>🎁</span>
            <span style={s.actionLabel}>Gift</span>
          </button>
          <button style={s.actionBtn} title="Share">
            <span style={s.actionIcon}>↗</span>
            <span style={s.actionLabel}>Share</span>
          </button>
        </div>
      </div>

      <style>{`
        @keyframes emb-spin  { to { transform: rotate(360deg); } }
        @keyframes emb-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        input::placeholder { color: rgba(255,255,255,0.5); }
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
  /* Gradient scrims */
  topScrim: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 160, zIndex: 2, pointerEvents: 'none',
    background: 'linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 100%)',
  },
  bottomScrim: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 260, zIndex: 2, pointerEvents: 'none',
    background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%)',
  },
  /* Top bar */
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 14px',
  },
  hostRow: { display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  liveBadge: {
    display: 'flex', alignItems: 'center', gap: 4,
    background: '#FF0040', color: '#fff',
    padding: '3px 8px', borderRadius: 5,
    fontSize: 11, fontWeight: 800, letterSpacing: 0.5, flexShrink: 0,
  },
  liveDot: {
    width: 5, height: 5, borderRadius: '50%', background: '#fff',
    animation: 'emb-pulse 1.5s ease-in-out infinite',
    display: 'inline-block',
  },
  hostName: {
    color: '#fff', fontSize: 13, fontWeight: 700,
    flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    textShadow: '0 1px 4px rgba(0,0,0,0.9)',
  },
  followBtn: {
    background: 'transparent', border: '1.5px solid rgba(255,255,255,0.85)',
    color: '#fff', borderRadius: 5, padding: '3px 10px',
    fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
  },
  topRight: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  viewerCount: {
    color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: 600,
    textShadow: '0 1px 3px rgba(0,0,0,0.8)',
  },
  camToggle: {
    background: 'rgba(0,0,0,0.4)', border: 'none', color: '#fff',
    borderRadius: 20, width: 32, height: 32, fontSize: 16,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
  },
  /* Chat overlay — transparent TikTok style */
  chatOverlay: {
    position: 'absolute', bottom: 90, left: 12, zIndex: 10,
    display: 'flex', flexDirection: 'column', gap: 6,
    maxWidth: '72%', pointerEvents: 'none',
  },
  chatRow: {
    display: 'flex', alignItems: 'flex-start', gap: 7,
  },
  chatAvatar: {
    width: 26, height: 26, borderRadius: 13, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 11, fontWeight: 800, color: '#fff',
  },
  chatBody: {
    display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 3,
  },
  chatUser: {
    fontSize: 12, fontWeight: 800, flexShrink: 0,
    textShadow: '0 1px 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.7)',
  },
  chatText: {
    color: '#fff', fontSize: 13, fontWeight: 500,
    textShadow: '0 1px 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.7)',
    wordBreak: 'break-word',
  },
  /* Bottom bar */
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10,
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 12px 28px',
  },
  inputWrap: { flex: 1 },
  commentInput: {
    width: '100%', boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.15)',
    border: '1px solid rgba(255,255,255,0.25)',
    borderRadius: 24, padding: '10px 16px',
    color: '#fff', fontSize: 14, outline: 'none',
    backdropFilter: 'blur(8px)',
  },
  actions: { display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 },
  actionBtn: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
    background: 'none', border: 'none', cursor: 'pointer', padding: '4px 2px',
    width: 44,
  },
  actionIcon: { fontSize: 22, lineHeight: 1 },
  actionLabel: {
    color: '#fff', fontSize: 9, fontWeight: 700,
    textShadow: '0 1px 3px rgba(0,0,0,0.9)',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%', textAlign: 'center',
  },
}

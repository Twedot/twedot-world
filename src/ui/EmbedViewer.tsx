/**
 * Minimal LiveKit viewer rendered inside an <iframe> in the Twedot web feed.
 * Shows the live video full-width with a compact header. No house, no canvas.
 * Loaded via world.twedot.com/?stream=ROOM_ID&embed=1
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { useLive } from '../live/LiveContext'

const STREAM_API = import.meta.env.VITE_STREAM_API_URL ?? (
  import.meta.env.DEV ? '/stream-api' : 'https://prodapi.twedot.com/stream-api'
)

interface JoinResponse {
  token: string
  livekitUrl: string
  hostId?: string
  hostName?: string
  title?: string
  viewers?: number
}

interface Props {
  roomId: string
}

export default function EmbedViewer({ roomId }: Props) {
  const { service } = useLive()
  const screenRef = useRef<HTMLVideoElement>(null)
  const cameraRef = useRef<HTMLVideoElement>(null)
  const audioRef  = useRef<HTMLAudioElement>(null)

  const [phase,       setPhase]       = useState<'connecting' | 'payment' | 'live' | 'ended'>('connecting')
  const [hostName,    setHostName]    = useState('')
  const [title,       setTitle]       = useState('')
  const [viewers,     setViewers]     = useState(0)
  const [priceKobo,   setPriceKobo]   = useState(0)
  const [payUrl,      setPayUrl]      = useState('')
  const [hasCam,      setHasCam]      = useState(false)
  const [viewMode,    setViewMode]    = useState<'house' | 'camera'>('house')

  const join = useCallback(async () => {
    try {
      // Use guest session id so cross-origin redirect survives
      let sessionId: string | null = null
      try { sessionId = localStorage.getItem('tw_stream_session') } catch {}
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (sessionId) headers['X-Guest-Session'] = sessionId

      const res = await fetch(`${STREAM_API}/streams/${encodeURIComponent(roomId)}/join`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ sessionId }),
      })
      const data: Record<string, unknown> = await res.json()

      if (data.requiresPayment) {
        setPriceKobo((data.priceKobo as number) || 0)
        setHostName((data.hostName as string) || '')
        setPayUrl((data.paymentUrl as string) || '')
        setPhase('payment')
        return
      }

      if (!data.token) { setPhase('ended'); return }

      const info = data as unknown as JoinResponse
      setHostName(info.hostName || '')
      setTitle(info.title || '')
      setViewers(info.viewers || 0)

      setPhase('live')
      // Give React a tick to mount video elements
      await new Promise(r => setTimeout(r, 80))
      service.setMediaElements(screenRef.current, cameraRef.current, audioRef.current)
      await service.connectRoom(info.token, info.livekitUrl)
    } catch {
      setPhase('ended')
    }
  }, [roomId, service])

  useEffect(() => {
    join()
    return () => { service.disconnectRoom().catch(() => {}) }
  }, [join, service])

  // Track camera availability from the service
  useEffect(() => {
    const iv = setInterval(() => {
      // probe if camera ref has a src
      if (cameraRef.current?.srcObject || (cameraRef.current?.src && cameraRef.current.src !== window.location.href)) {
        setHasCam(true)
      }
    }, 1000)
    return () => clearInterval(iv)
  }, [])

  // ── Payment gate ────────────────────────────────────────────────
  if (phase === 'payment') {
    return (
      <div style={styles.root}>
        <div style={styles.gate}>
          <div style={styles.gateLock}>🔒</div>
          <p style={styles.gateTitle}>{hostName || 'Live'}</p>
          <p style={styles.gatePrice}>
            {priceKobo > 0 ? `₦${(priceKobo / 100).toLocaleString('en-NG')} to watch` : 'Paid stream'}
          </p>
          {payUrl ? (
            <a href={payUrl} style={styles.gateBtn}>Pay & Watch</a>
          ) : (
            <a href={`https://world.twedot.com/?stream=${roomId}`} target="_top" style={styles.gateBtn}>
              Watch on Twedot World
            </a>
          )}
        </div>
      </div>
    )
  }

  // ── Connecting ───────────────────────────────────────────────────
  if (phase === 'connecting') {
    return (
      <div style={styles.root}>
        <div style={styles.center}>
          <div style={styles.spinner} />
          <p style={{ color: '#aaa', fontSize: 13, marginTop: 12 }}>Joining stream…</p>
        </div>
      </div>
    )
  }

  // ── Ended ───────────────────────────────────────────────────────
  if (phase === 'ended') {
    return (
      <div style={styles.root}>
        <div style={styles.center}>
          <p style={{ color: '#aaa', fontSize: 14 }}>Stream ended</p>
        </div>
      </div>
    )
  }

  // ── Live ─────────────────────────────────────────────────────────
  return (
    <div style={styles.root}>
      {/* Main video */}
      <video
        ref={screenRef}
        autoPlay
        playsInline
        muted={false}
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'contain', background: '#000',
          display: viewMode === 'house' ? 'block' : 'none',
        }}
      />
      {/* Camera pip / main */}
      <video
        ref={cameraRef}
        autoPlay
        playsInline
        muted
        style={{
          position: 'absolute',
          ...(viewMode === 'camera'
            ? { inset: 0, width: '100%', height: '100%', objectFit: 'cover' }
            : { bottom: 8, right: 8, width: 80, height: 80, borderRadius: 40, objectFit: 'cover', border: '2px solid rgba(255,255,255,0.3)' }
          ),
          display: hasCam ? 'block' : 'none',
          background: '#111',
        }}
      />
      <audio ref={audioRef} autoPlay playsInline style={{ display: 'none' }} />

      {/* Top bar */}
      <div style={styles.topBar}>
        <span style={styles.liveBadge}>
          <span style={styles.liveDot} />
          LIVE
        </span>
        {hostName && <span style={styles.hostName}>{hostName}{title ? ` · #${title}` : ''}</span>}
        <span style={styles.viewerCount}>👁 {viewers}</span>
        {hasCam && (
          <button
            onClick={() => setViewMode(v => v === 'house' ? 'camera' : 'house')}
            style={styles.viewBtn}
          >
            {viewMode === 'house' ? 'Camera' : 'House'}
          </button>
        )}
        {/* Open full experience */}
        <a
          href={`https://world.twedot.com/?stream=${roomId}`}
          target="_top"
          style={styles.expandBtn}
          title="Open full experience"
        >
          ⛶
        </a>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: 'fixed', inset: 0,
    background: '#000',
    overflow: 'hidden',
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
    animation: 'embed-spin 0.8s linear infinite',
  },
  gate: {
    position: 'absolute', inset: 0,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 12, padding: 24,
    background: 'linear-gradient(135deg,#1a0a2e,#0a0a1a)',
  },
  gateLock: { fontSize: 40 },
  gateTitle: { color: '#fff', fontSize: 16, fontWeight: 700, margin: 0 },
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
    background: 'linear-gradient(to bottom, rgba(0,0,0,0.65), transparent)',
  },
  liveBadge: {
    display: 'flex', alignItems: 'center', gap: 4,
    background: '#FF0040', color: '#fff',
    padding: '2px 7px', borderRadius: 4,
    fontSize: 10, fontWeight: 800, letterSpacing: 0.5,
    flexShrink: 0,
  },
  liveDot: {
    width: 5, height: 5, borderRadius: '50%', background: '#fff',
    animation: 'embed-pulse 1.5s ease-in-out infinite',
  },
  hostName: {
    color: '#fff', fontSize: 12, fontWeight: 600,
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
}

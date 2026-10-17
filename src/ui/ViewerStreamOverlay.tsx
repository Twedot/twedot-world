import { useState, useEffect, useRef, useCallback } from 'react'
import { useLive } from '../live/LiveContext'
import type { PaymentGate, JoinedInfo, ChatMessage } from '../live/LiveContext'
import { followUser, unfollowUser, getUserProfile, getPublicSellerInventory, createPurchaseRequest } from '../api/twedotApi'
import type { InventoryItem } from '../api/twedotApi'
import './ViewerStreamOverlay.css'


interface Props {
  roomId: string
  onLeave: () => void
}

interface ChatMsg {
  id: number
  user: string
  color: string
  text: string
  system?: boolean
}

let _vid = 0

export default function ViewerStreamOverlay({ roomId, onLeave }: Props) {
  const { service } = useLive()
  const [state, setState] = useState<'connecting' | 'payment' | 'watching' | 'ended'>('connecting')
  const [paymentGate, setPaymentGate] = useState<PaymentGate | null>(null)
  const [streamerName, setStreamerName] = useState('')
  const [streamerAvatar, setStreamerAvatar] = useState<string | null>(null)
  const [streamTitle, setStreamTitle] = useState('')
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [viewers, setViewers] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [isFollowing, setIsFollowing] = useState(false)
  const [streamerId, setStreamerId] = useState('')
  const [followerCount, setFollowerCount] = useState(0)
  const isGuest = !service.myUserId || service.myUserId.startsWith('guest_')

  const screenRef = useRef<HTMLVideoElement>(null)
  const cameraRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const chatRef = useRef<HTMLDivElement>(null)
  const startRef = useRef(Date.now())
  const [viewMode, setViewMode] = useState<'house' | 'camera'>('house')
  const [hasCameraTrack, setHasCameraTrack] = useState(false)

  const [shopItems, setShopItems] = useState<InventoryItem[]>([])
  const [showShop, setShowShop] = useState(false)
  const [pendingRequests, setPendingRequests] = useState<{ requestId: string; itemName: string; status: 'pending' | 'accepted' | 'declined' }[]>([])
  const [payProcessing, setPayProcessing] = useState(false)
  const [payError, setPayError] = useState('')
  const payAbortRef = useRef<AbortController | null>(null)
  const streamApiBase = import.meta.env.VITE_STREAM_API_URL ?? (
    import.meta.env.DEV ? '/stream-api' : 'https://prodapi.twedot.com/stream-api'
  )

  const joinInfoRef = useRef<JoinedInfo | null>(null)

  const addMsg = useCallback((msg: Omit<ChatMsg, 'id'>) => {
    setMessages(prev => [...prev.slice(-200), { ...msg, id: ++_vid }])
  }, [])

  useEffect(() => {
    if (state !== 'watching') return
    const info = joinInfoRef.current
    if (!info) return
    joinInfoRef.current = null

    service.setMediaElements(screenRef.current, cameraRef.current, audioRef.current)
    service.connectRoom(info.token, info.livekitUrl).catch(err => {
      console.error('Failed to connect to LiveKit:', err)
      addMsg({ user: '', color: '', text: 'Failed to connect to stream', system: true })
    })

    if (info.hostId) {
      getUserProfile(info.hostId)
        .then(u => {
          setStreamerId(u.id)
          setIsFollowing(!!u.is_following)
          setFollowerCount(u.follower_count ?? 0)
        })
        .catch(() => {})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  useEffect(() => {
    service.on({
      onJoined: (info: JoinedInfo) => {
        joinInfoRef.current = info
        setStreamerName(info.hostName)
        setStreamerAvatar(info.hostPhoto || null)
        setStreamTitle(info.title)
        setViewers(info.viewers)
        setState('watching')
        startRef.current = Date.now()
        addMsg({ user: '', color: '', text: 'You joined the stream', system: true })
        // Load streamer's shop inventory
        if (info.hostId) {
          getPublicSellerInventory(info.hostId, 1, 30).then(({ items }) => setShopItems(items)).catch(() => {})
        }
      },
      onPaymentRequired: async (gate: PaymentGate) => {
        // 1. Auto-verify if returning from Paystack redirect (reference in sessionStorage)
        try {
          const ref = sessionStorage.getItem(`twpay_${gate.roomId}`)
          if (ref) {
            const verifyRes = await fetch(`${streamApiBase}/payments/verify`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ reference: ref, roomId: gate.roomId, userId: service.myUserId ?? '' }),
            })
            if (verifyRes.ok) {
              // Remove only after successful verify so retries can reuse the ref
              try { sessionStorage.removeItem(`twpay_${gate.roomId}`) } catch {}
              setState('connecting')
              service.joinStream(gate.roomId)
              return
            }
          }
        } catch { /* fall through */ }

        // 2. Check Redis directly — catches users who already paid but lost their
        //    sessionStorage reference (iOS Safari clears it on cross-origin redirects,
        //    or the tab was closed after paying). Guest session ID is now in
        //    localStorage so it stays stable across redirects.
        try {
          const uid = service.myUserId ?? ''
          const statusRes = await fetch(
            `${streamApiBase}/payments/status?roomId=${encodeURIComponent(gate.roomId)}&userId=${encodeURIComponent(uid)}`,
            { credentials: 'include' },
          )
          if (statusRes.ok) {
            const { paid } = await statusRes.json() as { paid: boolean }
            if (paid) {
              setState('connecting')
              service.joinStream(gate.roomId)
              return
            }
          }
        } catch { /* fall through to payment modal */ }

        setPaymentGate(gate)
        setStreamerName(gate.hostName)
        setStreamTitle(gate.title)
        setState('payment')
      },
      onChat: (msg: ChatMessage) => {
        const isMe = msg.userId === service.myUserId
        addMsg({ user: isMe ? 'You' : msg.user, color: msg.color, text: msg.text })
      },
      onViewerCount: (count) => {
        if (typeof count === 'number' && !isNaN(count)) setViewers(count)
      },
      onFollowUpdate: (update) => {
        if (update.targetUserId === streamerId || streamerId === '') {
          setFollowerCount(update.followerCount)
        }
      },
      onStreamEnded: () => {
        setState('ended')
        addMsg({ user: '', color: '', text: 'Stream has ended', system: true })
      },
      onRequestUpdate: (requestId, status) => {
        setPendingRequests(prev =>
          prev.map(r => r.requestId === requestId ? { ...r, status } : r)
        )
        const label = status === 'accepted'
          ? '✓ Your purchase request was accepted!'
          : '✗ Your purchase request was declined.'
        addMsg({ user: '', color: '', text: label, system: true })
      },
      onError: (msg: string) => {
        addMsg({ user: '', color: '', text: msg, system: true })
        if (msg === 'stream not found') setState('ended')
      },
    })

    service.joinStream(roomId)

    return () => {
      service.leaveStream()
      service.setMediaElements(null, null, null)
      service.on({
        onJoined: undefined,
        onPaymentRequired: undefined,
        onChat: undefined,
        onViewerCount: undefined,
        onFollowUpdate: undefined,
        onStreamEnded: undefined,
        onRequestUpdate: undefined,
        onError: undefined,
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId])

  useEffect(() => {
    if (state !== 'watching') return
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [state])

  useEffect(() => {
    const el = chatRef.current
    if (!el) return
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    }
  }, [messages])

  // When the user presses the browser back button from Paystack, the browser
  // restores this page from bfcache with payProcessing=true still set.
  // Reset payment state so the button reads "Pay" again instead of "Redirecting…"
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        payAbortRef.current?.abort()
        payAbortRef.current = null
        setPayProcessing(false)
        setPayError('')
      }
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [])

  function cancelPay() {
    payAbortRef.current?.abort()
    payAbortRef.current = null
    setPayProcessing(false)
    setPayError('')
  }

  async function handlePay() {
    if (!paymentGate || payProcessing) return
    setPayProcessing(true)
    setPayError('')

    const ctrl = new AbortController()
    payAbortRef.current = ctrl
    const timeout = setTimeout(() => ctrl.abort(), 30000)

    try {
      // Server-side payment init — works on all devices without Paystack domain whitelisting
      const initRes = await fetch(`${streamApiBase}/payments/initialize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: ctrl.signal,
        body: JSON.stringify({ roomId: paymentGate.roomId, userId: service.myUserId ?? '' }),
      })
      clearTimeout(timeout)
      if (!initRes.ok) {
        const errBody = await initRes.json().catch(() => ({}))
        throw new Error((errBody as { error?: string }).error ?? 'Payment service unavailable')
      }
      const { authorization_url, reference } = await initRes.json() as { authorization_url: string; reference: string }

      // Persist reference so we can auto-verify when Paystack redirects back
      try { sessionStorage.setItem(`twpay_${paymentGate.roomId}`, reference) } catch { /* private mode */ }

      // Redirect to Paystack's hosted checkout — works everywhere
      window.location.href = authorization_url
    } catch (err) {
      clearTimeout(timeout)
      payAbortRef.current = null
      const isAbort = err instanceof DOMException && err.name === 'AbortError'
      setPayError(isAbort ? 'Payment timed out — please try again.' : (err instanceof Error ? err.message : 'Could not start payment'))
      setPayProcessing(false)
    }
  }

  function sendMessage() {
    const text = input.trim()
    if (!text) return
    service.sendChat(text)
    setInput('')
  }

  function fmtTime(s: number): string {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  }

  // ── Payment gate ──────────────────────────────────────
  if (state === 'payment' && paymentGate) {
    const initial = paymentGate.hostName?.[0]?.toUpperCase() ?? '?'
    return (
      <div className="vs-root">
        <div className="vs-payment-overlay">
          <div className="vs-payment-modal">
            <button className="vs-payment-close" onClick={() => { cancelPay(); onLeave() }}>✕</button>
            <div className="vs-payment-live-badge">
              <span className="vs-payment-live-dot" />
              LIVE
            </div>
            {streamerAvatar
              ? <img className="vs-payment-avatar" src={streamerAvatar} alt="" />
              : <div className="vs-payment-avatar-fb">{initial}</div>
            }
            <div className="vs-payment-streamer">{paymentGate.hostName}</div>
            <div className="vs-payment-stream-title">{paymentGate.title}</div>
            <div className="vs-payment-price">₦{(paymentGate.price / 100).toLocaleString('en-NG')}</div>
            <div className="vs-payment-desc">
              Premium stream — pay once and rejoin anytime with the same device.
            </div>
            {payError && (
              <div className="vs-payment-error">{payError}</div>
            )}
            <button className="vs-payment-btn" onClick={handlePay} disabled={payProcessing}>
              {payProcessing ? 'Redirecting to payment…' : `Pay ₦${(paymentGate.price / 100).toLocaleString()} & Watch`}
            </button>
            <button className="vs-payment-cancel" onClick={() => { cancelPay(); onLeave() }}>
              Go Back
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Connecting ────────────────────────────────────────
  if (state === 'connecting') {
    return (
      <div className="vs-root">
        <div className="vs-connecting">
          <div className="vs-spinner" />
          <div className="vs-connecting-text">Joining stream...</div>
        </div>
      </div>
    )
  }

  // ── Stream ended ──────────────────────────────────────
  if (state === 'ended') {
    return (
      <div className="vs-root">
        <div className="vs-ended">
          <div className="vs-ended-icon">📡</div>
          <div className="vs-ended-title">Stream Ended</div>
          <div className="vs-ended-desc">
            {streamerName ? `${streamerName}'s stream has ended.` : 'This stream is no longer available.'}
          </div>
          <button className="vs-ended-btn" onClick={onLeave}>Back to City</button>
        </div>
      </div>
    )
  }

  // ── Watching ──────────────────────────────────────────
  return (
    <div className="vs-root">
      <audio ref={audioRef} autoPlay />

      <div className="vs-center">
        <div className="vs-badge-bar">
          <div className="vs-badge-live">
            <span className="vs-badge-dot" />
            LIVE
          </div>
          <div className="vs-badge-viewers">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
            </svg>
            {viewers}
          </div>
          <div className="vs-badge-timer">{fmtTime(elapsed)}</div>
          {shopItems.length > 0 && (
            <button className="vs-shop-btn" onClick={() => setShowShop(true)} title="View shop">
              🛍 Shop
            </button>
          )}
          <button
            className="vs-share-btn"
            onClick={(e) => {
              const url = `https://twedot.com/live/${roomId}`
              navigator.clipboard.writeText(url).catch(() => {})
              const btn = e.currentTarget as HTMLButtonElement
              btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = '🔗 Share' }, 2000)
            }}
          >🔗 Share</button>
          <button className="vs-leave-btn" onClick={onLeave}>Leave</button>
        </div>

        <div className="vs-video-area">
          <video
            ref={screenRef}
            className={`vs-video vs-video-layer ${viewMode === 'house' ? 'vs-video-active' : ''}`}
            autoPlay
            playsInline
            muted
          />
          <video
            ref={cameraRef}
            className={`vs-video vs-video-layer ${viewMode === 'camera' ? 'vs-video-active' : ''}`}
            autoPlay
            playsInline
            muted
            onPlay={() => setHasCameraTrack(true)}
          />
          <div className="vs-video-placeholder">
            <div className="vs-video-ph-icon">📡</div>
            <div className="vs-video-ph-text">Waiting for video...</div>
          </div>
          {hasCameraTrack && (
            <button
              className="vs-view-switch"
              onClick={() => setViewMode(v => v === 'house' ? 'camera' : 'house')}
              title={viewMode === 'house' ? 'Switch to camera' : 'Switch to house'}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16 17.01V10h-2v7.01h-3L15 21l4-3.99h-3zM9 3L5 6.99h3V14h2V6.99h3L9 3z"/>
              </svg>
              {viewMode === 'house' ? 'Camera' : 'House'}
            </button>
          )}
        </div>

        <div className="vs-info-bar">
          <div className="vs-info-left">
            <div className="vs-info-avatar">
              {streamerAvatar
                ? <img src={streamerAvatar} alt="" />
                : <div className="vs-info-avatar-fb">{streamerName[0]?.toUpperCase()}</div>
              }
            </div>
            <div className="vs-info-details">
              <div className="vs-info-name">{streamerName}</div>
              <div className="vs-info-stream-title">
                {streamTitle}
                {followerCount > 0 && <span className="vs-info-followers"> · {followerCount} followers</span>}
              </div>
            </div>
          </div>
          {!isGuest && streamerId !== service.myUserId && (
            <button
              className={`vs-follow-btn ${isFollowing ? 'vs-following' : ''}`}
              onClick={async () => {
                if (!streamerId) return
                try {
                  if (isFollowing) {
                    const r = await unfollowUser(streamerId)
                    setIsFollowing(r.is_following)
                    setFollowerCount(r.follower_count)
                    service.sendFollowUpdate(streamerId, r.follower_count, r.is_following)
                  } else {
                    const r = await followUser(streamerId)
                    setIsFollowing(r.is_following)
                    setFollowerCount(r.follower_count)
                    service.sendFollowUpdate(streamerId, r.follower_count, r.is_following)
                  }
                } catch {}
              }}
            >
              {isFollowing
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
              }
              {isFollowing ? 'Following' : 'Follow'}
            </button>
          )}
        </div>
      </div>

      {/* Right — Chat */}
      <div className="vs-chat">
        <div className="vs-chat-header">
          <span className="vs-chat-label">Stream Chat</span>
        </div>

        <div className="vs-chat-messages" ref={chatRef}>
          {messages.map(m => (
            <div key={m.id} className={`vs-msg ${m.system ? 'vs-msg-sys' : ''}`}>
              {m.system ? (
                <span className="vs-msg-sys-text">{m.text}</span>
              ) : (
                <>
                  <span className="vs-msg-user" style={{ color: m.color }}>{m.user}</span>
                  <span className="vs-msg-sep">: </span>
                  <span className="vs-msg-text">{m.text}</span>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="vs-chat-bottom">
          <div className="vs-chat-input-row">
            <input
              className="vs-chat-input"
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') sendMessage() }}
              placeholder="Send a message..."
            />
          </div>
          <div className="vs-chat-actions">
            <button className="vs-chat-icon-btn" title="Emoji">😀</button>
            <button className="vs-chat-send" onClick={sendMessage}>Chat</button>
          </div>
        </div>
      </div>

      {/* Shop overlay */}
      {showShop && (
        <div className="vs-shop-overlay" onClick={() => setShowShop(false)}>
          <div className="vs-shop-sheet" onClick={e => e.stopPropagation()}>
            <div className="vs-shop-handle" />
            <div className="vs-shop-header">
              <div className="vs-shop-title">{streamerName}'s Shop</div>
              <button className="vs-shop-close" onClick={() => setShowShop(false)}>×</button>
            </div>
            <div className="vs-shop-count">{shopItems.length} item{shopItems.length !== 1 ? 's' : ''} available</div>
            <div className="vs-shop-grid">
              {shopItems.map(item => {
                const imgUrl = item.images[0]?.image_url
                const already = pendingRequests.find(r => r.itemName === item.title)
                return (
                  <div key={item.id} className="vs-shop-card">
                    <div className="vs-shop-img">
                      {imgUrl ? <img src={imgUrl} alt="" /> : '📦'}
                    </div>
                    <div className="vs-shop-name">{item.title}</div>
                    <div className="vs-shop-price">
                      ₦{item.price.toLocaleString()}
                    </div>
                    {already ? (
                      <div className={`vs-shop-req-status vs-shop-req-${already.status}`}>
                        {already.status === 'pending' ? 'Requested' : already.status === 'accepted' ? '✓ Accepted' : '✗ Declined'}
                      </div>
                    ) : (
                      <button
                        className="vs-shop-buy-btn"
                        onClick={async () => {
                          if (isGuest) {
                            addMsg({ user: '', color: '', text: 'Log in to purchase items', system: true })
                            return
                          }
                          try {
                            const req = await createPurchaseRequest(item.id, 'livestream')
                            service.sendPurchaseRequest(req.id, item.id, item.title, Math.round(item.price * 100))
                            setPendingRequests(prev => [...prev, { requestId: req.id, itemName: item.title, status: 'pending' }])
                            addMsg({ user: '', color: '', text: `Purchase request sent for ${item.title}`, system: true })
                          } catch {
                            addMsg({ user: '', color: '', text: 'Could not send request — try again', system: true })
                          }
                        }}
                      >
                        Request to Buy
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

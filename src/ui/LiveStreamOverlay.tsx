import { useState, useEffect, useRef, useCallback } from 'react'
import { useLive } from '../live/LiveContext'
import { updatePurchaseRequestStatus } from '../api/twedotApi'
import './LiveStreamOverlay.css'

export interface StreamInventoryItem {
  id: string
  name: string
  price: string
  img?: string
}

export interface ProductRequest {
  id: number
  requestId: string  // DB id for API calls
  userId: string     // viewer's userId for WS relay
  user: string
  color: string
  itemId: string
  itemName: string
  itemPrice: string
  time: number
  status: 'pending' | 'accepted' | 'declined'
}

interface Props {
  roomId: string
  userId: string
  ownerName: string
  ownerAvatar: string | null
  inventoryItems: StreamInventoryItem[]
  followers: number
  following: number
  posts: number
  onEnd: (requests: ProductRequest[]) => void
  onCamMain?: (isMain: boolean) => void
  canvasRef?: React.RefObject<HTMLCanvasElement | null>
  onViewerJoined?: (userId: string, userName: string) => void
  onViewerLeft?: (userId: string) => void
  resuming?: boolean
}

type Phase = 'setup' | 'countdown' | 'live'

interface ChatMsg {
  id: number
  user: string
  color: string
  text: string
  system?: boolean
}

let _msgId = 0

export default function LiveStreamOverlay({ ownerName, ownerAvatar, inventoryItems, followers, following, posts, onEnd, onCamMain, canvasRef, onViewerJoined, onViewerLeft, resuming }: Props) {
  const { service } = useLive()
  const [phase, setPhase] = useState<Phase>(resuming ? 'live' : 'setup')
  const [title, setTitle] = useState('')
  const [price, setPrice] = useState('')
  const [category, setCategory] = useState('Just Chatting')
  const [countdown, setCountdown] = useState(5)
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [viewers, setViewers] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [liveFollowers, setLiveFollowers] = useState(followers)

  const [camOn, setCamOn] = useState(false)
  const [micOn, setMicOn] = useState(false)
  const [camError, setCamError] = useState<string | null>(null)
  const [camLoading, setCamLoading] = useState(false)
  const [viewMode, setViewMode] = useState<'camera' | 'house'>('camera')
  const [showAllItems, setShowAllItems] = useState(false)
  const [requests, setRequests] = useState<ProductRequest[]>([])
  const previewStreamRef = useRef<MediaStream | null>(null)
  const setupVidRef = useRef<HTMLVideoElement>(null)
  const countdownVidRef = useRef<HTMLVideoElement>(null)
  const pipVidRef = useRef<HTMLVideoElement>(null)
  const mainVidRef = useRef<HTMLVideoElement>(null)

  const chatRef = useRef<HTMLDivElement>(null)
  const startRef = useRef(resuming ? Date.now() : 0)

  const addMsg = useCallback((msg: Omit<ChatMsg, 'id'>) => {
    setMessages(prev => [...prev.slice(-150), { ...msg, id: ++_msgId }])
  }, [])

  // ── Camera preview (setup phase only) ──────────────────

  async function startCameraPreview() {
    if (previewStreamRef.current) return
    setCamLoading(true)
    setCamError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      })
      previewStreamRef.current = stream
      setCamOn(true)
      setMicOn(true)
      if (setupVidRef.current) {
        setupVidRef.current.srcObject = stream
        setupVidRef.current.play().catch(() => {})
      }
    } catch {
      setCamError('Camera access denied. Check browser permissions.')
    } finally {
      setCamLoading(false)
    }
  }

  function togglePreviewCam() {
    const s = previewStreamRef.current
    if (!s) return
    const track = s.getVideoTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    setCamOn(track.enabled)
  }

  function togglePreviewMic() {
    const s = previewStreamRef.current
    if (!s) return
    const track = s.getAudioTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    setMicOn(track.enabled)
  }

  function stopPreviewStream() {
    previewStreamRef.current?.getTracks().forEach(t => t.stop())
    previewStreamRef.current = null
    setCamOn(false)
    setMicOn(false)
  }

  useEffect(() => {
    if (phase === 'live') onCamMain?.(camOn && viewMode === 'camera')
  }, [phase, camOn, viewMode, onCamMain])

  useEffect(() => {
    const stream = previewStreamRef.current
    if (!camOn || !stream) return
    if (phase === 'setup' && setupVidRef.current) {
      setupVidRef.current.srcObject = stream
      setupVidRef.current.play().catch(() => {})
    }
    if (phase === 'countdown' && countdownVidRef.current) {
      countdownVidRef.current.srcObject = stream
      countdownVidRef.current.play().catch(() => {})
    }
    if (phase === 'live') {
      if (pipVidRef.current) {
        pipVidRef.current.srcObject = stream
        pipVidRef.current.play().catch(() => {})
      }
      if (mainVidRef.current) {
        mainVidRef.current.srcObject = stream
        mainVidRef.current.play().catch(() => {})
      }
    }
  }, [camOn, phase, viewMode])

  useEffect(() => {
    return () => { stopPreviewStream() }
  }, [])

  function handleEndStream() {
    service.endStream()
    stopPreviewStream()
    onEnd(requests)
  }

  // ── Stream lifecycle ────────────────────────────────────

  function handleStart() {
    if (!title.trim()) return
    setPhase('countdown')
    setCountdown(5)
  }

  useEffect(() => {
    if (phase !== 'countdown') return
    if (countdown <= 0) {
      setPhase('live')
      startRef.current = Date.now()
      return
    }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [phase, countdown])

  // ── Connect to stream service + LiveKit when going live ──
  useEffect(() => {
    if (phase !== 'live') return

    const hadCam = camOn

    const priceNum = price ? Math.round(parseFloat(price) * 100) || 0 : 0
    const streamTitle = '#' + title.trim().replace(/\s+/g, '')
    service.goLive(streamTitle, category, priceNum)

    service.on({
      onLiveStarted: async (_streamId, token, livekitUrl) => {
        try {
          await service.connectRoom(token, livekitUrl)

          if (canvasRef?.current) {
            await service.publishCanvas(canvasRef.current)
          }

          const preview = previewStreamRef.current

          // Publish CLONED mic track — original stays for local, clone goes to LiveKit
          try {
            const audioTrack = preview?.getAudioTracks()[0]
            if (audioTrack) {
              audioTrack.enabled = true
              await service.publishMicTrack(audioTrack.clone())
            } else {
              const micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
              await service.publishMicTrack(micStream.getAudioTracks()[0])
            }
            setMicOn(true)
          } catch {
            setMicOn(false)
          }

          // Publish CLONED camera track — original stays for local preview
          if (hadCam && preview) {
            try {
              const videoTrack = preview.getVideoTracks()[0]
              if (videoTrack) {
                await service.publishCameraTrack(videoTrack.clone())
              }
              setCamOn(true)
            } catch {
              setCamOn(false)
            }
          }
        } catch (err) {
          console.error('Failed to connect to LiveKit:', err)
          addMsg({ user: '', color: '', text: 'Failed to start stream', system: true })
        }
      },
      onViewerJoined: (userId, userName) => {
        setViewers(v => v + 1)
        onViewerJoined?.(userId, userName)
        if (userName) {
          addMsg({ user: '', color: '', text: `${userName} joined the stream`, system: true })
        }
      },
      onViewerLeft: (userId) => {
        setViewers(v => Math.max(0, v - 1))
        onViewerLeft?.(userId)
      },
      onViewerCount: (count) => {
        setViewers(count)
      },
      onChat: (msg) => {
        const isMe = msg.userId === service.myUserId
        addMsg({ user: isMe ? 'You' : msg.user, color: msg.color, text: msg.text })
      },
      onStreamEnded: () => {
        stopPreviewStream()
        onEnd(requests)
      },
      onFollowUpdate: (update) => {
        setLiveFollowers(update.followerCount)
      },
      onPurchaseRequest: (req) => {
        const color = '#' + req.userId.slice(-6).replace(/[^0-9a-f]/gi, 'A')
        const priceNGN = (req.itemPrice / 100).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })
        setRequests(prev => [
          {
            id: Date.now(),
            requestId: req.requestId,
            userId: req.userId,
            user: req.userName || req.userId.slice(0, 8),
            color,
            itemId: req.itemId,
            itemName: req.itemName,
            itemPrice: priceNGN,
            time: Date.now(),
            status: 'pending',
          },
          ...prev.slice(0, 49),
        ])
      },
      onError: (msg) => {
        addMsg({ user: '', color: '', text: msg, system: true })
      },
    })

    return () => {
      service.on({
        onLiveStarted: undefined,
        onViewerJoined: undefined,
        onViewerLeft: undefined,
        onViewerCount: undefined,
        onChat: undefined,
        onStreamEnded: undefined,
        onFollowUpdate: undefined,
        onPurchaseRequest: undefined,
        onError: undefined,
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // ── LiveKit camera/mic toggle in live phase ─────────────

  async function toggleLiveCam() {
    if (!camOn) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: 'user' },
        })
        previewStreamRef.current = stream
        await service.publishCameraTrack(stream.getVideoTracks()[0].clone())
        setCamOn(true)
      } catch {
        setCamOn(false)
      }
    } else {
      await service.unpublishCamera()
      previewStreamRef.current?.getVideoTracks().forEach(t => t.stop())
      previewStreamRef.current = null
      setCamOn(false)
    }
  }

  async function toggleLiveMic() {
    const next = !micOn
    try {
      await service.setMicEnabled(next)
      setMicOn(next)
    } catch {
      // mic toggle failed, don't change state
    }
  }

  // ── Timer ───────────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'live') return

    addMsg({ user: '', color: '', text: 'You are now live!', system: true })

    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000))
    }, 1000)

    return () => {
      clearInterval(timer)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, addMsg])

  useEffect(() => {
    const el = chatRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    if (nearBottom) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages])

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

  // ═══════════════════════ SETUP ═══════════════════════
  if (phase === 'setup') {
    return (
      <div className="ls-setup-overlay">
        <div className="ls-setup-modal">
          <button className="ls-setup-close" onClick={() => { stopPreviewStream(); onEnd([]) }}>×</button>
          <div className="ls-setup-icon">📡</div>
          <h2 className="ls-setup-heading">Go Live</h2>
          <p className="ls-setup-desc">
            Set up your live stream. Turn on your camera so viewers can see you alongside your house.
          </p>

          <div className="ls-cam-preview">
            {camOn ? (
              <video
                ref={setupVidRef}
                className="ls-cam-video"
                autoPlay
                playsInline
                muted
              />
            ) : (
              <div className="ls-cam-placeholder">
                {camLoading ? (
                  <div className="ls-cam-loading">Requesting camera...</div>
                ) : camError ? (
                  <div className="ls-cam-error">{camError}</div>
                ) : (
                  <>
                    <svg className="ls-cam-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                    </svg>
                    <span>Camera is off</span>
                  </>
                )}
              </div>
            )}

            <div className="ls-cam-controls">
              <button
                className={`ls-cam-ctrl-btn ${camOn ? 'ls-ctrl-on' : ''}`}
                onClick={camOn ? togglePreviewCam : startCameraPreview}
                disabled={camLoading}
                title={camOn ? 'Turn off camera' : 'Turn on camera'}
              >
                {camOn ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M21 6.5l-4 4V7c0-.55-.45-1-1-1H9.82L21 17.18V6.5zM3.27 2L2 3.27 4.73 6H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.21 0 .39-.08.54-.18L19.73 21 21 19.73 3.27 2z"/>
                  </svg>
                )}
              </button>
              <button
                className={`ls-cam-ctrl-btn ${micOn ? 'ls-ctrl-on' : ''}`}
                onClick={previewStreamRef.current ? togglePreviewMic : startCameraPreview}
                disabled={camLoading}
                title={micOn ? 'Mute mic' : 'Unmute mic'}
              >
                {micOn ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z"/>
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V20h2v-2.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/>
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div className="ls-setup-field">
            <label>Stream Title</label>
            <div className="ls-hash-input">
              <span className="ls-hash-prefix">#</span>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value.replace(/^#+/, '').replace(/\s+/g, ''))}
                placeholder="HouseTour"
                maxLength={80}
                onKeyDown={e => { if (e.key === 'Enter') handleStart() }}
              />
            </div>
          </div>

          <div className="ls-setup-field">
            <label>Price (optional)</label>
            <div className="ls-price-row">
              <span className="ls-price-symbol">₦</span>
              <input
                type="number"
                min="0"
                step="100"
                value={price}
                onChange={e => setPrice(e.target.value)}
                placeholder="0"
              />
              <span className="ls-price-hint">
                {price && parseFloat(price) > 0
                  ? `Viewers pay ₦${parseFloat(price).toLocaleString('en-NG')} via Paystack to join`
                  : 'Free — anyone can watch'}
              </span>
            </div>
            {price && parseFloat(price) > 0 && (
              <div className="ls-price-info">
                💳 Paid stream — viewers will be shown a Paystack payment screen before they can watch. They can rejoin anytime with the same session.
              </div>
            )}
          </div>

          <div className="ls-setup-field">
            <label>Category</label>
            <div className="ls-setup-tags">
              {['Just Chatting', 'House Tour', 'Building', 'Hangout'].map(tag => (
                <span
                  key={tag}
                  className={`ls-setup-tag ${category === tag ? 'ls-setup-tag-active' : ''}`}
                  onClick={() => setCategory(tag)}
                >{tag}</span>
              ))}
            </div>
          </div>

          <button
            className="ls-setup-start"
            onClick={handleStart}
            disabled={!title.trim()}
          >
            Start Stream
          </button>
        </div>
      </div>
    )
  }

  // ═══════════════════════ COUNTDOWN ═══════════════════════
  if (phase === 'countdown') {
    return (
      <div className="ls-countdown-overlay">
        {camOn && previewStreamRef.current && (
          <video
            ref={countdownVidRef}
            className="ls-countdown-cam"
            autoPlay playsInline muted
          />
        )}
        <div className="ls-countdown-ring">
          <div className={`ls-countdown-num ${countdown === 0 ? 'ls-countdown-go' : ''}`}>
            {countdown || 'GO!'}
          </div>
        </div>
        <div className="ls-countdown-label">Going live in...</div>
      </div>
    )
  }

  // ═══════════════════════ LIVE ═══════════════════════
  const hasInventory = inventoryItems.length > 0
  const camIsBig = camOn && viewMode === 'camera'
  const previewItems = inventoryItems.slice(0, 3)

  return (
    <div className="ls-live-root">
      {/* ═══ LEFT PANEL — Purchase Requests ═══════════════ */}
      <div className="ls-req-panel">
        <div className="ls-req-header">
          <span className="ls-req-title">Requests</span>
          <span className="ls-req-badge">{requests.length}</span>
        </div>
        <div className="ls-req-list">
          {requests.length === 0 ? (
            <div className="ls-req-empty">
              <div className="ls-req-empty-icon">🛒</div>
              <div className="ls-req-empty-text">No purchase requests yet</div>
              <div className="ls-req-empty-sub">Viewers can request items from your shop during the stream</div>
            </div>
          ) : (
            requests.map(r => (
              <div key={r.id} className={`ls-req-item${r.status !== 'pending' ? ' ls-req-item-done' : ''}`}>
                <div className="ls-req-user" style={{ color: r.color }}>{r.user}</div>
                <div className="ls-req-product">
                  <span className="ls-req-product-name">{r.itemName}</span>
                  <span className="ls-req-product-price">{r.itemPrice}</span>
                </div>
                {r.status === 'pending' ? (
                  <div className="ls-req-actions">
                    <button
                      className="ls-req-accept"
                      onClick={async () => {
                        try {
                          await updatePurchaseRequestStatus(r.requestId, 'accepted')
                          service.sendRequestUpdate(r.requestId, r.userId, 'accepted')
                          setRequests(prev => prev.map(x => x.id === r.id ? { ...x, status: 'accepted' } : x))
                          addMsg({ user: '', color: '', text: `Accepted ${r.user}'s request for ${r.itemName}`, system: true })
                        } catch { /* ignore */ }
                      }}
                    >Accept</button>
                    <button
                      className="ls-req-decline"
                      onClick={async () => {
                        try {
                          await updatePurchaseRequestStatus(r.requestId, 'declined')
                          service.sendRequestUpdate(r.requestId, r.userId, 'declined')
                          setRequests(prev => prev.map(x => x.id === r.id ? { ...x, status: 'declined' } : x))
                        } catch { /* ignore */ }
                      }}
                    >Decline</button>
                  </div>
                ) : (
                  <div className={`ls-req-status ls-req-status-${r.status}`}>
                    {r.status === 'accepted' ? '✓ Accepted' : '✗ Declined'}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* ═══ CENTER — Camera / House / Controls ═══════════ */}
      <div className="ls-center">
        <div className="ls-badge-bar">
          <div className="ls-badge-live">
            <span className="ls-badge-dot" />
            LIVE
          </div>
          <div className="ls-badge-viewers">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
            </svg>
            {viewers}
          </div>
          <div className="ls-badge-timer">{fmtTime(elapsed)}</div>
        </div>

        <div className={`ls-cam-stage ${camIsBig ? '' : 'ls-cam-stage-hidden'}`}>
          <video
            ref={mainVidRef}
            className="ls-cam-stage-video"
            autoPlay playsInline muted
          />
        </div>

        {camOn && !camIsBig && (
          <div className="ls-pip-cam">
            <video
              ref={pipVidRef}
              className="ls-pip-cam-video"
              autoPlay playsInline muted
            />
          </div>
        )}

        <div className="ls-controls-bar">
          <button
            className={`ls-ctrl-btn ${camOn ? 'ls-ctrl-on' : 'ls-ctrl-off2'}`}
            onClick={toggleLiveCam}
            title={camOn ? 'Turn off camera' : 'Turn on camera'}
          >
            {camOn ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21 6.5l-4 4V7c0-.55-.45-1-1-1H9.82L21 17.18V6.5zM3.27 2L2 3.27 4.73 6H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.21 0 .39-.08.54-.18L19.73 21 21 19.73 3.27 2z"/>
              </svg>
            )}
          </button>
          <button
            className={`ls-ctrl-btn ${micOn ? 'ls-ctrl-on' : 'ls-ctrl-off2'}`}
            onClick={toggleLiveMic}
            title={micOn ? 'Mute mic' : 'Unmute mic'}
          >
            {micOn ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z"/>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V20h2v-2.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/>
              </svg>
            )}
          </button>
          {camOn && (
            <button
              className="ls-ctrl-btn ls-ctrl-swap2"
              onClick={() => setViewMode(v => v === 'camera' ? 'house' : 'camera')}
              title={camIsBig ? 'Show house view' : 'Show camera view'}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16 17.01V10h-2v7.01h-3L15 21l4-3.99h-3zM9 3L5 6.99h3V14h2V6.99h3L9 3z"/>
              </svg>
            </button>
          )}
          <div className="ls-ctrl-spacer" />
          <button
            className="ls-ctrl-share"
            onClick={(e) => {
              const id = service.activeStreamId
              if (!id) return
              const url = `https://prodapi.twedot.com/live/${id}`
              navigator.clipboard.writeText(url).catch(() => {})
              const btn = e.currentTarget as HTMLButtonElement
              btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = '🔗 Share' }, 2000)
            }}
          >🔗 Share</button>
          <button className="ls-ctrl-end" onClick={() => setConfirmEnd(true)}>End Stream</button>
        </div>

        {hasInventory && (
          <div className="ls-inv-strip">
            <div className="ls-inv-header">
              <span className="ls-inv-title">Shop</span>
              <button className="ls-inv-see-all" onClick={() => setShowAllItems(true)}>
                See All ({inventoryItems.length})
              </button>
            </div>
            <div className="ls-inv-scroll">
              {previewItems.map(item => (
                <div key={item.id} className="ls-inv-card" onClick={() => setShowAllItems(true)}>
                  <div className="ls-inv-img">
                    {item.img ? <img src={item.img} alt="" /> : '📦'}
                  </div>
                  <div className="ls-inv-info">
                    <div className="ls-inv-name">{item.name}</div>
                    <div className="ls-inv-price">{item.price}</div>
                  </div>
                </div>
              ))}
              {inventoryItems.length > 3 && (
                <button className="ls-inv-more-card" onClick={() => setShowAllItems(true)}>
                  +{inventoryItems.length - 3} more
                </button>
              )}
            </div>
          </div>
        )}

        <div className="ls-info-bar">
          <div className="ls-info-left">
            <div className="ls-info-avatar">
              {ownerAvatar
                ? <img src={ownerAvatar} alt="" />
                : <div className="ls-info-avatar-fb">{ownerName[0]?.toUpperCase()}</div>
              }
            </div>
            <div className="ls-info-details">
              <div className="ls-info-name">{ownerName}</div>
              <div className="ls-info-stream-title">#{title}</div>
            </div>
          </div>
          <div className="ls-info-stats">
            <div className="ls-info-stat"><span className="ls-info-stat-num">{liveFollowers}</span> Followers</div>
            <div className="ls-info-stat"><span className="ls-info-stat-num">{following}</span> Following</div>
            <div className="ls-info-stat"><span className="ls-info-stat-num">{posts}</span> Posts</div>
          </div>
        </div>
      </div>

      {/* ═══ RIGHT PANEL — Chat ═══════════════════════════ */}
      <div className="ls-chat">
        <div className="ls-chat-header">
          <span className="ls-chat-hashtag">#general</span>
          <span className="ls-chat-label">Stream Chat</span>
        </div>

        <div className="ls-chat-messages" ref={chatRef}>
          {messages.map(m => (
            <div key={m.id} className={`ls-msg ${m.system ? 'ls-msg-sys' : ''}`}>
              {m.system ? (
                <span className="ls-msg-sys-text">{m.text}</span>
              ) : (
                <>
                  <span className="ls-msg-user" style={{ color: m.color }}>{m.user}</span>
                  <span className="ls-msg-sep">: </span>
                  <span className="ls-msg-text">{m.text}</span>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="ls-chat-bottom">
          <div className="ls-chat-input-row">
            <input
              className="ls-chat-input"
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') sendMessage() }}
              placeholder="Send a message..."
            />
          </div>
          <div className="ls-chat-actions">
            <div className="ls-chat-icons">
              <button className="ls-chat-icon-btn" title="Emoji">😀</button>
            </div>
            <button className="ls-chat-send" onClick={sendMessage}>Chat</button>
          </div>
        </div>
      </div>

      {/* ═══ OVERLAYS ═════════════════════════════════════ */}

      {showAllItems && (
        <div className="ls-inv-overlay" onClick={() => setShowAllItems(false)}>
          <div className="ls-inv-sheet" onClick={e => e.stopPropagation()}>
            <div className="ls-inv-sheet-handle" />
            <div className="ls-inv-sheet-header">
              <div className="ls-inv-sheet-title">{ownerName}'s Shop</div>
              <button className="ls-inv-sheet-close" onClick={() => setShowAllItems(false)}>×</button>
            </div>
            <div className="ls-inv-sheet-count">{inventoryItems.length} items available</div>
            <div className="ls-inv-grid">
              {inventoryItems.map(item => (
                <div key={item.id} className="ls-inv-grid-card">
                  <div className="ls-inv-grid-img">
                    {item.img ? <img src={item.img} alt="" /> : '📦'}
                  </div>
                  <div className="ls-inv-grid-name">{item.name}</div>
                  <div className="ls-inv-grid-price">{item.price}</div>
                  <div className="ls-inv-grid-status">Listed</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {confirmEnd && (
        <div className="ls-confirm-overlay" onClick={() => setConfirmEnd(false)}>
          <div className="ls-confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="ls-confirm-title">End Stream?</div>
            <p className="ls-confirm-desc">
              Your stream has been live for {fmtTime(elapsed)} with {viewers} viewer{viewers !== 1 ? 's' : ''}.
              {requests.length > 0 && ` You have ${requests.length} purchase request${requests.length > 1 ? 's' : ''}.`}
            </p>
            <div className="ls-confirm-btns">
              <button className="ls-confirm-cancel" onClick={() => setConfirmEnd(false)}>Keep Streaming</button>
              <button className="ls-confirm-end" onClick={handleEndStream}>End Stream</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

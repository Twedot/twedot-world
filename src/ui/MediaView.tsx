import { useEffect, useRef, useState, useCallback } from 'react'
import type { Scene } from '@babylonjs/core'
import { MediaScene } from '../engine/MediaScene'
import { AvatarController } from '../engine/AvatarController'
import { BRAND_LOGOS } from '../world/brandLogos'
import { useBuildingVisitors } from './useBuildingVisitors'
import VisitorPopup from './VisitorPopup'
import './LiveStreamOverlay.css'
import './BusinessLiveView.css'

interface Props {
  name: string
  onExit: () => void
}

interface ChatMsg {
  id: number
  user: string
  color: string
  text: string
  system?: boolean
}

interface ProductRequest {
  id: number
  user: string
  color: string
  itemName: string
  itemPrice: string
}

const USER_COLORS = [
  '#FF6B6B', '#9B59B6', '#3498DB', '#2ECC71', '#F39C12',
  '#E74C3C', '#1ABC9C', '#E91E63', '#00BCD4', '#FF9800',
]

const MOCK_NAMES = [
  'CoolGamer42', 'PixelQueen', 'NightOwl77', 'StarChaser', 'BlueFox',
  'ThunderBolt', 'CosmicDust', 'WildCard99', 'SkyWalker', 'IronWolf',
  'CrystalMage', 'ShadowKnight', 'GoldenEagle', 'NeonTiger', 'FrostByte',
]

const MOCK_CHAT_TEXTS = [
  'Great broadcast! 📺', 'Love this show', 'Breaking news!',
  'Turn up the volume!', 'Amazing coverage 🎙️', 'This is fire',
  'First time watching! 👋', 'Best channel ever', 'Hello everyone!',
  'Love the energy 🔥', 'Just subscribed! ❤️', 'Top-tier content',
  'When is the next episode?', 'Incredible footage 🎬', 'GGs',
  'The host is amazing', 'Quality journalism 📡', 'Best studio in town',
]

interface MediaProduct {
  id: string
  name: string
  price: string
  emoji: string
}

const MEDIA_PRODUCTS: MediaProduct[] = [
  { id: '1', name: 'Go Live', price: '₦2,000', emoji: '📺' },
  { id: '2', name: 'Record Show', price: '₦1,000', emoji: '🎙️' },
  { id: '3', name: 'Broadcast', price: '₦3,500', emoji: '📡' },
  { id: '4', name: 'Edit Footage', price: '₦800', emoji: '🎬' },
  { id: '5', name: 'Interview Slot', price: '₦1,500', emoji: '🎙' },
]

let _msgId = 0

export default function MediaView({ name, onExit }: Props) {
  const cvRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<MediaScene | null>(null)
  const avatarRef = useRef<AvatarController | null>(null)
  const [bScene, setBScene] = useState<Scene | null>(null)
  const { visitorPopup, visitorMsg, setVisitorMsg, closePopup } = useBuildingVisitors(bScene)

  const logo = BRAND_LOGOS[name]
  const theme = { primary: '#C62828' }

  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [requests, setRequests] = useState<ProductRequest[]>([])
  const chatRef = useRef<HTMLDivElement>(null)
  const chatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const products = MEDIA_PRODUCTS

  const addMsg = useCallback((msg: Omit<ChatMsg, 'id'>) => {
    setMessages(prev => [...prev.slice(-150), { ...msg, id: ++_msgId }])
  }, [])

  useEffect(() => {
    const cv = cvRef.current!
    cv.width = cv.clientWidth || window.innerWidth
    cv.height = cv.clientHeight || window.innerHeight
    const sc = new MediaScene(cv, name)
    sceneRef.current = sc
    sc.start()
    setBScene(sc.scene)
    const avatar = new AvatarController(sc.scene)
    avatarRef.current = avatar
    avatar.load('male').catch(err => console.warn('[Avatar] load failed', err))
    const resize = () => sc.engine.resize()
    window.addEventListener('resize', resize)
    return () => { window.removeEventListener('resize', resize); avatarRef.current?.dispose(); sc.dispose(); setBScene(null) }
  }, [])

  useEffect(() => {
    addMsg({ user: '', color: '', text: `Welcome to ${name}! 📺`, system: true })

    const joins = [
      { delay: 2000, text: 'CoolGamer42 entered the studio' },
      { delay: 7000, text: 'PixelQueen entered the studio' },
      { delay: 14000, text: 'NightOwl77 entered the studio' },
      { delay: 25000, text: 'StarChaser entered the studio' },
    ]
    const joinTimers = joins.map(j =>
      setTimeout(() => {
        addMsg({ user: '', color: '', text: j.text, system: true })
      }, j.delay),
    )

    function scheduleChat() {
      const delay = 3000 + Math.random() * 6000
      chatTimerRef.current = setTimeout(() => {
        const n = MOCK_NAMES[Math.floor(Math.random() * MOCK_NAMES.length)]
        const c = USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)]
        const t = MOCK_CHAT_TEXTS[Math.floor(Math.random() * MOCK_CHAT_TEXTS.length)]
        addMsg({ user: n, color: c, text: t })
        scheduleChat()
      }, delay)
    }
    setTimeout(scheduleChat, 4000)

    const reqTimers: ReturnType<typeof setTimeout>[] = []
    function scheduleReq() {
      const delay = 8000 + Math.random() * 15000
      const t = setTimeout(() => {
        const prod = products[Math.floor(Math.random() * products.length)]
        const n2 = MOCK_NAMES[Math.floor(Math.random() * MOCK_NAMES.length)]
        const c2 = USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)]
        setRequests(prev => [...prev, {
          id: Date.now() + Math.random(),
          user: n2,
          color: c2,
          itemName: prod.name,
          itemPrice: prod.price,
        }])
        scheduleReq()
      }, delay)
      reqTimers.push(t)
    }
    setTimeout(scheduleReq, 5000)

    return () => {
      joinTimers.forEach(clearTimeout)
      reqTimers.forEach(clearTimeout)
      if (chatTimerRef.current) clearTimeout(chatTimerRef.current)
    }
  }, [addMsg, name, products])

  useEffect(() => {
    const el = chatRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    if (nearBottom) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages])

  function sendMessage() {
    const text = input.trim()
    if (!text) return
    addMsg({ user: 'You', color: '#9146FF', text })
    setInput('')
  }

  return (
    <div className="blv-root">
      {/* Full-screen 3D canvas */}
      <canvas ref={cvRef} className="blv-canvas" />

      {/* 3-panel overlay (same layout as LiveStreamOverlay) */}
      <div className="ls-live-root">
        {/* LEFT -- Purchase Requests */}
        <div className="ls-req-panel">
          <div className="ls-req-header">
            <span className="ls-req-title">Requests</span>
            <span className="ls-req-badge">{requests.length}</span>
          </div>
          <div className="ls-req-list">
            {requests.length === 0 ? (
              <div className="ls-req-empty">
                <div className="ls-req-empty-icon">📺</div>
                <div className="ls-req-empty-text">No service requests yet</div>
                <div className="ls-req-empty-sub">Viewers can request media services</div>
              </div>
            ) : (
              requests.map(r => (
                <div key={r.id} className="ls-req-item">
                  <div className="ls-req-user" style={{ color: r.color }}>{r.user}</div>
                  <div className="ls-req-product">
                    <span className="ls-req-product-name">{r.itemName}</span>
                    <span className="ls-req-product-price">{r.itemPrice}</span>
                  </div>
                  <div className="ls-req-actions">
                    <button className="ls-req-accept">Accept</button>
                    <button className="ls-req-decline">Decline</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* CENTER -- transparent, overlays on 3D scene */}
        <div className="ls-center">
          {/* Exit button -- top right of center */}
          <button className="blv-exit-overlay" onClick={onExit}>&larr; City</button>

          {/* Inventory strip at bottom */}
          <div className="ls-inv-strip">
            <div className="ls-inv-header">
              <span className="ls-inv-title">Products & Services</span>
              <span className="ls-inv-see-all" style={{ cursor: 'default' }}>{products.length} items</span>
            </div>
            <div className="ls-inv-scroll">
              {products.map(p => (
                <div key={p.id} className="ls-inv-card">
                  <div className="ls-inv-img">{p.emoji}</div>
                  <div className="ls-inv-info">
                    <div className="ls-inv-name">{p.name}</div>
                    <div className="ls-inv-price">{p.price}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Info bar */}
          <div className="ls-info-bar">
            <div className="ls-info-left">
              <div className="ls-info-avatar" style={{ borderColor: theme.primary }}>
                {logo
                  ? <img src={logo} alt="" style={{ padding: 4, background: '#fff', borderRadius: '50%' }} />
                  : <div className="ls-info-avatar-fb">{name[0]?.toUpperCase()}</div>
                }
              </div>
              <div className="ls-info-details">
                <div className="ls-info-name">{name}</div>
                <div className="ls-info-stream-title" style={{ color: theme.primary, fontWeight: 700 }}>OPEN</div>
              </div>
            </div>
            <div className="ls-info-right">
              <button className="ls-info-follow">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                </svg>
                Follow
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT -- Chat */}
        <div className="ls-chat">
          <div className="ls-chat-header">
            <span className="ls-chat-hashtag">{'💬'} Customer Chat</span>
            <span className="ls-chat-label">Live</span>
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
                <button className="ls-chat-icon-btn" title="Emoji">{'😀'}</button>
              </div>
              <button className="ls-chat-send" onClick={sendMessage}>Chat</button>
            </div>
          </div>
        </div>
      </div>

      {visitorPopup && <VisitorPopup popup={visitorPopup} msg={visitorMsg} onMsgChange={setVisitorMsg} onClose={closePopup} />}
    </div>
  )
}

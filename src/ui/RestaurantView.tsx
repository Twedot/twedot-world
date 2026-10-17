import { useEffect, useRef, useState, useCallback } from 'react'
import type { Scene } from '@babylonjs/core'
import { RestaurantScene } from '../engine/RestaurantScene'
import { OfficeScene } from '../engine/OfficeScene'
import { ShopScene } from '../engine/ShopScene'
import { MediaScene } from '../engine/MediaScene'
import { AvatarController } from '../engine/AvatarController'
import { RoomVisitors } from '../engine/RoomVisitors'
import { BRAND_LOGOS } from '../world/brandLogos'
import { useLive } from '../live/LiveContext'
import type { BuildingUser, BuildingChatMessage } from '../live/LiveContext'
import { getRestaurantConfig } from '../buildings/restaurantConfigs'
import {
  getPublicSellerInventory,
  getPublicBusinessItems,
  getPublicBusinessFeatures,
  getMyPurchaseRequests,
  getCustomerRequests,
  createPurchaseRequest,
  updatePurchaseRequestStatus,
  cancelPurchaseRequest,
  createBusinessOrder,
  getMyBusinessOrders,
  getCustomerBusinessOrders,
  updateBusinessOrderStatus,
  cancelBusinessOrder,
  getMyProfile,
  getUserProfile,
} from '../api/twedotApi'
import type { InventoryItem, PurchaseRequest, BusinessFeature, BusinessOrder } from '../api/twedotApi'
import type { BuildingConfig } from '../buildings/types'
import type { BuildingDef } from '../world/types'
import { getRankLabel } from '../api/globalRank'
import './LiveStreamOverlay.css'
import './BusinessLiveView.css'
import './RestaurantView.css'


interface Props {
  name: string
  bizConfig?: BuildingConfig
  def?: BuildingDef
  onExit: () => void
}

interface ChatMsg {
  id: number
  userId: string
  userName: string
  userPhoto: string
  text: string
  timestamp: number
  system?: boolean
}

let _msgId = 0

export default function RestaurantView({ name, bizConfig, def, onExit }: Props) {
  const cvRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<{ engine: { resize(): void }; scene: Scene; start(): void; dispose(): void } | null>(null)
  const avatarRef = useRef<AvatarController | null>(null)
  const visitorsRef = useRef<RoomVisitors | null>(null)
  const [scene, setScene] = useState<Scene | null>(null)
  const { service } = useLive()

  // For dynamic businesses: pull directly from the BuildingDef so we don't depend
  // on the config-registry lookup succeeding in the parent.
  const bizId      = def?.businessId ?? bizConfig?.businessId
  const bizOwner   = def?.ownerId    ?? bizConfig?.ownerId
  const bizLogoUrl = def?.logoUrl    ?? bizConfig?.logoUrl

  const config: BuildingConfig | null = getRestaurantConfig(name) ?? bizConfig ?? (bizId ? {
    id:           def?.id ?? `biz_${bizId}`,
    name,
    ownerId:      bizOwner ?? '',
    businessId:   bizId,
    logoUrl:      bizLogoUrl,
    primaryColor: '#E85D5D',
    accentColor:  '#FF9F43',
    description:  '',
    coverEmoji:   '🏪',
    category:     'business',
  } : null)

  const logo = BRAND_LOGOS[name] ?? bizLogoUrl

  // Auth
  const myUserId = service.myUserId ?? ''
  const isGuest = !myUserId || myUserId.startsWith('guest_')
  const isOwner = !!config && !isGuest && myUserId === config.ownerId

  // Menu (owner's public inventory)
  const [items, setItems] = useState<InventoryItem[]>([])
  const [itemsLoading, setItemsLoading] = useState(true)

  // Features / services
  const [features, setFeatures] = useState<BusinessFeature[]>([])
  const [featuresLoading, setFeaturesLoading] = useState(true)
  const [selectedFeature, setSelectedFeature] = useState<BusinessFeature | null>(null)

  // My orders — static restaurant (PurchaseRequest) or dynamic biz (BusinessOrder)
  const [myOrders, setMyOrders] = useState<PurchaseRequest[]>([])
  const [myBizOrders, setMyBizOrders] = useState<BusinessOrder[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)

  // Customer orders — owner view
  const [customerOrders, setCustomerOrders] = useState<PurchaseRequest[]>([])
  const [customerBizOrders, setCustomerBizOrders] = useState<BusinessOrder[]>([])
  const [customerLoading, setCustomerLoading] = useState(false)

  // Toast feedback
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Chat
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const chatRef = useRef<HTMLDivElement>(null)

  // @mention
  const [roomUsers, setRoomUsers] = useState<BuildingUser[]>([])
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function showToast(msg: string) {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }

  // ── 3D scene setup ────────────────────────────────────────
  useEffect(() => {
    const cv = cvRef.current!
    cv.width = cv.clientWidth || window.innerWidth
    cv.height = cv.clientHeight || window.innerHeight
    // When there's a business config, use its category to pick the scene.
    // For unclaimed buildings (no config), fall back to the building's static type.
    const cat = config?.category
    const bldType = def?.type
    const sc = (cat === 'retail' || cat === 'stores' || cat === 'sales')
      ? new ShopScene(cv, name, logo)
      : cat === 'entertainment' || bldType === 'media' || bldType === 'club'
        ? new MediaScene(cv, name, logo)
        : (cat === 'food' || bldType === 'restaurant')
          ? new RestaurantScene(cv, name, logo)
          : new OfficeScene(cv, name, logo)
    sceneRef.current = sc
    sc.start()
    setScene(sc.scene)
    const avatar = new AvatarController(sc.scene)
    avatarRef.current = avatar
    avatar.load('male').catch(() => {})
    const resize = () => sc.engine.resize()
    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('resize', resize)
      avatarRef.current?.dispose()
      sc.dispose()
      setScene(null)
    }
  }, [])

  // ── Load menu ─────────────────────────────────────────────
  // Dynamic businesses use their own items API; static restaurants use seller inventory.
  useEffect(() => {
    if (!config) { setItemsLoading(false); return }
    setItemsLoading(true)
    const fetcher = bizId
      ? getPublicBusinessItems(bizId)
      : getPublicSellerInventory(config.ownerId, 1, 50)
    fetcher
      .then(({ items }) => setItems(items))
      .catch(() => {})
      .finally(() => setItemsLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bizId, config?.ownerId])

  // ── Load features ─────────────────────────────────────
  useEffect(() => {
    if (!bizId) { setFeaturesLoading(false); return }
    setFeaturesLoading(true)
    getPublicBusinessFeatures(bizId)
      .then(({ features }) => setFeatures(features))
      .catch(() => {})
      .finally(() => setFeaturesLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bizId])

  // ── Load my orders (buyer) ────────────────────────────────
  useEffect(() => {
    if (isGuest || !config || isOwner) return
    if (bizId) {
      setOrdersLoading(true)
      getMyBusinessOrders(bizId)
        .then(({ orders }) => setMyBizOrders(orders))
        .catch(() => {})
        .finally(() => setOrdersLoading(false))
      return
    }
    setOrdersLoading(true)
    getMyPurchaseRequests(1, 50)
      .then(({ requests }) => setMyOrders(requests.filter(r => r.seller_id === config.ownerId)))
      .catch(() => {})
      .finally(() => setOrdersLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGuest, isOwner, config?.ownerId, bizId])

  // ── Load customer orders (owner) ──────────────────────────
  useEffect(() => {
    if (!isOwner) return
    setCustomerLoading(true)
    if (bizId) {
      getCustomerBusinessOrders(bizId)
        .then(({ orders }) => setCustomerBizOrders(orders))
        .catch(() => {})
        .finally(() => setCustomerLoading(false))
      return
    }
    getCustomerRequests(1, 50)
      .then(({ requests }) => setCustomerOrders(requests))
      .catch(() => {})
      .finally(() => setCustomerLoading(false))
  }, [isOwner])

  // ── Building WebSocket room + real 3D visitors ────────────
  useEffect(() => {
    if (!config || !scene) return

    const visitors = new RoomVisitors(scene)
    visitorsRef.current = visitors

    let currentUsers: BuildingUser[] = []

    const syncVisitors = (next: BuildingUser[]) => {
      const prevIds = new Set(currentUsers.map(u => u.userId))
      const nextIds = new Set(next.map(u => u.userId))
      currentUsers.forEach(u => { if (!nextIds.has(u.userId)) visitors.removeVisitor(u.userId) })
      next.forEach(u => { if (!prevIds.has(u.userId) && u.userId !== service.myUserId) visitors.addVisitor(u.userId, u.userName, '') })
      currentUsers = next
    }

    const addOther = (u: BuildingUser) => {
      // Use service.myUserId directly — the closure-captured myUserId may be stale
      // on refresh when auth resolves after this effect first ran.
      if (u.userId === service.myUserId) return
      visitors.addVisitor(u.userId, u.userName, '')
      // Fetch rank async and update label once we have it
      getUserProfile(u.userId)
        .then(p => visitors.updateLabel(u.userId, p.name ?? u.userName, getRankLabel(p.global_activity_score)))
        .catch(() => {})
    }

    service.on({
      onBuildingJoined: (users) => {
        setRoomUsers(users)
        // Set own label with real rank
        getMyProfile()
          .then(p => avatarRef.current?.setLabel(p.name ?? service.myName ?? 'You', getRankLabel(p.global_activity_score)))
          .catch(() => avatarRef.current?.setLabel(service.myName ?? 'You', ''))
        users.forEach(addOther)
        currentUsers = users
      },
      onBuildingUsers: (users) => {
        syncVisitors(users)
        setRoomUsers(users)
      },
      onBuildingChat: (msg: BuildingChatMessage) => {
        setMessages(prev => [...prev.slice(-200), {
          id: ++_msgId,
          userId: msg.userId,
          userName: msg.userName,
          userPhoto: msg.userPhoto,
          text: msg.text,
          timestamp: msg.timestamp,
        }])
      },
    })

    service.joinBuilding(config.id)

    setMessages([{
      id: ++_msgId, userId: '', userName: '', userPhoto: '',
      text: `Welcome to ${name}! ${isFood ? '🍽️' : isRetail ? '🛍️' : '👋'}`, timestamp: Date.now(), system: true,
    }])

    return () => {
      service.leaveBuilding()
      service.on({
        onBuildingJoined: undefined,
        onBuildingUsers: undefined,
        onBuildingChat: undefined,
      })
      visitors.dispose()
      visitorsRef.current = null
    }
  }, [scene, config?.id])

  // ── Auto-scroll chat ─────────────────────────────────────
  useEffect(() => {
    const el = chatRef.current
    if (!el) return
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    }
  }, [messages])

  // ── Chat input with @mention detection ───────────────────
  const handleInputChange = useCallback((value: string) => {
    setInput(value)
    const atIdx = value.lastIndexOf('@')
    if (atIdx !== -1 && (atIdx === 0 || value[atIdx - 1] === ' ')) {
      const query = value.slice(atIdx + 1)
      if (!query.includes(' ')) {
        setMentionQuery(query)
        setMentionOpen(true)
        return
      }
    }
    setMentionOpen(false)
  }, [])

  function insertMention(user: BuildingUser) {
    const atIdx = input.lastIndexOf('@')
    const newInput = input.slice(0, atIdx) + '@' + user.userName + ' '
    setInput(newInput)
    setMentionOpen(false)
    inputRef.current?.focus()
  }

  function sendChat() {
    const text = input.trim()
    if (!text || isGuest) return
    service.sendBuildingChat(text)
    setInput('')
    setMentionOpen(false)
  }

  // ── Request an item ───────────────────────────────────────
  async function requestItem(item: InventoryItem) {
    if (isGuest) { showToast('Log in to place an order'); return }
    if (isOwner) return

    if (bizId) {
      try {
        const order = await createBusinessOrder(bizId, item.id)
        setMyBizOrders(prev => [order, ...prev])
        showToast(`✓ Order sent for ${item.title}`)
      } catch (err: unknown) {
        showToast((err as Error).message ?? 'Failed to place order')
      }
      return
    }

    try {
      const req = await createPurchaseRequest(item.id, 'direct')
      setMyOrders(prev => [req, ...prev])
      showToast(`✓ Order placed for ${item.title}`)
    } catch (err: unknown) {
      showToast((err as Error).message ?? 'Failed to place order')
    }
  }

  // ── Owner: accept / decline customer order ────────────────
  async function handleOrderStatus(orderId: string, status: 'accepted' | 'declined') {
    if (bizId) {
      try {
        const updated = await updateBusinessOrderStatus(bizId, orderId, status)
        setCustomerBizOrders(prev => prev.map(o => o.id === orderId ? updated : o))
      } catch {}
      return
    }
    try {
      const updated = await updatePurchaseRequestStatus(orderId, status)
      setCustomerOrders(prev => prev.map(o => o.id === orderId ? updated : o))
    } catch {}
  }

  // ── Buyer: cancel my order ────────────────────────────────
  async function handleCancelOrder(orderId: string) {
    if (bizId) {
      try {
        await cancelBusinessOrder(bizId, orderId)
        setMyBizOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'cancelled' as const } : o))
        showToast('Order cancelled')
      } catch {}
      return
    }
    try {
      await cancelPurchaseRequest(orderId)
      setMyOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'cancelled' as const } : o))
      showToast('Order cancelled')
    } catch {}
  }

  const filteredMentions = mentionOpen
    ? roomUsers.filter(u =>
        u.userId !== myUserId &&
        u.userName.toLowerCase().includes(mentionQuery.toLowerCase())
      )
    : []

  const primaryColor = config?.primaryColor ?? '#E85D5D'
  const isFood   = (config?.category ?? 'food') === 'food'
  const isRetail = config?.category === 'retail' || config?.category === 'stores' || config?.category === 'sales'
  const hasOrdering = isFood || isRetail

  // All user-facing copy that differs by ordering mode
  const orderCopy = isFood ? {
    actionBtn:      'Order',
    myPanel:        'My Orders',
    custPanel:      'Customer Orders',
    emptyMyCta:     'Click an item below to order',
    emptyCustText:  'Customer orders will appear here',
    noMy:           'No orders yet',
    noCust:         'No orders yet',
  } : isRetail ? {
    actionBtn:      'Buy',
    myPanel:        'My Purchases',
    custPanel:      'Customer Purchases',
    emptyMyCta:     'Tap a product below to purchase',
    emptyCustText:  'Customer purchases will appear here',
    noMy:           'No purchases yet',
    noCust:         'No purchases yet',
  } : {
    actionBtn:      'Book',
    myPanel:        'My Bookings',
    custPanel:      'Customer Requests',
    emptyMyCta:     'Browse our services below',
    emptyCustText:  'Customer requests will appear here',
    noMy:           'No bookings yet',
    noCust:         'No requests yet',
  }

  // Open/closed based on actual business hours when available
  function computeIsOpen(): boolean {
    const ot = config?.opening_time
    const ct = config?.closing_time
    const wd = config?.working_days
    if (!ot || !ct) return true  // no hours set: assume open
    const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
    const now = new Date()
    const todayKey = dayKeys[now.getDay()]
    if (wd && wd.length > 0 && !wd.includes(todayKey)) return false
    const [oh, om] = ot.split(':').map(Number)
    const [ch, cm] = ct.split(':').map(Number)
    const nowMins = now.getHours() * 60 + now.getMinutes()
    return nowMins >= oh * 60 + om && nowMins < ch * 60 + cm
  }
  const isOpen = computeIsOpen()
  const menuLabel = ({ food: 'Menu', services: 'Services', retail: 'Products', stores: 'Products', sales: 'Products', entertainment: 'Offerings', health: 'Services', education: 'Courses', other: 'Offerings' } as Record<string, string>)[config?.category ?? 'food'] ?? 'Offerings'
  const categoryEmoji = ({ food: '🍽️', services: '🏢', retail: '🛍️', stores: '🛍️', sales: '🛍️', entertainment: '🎭', health: '🏥', education: '🎓', other: '🏢' } as Record<string, string>)[config?.category ?? 'food'] ?? '🏢'
  const [sheetOpen, setSheetOpen] = useState(true)

  function statusBadge(status: string) {
    const map: Record<string, string> = { pending: '#f59e0b', accepted: '#22c55e', declined: '#ef4444', cancelled: '#6b7280' }
    return <span className="rv-badge" style={{ background: map[status] ?? '#6b7280' }}>{status}</span>
  }

  // ── No config: unclaimed building — full shell, nothing functional ──
  if (!config) {
    return (
      <div className="blv-root">
        <canvas ref={cvRef} className="blv-canvas" />
        <button className="blv-exit-overlay" onClick={onExit}>← Back to City</button>

        <div className="ls-live-root">
          {/* Centre — fills remaining space so chat stays on the right */}
          <div className="ls-main" style={{ flex: 1, pointerEvents: 'none' }}>
            <div className="ls-info-bar rv-info-bar-expanded">
              <div className="rv-info-row1">
                <div className="ls-info-avatar">
                  <div className="ls-info-avatar-fb" style={{ background: '#555' }}>?</div>
                </div>
                <div className="ls-info-details">
                  <div className="ls-info-name">{name}</div>
                  <div className="ls-info-stream-title" style={{ color: '#888' }}>Unclaimed · No business active</div>
                </div>
              </div>
            </div>
          </div>

          {/* Chat — right panel, visible but disabled */}
          <div className="ls-chat">
            <div className="ls-chat-header">
              <span className="ls-chat-hashtag">💬 Chat</span>
              <span className="ls-chat-label">{name}</span>
            </div>
            <div className="ls-chat-messages">
              <div className="ls-msg ls-msg-sys">
                <span className="ls-msg-sys-text">Chat is not available — this building has no active business.</span>
              </div>
            </div>
            <div className="ls-chat-bottom">
              <div className="ls-chat-input-row">
                <input className="ls-chat-input" disabled placeholder="No business active…" />
                <button className="ls-chat-send" disabled>Send</button>
              </div>
            </div>
          </div>
        </div>

        {/* Claim banner */}
        <div className="rv-unclaimed-banner">
          🏚️ No active business here yet — <a href={`mailto:support@twedot.com?subject=${encodeURIComponent(`Claim "${name}" in Twedot World`)}`} style={{ color: '#a78bfa' }}>claim this building</a>
        </div>
      </div>
    )
  }

  return (
    <div className="blv-root">
      <canvas ref={cvRef} className="blv-canvas" />

      {toast && <div className="rv-toast">{toast}</div>}

      <div className="ls-live-root">

        {/* LEFT — Orders panel (food/retail only) */}
        {hasOrdering && <div className="ls-req-panel">
          {isOwner ? (
            <>
              <div className="ls-req-header">
                <span className="ls-req-title">{orderCopy.custPanel}</span>
                <span className="ls-req-badge">
                  {bizId
                    ? customerBizOrders.filter(o => o.status === 'pending').length
                    : customerOrders.filter(o => o.status === 'pending').length}
                </span>
              </div>
              <div className="ls-req-list">
                {customerLoading && <div className="rv-loading">Loading orders…</div>}
                {!customerLoading && (bizId ? customerBizOrders : customerOrders).length === 0 && (
                  <div className="ls-req-empty">
                    <div className="ls-req-empty-icon">{categoryEmoji}</div>
                    <div className="ls-req-empty-text">{orderCopy.noCust}</div>
                    <div className="ls-req-empty-sub">{orderCopy.emptyCustText}</div>
                  </div>
                )}
                {bizId
                  ? customerBizOrders.map(o => (
                    <div key={o.id} className="rv-order-card">
                      {o.item?.image_url && (
                        <img className="rv-order-img" src={o.item.image_url} alt="" />
                      )}
                      <div className="rv-order-info">
                        <div className="rv-order-item">{o.item?.name ?? 'Item'}</div>
                        <div className="rv-order-buyer">
                          {o.buyer?.name ?? 'Customer'}
                          {statusBadge(o.status)}
                        </div>
                        {o.status === 'pending' && (
                          <div className="rv-order-actions">
                            <button className="rv-btn-accept" onClick={() => handleOrderStatus(o.id, 'accepted')}>Accept</button>
                            <button className="rv-btn-decline" onClick={() => handleOrderStatus(o.id, 'declined')}>Decline</button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                  : customerOrders.map(o => (
                    <div key={o.id} className="rv-order-card">
                      {o.inventory?.images?.[0] && (
                        <img className="rv-order-img" src={o.inventory.images[0].image_url} alt="" />
                      )}
                      <div className="rv-order-info">
                        <div className="rv-order-item">{o.inventory?.title ?? 'Item'}</div>
                        <div className="rv-order-buyer">
                          {o.buyer?.name ?? 'Customer'}
                          {statusBadge(o.status)}
                        </div>
                        {o.status === 'pending' && (
                          <div className="rv-order-actions">
                            <button className="rv-btn-accept" onClick={() => handleOrderStatus(o.id, 'accepted')}>Accept</button>
                            <button className="rv-btn-decline" onClick={() => handleOrderStatus(o.id, 'declined')}>Decline</button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                }
              </div>
            </>
          ) : (
            <>
              <div className="ls-req-header">
                <span className="ls-req-title">{orderCopy.myPanel}</span>
                <span className="ls-req-badge">
                  {bizId
                    ? myBizOrders.filter(o => o.status === 'pending').length
                    : myOrders.filter(o => o.status === 'pending').length}
                </span>
              </div>
              <div className="ls-req-list">
                {isGuest && (
                  <div className="ls-req-empty">
                    <div className="ls-req-empty-icon">🔐</div>
                    <div className="ls-req-empty-text">Login to order</div>
                    <div className="ls-req-empty-sub">Create a free account to place orders</div>
                  </div>
                )}
                {!isGuest && ordersLoading && <div className="rv-loading">Loading…</div>}
                {!isGuest && !ordersLoading && (bizId ? myBizOrders : myOrders).length === 0 && (
                  <div className="ls-req-empty">
                    <div className="ls-req-empty-icon">{isFood ? '🛒' : isRetail ? '🛍️' : '📋'}</div>
                    <div className="ls-req-empty-text">{orderCopy.noMy}</div>
                    <div className="ls-req-empty-sub">{orderCopy.emptyMyCta}</div>
                  </div>
                )}
                {bizId
                  ? myBizOrders.map(o => (
                    <div key={o.id} className="rv-order-card">
                      {o.item?.image_url && (
                        <img className="rv-order-img" src={o.item.image_url} alt="" />
                      )}
                      <div className="rv-order-info">
                        <div className="rv-order-item">{o.item?.name ?? 'Item'}</div>
                        <div className="rv-order-price">
                          ₦{o.item?.price?.toLocaleString() ?? '–'}
                          {statusBadge(o.status)}
                        </div>
                        {o.status === 'pending' && (
                          <button className="rv-btn-cancel" onClick={() => handleCancelOrder(o.id)}>Cancel</button>
                        )}
                      </div>
                    </div>
                  ))
                  : myOrders.map(o => (
                    <div key={o.id} className="rv-order-card">
                      {o.inventory?.images?.[0] && (
                        <img className="rv-order-img" src={o.inventory.images[0].image_url} alt="" />
                      )}
                      <div className="rv-order-info">
                        <div className="rv-order-item">{o.inventory?.title ?? 'Item'}</div>
                        <div className="rv-order-price">
                          ₦{o.inventory?.price?.toLocaleString() ?? '–'}
                          {statusBadge(o.status)}
                        </div>
                        {o.status === 'pending' && (
                          <button className="rv-btn-cancel" onClick={() => handleCancelOrder(o.id)}>Cancel</button>
                        )}
                      </div>
                    </div>
                  ))
                }
              </div>
            </>
          )}
        </div>}

        {/* CENTER — 3D scene + menu strip + info bar */}
        <div className="ls-center">
          <button className="blv-exit-overlay" onClick={onExit}>&larr; City</button>

          {/* Mobile bottom-sheet toggle handle */}
          <button className="rv-sheet-toggle" onClick={() => setSheetOpen(o => !o)}>
            <span className="rv-sheet-pill" />
            <span>{sheetOpen ? 'Hide ▼' : `${menuLabel} & Chat ▲`}</span>
          </button>

          {/* Menu / items strip — hidden for non-ordering categories with no items */}
          {(hasOrdering || itemsLoading || items.length > 0) && <div className={`ls-inv-strip${sheetOpen ? '' : ' rv-sheet-hidden'}`} style={{ order: isFood ? 0 : 1 }}>
            <div className="ls-inv-header">
              <span className="ls-inv-title">{menuLabel}</span>
              <span className="ls-inv-see-all" style={{ color: primaryColor }}>
                {config.category}
              </span>
            </div>
            <div className="ls-inv-scroll">
              {itemsLoading && (
                <div className="rv-menu-loading">Loading menu…</div>
              )}
              {!itemsLoading && items.length === 0 && (
                <div className="rv-menu-empty">No items available</div>
              )}
              {items.map(item => (
                <div key={item.id} className="rv-menu-card">
                  {item.images?.[0]
                    ? <img className="rv-menu-img" src={item.images[0].image_url} alt={item.title} />
                    : <div className="rv-menu-emoji">{config.coverEmoji}</div>
                  }
                  <div className="rv-menu-info">
                    <div className="rv-menu-name">{item.title}</div>
                    <div className="rv-menu-price" style={{ color: primaryColor }}>
                      ₦{item.price.toLocaleString()}
                    </div>
                  </div>
                  {!isOwner && hasOrdering && (
                    <button
                      className="rv-menu-btn"
                      style={{ background: primaryColor }}
                      onClick={() => requestItem(item)}
                    >
                      {isGuest ? 'Login' : orderCopy.actionBtn}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>}

          {/* Features strip — always shown for service businesses, conditionally for food */}
          {(!isFood || featuresLoading || features.length > 0) && (
            <div className={`ls-inv-strip rv-features-strip${sheetOpen ? '' : ' rv-sheet-hidden'}`} style={{ order: isFood ? 1 : 0 }}>
              <div className="ls-inv-header">
                <span className="ls-inv-title">{isFood ? 'Features & Extras' : isRetail ? 'Store Info & Features' : 'Services & Features'}</span>
              </div>
              <div className="ls-inv-scroll">
                {featuresLoading && <div className="rv-menu-loading">Loading…</div>}
                {!featuresLoading && features.length === 0 && !isFood && (
                  <div className="rv-menu-empty" style={{ minWidth: 220, flexDirection: 'column', gap: 4, alignItems: 'flex-start', padding: '0 12px' }}>
                    <span style={{ fontSize: 22 }}>{categoryEmoji}</span>
                    <span>No features added yet</span>
                  </div>
                )}
                {features.map(f => (
                  <div key={f.id} className="rv-feature-card" onClick={() => setSelectedFeature(f)}>
                    <div className="rv-feature-icon" style={{ background: primaryColor + '22', color: primaryColor }}>
                      {f.link ? '🔗' : '✦'}
                    </div>
                    <div className="rv-feature-title">{f.title}</div>
                    {f.description && (
                      <div className="rv-feature-desc">{f.description.slice(0, 60)}{f.description.length > 60 ? '…' : ''}</div>
                    )}
                    <div className="rv-feature-tap" style={{ color: primaryColor }}>Tap to read ›</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Info bar */}
          <div className={`ls-info-bar rv-info-bar-expanded${sheetOpen ? '' : ' rv-sheet-hidden'}`}>
            {/* Row 1: logo + name + status + visitor count */}
            <div className="rv-info-row1">
              <div className="ls-info-avatar" style={{ borderColor: primaryColor }}>
                {logo
                  ? <img src={logo} alt="" style={{ padding: 4, background: '#fff', borderRadius: '50%' }} />
                  : <div className="ls-info-avatar-fb" style={{ background: primaryColor }}>{name[0]?.toUpperCase()}</div>
                }
              </div>
              <div className="ls-info-details">
                <div className="ls-info-name">{name}</div>
                <div className="ls-info-stream-title">
                  {!itemsLoading && (
                    <span style={{ color: isOpen ? '#22c55e' : '#ef4444', fontWeight: 700 }}>
                      {isOpen ? 'OPEN' : 'CLOSED'}
                    </span>
                  )}
                  <span style={{ color: 'rgba(255,255,255,0.5)', marginLeft: 4 }}>· {config.category}</span>
                </div>
              </div>
              <span className="rv-user-count" style={{ marginLeft: 'auto' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" opacity="0.6">
                  <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
                </svg>
                {roomUsers.length}{roomUsers.length === 1 && !isGuest ? ' (you)' : ''}
              </span>
            </div>

            {/* Row 2: hours + working days + contact links */}
            <div className="rv-info-row2">
              {(config.opening_time && config.closing_time) && (
                <span className="rv-info-chip">
                  🕐 {config.opening_time} – {config.closing_time}
                </span>
              )}
              {config.working_days && config.working_days.length > 0 && (
                <span className="rv-info-chip rv-info-days">
                  📅 {config.working_days.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(', ')}
                </span>
              )}
              {config.phone && (
                <a className="rv-info-chip rv-info-link" href={`tel:${config.phone}`}>
                  📞 {config.phone}
                </a>
              )}
              {config.website && (
                <a
                  className="rv-info-chip rv-info-link"
                  href={config.website.startsWith('http') ? config.website : `https://${config.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  🌐 {config.website.replace(/^https?:\/\//, '')}
                </a>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT — Chat */}
        <div className={`ls-chat${sheetOpen ? '' : ' rv-sheet-hidden'}`}>
          <div className="ls-chat-header">
            <span className="ls-chat-hashtag">💬 Chat</span>
            <span className="ls-chat-label">{name}</span>
          </div>

          <div className="ls-chat-messages" ref={chatRef}>
            {messages.map(m => (
              <div key={m.id} className={`ls-msg ${m.system ? 'ls-msg-sys' : ''}`}>
                {m.system ? (
                  <span className="ls-msg-sys-text">{m.text}</span>
                ) : (
                  <>
                    <span className="ls-msg-user" style={{
                      color: '#' + (m.userId || 'aaa').slice(-6).replace(/[^0-9a-f]/gi, 'A'),
                    }}>
                      {m.userId === myUserId ? 'You' : m.userName}
                    </span>
                    <span className="ls-msg-sep">: </span>
                    <span className="ls-msg-text">{m.text}</span>
                  </>
                )}
              </div>
            ))}
          </div>

          <div className="ls-chat-bottom">
            {/* @mention dropdown */}
            {mentionOpen && (
              <div className="rv-mention-list">
                {filteredMentions.length === 0 ? (
                  <div className="rv-mention-item" style={{ color: 'rgba(255,255,255,0.35)', cursor: 'default', fontSize: 12 }}>
                    No one else in room
                  </div>
                ) : filteredMentions.map(u => (
                  <div key={u.userId} className="rv-mention-item" onMouseDown={() => insertMention(u)}>
                    {u.userPhoto
                      ? <img className="rv-mention-av" src={u.userPhoto} alt="" />
                      : <div className="rv-mention-av rv-mention-av-fb">{u.userName[0]?.toUpperCase()}</div>
                    }
                    <span>{u.userName}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="ls-chat-input-row">
              <input
                ref={inputRef}
                className="ls-chat-input"
                type="text"
                value={input}
                onChange={e => handleInputChange(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Escape') { setMentionOpen(false); return }
                  if (e.key === 'Enter') sendChat()
                }}
                placeholder={isGuest ? 'Login to chat…' : 'Message… (@ to mention)'}
                disabled={isGuest}
              />
            </div>
            <div className="ls-chat-actions">
              <button className="ls-chat-send" onClick={sendChat} disabled={isGuest}>Send</button>
            </div>
          </div>
        </div>

      </div>

      {/* Feature detail bottom sheet */}
      {selectedFeature && (
        <div className="rv-feat-overlay" onClick={() => setSelectedFeature(null)}>
          <div className="rv-feat-sheet" onClick={e => e.stopPropagation()}>
            <div className="rv-feat-handle" />
            <button className="rv-feat-close" onClick={() => setSelectedFeature(null)}>×</button>
            <div className="rv-feat-icon-lg" style={{ background: primaryColor + '22', color: primaryColor }}>
              {selectedFeature.link ? '🔗' : '✦'}
            </div>
            <h2 className="rv-feat-title">{selectedFeature.title}</h2>
            {selectedFeature.description && (
              <p className="rv-feat-body">{selectedFeature.description}</p>
            )}
            {selectedFeature.link && (
              <a
                href={selectedFeature.link}
                target="_blank"
                rel="noopener noreferrer"
                className="rv-feat-link-btn"
                style={{ background: primaryColor }}
              >
                Open ↗
              </a>
            )}
          </div>
        </div>
      )}

    </div>
  )
}

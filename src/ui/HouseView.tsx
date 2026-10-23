import { useEffect, useRef, useState } from 'react'
import { HouseScene } from '../engine/HouseScene'
import { AvatarController } from '../engine/AvatarController'
import { RoomVisitors } from '../engine/RoomVisitors'
import { fetchHouseState } from '../world/worldApi'
import type { FurnitureType, RoomZone, HouseType } from '../engine/HouseScene'
import type { MyWorldStats } from './MyDashboard'
import type { WorldUser } from '../world/types'
import type { TwedotUser } from '../api/twedotApi'
import { getUserProfile, followUser, unfollowUser, getMyInventory } from '../api/twedotApi'
import type { InventoryItem } from '../api/twedotApi'
import { getRankLabel } from '../api/globalRank'
import MyRequestsPanel from './MyRequestsPanel'
import CustomerOrdersPanel from './CustomerOrdersPanel'
import './HouseView.css'

interface Props {
  stats:  MyWorldStats
  onExit: () => void
  visitUser?: WorldUser
  twedotUser?: TwedotUser | null
  postsCount?: number
}

interface FurnDef { type: FurnitureType; label: string; emoji: string }

const FURN_LIVING: FurnDef[] = [
  { type: 'chair',    label: 'Chair',    emoji: '🪑' },
  { type: 'sofa',     label: 'Sofa',     emoji: '🛋️' },
  { type: 'table',    label: 'Table',    emoji: '🪵' },
  { type: 'bed',      label: 'Bed',      emoji: '🛏️' },
  { type: 'wardrobe', label: 'Wardrobe', emoji: '🗄️' },
  { type: 'lamp',     label: 'Lamp',     emoji: '💡' },
  { type: 'tv',       label: 'TV',       emoji: '📺' },
  { type: 'ac',       label: 'AC',       emoji: '❄️' },
]

const FURN_BATHROOM: FurnDef[] = [
  { type: 'toilet',   label: 'Toilet',   emoji: '🚽' },
  { type: 'bathtub',  label: 'Bathtub',  emoji: '🛁' },
  { type: 'sink',     label: 'Sink',     emoji: '🚿' },
]

const FURN_KITCHEN: FurnDef[] = [
  { type: 'stove',    label: 'Stove',    emoji: '🍳' },
  { type: 'counter',  label: 'Counter',  emoji: '🧱' },
  { type: 'fridge',   label: 'Fridge',   emoji: '🧊' },
]

const ZONE_LABEL: Record<RoomZone, string> = {
  living: 'the living area',
  bathroom: 'the bathroom',
  kitchen: 'the kitchen',
}

export default function HouseView({ stats, onExit, visitUser, twedotUser, postsCount = 0 }: Props) {
  const cvRef      = useRef<HTMLCanvasElement>(null)
  const sceneRef   = useRef<HouseScene | null>(null)
  const avatarRef  = useRef<AvatarController | null>(null)
  const visitorsRef = useRef<RoomVisitors | null>(null)

  const isOwn = !visitUser
  const ownerName   = visitUser?.name ?? twedotUser?.name ?? stats.name ?? 'User'
  const ownerAvatar = visitUser?.avatarUrl ?? twedotUser?.profile_photo_url ?? stats.avatar_url
  const ownerId     = visitUser?.id ?? twedotUser?.id ?? stats.user_id

  const [placing,    setPlacing]    = useState<FurnitureType | null>(null)
  const [moving,     setMoving]     = useState(false)
  const [wallColor,  setWallColor]  = useState('#F0EBE0')
  const [floorColor, setFloorColor] = useState('#C4A882')
  const [furnMenu,   setFurnMenu]   = useState<{ furnId: number; x: number; y: number } | null>(null)
  const [profileData, setProfileData] = useState<{
    followers: number; following: number;
    posts: number;
    is_following?: boolean
  } | null>(null)
  const [bizModal, setBizModal] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [zoneBanner, setZoneBanner] = useState<string | null>(null)
  const [houseType, setHouseType] = useState<HouseType>('selfcon')
  const [visitorPopup, setVisitorPopup] = useState<{ name: string; rank: string } | null>(null)
  const [visitorMsg, setVisitorMsg] = useState('')

  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [activePanel, setActivePanel] = useState<'myRequests' | 'orders' | null>(null)

  useEffect(() => {
    const cv = cvRef.current!
    cv.width  = cv.clientWidth  || window.innerWidth
    cv.height = cv.clientHeight || window.innerHeight

    const hs = new HouseScene(cv, ownerId, ownerAvatar ?? null, ownerName)
    hs.onPlacingDone  = () => { setPlacing(null); if (avatarRef.current) avatarRef.current.paused = false }
    hs.onMovingStart  = () => { setMoving(true); setFurnMenu(null); if (avatarRef.current) avatarRef.current.paused = true }
    hs.onMovingDone   = () => { setMoving(false); if (avatarRef.current) avatarRef.current.paused = false }
    hs.onFurnSelected = (furnId, x, y) => requestAnimationFrame(() => { setShowProfile(false); setFurnMenu({ furnId, x, y }) })
    hs.onZoneReject = (zone: RoomZone) => {
      setZoneBanner(`This item belongs in ${ZONE_LABEL[zone]}`)
      setTimeout(() => setZoneBanner(null), 2500)
    }
    sceneRef.current = hs

    setWallColor(hs.getWallColor())
    setFloorColor(hs.getFloorColor())

    hs.start()

    fetchHouseState().then(s => { if (sceneRef.current) sceneRef.current.loadServerState(s) })

    const avatar = new AvatarController(hs.scene)
    avatarRef.current = avatar
    avatar.load('male').then(() => {
      avatar.setLabel(ownerName, getRankLabel(twedotUser?.global_activity_score))
    }).catch(err => console.warn('[Avatar] load failed', err))

    if (visitUser) {
      getUserProfile(visitUser.id)
        .then(u => setProfileData({
          followers: u.follower_count ?? 0,
          following: u.following_count ?? 0,
          posts: 0,
          is_following: u.is_following,
        }))
        .catch(() => setProfileData({ followers: 0, following: 0, posts: 0 }))
    } else if (twedotUser) {
      setProfileData({
        followers: twedotUser.follower_count ?? 0,
        following: twedotUser.following_count ?? 0,
        posts: postsCount,
      })
      getMyInventory().then(setInventory).catch(() => {})
    } else {
      setProfileData({ followers: 0, following: 0, posts: 0 })
    }

    const resize = () => { if (sceneRef.current) sceneRef.current.engine.resize() }
    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('resize', resize)
      visitorsRef.current?.dispose()
      visitorsRef.current = null
      avatarRef.current?.dispose()
      avatarRef.current = null
      hs.dispose()
    }
  }, [ownerId])


  function handlePickFurniture(type: FurnitureType) {
    const hs = sceneRef.current; if (!hs) return
    if (placing === type) {
      hs.cancelPlacing(); setPlacing(null)
      if (avatarRef.current) avatarRef.current.paused = false
      return
    }
    setPlacing(type)
    if (avatarRef.current) avatarRef.current.paused = true
    hs.startPlacing(type)
  }

  function handleWallColor(hex: string) {
    setWallColor(hex); sceneRef.current?.setWallColor(hex)
  }

  function handleFloorColor(hex: string) {
    setFloorColor(hex); sceneRef.current?.setFloorColor(hex)
  }

  function handleHouseType(type: HouseType) {
    setHouseType(type); sceneRef.current?.setHouseType(type)
  }

  function dismissMenu() { setFurnMenu(null) }

  return (
    <div className="hv-root">
      <canvas ref={cvRef} className="hv-canvas" />

      {/* Top bar */}
      <div className="hv-topbar">
        <button className="hv-exit" onClick={onExit}>← City</button>
        <span className="hv-title">🏠 {ownerName}'s House</span>
        {isOwn && <div className="hv-hint">Tap floor to walk</div>}
      </div>

      {/* ── Profile trigger button ────────────────────────── */}
      {profileData && (
        <button className="hv-profile-trigger" onClick={() => setShowProfile(true)}>
          <div className="hv-trigger-avatar">
            {ownerAvatar
              ? <img src={ownerAvatar} alt="" />
              : <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" fill="#fff"/><path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" fill="#fff"/></svg>
            }
          </div>
          <span className="hv-trigger-name">{ownerName}</span>
        </button>
      )}

      {/* ── Profile bottom sheet ────────────────────────── */}
      {showProfile && profileData && (
        <div className="hv-profile-overlay" onClick={() => setShowProfile(false)}>
          <div className="hv-profile-sheet" onClick={e => e.stopPropagation()}>
            <div className="hv-sheet-handle" />
            <button className="hv-sheet-close" onClick={() => setShowProfile(false)}>×</button>

            {/* ── Profile header ── */}
            <div className="hv-sh-header">
              <div className="hv-pp-avatar">
                {ownerAvatar
                  ? <img src={ownerAvatar} alt="" />
                  : <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" fill="#fff"/><path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" fill="#fff"/></svg>
                }
              </div>
              <div className="hv-sh-info">
                <div className="hv-pp-name">{ownerName}</div>
                {visitUser?.username && <div className="hv-pp-username">@{visitUser.username}</div>}
                <div className="hv-pp-stats">
                  <div className="hv-pp-stat">
                    <span className="hv-pp-stat-num">{profileData.followers}</span>
                    <span className="hv-pp-stat-label">Followers</span>
                  </div>
                  <div className="hv-pp-stat">
                    <span className="hv-pp-stat-num">{profileData.following}</span>
                    <span className="hv-pp-stat-label">Following</span>
                  </div>
                  <div className="hv-pp-stat">
                    <span className="hv-pp-stat-num">{profileData.posts}</span>
                    <span className="hv-pp-stat-label">Posts</span>
                  </div>
                </div>
              </div>
            </div>

            {!isOwn && (
              <div className="hv-sh-visitor-actions">
                <button
                  className={`hv-pp-btn ${profileData?.is_following ? 'hv-pp-btn-following' : 'hv-pp-btn-follow'}`}
                  onClick={async () => {
                    if (!visitUser) return
                    try {
                      if (profileData?.is_following) {
                        const r = await unfollowUser(visitUser.id)
                        setProfileData(p => p ? { ...p, is_following: r.is_following, followers: r.follower_count } : p)
                      } else {
                        const r = await followUser(visitUser.id)
                        setProfileData(p => p ? { ...p, is_following: r.is_following, followers: r.follower_count } : p)
                      }
                    } catch {}
                  }}
                >
                  {profileData?.is_following ? 'Following' : 'Follow'}
                </button>
                <button className="hv-pp-btn hv-pp-btn-msg">Message</button>
              </div>
            )}

            {/* ── Quick actions grid ── */}
            <div className="hv-sh-section">
              <div className="hv-sh-section-title">Quick Actions</div>
              <div className="hv-sh-actions-grid">
                <button className="hv-sh-action" onClick={() => {
                  const link = `${window.location.origin}?house=${ownerId}`
                  navigator.clipboard.writeText(link).then(() => {
                    setShowProfile(false)
                    setZoneBanner('House link copied!')
                    setTimeout(() => setZoneBanner(null), 2500)
                  }).catch(() => {
                    window.open(link, '_blank')
                    setShowProfile(false)
                  })
                }}>
                  <span className="hv-sh-action-icon">🔗</span>
                  <span className="hv-sh-action-label">Share</span>
                </button>
                {isOwn && (
                  <button className="hv-sh-action" onClick={() => { setShowProfile(false); setActivePanel('myRequests') }}>
                    <span className="hv-sh-action-icon">📦</span>
                    <span className="hv-sh-action-label">My Requests</span>
                  </button>
                )}
                {isOwn && (
                  <button className="hv-sh-action" onClick={() => { setShowProfile(false); setActivePanel('orders') }}>
                    <span className="hv-sh-action-icon">🛒</span>
                    <span className="hv-sh-action-label">Orders</span>
                  </button>
                )}
              </div>
            </div>

            {/* ── Business & Inventory ── */}
            <div className="hv-sh-section">
              <div className="hv-sh-section-title">Business & Inventory</div>
              {inventory.length > 0 ? (
                <>
                  <div className="hv-pp-inv-grid">
                    {inventory.slice(0, 4).map(item => (
                      <div key={item.id} className="hv-pp-inv-card">
                        {item.images[0]
                          ? <img src={item.images[0].image_url} alt="" className="hv-pp-inv-img" />
                          : <div className="hv-pp-inv-img-placeholder">🏷️</div>
                        }
                        <div className="hv-pp-inv-name">{item.title}</div>
                        <div className="hv-pp-inv-price">
                          {item.price > 0 ? `₦${item.price.toLocaleString()}` : 'Free'}
                        </div>
                      </div>
                    ))}
                  </div>
                  <button className="hv-pp-btn hv-pp-btn-inv" onClick={() => { window.open('https://twedot.com/inventory', '_blank', 'noopener'); setShowProfile(false) }}>
                    Open Inventory
                  </button>
                </>
              ) : isOwn ? (
                <button className="hv-pp-btn hv-pp-btn-biz" onClick={() => { setBizModal(true); setShowProfile(false) }}>
                  Start a Real Business
                </button>
              ) : (
                <div className="hv-sh-empty">No items for sale yet</div>
              )}
              {isOwn && (
                <a
                  className="hv-pp-create-biz-link"
                  href="https://twedot.com/business/create"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setShowProfile(false)}
                >
                  🏗️ Create a Public Building on the Map →
                </a>
              )}
            </div>

            {/* ── House features ── */}
            <div className="hv-sh-section">
              <div className="hv-sh-section-title">House</div>
              <div className="hv-sh-actions-grid">
                <button className="hv-sh-action" onClick={() => { setShowProfile(false) }}>
                  <span className="hv-sh-action-icon">🛋️</span>
                  <span className="hv-sh-action-label">Furniture</span>
                </button>
                <button className="hv-sh-action" onClick={() => { setShowProfile(false) }}>
                  <span className="hv-sh-action-icon">🎵</span>
                  <span className="hv-sh-action-label">Music</span>
                </button>
                <button className="hv-sh-action" onClick={() => { setShowProfile(false) }}>
                  <span className="hv-sh-action-icon">🐾</span>
                  <span className="hv-sh-action-label">Pets</span>
                </button>
                <button className="hv-sh-action" onClick={() => { setShowProfile(false) }}>
                  <span className="hv-sh-action-icon">🎮</span>
                  <span className="hv-sh-action-label">Games</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Placement / move prompt */}
      {(placing || moving) && (
        <div className="hv-placing-banner">
          {placing
            ? <>Click floor to place {[...FURN_LIVING, ...FURN_BATHROOM, ...FURN_KITCHEN].find(f => f.type === placing)?.label}</>
            : <>Click new position to move — or </>}
          <button onClick={() => {
            if (placing) { sceneRef.current?.cancelPlacing(); setPlacing(null) }
            else { sceneRef.current?.cancelMoving(); setMoving(false) }
          }}>Cancel</button>
        </div>
      )}

      {/* Furniture context menu */}
      {furnMenu && (
        <>
          <div className="hv-furn-backdrop" onClick={dismissMenu} />
          <div
            className="hv-furn-menu"
            style={{ left: furnMenu.x, top: furnMenu.y }}
          >
            <button onClick={() => {
              const info = sceneRef.current?.getFurnitureInfo(furnMenu.furnId)
              if (info && avatarRef.current) avatarRef.current.interactWith(info.type, info.x, info.z)
              setFurnMenu(null)
            }}>
              Use
            </button>
            <button onClick={() => {
              sceneRef.current?.rotateFurniture(furnMenu.furnId)
            }}>
              Rotate
            </button>
            <label className="hv-furn-menu-color">
              Color
              <input type="color"
                defaultValue={sceneRef.current?.getFurnitureInfo(furnMenu.furnId)?.color ?? '#888888'}
                onChange={e => sceneRef.current?.setFurnitureColor(furnMenu.furnId, e.target.value)}
              />
            </label>
            <button onClick={() => {
              sceneRef.current?.startMoving(furnMenu.furnId)
              setFurnMenu(null)
            }}>
              Reposition
            </button>
            <button className="hv-furn-menu-remove" onClick={() => {
              sceneRef.current?.removeFurniture(furnMenu.furnId)
              setFurnMenu(null)
            }}>
              Remove
            </button>
          </div>
        </>
      )}

      {/* Zone reject banner */}
      {zoneBanner && <div className="hv-zone-banner">{zoneBanner}</div>}

      {/* Visitor interaction popup */}
      {visitorPopup && (
        <div className="hv-visitor-overlay" onClick={() => setVisitorPopup(null)}>
          <div className="hv-visitor-popup" onClick={e => e.stopPropagation()}>
            <button className="hv-visitor-close" onClick={() => setVisitorPopup(null)}>×</button>
            <div className="hv-visitor-header">
              <div className="hv-visitor-avatar-circle">
                <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" fill="#fff"/><path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" fill="#fff"/></svg>
              </div>
              <div>
                <div className="hv-visitor-name">{visitorPopup.name}</div>
                <div className="hv-visitor-rank">{visitorPopup.rank}</div>
              </div>
            </div>
            <div className="hv-visitor-input-row">
              <input
                className="hv-visitor-input"
                placeholder="Say something..."
                value={visitorMsg}
                onChange={e => setVisitorMsg(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && visitorMsg.trim()) { setVisitorPopup(null) } }}
                autoFocus
              />
              <button
                className="hv-visitor-send"
                disabled={!visitorMsg.trim()}
                onClick={() => setVisitorPopup(null)}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom toolbar — only for own house, hidden during live */}
      {isOwn && <div className="hv-toolbar">
        <div className="hv-toolbar-section">
          <span className="hv-section-label">House Type</span>
          <div className="hv-furn-row">
            {([
              { type: 'selfcon' as HouseType, label: 'Selfcon', emoji: '🏠' },
              { type: '2bed' as HouseType, label: '2 Bedroom', emoji: '🏡' },
              { type: '3bed' as HouseType, label: '3 Bedroom', emoji: '🏘️' },
              { type: 'upstairs' as HouseType, label: 'Upstairs', emoji: '🏢' },
            ]).map(h => (
              <button
                key={h.type}
                className={`hv-furn-btn ${houseType === h.type ? 'hv-furn-active' : ''}`}
                onClick={() => handleHouseType(h.type)}
                title={h.label}
              >
                <span className="hv-furn-emoji">{h.emoji}</span>
                <span className="hv-furn-label">{h.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="hv-divider" />

        <div className="hv-toolbar-section">
          <span className="hv-section-label">Living Room</span>
          <div className="hv-furn-row">
            {FURN_LIVING.map(f => (
              <button
                key={f.type}
                className={`hv-furn-btn ${placing === f.type ? 'hv-furn-active' : ''}`}
                onClick={() => handlePickFurniture(f.type)}
                title={`Place ${f.label}`}
              >
                <span className="hv-furn-emoji">{f.emoji}</span>
                <span className="hv-furn-label">{f.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="hv-divider" />

        <div className="hv-toolbar-section">
          <span className="hv-section-label">Bathroom</span>
          <div className="hv-furn-row">
            {FURN_BATHROOM.map(f => (
              <button
                key={f.type}
                className={`hv-furn-btn ${placing === f.type ? 'hv-furn-active' : ''}`}
                onClick={() => handlePickFurniture(f.type)}
                title={`Place ${f.label}`}
              >
                <span className="hv-furn-emoji">{f.emoji}</span>
                <span className="hv-furn-label">{f.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="hv-divider" />

        <div className="hv-toolbar-section">
          <span className="hv-section-label">Kitchen</span>
          <div className="hv-furn-row">
            {FURN_KITCHEN.map(f => (
              <button
                key={f.type}
                className={`hv-furn-btn ${placing === f.type ? 'hv-furn-active' : ''}`}
                onClick={() => handlePickFurniture(f.type)}
                title={`Place ${f.label}`}
              >
                <span className="hv-furn-emoji">{f.emoji}</span>
                <span className="hv-furn-label">{f.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="hv-divider" />

        <div className="hv-toolbar-section">
          <span className="hv-section-label">Colours</span>
          <div className="hv-color-row">
            <label className="hv-color-item">
              <div className="hv-color-preview" style={{ background: wallColor }} />
              <span>Wall</span>
              <input type="color" value={wallColor}
                onChange={e => handleWallColor(e.target.value)} />
            </label>
            <label className="hv-color-item">
              <div className="hv-color-preview" style={{ background: floorColor }} />
              <span>Floor</span>
              <input type="color" value={floorColor}
                onChange={e => handleFloorColor(e.target.value)} />
            </label>
          </div>
        </div>

        <div className="hv-divider" />

        <button className="hv-clear-btn" onClick={() => { sceneRef.current?.clearFurniture() }}
          title="Remove all furniture">
          Clear
        </button>
      </div>}


      {/* ── My Requests / Orders panels ────────────────────── */}
      {activePanel === 'myRequests' && (
        <MyRequestsPanel onClose={() => setActivePanel(null)} />
      )}
      {activePanel === 'orders' && (
        <CustomerOrdersPanel onClose={() => setActivePanel(null)} />
      )}

      {/* ── Start a Business modal ─────────────────────────── */}
      {bizModal && (
        <div className="hv-biz-overlay" onClick={() => setBizModal(false)}>
          <div className="hv-biz-modal" onClick={e => e.stopPropagation()}>
            <button className="hv-biz-close" onClick={() => setBizModal(false)}>×</button>
            <div className="hv-biz-icon">🏪</div>
            <div className="hv-biz-title">Start a Real Business</div>
            <div className="hv-biz-desc">
              Turn your virtual house into a real shop! Everything you add to your
              inventory becomes a real product that other Twedot users can buy.
            </div>
            <div className="hv-biz-steps">
              <div className="hv-biz-step">
                <span className="hv-biz-step-num">1</span>
                <div>
                  <strong>Add products to your inventory</strong>
                  <p>Upload photos, set prices, and describe what you're selling.</p>
                </div>
              </div>
              <div className="hv-biz-step">
                <span className="hv-biz-step-num">2</span>
                <div>
                  <strong>Your house becomes your shop</strong>
                  <p>Visitors see your products displayed and can browse your catalog.</p>
                </div>
              </div>
              <div className="hv-biz-step">
                <span className="hv-biz-step-num">3</span>
                <div>
                  <strong>Get paid when people buy</strong>
                  <p>Earnings go straight to your Twedot wallet. Real money, real sales.</p>
                </div>
              </div>
            </div>
            <button className="hv-biz-cta" onClick={() => { window.open('https://twedot.com/inventory', '_blank', 'noopener'); setBizModal(false) }}>
              Get Started
            </button>
          </div>
        </div>
      )}

    </div>
  )
}

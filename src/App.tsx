import { useEffect, useRef, useState, useCallback } from 'react'
import { CityEngine } from './engine/CityEngine'
import type { BuildingDef, WorldUser } from './world/types'
import { BRAND_LOGOS } from './world/brandLogos'
import lagos from './world/lagos'
import BuildingPanel from './ui/BuildingPanel'
import HomeProfilePanel from './ui/HomeProfilePanel'
import SignpostRentModal from './ui/SignpostRentModal'
import type { MyWorldStats, WalletStats } from './ui/MyDashboard'
import UserHUD from './ui/UserHUD'
import UserDashboard from './ui/UserDashboard'
import HouseView from './ui/HouseView'
import RestaurantView from './ui/RestaurantView'
import CitySearch from './ui/CitySearch'
import LiveNowPanel from './ui/LiveNowPanel'
import LiveStoriesStrip from './ui/LiveStoriesStrip'
import { getMyProfile, getContentStats, openAuthPopup, silentAuthViaIframe, exchangeBridgeCode, fetchPublicBusinesses } from './api/twedotApi'
import type { TwedotUser, TwedotBusiness } from './api/twedotApi'
import { businessesToBuildingDefs, businessToBuildingConfig, applyBusinessClaims } from './buildings/businessMapConfig'
import type { BuildingConfig } from './buildings/types'
import type { CityDef } from './world/types'
import { getRankLabel } from './api/globalRank'
import { useLive } from './live/LiveContext'
import './App.css'

const WORLD_API    = import.meta.env.VITE_WORLD_API_URL ?? 'http://localhost:2027'
const WORLD_WS     = import.meta.env.VITE_WORLD_WS_URL  ?? 'ws://localhost:2027'
const TWEDOT_FEED    = import.meta.env.VITE_TWEDOT_FEED_URL   ?? 'https://twedot.com'
const TWEDOT_API     = import.meta.env.DEV ? '/twedot-api' : (import.meta.env.VITE_TWEDOT_API_URL ?? 'https://prodapi.twedot.com')

/** Shape returned by GET /world/homes */
interface BackendUser {
  home_index: number
  user_id: string
  name: string | null
  username: string | null
  avatar_url: string | null
  occupation: string | null
}

function backendToWorldUser(u: BackendUser): WorldUser {
  return {
    id:        u.user_id,
    name:      u.name ?? 'Twedot User',
    username:  u.username ?? undefined,
    avatarUrl: u.avatar_url ?? undefined,
    homeIndex: u.home_index,
    occupation: u.occupation ?? undefined,
  }
}

export default function App() {
  const mapCvRef  = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<CityEngine | null>(null)

  const labelsRef    = useRef<HTMLDivElement>(null)
  const labelEls     = useRef(new Map<string, HTMLElement>())
  const bubblesRef   = useRef<HTMLDivElement>(null)
  const bubbleEls    = useRef(new Map<string, HTMLElement>())
  const wsRef        = useRef<WebSocket | null>(null)
  const usersRef     = useRef<BackendUser[]>([])
  // Full city def (static + dynamic businesses) — used by the labels click handler
  const cityRef      = useRef<CityDef>(lagos)
  // BuildingConfig keyed by BuildingDef.id (e.g. 'biz_<uuid>') for dynamic businesses
  const bizConfigsRef = useRef<Map<string, BuildingConfig>>(new Map())

  const [picked,        setPicked]        = useState<BuildingDef | null>(null)
  const [homePicked,    setHomePicked]    = useState<WorldUser | null>(null)
  const [rentSign,      setRentSign]      = useState<{ ownerId: string } | null>(null)
  const [clock,         setClock]         = useState('')
  const [loadPct,       setLoadPct]       = useState<number>(-1)
  const [myStats,       setMyStats]       = useState<MyWorldStats | null>(null)
  const [walletStats,   setWalletStats]   = useState<WalletStats | null>(null)
  const [_walletLoading, setWalletLoading] = useState(false)
  const [dashOpen,      setDashOpen]      = useState(false)
  const [houseOpen,     setHouseOpen]     = useState(false)
  const [visitingUser, setVisitingUser]  = useState<WorldUser | null>(null)
  const [restaurantOpen, setRestaurantOpen] = useState<string | null>(null)
  const [restaurantBizConfig, setRestaurantBizConfig] = useState<BuildingConfig | null>(null)
  const [restaurantDef, setRestaurantDef] = useState<BuildingDef | null>(null)
  const [, setDbgStatus] = useState('')
  const { service: streamService } = useLive()
  const [twedotUser, setTwedotUser] = useState<TwedotUser | null>(null)
  const [postsCount, setPostsCount] = useState(0)
  const [bizList, setBizList] = useState<TwedotBusiness[]>([])
  const [goLiveOpen, setGoLiveOpen] = useState(false)

  useEffect(() => {
    const tick = () => {
      const n = new Date()
      const hh = String(n.getHours()).padStart(2, '0')
      const mm = String(n.getMinutes()).padStart(2, '0')
      const ss = String(n.getSeconds()).padStart(2, '0')
      setClock(`${hh}:${mm}:${ss}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  async function fetchTwedotProfile(): Promise<boolean> {
    try {
      const u = await getMyProfile()
      setTwedotUser(u)
      if (u.id) streamService.setAuthUser(u.id)
      getContentStats()
        .then(s => setPostsCount(s.contentPublished))
        .catch(() => {})
      return true
    } catch {
      return false
    }
  }

  const handleLogin = useCallback(async (): Promise<boolean> => {
    const ok = await openAuthPopup()
    if (ok) await fetchTwedotProfile()
    return ok
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    ;(async () => {
      const params = new URLSearchParams(window.location.search)
      const bridgeCode = params.get('bridge_code')
      const streamId = params.get('stream')

      // Open stream viewer immediately — don't wait for auth to complete.
      // Auth (fetchTwedotProfile / silentAuthViaIframe) can take 5-10s; the
      // viewer overlay handles both auth and guest users on its own.
      if (streamId) {
        params.delete('stream')
        window.history.replaceState({}, '', window.location.pathname + (params.toString() ? '?' + params : ''))
        setVisitingUser({ id: streamId, name: 'Live User', watchingLive: true })
        setView('house')
      }

      if (bridgeCode) {
        params.delete('bridge_code')
        params.delete('bridge_failed')
        window.history.replaceState({}, '', window.location.pathname + (params.toString() ? '?' + params : ''))
        const ok = await exchangeBridgeCode(bridgeCode)
        if (ok) { await fetchTwedotProfile(); return }
      } else if (params.has('bridge_failed')) {
        params.delete('bridge_failed')
        window.history.replaceState({}, '', window.location.pathname + (params.toString() ? '?' + params : ''))
      }

      const ok = await fetchTwedotProfile()
      if (!ok) {
        const bridged = await silentAuthViaIframe()
        if (bridged) await fetchTwedotProfile()
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let checking = false
    const onFocus = async () => {
      if (checking) return
      checking = true
      try {
        const ok = await fetchTwedotProfile()
        if (!ok) {
          const bridged = await silentAuthViaIframe()
          if (bridged) {
            await fetchTwedotProfile()
          } else {
            setTwedotUser(null)
            setPostsCount(0)
          }
        }
      } finally {
        checking = false
      }
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── City mode ─────────────────────────────────────────────────
  useEffect(() => {
    const cv = mapCvRef.current!
    cv.width  = cv.clientWidth  || window.innerWidth
    cv.height = cv.clientHeight || window.innerHeight
    const eng = new CityEngine(cv)
    eng.onEvent    = e => {
      if (e.type === 'pick-empty') {
        setPicked(null); setHomePicked(null); setRentSign(null)
        return
      }
      if (e.type === 'pick-building') {
        // Always dismiss any currently open panel first
        setPicked(null); setHomePicked(null); setRentSign(null)
        if (e.building.type === 'home' && e.building.ownerId) {
          const u = usersRef.current.find(u => u.user_id === e.building.ownerId)
          if (u) { setHomePicked(backendToWorldUser(u)); return }
        }
        setPicked(e.building)
      }
      if (e.type === 'pick-signpost') {
        setPicked(null); setHomePicked(null)
        setRentSign({ ownerId: e.ownerId })
      }
    }
    eng.onLabels   = data => {
      const container = labelsRef.current
      if (!container) return
      // Clear stale elements when container was remounted
      if (container.childElementCount === 0) labelEls.current.clear()
      const alive = new Set(data.map(l => l.id))
      // Remove labels that scrolled out of view
      for (const [id, el] of labelEls.current) {
        if (!alive.has(id)) { el.remove(); labelEls.current.delete(id) }
      }
      // Create new labels or update positions directly on the DOM (no React re-render)
      for (const l of data) {
        let el = labelEls.current.get(l.id)
        if (!el) {
          el = document.createElement('div')
          el.className = 'biz-avatar'
          const logoUrl = BRAND_LOGOS[l.name] ?? bizConfigsRef.current.get(l.id)?.logoUrl
          const icon = logoUrl
            ? `<img class="ba-logo" src="${logoUrl}" alt="" />`
            : `<span class="ba-icon">${l.emoji}</span>`
          el.innerHTML = `${icon}<span class="ba-name">${l.name}</span>`
          el.addEventListener('click', () => {
            const bld = cityRef.current.buildings.find(b => b.id === l.id)
            if (bld) { setPicked(null); setHomePicked(null); setRentSign(null); setPicked(bld) }
          })
          container.appendChild(el)
          labelEls.current.set(l.id, el)
        }
        el.style.transform = `translate(calc(${l.sx}px - 50%), calc(${l.sy}px - 100% - 2px))`
      }
    }
    eng.onPostBubble = bubbles => {
      const container = bubblesRef.current
      if (!container) return
      if (container.childElementCount === 0) bubbleEls.current.clear()
      const alive = new Set(bubbles.map(b => b.id))
      for (const [id, el] of bubbleEls.current) {
        if (!alive.has(id)) { el.remove(); bubbleEls.current.delete(id) }
      }
      for (const b of bubbles) {
        let el = bubbleEls.current.get(b.id)
        if (!el) {
          el = document.createElement('div')
          el.className = 'pb-bubble'
          const av = b.avatarUrl
            ? `<img class="pb-av" src="${b.avatarUrl}" alt="" />`
            : `<div class="pb-av pb-av-init">${b.name.charAt(0).toUpperCase()}</div>`
          el.innerHTML = `
            ${av}
            <div class="pb-body">
              <div class="pb-msg"><strong>${b.name}</strong> said something on Twedot feed 🔥</div>
            </div>
            <button class="pb-close" title="Dismiss">×</button>`

          // Click bubble body → open feed in new tab
          el.addEventListener('click', () => window.open(TWEDOT_FEED, '_blank', 'noopener'))

          // × → dismiss this bubble only
          el.querySelector('.pb-close')!.addEventListener('click', ev => {
            ev.stopPropagation()
            eng.dismissBubble(b.id)
          })

          container.appendChild(el)
          bubbleEls.current.set(b.id, el)
        }
        el.style.left    = b.sx + 'px'
        el.style.top     = b.sy + 'px'
        el.style.opacity = b.remaining < 0.15 ? String(b.remaining / 0.15) : '1'
      }
    }
    eng.onProgress = pct => setLoadPct(pct)
    eng.onStatus   = msg => setDbgStatus(msg)
    engineRef.current = eng
    let pendingBizId = ''
    const restoreView = (view: string) => {
      if (view === 'house') setHouseOpen(true)
      else if (view.startsWith('business:')) {
        // Claimed building — defer until bizConfigsRef is populated after fetch
        pendingBizId = view.slice(9)
      }
    }
    try {
      const cached = localStorage.getItem('tw_view')
      if (cached && cached !== 'map') restoreView(cached)
    } catch {}
    fetch(`${WORLD_API}/world/state`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.view && d.view !== 'map') restoreView(d.view) })
      .catch(() => {})
    eng.start()
    setLoadPct(1)

    // ── Fetch dynamic businesses, then build city + load real users ──
    ;(async () => {
      // Build merged city def (static + dynamic businesses from backend)
      try {
        const { businesses } = await fetchPublicBusinesses(1, 200)
        const dynamicDefs = businessesToBuildingDefs(businesses)
        const claimedStatic = applyBusinessClaims(lagos.buildings, businesses)
        const newConfigs = new Map<string, BuildingConfig>()
        businesses.forEach(b => newConfigs.set(`biz_${b.id}`, businessToBuildingConfig(b)))
        // Also index claimed static buildings by their static ID so RestaurantView can find config
        businesses.filter(b => b.world_building_id).forEach(b => {
          newConfigs.set(b.world_building_id!, businessToBuildingConfig(b))
        })
        bizConfigsRef.current = newConfigs
        cityRef.current = { ...lagos, buildings: [...claimedStatic, ...dynamicDefs] }
        setBizList(businesses)

        // Restore a dynamic business view saved before this fetch completed
        if (pendingBizId) {
          const def = dynamicDefs.find(d => d.businessId === pendingBizId)
          if (def) {
            const cfg = newConfigs.get(def.id) ?? null
            setRestaurantOpen(def.name)
            setRestaurantBizConfig(cfg)
            setRestaurantDef(def)
          }
          pendingBizId = ''
        }
      } catch {
        // Failed to fetch — use static-only city
        cityRef.current = lagos
      }

      await eng.loadAndBuild(cityRef.current)

      try {
        const res = await fetch(`${WORLD_API}/world/homes`)
        const users: BackendUser[] = await res.json()
        usersRef.current = users
        eng.setUserHomes(users.map(backendToWorldUser))

        fetch(`${WORLD_API}/world/me`, { credentials: 'include' })
          .then(r => r.ok ? r.json() : null)
          .then((s: MyWorldStats | null) => { if (s) setMyStats(s) })
          .catch(() => {})

        setWalletLoading(true)
        fetch(`${TWEDOT_API}/api/v1/wallet/earnings/stats?days=30`, { credentials: 'include' })
          .then(r => r.ok ? r.json() : null)
          .then((w: WalletStats | null) => { if (w) setWalletStats(w) })
          .catch(() => {})
          .finally(() => setWalletLoading(false))
      } catch (e) {
        console.warn('[world] failed to fetch homes', e)
      }

      // ── Fetch active rentals and apply to signs ─────────────────
      // (done lazily per sign in SignpostRentModal; skip bulk prefetch for now)

      // ── WebSocket for real-time city updates ────────────────────
      const sock = new WebSocket(`${WORLD_WS}/ws`)
      wsRef.current = sock
      sock.onmessage = ev => {
        try {
          const msg = JSON.parse(ev.data) as { type: string; data: unknown }
          if (msg.type === 'home_added') {
            const u = msg.data as BackendUser
            usersRef.current = [...usersRef.current, u]
            eng.setUserHomes([backendToWorldUser(u)])
          }
          if (msg.type === 'post_created') {
            const d = msg.data as { user_id: string; name: string; avatar_url?: string }
            eng.showPostBubble(d.user_id, d.name, d.avatar_url)
          }
          if (msg.type === 'sign_rented') {
            const d = msg.data as { owner_user_id: string; image_url: string }
            eng.updateSignAd('user_' + d.owner_user_id, d.image_url)
          }
        } catch {}
      }
      sock.onerror = () => console.warn('[ws] connection error')
    })().catch(err => console.error('[loadAndBuild]', err))

    const resize = () => eng.engine.resize()
    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('resize', resize)
      wsRef.current?.close()
      eng.dispose()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Pause city engine when any interior is open ───────────────
  const anyInteriorOpen = !!(houseOpen || visitingUser || restaurantOpen)

  useEffect(() => {
    const eng = engineRef.current
    if (!eng) return
    if (anyInteriorOpen) eng.pause()
    else eng.resume()
  }, [anyInteriorOpen])

  const setView = useCallback((v: string) => {
    try { localStorage.setItem('tw_view', v) } catch {}
    fetch(`${WORLD_API}/world/state`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ view: v }),
    }).catch(() => {})
  }, [])

  const handleEnter = useCallback((def: BuildingDef) => {
    const bizCfg = bizConfigsRef.current.get(def.id) ?? null
    setPicked(null)
    setRestaurantOpen(def.name)
    setRestaurantBizConfig(bizCfg)
    setRestaurantDef(def)
    setView(def.businessId ? 'business:' + def.businessId : 'building:' + def.id)
  }, [])

  const loading = loadPct >= 0 && loadPct < 100

  return (
    <div className="app-root">

      {/* ── City view ── */}
      <div style={anyInteriorOpen ? { display: 'none' } : undefined}>
        <>
          <canvas ref={mapCvRef} className="world-canvas" />

          {/* Loading overlay — shown until city is fully built */}
          {loading && (
            <div className="load-overlay">
              <div className="load-box">
                <div className="load-title">Lagos Virtual City</div>
                <div className="load-sub">Loading city assets…</div>
                <div className="load-track">
                  <div className="load-fill" style={{ width: `${loadPct}%` }} />
                </div>
                <div className="load-pct">{loadPct}%</div>
              </div>
            </div>
          )}

          {/* Floating building labels — positions written directly to DOM every frame */}
          {!loading && <div className="labels-layer" ref={labelsRef} />}
          {/* Post-notification bubbles — projected above user homes */}
          {!loading && <div className="bubbles-layer" ref={bubblesRef} />}

          <div className="ui-layer">
            <div className="city-title">🌍 Lagos — Twedot Virtual City</div>
            <div className="live-clock">{clock}</div>
            {!loading && bizList.length > 0 && (
              <CitySearch
                businesses={bizList}
                defs={cityRef.current.buildings.filter(b => b.businessId)}
                onSelect={handleEnter}
              />
            )}
            {!loading && (
              <div className="controls-hint">
                <span>Drag <b>pan</b></span>
                <span>Right-drag <b>rotate 360°</b></span>
                <span>Scroll <b>zoom</b></span>
                <span>Tap <b>walk / info</b></span>
              </div>
            )}
            <div className="zoom-btns">
              <button onClick={() => engineRef.current?.zoom(true)}>+</button>
              <button onClick={() => engineRef.current?.zoom(false)}>−</button>
            </div>
          </div>

          {!loading && <LiveStoriesStrip
            onJoin={(roomId) => {
              setVisitingUser({ id: roomId, name: 'Live User', watchingLive: true })
              setView('house')
            }}
          />}

          {!loading && <LiveNowPanel
            isLoggedIn={!!twedotUser}
            onJoin={(roomId) => {
              setVisitingUser({ id: roomId, name: 'Live User', watchingLive: true })
              setView('house')
            }}
            onGoLive={() => {
              setGoLiveOpen(true)
              setHouseOpen(true)
              setView('house')
            }}
          />}

          {!loading && (() => {
            const displayStats: MyWorldStats = myStats ?? {
              home_index: 0,
              user_id: twedotUser?.id ?? '',
              name: twedotUser?.name ?? 'Demo User',
              avatar_url: twedotUser?.profile_photo_url ?? null,
              signpost_earnings_kobo: 0,
              active_rental: false,
            }
            const displayWallet: WalletStats = walletStats ?? {
              isEligible: false,
              totalEarnings: 0,
              periodEarnings: 0,
              deltaPct: 0,
            }
            return (
              <>
                <UserHUD
                  stats={displayStats}
                  wallet={displayWallet}
                  walletLoading={false}
                  onOpenDash={() => setDashOpen(true)}
                  onSettings={() => {/* settings — coming soon */}}
                />
                {dashOpen && (
                  <UserDashboard
                    stats={displayStats}
                    wallet={displayWallet}
                    walletLoading={false}
                    rank={getRankLabel(twedotUser?.global_activity_score)}
                    isLoggedIn={!!twedotUser}
                    onLogin={handleLogin}
                    onEnterHome={() => { setDashOpen(false); setHouseOpen(true); setView('house') }}
                    onClose={() => setDashOpen(false)}
                  />
                )}
              </>
            )
          })()}

          {picked && (
            <BuildingPanel
              def={picked}
              onClose={() => setPicked(null)}
              onEnter={handleEnter}
              isLoggedIn={!!twedotUser}
            />
          )}

          {homePicked && (
            <HomeProfilePanel
              user={homePicked}
              isOwnHome={!!twedotUser && homePicked.id === myStats?.user_id}
              isLoggedIn={!!twedotUser}
              onLogin={handleLogin}
              onRentSign={() => { setRentSign({ ownerId: homePicked.id }); setHomePicked(null) }}
              onEnterHouse={() => {
                const isOwn = !!twedotUser && homePicked.id === myStats?.user_id
                if (isOwn) { setHouseOpen(true) } else { setVisitingUser(homePicked) }
                setHomePicked(null); setView('house')
              }}
              onClose={() => setHomePicked(null)}
            />
          )}

          {rentSign && (() => {
            const u = usersRef.current.find(u => u.user_id === rentSign.ownerId)
            return (
              <SignpostRentModal
                building={{ id: 'user_' + rentSign.ownerId, name: '', type: 'home', x: 0, z: 0, w: 0, h: 0, d: 0, ownerId: rentSign.ownerId }}
                owner={u ? backendToWorldUser(u) : undefined}
                currentUserId={twedotUser?.id ?? ''}
                isLoggedIn={!!twedotUser}
                apiUrl={WORLD_API}
                onClose={() => setRentSign(null)}
              />
            )
          })()}
        </>
      </div>

      {/* ── House interior ── */}
      {(houseOpen || visitingUser) && (() => {
        const s = myStats ?? {
          home_index: 0, user_id: twedotUser?.id ?? '', name: twedotUser?.name ?? 'Demo User',
          avatar_url: twedotUser?.profile_photo_url ?? null, signpost_earnings_kobo: 0, active_rental: false,
        }
        return <HouseView stats={s} visitUser={visitingUser ?? undefined}
          twedotUser={twedotUser} postsCount={postsCount}
          onLogin={handleLogin}
          autoOpenLive={goLiveOpen}
          onExit={() => { setHouseOpen(false); setVisitingUser(null); setGoLiveOpen(false); setView('map') }} />
      })()}

      {/* ── Business interior (claimed building) ── */}
      {restaurantOpen && (
        <RestaurantView
          name={restaurantOpen}
          bizConfig={restaurantBizConfig ?? undefined}
          def={restaurantDef ?? undefined}
          onExit={() => { setRestaurantOpen(null); setRestaurantBizConfig(null); setRestaurantDef(null); setView('map') }}
        />
      )}

    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useLive } from '../live/LiveContext'
import type { LiveRoom } from '../live/LiveContext'
import './LiveNowPanel.css'

interface Props {
  onJoin: (roomId: string) => void
  onGoLive: () => void
  isLoggedIn: boolean
}

export default function LiveNowPanel({ onJoin, onGoLive, isLoggedIn }: Props) {
  const { liveRooms, refreshRooms } = useLive()
  const [expanded, setExpanded] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    refreshRooms()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!expanded) return
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setExpanded(false)
      }
    }
    document.addEventListener('pointerdown', handleClick)
    return () => document.removeEventListener('pointerdown', handleClick)
  }, [expanded])

  function fmtPrice(kobo: number): string {
    return '₦' + (kobo / 100).toLocaleString('en-NG')
  }

  function fmtElapsed(startedAt: number): string {
    const s = Math.floor((Date.now() - startedAt) / 1000)
    if (s < 60) return `${Math.max(0, s)}s`
    if (s < 3600) return `${Math.floor(s / 60)}m`
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
  }

  if (!expanded) {
    return (
      <button className="lnp-pill" onClick={() => setExpanded(true)}>
        <div className="lnp-dot" />
        <span>Live</span>
        {liveRooms.length > 0 && <span className="lnp-pill-count">{liveRooms.length}</span>}
      </button>
    )
  }

  return (
    <div className="lnp-panel" ref={panelRef}>
      <div className="lnp-header">
        <div className="lnp-dot" />
        <span className="lnp-title">Live Now</span>
        {liveRooms.length > 0 && <span className="lnp-count">{liveRooms.length}</span>}
        <div className="lnp-header-right">
          {isLoggedIn && (
            <button className="lnp-golive-btn" onClick={() => { setExpanded(false); onGoLive() }}>
              <span className="lnp-golive-dot" />
              Go Live
            </button>
          )}
          <button className="lnp-close" onClick={() => setExpanded(false)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="lnp-list">
        {liveRooms.length === 0 ? (
          <div className="lnp-empty">
            <div className="lnp-empty-icon">📡</div>
            <div>No one is live right now</div>
            {isLoggedIn && (
              <button className="lnp-empty-golive" onClick={() => { setExpanded(false); onGoLive() }}>
                Be the first — Go Live
              </button>
            )}
          </div>
        ) : (
          liveRooms.map((r: LiveRoom) => (
            <div key={r.roomId} className="lnp-card" onClick={() => { setExpanded(false); onJoin(r.roomId) }}>
              {/* Thumbnail area */}
              <div className="lnp-thumb">
                {r.hostPhoto && (
                  <img className="lnp-thumb-bg" src={r.hostPhoto} alt="" />
                )}
                <div className="lnp-thumb-overlay" />

                {/* Live badge + elapsed time */}
                <div className="lnp-thumb-top">
                  <span className="lnp-live-badge">
                    <span className="lnp-live-badge-dot" />
                    LIVE
                  </span>
                  {r.price > 0 && (
                    <span className="lnp-price lnp-thumb-price">{fmtPrice(r.price)}</span>
                  )}
                </div>

                {/* Host info overlaid bottom */}
                <div className="lnp-thumb-bottom">
                  <div className="lnp-thumb-avatar">
                    {r.hostPhoto
                      ? <img src={r.hostPhoto} alt="" />
                      : <span>{r.hostName[0]?.toUpperCase()}</span>
                    }
                  </div>
                  <div className="lnp-thumb-info">
                    <div className="lnp-thumb-name">{r.hostName}</div>
                    <div className="lnp-thumb-title">{r.title.replace(/^#+/, '').trim()}</div>
                  </div>
                  <div className="lnp-thumb-viewers">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                    </svg>
                    {r.viewers}
                  </div>
                </div>
              </div>

              {/* Join button */}
              <button
                className="lnp-join"
                onClick={e => { e.stopPropagation(); setExpanded(false); onJoin(r.roomId) }}
              >
                {r.price > 0 ? `Pay ${fmtPrice(r.price)} & Watch` : 'Watch Live'}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

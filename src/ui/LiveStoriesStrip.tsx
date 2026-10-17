import { useLive } from '../live/LiveContext'
import type { LiveRoom } from '../live/LiveContext'
import './LiveStoriesStrip.css'

interface Props {
  onJoin: (roomId: string) => void
}

export default function LiveStoriesStrip({ onJoin }: Props) {
  const { liveRooms } = useLive()
  if (liveRooms.length === 0) return null

  return (
    <div className="lss-strip">
      <div className="lss-label">
        <span className="lss-label-dot" />
        Live Now
      </div>
      <div className="lss-scroll">
        {liveRooms.map((r: LiveRoom) => (
          <button key={r.roomId} className="lss-card" onClick={() => onJoin(r.roomId)}>
            {r.hostPhoto
              ? <img className="lss-card-photo" src={r.hostPhoto} alt="" />
              : <div className="lss-card-fb">{r.hostName[0]?.toUpperCase()}</div>
            }
            <div className="lss-card-grad" />

            <span className="lss-badge">LIVE</span>

            <span className="lss-viewers">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/>
              </svg>
              {r.viewers}
            </span>

            {r.title && <div className="lss-card-title">#{r.title.replace(/^#+/, '').trim()}</div>}
            <div className="lss-card-name">{r.hostName}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

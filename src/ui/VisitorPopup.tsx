import type { VisitorPopupState } from './useBuildingVisitors'
import './VisitorPopup.css'

interface Props {
  popup: VisitorPopupState
  msg: string
  onMsgChange: (v: string) => void
  onClose: () => void
}

export default function VisitorPopup({ popup, msg, onMsgChange, onClose }: Props) {
  return (
    <div className="vp-overlay" onClick={onClose}>
      <div className="vp-popup" onClick={e => e.stopPropagation()}>
        <button className="vp-close" onClick={onClose}>×</button>
        <div className="vp-header">
          <div className="vp-avatar-circle">
            <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" fill="#fff"/><path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" fill="#fff"/></svg>
          </div>
          <div>
            <div className="vp-name">{popup.name}</div>
            <div className="vp-rank">{popup.rank}</div>
          </div>
        </div>
        <div className="vp-input-row">
          <input
            className="vp-input"
            placeholder="Say something..."
            value={msg}
            onChange={e => onMsgChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && msg.trim()) onClose() }}
            autoFocus
          />
          <button className="vp-send" disabled={!msg.trim()} onClick={onClose}>
            Send
          </button>
        </div>
      </div>
    </div>
  )
}

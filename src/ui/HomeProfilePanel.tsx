import type { WorldUser } from '../world/types'

interface Props {
  user: WorldUser
  onRentSign: () => void
  onEnterHouse: () => void
  onClose: () => void
  isOwnHome: boolean
  isLoggedIn: boolean
  onLogin: () => void
}

export default function HomeProfilePanel({ user, onRentSign, onEnterHouse, onClose, isOwnHome, isLoggedIn, onLogin }: Props) {
  const avatar    = user.avatarUrl
  const initials  = (user.name ?? 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const username  = user.username ? `@${user.username}` : null

  return (
    <div className="hp-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="hp-panel">

        <button className="hp-close" onClick={onClose}>✕</button>

        {/* Avatar */}
        <div className="hp-avatar">
          {avatar
            ? <img src={avatar} alt={user.name ?? ''} />
            : <span className="hp-initials">{initials}</span>
          }
        </div>

        {/* Identity */}
        <div className="hp-name">{user.name ?? 'Twedot User'}</div>
        {username && <div className="hp-username">{username}</div>}
        {user.occupation && <div className="hp-occupation">{user.occupation}</div>}

        <div className="hp-tag">🏠 Twedot Resident</div>

        {/* Actions */}
        {isOwnHome && !isLoggedIn ? (
          <button className="hp-enter-btn" onClick={onLogin}>
            🔑 Login to Enter Your House
          </button>
        ) : (
          <button className="hp-enter-btn" onClick={onEnterHouse}>
            🏠 Enter House
          </button>
        )}
        {!isOwnHome && (
          <button className="hp-rent-btn" onClick={onRentSign}>
            📢 Rent Ad Space
          </button>
        )}
        {isOwnHome && isLoggedIn && (
          <div className="hp-own-note">This is your home</div>
        )}

      </div>
    </div>
  )
}

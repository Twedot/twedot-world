import './UserDashboard.css'
import type { MyWorldStats, WalletStats } from './MyDashboard'

interface Props {
  stats:         MyWorldStats
  wallet:        WalletStats | null
  walletLoading: boolean
  rank?:         string
  isLoggedIn:    boolean
  onLogin?:      () => void
  onClose:       () => void
}

function fmt(n: number | undefined | null) {
  if (n == null || isNaN(n)) return '₦0.00'
  return '₦' + n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function UserDashboard({ stats, wallet, walletLoading, rank, isLoggedIn, onLogin, onClose }: Props) {
  const earnings = stats.signpost_earnings_kobo / 100

  return (
    <div className="udash-overlay" onClick={onClose}>
      <div className="udash-drawer" onClick={e => e.stopPropagation()}>

        <button className="udash-close" onClick={onClose}>×</button>

        {/* Profile header */}
        <div className="udash-profile">
          {stats.avatar_url
            ? <img className="udash-av" src={stats.avatar_url} alt="" />
            : <div className="udash-av udash-av-default"><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" fill="#fff"/><path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" fill="#fff"/></svg></div>
          }
          <div className="udash-info">
            <div className="udash-name">{stats.name ?? 'Twedot User'}</div>
            {rank && <div className="udash-rank">{rank}</div>}
            <div className="udash-sub">Twedot World · House #{stats.home_index + 1}</div>
          </div>
        </div>

        <div className="udash-divider" />

        {/* Signpost */}
        <div className="udash-section">
          <div className="udash-section-title">📢 Signpost Earnings</div>
          <div className="udash-section-row">
            <span className="udash-big-num">{fmt(earnings)}</span>
            <span className={`udash-badge ${stats.active_rental ? 'udash-badge-green' : 'udash-badge-grey'}`}>
              {stats.active_rental ? 'Rented' : 'Available'}
            </span>
          </div>
          <div className="udash-section-hint">
            {stats.active_rental
              ? 'Your signpost is currently rented by someone.'
              : 'Your signpost is free — share your home link to attract renters.'}
          </div>
        </div>

        <div className="udash-divider" />

        {/* Wallet */}
        <div className="udash-section">
          <div className="udash-section-title">💰 Twedot Wallet</div>
          {walletLoading ? (
            <div className="udash-loading">Loading balance…</div>
          ) : wallet ? (
            <>
              <div className="udash-section-row">
                <span className="udash-big-num">{fmt(wallet.totalEarnings)}</span>
                {wallet.isEligible && (
                  <span className={`udash-badge ${wallet.deltaPct >= 0 ? 'udash-badge-green' : 'udash-badge-red'}`}>
                    {wallet.deltaPct >= 0 ? '+' : ''}{wallet.deltaPct}%
                  </span>
                )}
              </div>
              <div className="udash-section-hint">
                {wallet.isEligible
                  ? 'Total earnings from qualified video views on Twedot.'
                  : 'Reach Supreme rank to start earning from your content.'}
              </div>
            </>
          ) : (
            <div className="udash-loading">Could not load wallet.</div>
          )}
        </div>

        {!isLoggedIn && onLogin && (
          <>
            <div className="udash-divider" />
            <button className="udash-login-btn" onClick={() => { onLogin(); onClose() }}>
              Sign In with Twedot
            </button>
          </>
        )}

      </div>
    </div>
  )
}

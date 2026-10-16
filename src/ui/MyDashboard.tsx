import './MyDashboard.css'

export interface MyWorldStats {
  home_index:              number
  user_id:                 string
  name:                    string | null
  avatar_url:              string | null
  signpost_earnings_kobo:  number
  active_rental:           boolean
}

export interface WalletStats {
  isEligible:          boolean
  totalEarnings:       number  // ₦
  periodEarnings:      number
  deltaPct:            number
}

interface Props {
  stats:       MyWorldStats
  wallet:      WalletStats | null
  walletLoading: boolean
  onEnterHome: () => void
}

function fmt(naira: number | undefined | null): string {
  if (naira == null || isNaN(naira)) return '₦0.00'
  return '₦' + naira.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function MyDashboard({ stats, wallet, walletLoading, onEnterHome }: Props) {
  const earnings = stats.signpost_earnings_kobo / 100

  return (
    <div className="myd-panel">
      {/* Card 1 — My House */}
      <div className="myd-card">
        <div className="myd-card-header">
          <span className="myd-icon">🏠</span>
          <span className="myd-label">My House</span>
        </div>
        <div className="myd-card-body">
          <div className="myd-user-row">
            {stats.avatar_url
              ? <img className="myd-av" src={stats.avatar_url} alt="" />
              : <div className="myd-av myd-av-init">{(stats.name ?? 'U').charAt(0).toUpperCase()}</div>
            }
            <span className="myd-name">{stats.name ?? 'Twedot User'}</span>
          </div>
          <button className="myd-enter-btn" onClick={onEnterHome}>
            📍 Enter My House
          </button>
        </div>
      </div>

      {/* Card 2 — Signpost Earnings */}
      <div className="myd-card">
        <div className="myd-card-header">
          <span className="myd-icon">📢</span>
          <span className="myd-label">Signpost Earnings</span>
        </div>
        <div className="myd-card-body">
          <div className="myd-amount">{fmt(earnings)}</div>
          <div className={`myd-rental-status ${stats.active_rental ? 'myd-rented' : 'myd-available'}`}>
            {stats.active_rental ? '● Currently rented' : '○ Available for rent'}
          </div>
        </div>
      </div>

      {/* Card 3 — Twedot Wallet */}
      <div className="myd-card">
        <div className="myd-card-header">
          <span className="myd-icon">💰</span>
          <span className="myd-label">Twedot Wallet</span>
        </div>
        <div className="myd-card-body">
          {walletLoading ? (
            <div className="myd-loading">Loading…</div>
          ) : wallet ? (
            <>
              <div className="myd-amount">{fmt(wallet.totalEarnings)}</div>
              <div className="myd-wallet-sub">
                {wallet.isEligible
                  ? `${wallet.deltaPct >= 0 ? '+' : ''}${wallet.deltaPct}% this period`
                  : 'Reach Supreme rank to earn'}
              </div>
            </>
          ) : (
            <div className="myd-loading">Not available</div>
          )}
        </div>
      </div>
    </div>
  )
}

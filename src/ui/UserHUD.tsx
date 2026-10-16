import './UserHUD.css'
import type { MyWorldStats, WalletStats } from './MyDashboard'

interface Props {
  stats:         MyWorldStats
  wallet:        WalletStats | null
  walletLoading: boolean
  onOpenDash:    () => void
  onSettings:    () => void
}

function fmtNaira(n: number | undefined | null) {
  if (n == null || isNaN(n)) return '₦0'
  if (n >= 1_000_000) return '₦' + (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)     return '₦' + (n / 1_000).toFixed(1)     + 'K'
  return '₦' + n.toFixed(0)
}

export default function UserHUD({ stats, wallet, walletLoading, onOpenDash, onSettings }: Props) {
  const earnings = stats.signpost_earnings_kobo / 100

  return (
    <>
      {/* ── Bottom-left avatar + home label ────────────────── */}
      <div className="uhud-home-group" onClick={onOpenDash}>
        <button className="uhud-avatar-btn" title="My Profile">
          {stats.avatar_url
            ? <img src={stats.avatar_url} alt={stats.name ?? ''} />
            : <svg className="uhud-av-icon" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" fill="#fff"/><path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" fill="#fff"/></svg>
          }
          <span className="uhud-av-ring" />
        </button>
        <span className="uhud-home-label">My Home</span>
      </div>

      {/* ── Right side panel ───────────────────────────────── */}
      <div className="uhud-right">
        <div className="uhud-chip">
          <span className="uhud-chip-icon">📢</span>
          <div className="uhud-chip-col">
            <span className="uhud-chip-label">Signpost</span>
            <span className="uhud-chip-val">{fmtNaira(earnings)}</span>
          </div>
        </div>

        <div className="uhud-chip">
          <span className="uhud-chip-icon">💰</span>
          <div className="uhud-chip-col">
            <span className="uhud-chip-label">Wallet</span>
            <span className="uhud-chip-val">
              {walletLoading ? '…' : wallet ? fmtNaira(wallet.totalEarnings) : '—'}
            </span>
          </div>
        </div>

        <button className="uhud-chip uhud-settings-btn" onClick={onSettings}>
          <span className="uhud-chip-icon">⚙️</span>
          <span className="uhud-chip-val">Settings</span>
        </button>
      </div>
    </>
  )
}

import { useState } from 'react'
import type { BuildingDef } from '../world/types'
import { BUILDING_TYPES } from '../world/buildingTypes'
import { BRAND_LOGOS } from '../world/brandLogos'
import './BuildingPanel.css'

const API = (import.meta.env.DEV ? '/twedot-api' : (import.meta.env.VITE_TWEDOT_API_URL ?? 'https://prodapi.twedot.com')) + '/api/v1'

type ClaimStep = 'idle' | 'form' | 'verify' | 'pending' | 'approved'

interface Props {
  def: BuildingDef
  onClose: () => void
  onEnter?: (def: BuildingDef) => void
  isLoggedIn?: boolean
}

export default function BuildingPanel({ def, onClose, onEnter, isLoggedIn }: Props) {
  const ty   = BUILDING_TYPES[def.type]
  const logo = BRAND_LOGOS[def.name] ?? def.logoUrl
  const isClaimed = !!def.businessId

  const [step, setStep]       = useState<ClaimStep>('idle')
  const [email, setEmail]     = useState('')
  const [website, setWebsite] = useState('')
  const [claimId, setClaimId] = useState('')
  const [code, setCode]       = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const FREE_DOMAINS = new Set(['gmail.com','yahoo.com','hotmail.com','outlook.com','live.com','icloud.com','me.com','aol.com','protonmail.com','proton.me','mail.com','gmx.com','yandex.com','tutanota.com','fastmail.com','hey.com'])

  const submitClaim = async () => {
    if (!email || !email.includes('@')) { setError('Enter a valid company email'); return }
    const domain = email.split('@')[1]?.toLowerCase() ?? ''
    if (FREE_DOMAINS.has(domain)) { setError('Please use your company email, not a personal one (Gmail, Yahoo, etc.)'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch(`${API}/buildings/claim/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          building_id:      def.id,
          building_name:    def.name,
          building_type:    def.type,
          company_email:    email,
          business_website: website || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.message ?? json.error ?? 'Request failed')
      setClaimId(json.data.claim_id)
      setStep('verify')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const submitCode = async () => {
    if (code.length !== 6) { setError('Enter the 6-digit code'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch(`${API}/buildings/claim/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ claim_id: claimId, code }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.message ?? json.error ?? 'Verification failed')
      setStep(json.data.status === 'approved' ? 'approved' : 'pending')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bp-overlay" onClick={onClose}>
      <div
        className="bp-card"
        onClick={e => e.stopPropagation()}
        style={{ '--accent': ty.accent, '--win': ty.color } as React.CSSProperties}
      >
        <button className="bp-close" onClick={onClose}>×</button>

        <div className="bp-header">
          {logo
            ? <img src={logo} alt="" className="bp-logo" />
            : <span className="bp-emoji">{ty.emoji}</span>
          }
          <div>
            <div className="bp-name">{def.name}</div>
            <div className="bp-type">{ty.label}</div>
          </div>
        </div>

        {isClaimed && (
          <div className="bp-stats">
            <div className="bp-stat">
              <span className="bp-stat-label">Rating</span>
              <span className="bp-stat-val">★ {ty.rating}</span>
            </div>
            <div className="bp-stat">
              <span className="bp-stat-label">Status</span>
              <span className="bp-stat-val bp-open">Open</span>
            </div>
          </div>
        )}

        <div className="bp-actions">
          <button className="bp-cta bp-enter" onClick={() => onEnter?.(def)}>
            Enter Building →
          </button>

          {isClaimed ? (
            <button
              className="bp-cta bp-cta-view"
              onClick={() => window.open('https://twedot.com', '_blank')}
            >
              View on Twedot ↗
            </button>
          ) : isLoggedIn ? (
            step === 'idle' ? (
              <button className="bp-cta bp-cta-claim" onClick={() => setStep('form')}>
                Claim This Building
              </button>
            ) : step === 'form' ? (
              <div className="bp-claim-form">
                {error && <div className="bp-claim-error">{error}</div>}
                <input
                  className="bp-claim-input"
                  type="email"
                  placeholder="Company email (you@yourcompany.com)"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submitClaim()}
                />
                <input
                  className="bp-claim-input"
                  type="url"
                  placeholder="Business website (optional)"
                  value={website}
                  onChange={e => setWebsite(e.target.value)}
                />
                <button className="bp-cta bp-cta-claim" onClick={submitClaim} disabled={loading}>
                  {loading ? 'Sending…' : 'Send Verification Code →'}
                </button>
                <button className="bp-claim-back" onClick={() => { setStep('idle'); setError('') }}>
                  Cancel
                </button>
              </div>
            ) : step === 'verify' ? (
              <div className="bp-claim-form">
                <p className="bp-claim-hint">
                  A 6-digit code was sent to <strong>{email}</strong>. Check your inbox.
                </p>
                {error && <div className="bp-claim-error">{error}</div>}
                <input
                  className="bp-claim-input bp-claim-otp"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={e => e.key === 'Enter' && submitCode()}
                />
                <button
                  className="bp-cta bp-cta-claim"
                  onClick={submitCode}
                  disabled={loading || code.length !== 6}
                >
                  {loading ? 'Verifying…' : 'Verify Code →'}
                </button>
                <button className="bp-claim-back" onClick={() => { setStep('form'); setCode(''); setError('') }}>
                  ← Back
                </button>
              </div>
            ) : step === 'pending' ? (
              <div className="bp-claim-status bp-claim-pending">
                <span className="bp-claim-status-icon">⏳</span>
                <div>
                  <div className="bp-claim-status-title">Under Review</div>
                  <div className="bp-claim-status-desc">
                    Your claim is being reviewed by the Twedot team. We'll notify you once it's approved.
                  </div>
                </div>
              </div>
            ) : (
              <div className="bp-claim-status bp-claim-approved">
                <span className="bp-claim-status-icon">✅</span>
                <div>
                  <div className="bp-claim-status-title">Approved!</div>
                  <div className="bp-claim-status-desc">
                    This building is now linked to your business. Visit your Twedot dashboard to set up your space.
                  </div>
                </div>
              </div>
            )
          ) : (
            <div className="bp-cta-hint">Log in to Twedot to claim this building</div>
          )}
        </div>

        {!isClaimed && step === 'idle' && (
          <div className="bp-unclaimed-note">
            <span className="bp-unclaimed-note-icon">🔒</span>
            <span>
              This is a private building. It can only be claimed by its authorized representative.
              If that's you, use the button above to start the verification process.
            </span>
          </div>
        )}

      </div>
    </div>
  )
}

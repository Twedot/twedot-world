import { useRef, useState } from 'react'
import type { BuildingDef, WorldUser } from '../world/types'

interface Props {
  building: BuildingDef
  owner: WorldUser | undefined
  currentUserId: string
  isLoggedIn: boolean
  apiUrl: string
  onClose: () => void
}

const DURATIONS = [
  { label: '1 Day',    days: 1,  price: 500   },
  { label: '3 Days',   days: 3,  price: 1200  },
  { label: '1 Week',   days: 7,  price: 2500  },
  { label: '2 Weeks',  days: 14, price: 4500  },
  { label: '1 Month',  days: 30, price: 9000  },
]

export default function SignpostRentModal({ building, owner, currentUserId, isLoggedIn: loggedIn, apiUrl, onClose }: Props) {
  const fileRef    = useRef<HTMLInputElement>(null)
  const imgFileRef = useRef<File | null>(null)
  const [imgUrl, setImgUrl]     = useState<string | null>(null)
  const [duration, setDuration] = useState(DURATIONS[2])
  const [step, setStep]         = useState<'form' | 'success' | 'submitting'>('form')
  const [dragging, setDragging] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)

  const isOwn    = !!currentUserId && building.ownerId === currentUserId
  const notLoggedIn = !loggedIn

  const loadFile = (file: File) => {
    if (!file.type.startsWith('image/')) return
    imgFileRef.current = file
    const reader = new FileReader()
    reader.onload = e => setImgUrl(e.target?.result as string)
    reader.readAsDataURL(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) loadFile(file)
  }

  const handleRent = async () => {
    if (!imgFileRef.current || !loggedIn) return
    setStep('submitting')
    setApiError(null)
    try {
      const form = new FormData()
      form.append('image', imgFileRef.current)
      form.append('duration_days', String(duration.days))

      const token = (window as unknown as Record<string, string>).__twedotToken ?? null
      const res = await fetch(`${apiUrl}/world/signpost/${building.ownerId}/rent`, {
        method: 'POST',
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'request failed' }))
        setApiError(body.error ?? 'Something went wrong')
        setStep('form')
        return
      }
      setStep('success')
    } catch (e) {
      setApiError('Network error — please try again')
      setStep('form')
    }
  }

  return (
    <div className="sp-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sp-modal">

        {/* Header */}
        <div className="sp-header">
          <div>
            <div className="sp-title">Rent Ad Space</div>
            <div className="sp-sub">
              {owner ? <>Owned by <b>{owner.name}</b> (@{owner.username})</> : 'Ad signpost'}
            </div>
          </div>
          <button className="sp-close" onClick={onClose}>✕</button>
        </div>

        {step === 'success' ? (
          <div className="sp-success">
            <div className="sp-success-icon">🎉</div>
            <div className="sp-success-title">Ad Space Rented!</div>
            <div className="sp-success-body">
              Your ad is now live for <b>{duration.label}</b> on {owner?.name ?? 'this'}'s signpost.
            </div>
            <button className="sp-btn-primary" onClick={onClose}>Done</button>
          </div>
        ) : notLoggedIn ? (
          <div className="sp-own-notice">
            <div className="sp-own-icon">🔒</div>
            <div className="sp-own-text">Sign in to Twedot to rent ad space.</div>
            <div className="sp-own-sub">Open the Twedot app and you'll be connected automatically.</div>
            <button className="sp-btn-secondary" onClick={onClose}>Close</button>
          </div>
        ) : isOwn ? (
          <div className="sp-own-notice">
            <div className="sp-own-icon">🏠</div>
            <div className="sp-own-text">This is your home's signpost.</div>
            <div className="sp-own-sub">You cannot rent your own ad space.</div>
            <button className="sp-btn-secondary" onClick={onClose}>Close</button>
          </div>
        ) : (
          <>
            {/* Image upload */}
            <div className="sp-section-label">Ad Image (16:9)</div>
            <div
              className={`sp-drop${dragging ? ' sp-drop-active' : ''}`}
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              {imgUrl
                ? <img src={imgUrl} className="sp-preview-img" alt="ad preview" />
                : <div className="sp-drop-hint">
                    <span className="sp-drop-icon">🖼️</span>
                    <span>Drop image here or <b>click to upload</b></span>
                    <span className="sp-drop-note">JPG, PNG, WEBP — will be fitted to 16:9</span>
                  </div>
              }
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) loadFile(f) }}
            />
            {imgUrl && (
              <button className="sp-change-img" onClick={() => { setImgUrl(null); fileRef.current?.click() }}>
                Change image
              </button>
            )}

            {/* Duration picker */}
            <div className="sp-section-label">Rental Duration</div>
            <div className="sp-durations">
              {DURATIONS.map(d => (
                <button
                  key={d.days}
                  className={`sp-dur-btn${duration.days === d.days ? ' sp-dur-active' : ''}`}
                  onClick={() => setDuration(d)}
                >
                  {d.label}
                </button>
              ))}
            </div>

            <div className="sp-price-row">
              <span className="sp-price-label">Total</span>
              <span className="sp-price">₦{duration.price.toLocaleString()}</span>
            </div>

            {apiError && <div className="sp-api-error">{apiError}</div>}

            <button
              className="sp-btn-primary"
              disabled={!imgUrl || step === 'submitting'}
              onClick={handleRent}
            >
              {step === 'submitting' ? 'Processing…' : `Rent Now — ₦${duration.price.toLocaleString()}`}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

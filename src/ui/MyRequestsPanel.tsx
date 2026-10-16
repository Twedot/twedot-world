import { useState, useEffect } from 'react'
import { getMyPurchaseRequests, cancelPurchaseRequest } from '../api/twedotApi'
import type { PurchaseRequest } from '../api/twedotApi'
import './RequestsPanel.css'

interface Props {
  onClose: () => void
}

export default function MyRequestsPanel({ onClose }: Props) {
  const [requests, setRequests] = useState<PurchaseRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)

  useEffect(() => {
    loadRequests()
  }, [page])

  async function loadRequests() {
    setLoading(true)
    const data = await getMyPurchaseRequests(page)
    setRequests(data.requests)
    setTotal(data.total)
    setLoading(false)
  }

  async function handleCancel(id: string) {
    try {
      await cancelPurchaseRequest(id)
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'cancelled' as const } : r))
    } catch {}
  }

  const statusColors: Record<string, string> = {
    pending: '#f59e0b',
    accepted: '#22c55e',
    declined: '#ef4444',
    cancelled: '#6b7280',
  }

  return (
    <div className="rp-overlay" onClick={onClose}>
      <div className="rp-sheet" onClick={e => e.stopPropagation()}>
        <div className="rp-handle" />
        <button className="rp-close" onClick={onClose}>×</button>

        <div className="rp-header">
          <div className="rp-header-icon">📦</div>
          <div>
            <div className="rp-title">My Requests</div>
            <div className="rp-subtitle">Items you've requested to buy</div>
          </div>
        </div>

        {loading ? (
          <div className="rp-loading">
            <div className="rp-spinner" />
            <span>Loading requests...</span>
          </div>
        ) : requests.length === 0 ? (
          <div className="rp-empty">
            <div className="rp-empty-icon">📭</div>
            <div className="rp-empty-title">No requests yet</div>
            <div className="rp-empty-desc">
              When you request items from live streams or shops, they'll appear here.
            </div>
          </div>
        ) : (
          <div className="rp-list">
            <div className="rp-count">{total} request{total !== 1 ? 's' : ''}</div>
            {requests.map(r => (
              <div key={r.id} className="rp-card">
                <div className="rp-card-img">
                  {r.inventory?.images?.[0]?.image_url
                    ? <img src={r.inventory.images[0].image_url} alt="" />
                    : <span>📦</span>
                  }
                </div>
                <div className="rp-card-info">
                  <div className="rp-card-name">{r.inventory?.title ?? 'Unknown item'}</div>
                  <div className="rp-card-price">
                    {r.inventory?.price != null ? `₦${Number(r.inventory.price).toLocaleString()}` : '—'}
                  </div>
                  <div className="rp-card-seller">
                    Seller: {r.seller?.name ?? 'Unknown'}
                  </div>
                  <div className="rp-card-meta">
                    <span className="rp-badge" style={{ background: statusColors[r.status] ?? '#6b7280' }}>
                      {r.status}
                    </span>
                    {r.source === 'livestream' && <span className="rp-source">via Live</span>}
                    <span className="rp-date">{new Date(r.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                {r.status === 'pending' && (
                  <button className="rp-cancel-btn" onClick={() => handleCancel(r.id)}>Cancel</button>
                )}
              </div>
            ))}
            {total > requests.length && (
              <button className="rp-load-more" onClick={() => setPage(p => p + 1)}>
                Load more
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { getCustomerRequests, updatePurchaseRequestStatus } from '../api/twedotApi'
import type { PurchaseRequest } from '../api/twedotApi'
import './RequestsPanel.css'

interface Props {
  onClose: () => void
}

export default function CustomerOrdersPanel({ onClose }: Props) {
  const [requests, setRequests] = useState<PurchaseRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)

  useEffect(() => {
    loadRequests()
  }, [page])

  async function loadRequests() {
    setLoading(true)
    const data = await getCustomerRequests(page)
    setRequests(data.requests)
    setTotal(data.total)
    setLoading(false)
  }

  async function handleAction(id: string, status: 'accepted' | 'declined') {
    try {
      const updated = await updatePurchaseRequestStatus(id, status)
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status: updated.status } : r))
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
          <div className="rp-header-icon">🛒</div>
          <div>
            <div className="rp-title">Customer Orders</div>
            <div className="rp-subtitle">Items customers want to buy from you</div>
          </div>
        </div>

        {loading ? (
          <div className="rp-loading">
            <div className="rp-spinner" />
            <span>Loading orders...</span>
          </div>
        ) : requests.length === 0 ? (
          <div className="rp-empty">
            <div className="rp-empty-icon">📭</div>
            <div className="rp-empty-title">No orders yet</div>
            <div className="rp-empty-desc">
              When customers request your items from live streams or your shop, they'll appear here.
            </div>
          </div>
        ) : (
          <div className="rp-list">
            <div className="rp-count">{total} order{total !== 1 ? 's' : ''}</div>
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
                  <div className="rp-card-buyer">
                    <div className="rp-buyer-avatar">
                      {r.buyer?.profile_photo_url
                        ? <img src={r.buyer.profile_photo_url} alt="" />
                        : <span>{(r.buyer?.name ?? '?')[0]?.toUpperCase()}</span>
                      }
                    </div>
                    <span>{r.buyer?.name ?? 'Unknown buyer'}</span>
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
                  <div className="rp-action-col">
                    <button className="rp-accept-btn" onClick={() => handleAction(r.id, 'accepted')}>Accept</button>
                    <button className="rp-decline-btn" onClick={() => handleAction(r.id, 'declined')}>Decline</button>
                  </div>
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

const PROD_API = 'https://prodapi.twedot.com'
const TWEDOT_WEB = 'https://twedot.com'
const BASE = import.meta.env.DEV ? '/twedot-api' : (import.meta.env.VITE_TWEDOT_API_URL ?? PROD_API)

function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'x-platform': 'web',
      ...(init.headers as Record<string, string>),
    },
  })
}

export function silentAuthViaIframe(): Promise<boolean> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => cleanup(false), 8000)
    const iframe = document.createElement('iframe')
    iframe.style.display = 'none'
    iframe.src = `${TWEDOT_WEB}/auth-bridge?origin=${encodeURIComponent(window.location.origin)}`

    const onMessage = async (e: MessageEvent) => {
      if (e.origin !== TWEDOT_WEB || e.data?.type !== 'twedot-bridge') return
      cleanup()
      if (e.data.code) {
        const ok = await exchangeBridgeCode(e.data.code)
        resolve(ok)
      } else {
        resolve(false)
      }
    }

    function cleanup(shouldResolve?: false) {
      clearTimeout(timeout)
      window.removeEventListener('message', onMessage)
      iframe.remove()
      if (shouldResolve === false) resolve(false)
    }

    window.addEventListener('message', onMessage)
    document.body.appendChild(iframe)
  })
}

export function openAuthPopup(): Promise<boolean> {
  return new Promise((resolve) => {
    const origin = window.location.origin
    const url = `${TWEDOT_WEB}/auth-bridge?origin=${encodeURIComponent(origin)}`
    const popup = window.open(url, 'twedot-auth', 'width=450,height=500,popup=yes')

    if (!popup || popup.closed) {
      const redirectUrl = `${TWEDOT_WEB}/auth-bridge?origin=${encodeURIComponent(origin)}&mode=redirect`
      window.location.href = redirectUrl
      resolve(false)
      return
    }

    const onMessage = async (e: MessageEvent) => {
      if (e.origin !== TWEDOT_WEB || e.data?.type !== 'twedot-bridge') return
      window.removeEventListener('message', onMessage)
      clearInterval(pollClosed)

      if (e.data.code) {
        const ok = await exchangeBridgeCode(e.data.code)
        resolve(ok)
      } else {
        resolve(false)
      }
    }

    const pollClosed = setInterval(() => {
      if (popup?.closed) {
        clearInterval(pollClosed)
        window.removeEventListener('message', onMessage)
        resolve(false)
      }
    }, 500)

    window.addEventListener('message', onMessage)
  })
}

export { exchangeBridgeCode }

async function exchangeBridgeCode(code: string): Promise<boolean> {
  try {
    const res = await apiFetch(`${BASE}/api/v1/users/auth/session-bridge`, {
      method: 'POST',
      body: JSON.stringify({ code }),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function isLoggedIn(): Promise<boolean> {
  try {
    const res = await apiFetch(`${BASE}/api/v1/users/me`)
    return res.ok
  } catch {
    return false
  }
}

// ── Profile ───────────────────────────────────────────

export interface TwedotUser {
  id: string
  name: string | null
  phone_number?: string
  profile_photo_url: string | null
  occupation: string | null
  bio: string | null
  is_verified?: boolean
  follower_count?: number
  following_count?: number
  is_following?: boolean
  total_content_views?: number
  global_activity_score?: number
  rank_visible?: boolean
  credits_balance?: number
  city?: string | null
  country?: string | null
}

export async function getMyProfile(): Promise<TwedotUser> {
  const res = await apiFetch(`${BASE}/api/v1/users/me`)
  const json = await res.json()
  if (!res.ok) throw new Error(json.message ?? 'Failed to fetch profile')
  return json.data as TwedotUser
}

export async function getUserProfile(userId: string): Promise<TwedotUser> {
  const res = await apiFetch(`${BASE}/api/v1/users/getby_id/${userId}`)
  const json = await res.json()
  if (!res.ok) throw new Error(json.message ?? 'Failed to fetch user profile')
  return json.data as TwedotUser
}

// ── Follow ────────────────────────────────────────────

export async function followUser(userId: string) {
  const res = await apiFetch(`${BASE}/api/v1/users/follow/${userId}`, {
    method: 'POST',
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.message ?? 'Follow failed')
  return json.data as { following: boolean; is_following: boolean; follower_count: number }
}

export async function unfollowUser(userId: string) {
  const res = await apiFetch(`${BASE}/api/v1/users/follow/${userId}`, {
    method: 'DELETE',
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.message ?? 'Unfollow failed')
  return json.data as { unfollowed: boolean; is_following: boolean; follower_count: number }
}

// ── Inventory ────────────────────────────────────────

export interface InventoryItem {
  id: string
  title: string
  price: number
  is_available: boolean
  images: { image_url: string }[]
}

export async function getMyInventory(): Promise<InventoryItem[]> {
  const res = await apiFetch(`${BASE}/api/v1/inventory/my-items?limit=10&is_available=true`)
  const json = await res.json()
  if (!res.ok) return []
  return (json.data?.items ?? []) as InventoryItem[]
}

export async function getPublicSellerInventory(sellerId: string, page = 1, limit = 50): Promise<{ items: InventoryItem[]; total: number }> {
  const res = await fetch(`${BASE}/api/v1/inventory/public/${sellerId}?page=${page}&limit=${limit}`, {
    headers: { 'x-platform': 'web' },
  })
  const json = await res.json()
  if (!res.ok) return { items: [], total: 0 }
  return { items: (json.data?.items ?? []) as InventoryItem[], total: json.data?.total ?? 0 }
}

// ── Purchase Requests ─────────────────────────────────

export interface PurchaseRequest {
  id: string
  inventory_id: string
  buyer_id: string
  seller_id: string
  status: 'pending' | 'accepted' | 'declined' | 'cancelled'
  quantity: number
  note: string | null
  source: 'direct' | 'livestream'
  created_at: string
  inventory?: {
    id: string
    title: string
    price: number
    images: { image_url: string }[]
  }
  buyer?: {
    id: string
    name: string | null
    profile_photo_url: string | null
  }
  seller?: {
    id: string
    name: string | null
    profile_photo_url: string | null
  }
}

export async function createPurchaseRequest(inventoryId: string, source: 'direct' | 'livestream' = 'direct', note?: string): Promise<PurchaseRequest> {
  const res = await apiFetch(`${BASE}/api/v1/purchase-requests`, {
    method: 'POST',
    body: JSON.stringify({ inventory_id: inventoryId, source, note }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.message ?? 'Failed to create request')
  return json.data.request as PurchaseRequest
}

export async function getMyPurchaseRequests(page = 1, limit = 20): Promise<{ requests: PurchaseRequest[]; total: number }> {
  const res = await apiFetch(`${BASE}/api/v1/purchase-requests/my-requests?page=${page}&limit=${limit}`)
  const json = await res.json()
  if (!res.ok) return { requests: [], total: 0 }
  return json.data as { requests: PurchaseRequest[]; total: number }
}

export async function getCustomerRequests(page = 1, limit = 20): Promise<{ requests: PurchaseRequest[]; total: number }> {
  const res = await apiFetch(`${BASE}/api/v1/purchase-requests/customer-requests?page=${page}&limit=${limit}`)
  const json = await res.json()
  if (!res.ok) return { requests: [], total: 0 }
  return json.data as { requests: PurchaseRequest[]; total: number }
}

export async function updatePurchaseRequestStatus(requestId: string, status: 'accepted' | 'declined'): Promise<PurchaseRequest> {
  const res = await apiFetch(`${BASE}/api/v1/purchase-requests/${requestId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.message ?? 'Failed to update request')
  return json.data.request as PurchaseRequest
}

export async function cancelPurchaseRequest(requestId: string): Promise<void> {
  const res = await apiFetch(`${BASE}/api/v1/purchase-requests/${requestId}/cancel`, {
    method: 'POST',
  })
  if (!res.ok) {
    const json = await res.json()
    throw new Error(json.message ?? 'Failed to cancel request')
  }
}

// ── Business ──────────────────────────────────────────

export interface TwedotBusiness {
  id: string
  owner_id: string
  name: string
  slug: string
  category: 'food' | 'services' | 'retail' | 'stores' | 'sales' | 'entertainment' | 'health' | 'education' | 'other'
  description: string | null
  cover_image_url: string | null
  logo_url: string | null
  address: string | null
  phone: string | null
  website: string | null
  opening_time: string | null
  closing_time: string | null
  working_days: string[]
  is_active: boolean
  world_building_id?: string | null
}

export async function fetchPublicBusinesses(page = 1, limit = 200): Promise<{ businesses: TwedotBusiness[]; total: number }> {
  try {
    const res = await fetch(`${BASE}/api/v1/business/search?page=${page}&limit=${limit}`, {
      headers: { 'x-platform': 'web' },
    })
    const json = await res.json()
    if (!res.ok) return { businesses: [], total: 0 }
    const payload = json.data ?? json
    return { businesses: (payload.businesses ?? []) as TwedotBusiness[], total: payload.pagination?.total ?? 0 }
  } catch {
    return { businesses: [], total: 0 }
  }
}

export async function searchBusinessesByQuery(q: string, limit = 20): Promise<TwedotBusiness[]> {
  try {
    const res = await fetch(`${BASE}/api/v1/business/search?q=${encodeURIComponent(q)}&limit=${limit}`, {
      headers: { 'x-platform': 'web' },
    })
    const json = await res.json()
    if (!res.ok) return []
    return (json.data?.businesses ?? []) as TwedotBusiness[]
  } catch {
    return []
  }
}

export async function getMyBusinesses(): Promise<TwedotBusiness[]> {
  try {
    const res = await fetch(`${BASE}/api/v1/business/mine`, {
      credentials: 'include',
      headers: { 'x-platform': 'web' },
    })
    const json = await res.json()
    if (!res.ok) return []
    return (json.data?.businesses ?? []) as TwedotBusiness[]
  } catch {
    return []
  }
}

export async function claimWorldBuilding(businessId: string, worldBuildingId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${BASE}/api/v1/business/${businessId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'x-platform': 'web' },
      body: JSON.stringify({ world_building_id: worldBuildingId }),
    })
    const json = await res.json()
    if (!res.ok) return { ok: false, error: json.message ?? 'Failed to claim building' }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Network error' }
  }
}

export async function unclaimWorldBuilding(businessId: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/v1/business/${businessId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'x-platform': 'web' },
      body: JSON.stringify({ world_building_id: null }),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function getPublicBusinessItems(businessId: string): Promise<{ items: InventoryItem[]; total: number }> {
  try {
    const res = await fetch(`${BASE}/api/v1/business/public/${businessId}/items`, {
      headers: { 'x-platform': 'web' },
    })
    const json = await res.json()
    if (!res.ok) return { items: [], total: 0 }
    const payload = json.data ?? json
    const raw: Array<{ id: string; name: string; price: string | number; image_url: string | null; is_available: boolean }> = payload.items ?? []
    const items: InventoryItem[] = raw
      .filter(i => i.is_available)
      .map(i => ({
        id: i.id,
        title: i.name,
        price: parseFloat(String(i.price)),
        is_available: i.is_available,
        images: i.image_url ? [{ image_url: i.image_url }] : [],
      }))
    return { items, total: payload.total ?? items.length }
  } catch {
    return { items: [], total: 0 }
  }
}

export interface BusinessFeature {
  id: string
  business_id: string
  title: string
  description?: string | null
  link?: string | null
  sort_order: number
  created_at: string
}

export interface BusinessOrder {
  id: string
  business_id: string
  item_id?: string | null
  buyer_id: string
  status: 'pending' | 'accepted' | 'declined' | 'cancelled'
  note?: string | null
  created_at: string
  updated_at: string
  item?: { id: string; name: string; price: number; image_url: string | null } | null
  buyer?: { id: string; name: string | null; profile_photo_url: string | null } | null
}

export async function createBusinessOrder(businessId: string, itemId?: string, note?: string): Promise<BusinessOrder> {
  const res = await apiFetch(`${BASE}/api/v1/business/public/${businessId}/orders`, {
    method: 'POST',
    body: JSON.stringify({ item_id: itemId, note }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.message ?? 'Failed to place order')
  return (json.data?.order ?? json.data) as BusinessOrder
}

export async function getMyBusinessOrders(businessId: string): Promise<{ orders: BusinessOrder[] }> {
  try {
    const res = await apiFetch(`${BASE}/api/v1/business/public/${businessId}/orders/my`)
    const json = await res.json()
    if (!res.ok) return { orders: [] }
    return { orders: (json.data?.orders ?? []) as BusinessOrder[] }
  } catch {
    return { orders: [] }
  }
}

export async function getCustomerBusinessOrders(businessId: string): Promise<{ orders: BusinessOrder[] }> {
  try {
    const res = await apiFetch(`${BASE}/api/v1/business/${businessId}/orders`)
    const json = await res.json()
    if (!res.ok) return { orders: [] }
    return { orders: (json.data?.orders ?? []) as BusinessOrder[] }
  } catch {
    return { orders: [] }
  }
}

export async function updateBusinessOrderStatus(businessId: string, orderId: string, status: 'accepted' | 'declined'): Promise<BusinessOrder> {
  const res = await apiFetch(`${BASE}/api/v1/business/${businessId}/orders/${orderId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.message ?? 'Failed to update order')
  return (json.data?.order ?? json.data) as BusinessOrder
}

export async function cancelBusinessOrder(businessId: string, orderId: string): Promise<void> {
  const res = await apiFetch(`${BASE}/api/v1/business/public/${businessId}/orders/${orderId}/cancel`, {
    method: 'POST',
  })
  if (!res.ok) {
    const json = await res.json()
    throw new Error(json.message ?? 'Failed to cancel order')
  }
}

export async function getPublicBusinessFeatures(businessId: string): Promise<{ features: BusinessFeature[] }> {
  try {
    const res = await fetch(`${BASE}/api/v1/business/public/${businessId}/features`, {
      headers: { 'x-platform': 'web' },
    })
    const json = await res.json()
    if (!res.ok) return { features: [] }
    const payload = json.data ?? json
    return { features: (payload.features ?? []) as BusinessFeature[] }
  } catch {
    return { features: [] }
  }
}

// ── Content stats ─────────────────────────────────────

export interface ContentStats {
  postViews: number
  profileViews: number
  likes: number
  comments: number
  reposts: number
  contentPublished: number
}

export async function getContentStats(days = 9999): Promise<ContentStats> {
  const res = await apiFetch(`${BASE}/api/v1/status/analytics/stats?days=${days}`)
  const json = await res.json()
  if (!res.ok) throw new Error(json.message ?? 'Failed to fetch stats')
  return json.data.current as ContentStats
}

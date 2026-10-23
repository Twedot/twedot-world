const WORLD_API = import.meta.env.VITE_WORLD_API_URL ?? 'http://localhost:2027'

function getWorldToken(): string | null {
  try { return (window as unknown as Record<string, string>).__twedotToken ?? null } catch { return null }
}

function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = getWorldToken()
  return fetch(url, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers as Record<string, string>),
    },
  })
}

// ── House state ────────────────────────────────────────────────

export interface HouseStateData {
  wallColor: string
  floorColor: string
  houseType?: string
  furniture: Array<{ type: string; x: number; z: number; rotY?: number; color?: string }>
}

const LS_HOUSE_KEY = 'twedot_house_state'

function _readLocal(): HouseStateData | null {
  try { const s = localStorage.getItem(LS_HOUSE_KEY); return s ? JSON.parse(s) : null } catch { return null }
}

function _writeLocal(state: HouseStateData): void {
  try { localStorage.setItem(LS_HOUSE_KEY, JSON.stringify(state)) } catch {}
}

export async function fetchHouseState(): Promise<HouseStateData | null> {
  try {
    const res = await apiFetch(`${WORLD_API}/world/house`)
    if (res.ok) {
      const data = await res.json()
      if (data) { _writeLocal(data); return data }
    }
    return _readLocal()
  } catch { return _readLocal() }
}

let _houseSaveTimer: ReturnType<typeof setTimeout> | null = null

export function saveHouseState(state: HouseStateData): void {
  _writeLocal(state)
  if (_houseSaveTimer) clearTimeout(_houseSaveTimer)
  _houseSaveTimer = setTimeout(() => {
    apiFetch(`${WORLD_API}/world/house`, {
      method: 'PUT', body: JSON.stringify(state),
    }).catch(() => {})
  }, 500)
}

// ── Avatar config ──────────────────────────────────────────────

export interface AvatarConfigData {
  skinColor: string
  hairStyle: string
  hairColor: string
  shirtStyle: string
  shirtColor: string
  pantsStyle: string
  pantsColor: string
  shoeColor: string
}

export async function fetchAvatarConfig(): Promise<AvatarConfigData | null> {
  try {
    const res = await apiFetch(`${WORLD_API}/world/avatar`)
    if (!res.ok) return null
    const data = await res.json()
    return data ?? null
  } catch { return null }
}

export async function saveAvatarConfigToServer(config: AvatarConfigData): Promise<void> {
  try {
    await apiFetch(`${WORLD_API}/world/avatar`, {
      method: 'PUT', body: JSON.stringify(config),
    })
  } catch {}
}

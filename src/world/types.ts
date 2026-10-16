export type BuildingType =
  | 'cafe' | 'shop' | 'restaurant' | 'barber' | 'beauty'
  | 'office' | 'hotel' | 'gym' | 'bank' | 'bar' | 'media' | 'home'
  | 'club' | 'fintech'

export interface BuildingDef {
  id: string
  name: string
  type: BuildingType
  /** World-space position (X, Z) */
  x: number
  z: number
  /** Footprint width (X axis) */
  w: number
  /** Height */
  h: number
  /** Footprint depth (Z axis) */
  d: number
  /** Connected Twedot business ID */
  businessId?: string
  /** Business logo URL — shown on map label and building panel */
  logoUrl?: string
  /** Twedot user ID who owns this home */
  ownerId?: string
}

export interface WorldUser {
  id: string
  name: string
  username?: string
  avatarUrl?: string
  occupation?: string
  /** Explicit world home_index from the backend (overrides array position). */
  homeIndex?: number
  /** Set when joining from a live stream */
  watchingLive?: boolean
}

export interface BuildingTypeDef {
  color: string
  accent: string
  win: string
  label: string
  emoji: string
  rating: string
}

export interface District {
  id: string
  name: string
  /** World-space bounding box */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number }
}

export interface WaterBody {
  id: string
  name: string
  /** World-space corner points [x, z][] (convex polygon) */
  points: [number, number][]
  color: string
}

export interface Bridge {
  id: string
  name: string
  x1: number; z1: number; x2: number; z2: number
  w: number
}

export interface CityDef {
  id: string
  name: string
  groundSize: number
  buildings: BuildingDef[]
  districts: District[]
  waterBodies?: WaterBody[]
  bridges?: Bridge[]
}

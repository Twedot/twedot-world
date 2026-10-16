import type { BuildingDef, BuildingType } from '../world/types'
import type { TwedotBusiness } from '../api/twedotApi'
import type { BuildingConfig } from './types'

const CATEGORY_TO_TYPE: Record<string, BuildingType> = {
  food:          'restaurant',
  retail:        'shop',
  stores:        'shop',
  sales:         'shop',
  services:      'barber',
  entertainment: 'club',
  health:        'gym',
  education:     'office',
  other:         'shop',
}

const CATEGORY_VISUAL: Record<string, { primaryColor: string; accentColor: string; coverEmoji: string }> = {
  food:          { primaryColor: '#E85D5D', accentColor: '#FF9F43', coverEmoji: '🍽' },
  retail:        { primaryColor: '#5C9ED8', accentColor: '#74B9FF', coverEmoji: '🛍' },
  stores:        { primaryColor: '#5C9ED8', accentColor: '#74B9FF', coverEmoji: '🛍' },
  sales:         { primaryColor: '#F39C12', accentColor: '#F9CA24', coverEmoji: '🏷️' },
  services:      { primaryColor: '#7CC47E', accentColor: '#A8E6CF', coverEmoji: '✂️' },
  entertainment: { primaryColor: '#9B59B6', accentColor: '#D980FA', coverEmoji: '🎭' },
  health:        { primaryColor: '#00BCD4', accentColor: '#80CBC4', coverEmoji: '💊' },
  education:     { primaryColor: '#90CAF9', accentColor: '#64B5F6', coverEmoji: '📚' },
  other:         { primaryColor: '#B0BEC5', accentColor: '#90A4AE', coverEmoji: '🏪' },
}

// ── Scatter logic ────────────────────────────────────────────────────────────
// Businesses are placed by hashing their UUID so position is stable across
// refreshes but looks random. Four safe zones cover the flanks of the city:
//   - Left/right of the central road corridor (x = -18 to +30)
//   - Beyond the static commercial district (z = ±22 to ±95)
//   - Well clear of residential zones (homes start at |z| = 110)
//
// Each zone is large enough (112 × 73 units) to hold many buildings before
// visually overlapping.

const SCATTER_ZONES = [
  { minX: -130, maxX: -18, minZ:  22, maxZ:  95 },  // Mainland left
  { minX:   30, maxX: 130, minZ:  22, maxZ:  95 },  // Mainland right
  { minX: -130, maxX: -18, minZ: -95, maxZ: -22 },  // Island left
  { minX:   30, maxX: 130, minZ: -95, maxZ: -22 },  // Island right
]

function djb2(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h
}

export function applyBusinessClaims(staticBuildings: BuildingDef[], businesses: TwedotBusiness[]): BuildingDef[] {
  const claimed = new Map(
    businesses
      .filter(b => b.world_building_id)
      .map(b => [b.world_building_id!, b])
  )
  return staticBuildings.map(bld => {
    const biz = claimed.get(bld.id)
    if (!biz) return bld
    return {
      ...bld,
      businessId: biz.id,
      ownerId:    biz.owner_id,
      logoUrl:    biz.logo_url ?? undefined,
    }
  })
}

export function businessesToBuildingDefs(businesses: TwedotBusiness[]): BuildingDef[] {
  // Businesses that claimed a static building don't get their own scattered tile
  const scattered = businesses.filter(b => !b.world_building_id)
  return scattered.map((b) => {
    const h1 = djb2(b.id)
    const h2 = djb2(b.id + '\x01')
    const h3 = djb2(b.id + '\x02')
    const zone = SCATTER_ZONES[h1 % SCATTER_ZONES.length]
    const x = zone.minX + (h2 % (zone.maxX - zone.minX))
    const z = zone.minZ + (h3 % (zone.maxZ - zone.minZ))
    return {
      id: `biz_${b.id}`,
      name: b.name,
      type: CATEGORY_TO_TYPE[b.category] ?? 'shop',
      x: Math.round(x),
      z: Math.round(z),
      w: 3,
      d: 3,
      h: 3.5,
      businessId: b.id,
      logoUrl: b.logo_url ?? undefined,
      ownerId: b.owner_id,
    }
  })
}

export function businessToBuildingConfig(b: TwedotBusiness): BuildingConfig {
  const vis = CATEGORY_VISUAL[b.category] ?? CATEGORY_VISUAL.other
  return {
    id: `biz_${b.id}`,
    name: b.name,
    ownerId: b.owner_id,
    businessId: b.id,
    logoUrl: b.logo_url ?? undefined,
    primaryColor: vis.primaryColor,
    accentColor: vis.accentColor,
    description: b.description ?? '',
    coverEmoji: vis.coverEmoji,
    category: b.category,
    opening_time: b.opening_time ?? null,
    closing_time: b.closing_time ?? null,
    working_days: b.working_days ?? [],
    phone: b.phone ?? null,
    website: b.website ?? null,
  }
}

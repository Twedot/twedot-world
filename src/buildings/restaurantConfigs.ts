import type { BuildingConfig } from './types'

// ownerId = Twedot user ID of the business account that owns this building.
// Update each ownerId once the real business account is registered on Twedot.
// Until then, items come from that account's public inventory — if empty, menu
// shows "No items available" and guests cannot place orders.

export const RESTAURANT_CONFIGS: Record<string, BuildingConfig> = {
  'Chicken Republic': {
    id: 'm07',
    name: 'Chicken Republic',
    ownerId: 'CHICKEN_REPUBLIC_OWNER_ID',
    primaryColor: '#E31837',
    accentColor: '#FFC72C',
    description: 'Nigeria\'s favourite grilled chicken restaurant. Enjoy crispy chicken, chips, and more.',
    coverEmoji: '🍗',
    category: 'Fast Food',
  },
  'KFC Mainland': {
    id: 'm16',
    name: 'KFC Mainland',
    ownerId: 'KFC_MAINLAND_OWNER_ID',
    primaryColor: '#E4002B',
    accentColor: '#F40027',
    description: 'Finger lickin\' good. The world\'s most famous fried chicken, now in Lagos Mainland.',
    coverEmoji: '🍗',
    category: 'Fast Food',
  },
  'Mr Biggs': {
    id: 'm_rest3',
    name: 'Mr Biggs',
    ownerId: 'MR_BIGGS_OWNER_ID',
    primaryColor: '#003087',
    accentColor: '#FFD700',
    description: 'A Nigerian fast food classic. Jollof rice, meat pies, and more since 1986.',
    coverEmoji: '🍱',
    category: 'Nigerian Cuisine',
  },
}

export function getRestaurantConfig(name: string): BuildingConfig | null {
  return RESTAURANT_CONFIGS[name] ?? null
}

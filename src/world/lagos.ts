import type { BuildingDef, BuildingType, CityDef } from './types'

// World convention:
//   Mainland = positive Z  (far from camera, appears at top of screen)
//   Lagoon   = Z -15 to +15
//   Island   = negative Z  (near camera, appears at bottom of screen)

const B = (id: string, name: string, type: BuildingType,
           x: number, z: number, w: number, d: number, h: number): BuildingDef =>
  ({ id, name, type, x, z, w, d, h })

const COMMERCIAL: BuildingDef[] = [
  // ── MAINLAND (z = +22 to +70) — companies with logos ─────────
  B('m01', 'Dangote HQ',       'office',     10,  32, 5.0, 5.0, 14),
  B('m02', 'MTN Nigeria',      'office',    -14,  30, 4.0, 4.0, 11),
  B('m05', 'First Bank',       'bank',       18,  30, 3.5, 3.5,  7),
  B('m06', 'Shoprite Yaba',    'shop',      -22,  38, 6.0, 4.0,  4),
  B('m07', 'Chicken Republic', 'restaurant', 28,  32, 3.0, 3.0,3.5),
  B('m16', 'KFC Mainland',     'restaurant', -2,  43, 3.0, 3.0,3.2),
  B('m18', 'Konga',            'shop',      -30,  44, 4.0, 3.0,3.5),
  // ── MAINLAND far-left cluster ───────────────────────────────
  B('m_rest3', 'Mr Biggs',          'restaurant',-58, 52, 3, 3, 3),

  // ── MAINLAND far-right cluster ──────────────────────────────
  B('m_media2', 'TVC Studios',      'media',      60, 54, 5, 4, 6),

  // ── ISLAND / VICTORIA ISLAND (z = -22 to -70) ───────────────
  B('i01', 'Twedot HQ',        'office',      2, -28, 5.0, 5.0, 16),
  B('i02', 'Eko Hotel',        'hotel',      18, -32, 6.0, 5.0, 14),
  B('i03', 'Flutterwave HQ',   'fintech',   -12, -30, 4.0, 4.0, 10),
  B('i04', 'Pablo Cubana',     'club',       80, -35, 20, 16,  5),
  B('i05', 'Paystack HQ',      'fintech',   -20, -36, 3.5, 3.5,  9),
  B('i06', 'UBA HQ',           'bank',        8, -38, 4.0, 4.0,  9),
  B('i09', 'Radisson Blu',     'hotel',      20, -45, 5.0, 4.0, 12),
  B('i13', 'Jumia HQ',         'office',     26, -38, 4.0, 4.0, 12),
  B('i14', 'Interswitch',      'fintech',   -2, -35, 3.5, 3.5,  8),
  B('i15', 'Channels TV',      'media',      22, -56, 4.0, 3.5,  5),

]

// ── Residential zones ────────────────────────────────────────────────────────
//
// Users are split 50/50 between mainland and island:
//   even homeIndex → mainland   (z = +82  → +170, growing further from lagoon)
//   odd  homeIndex → island     (z = -82  → -170, mirror on the south side)
//
// Each zone has 24 columns spanning the full city width (x = -115 → +115)
// and up to 11 rows before hitting the district boundary.
// Capacity per zone: 24 × 11 = 264 homes (total 528).
//
// NOTE: future versions will let users choose a city (Lagos, Calabar, PH…)
// and the backend will tag each user with a city_id.  The position helpers
// below will move to a per-city config; for now they live here for Lagos.
//
// Grid constants — both zones share the same X layout.
// xBase = -75: keeps homes to the right of the airport's east wall (x = -81).
// zBase = 110 / -110: safely behind all commercial buildings (which spread to ~z = ±85).
// 20 cols × 10 step → x from -75 to +115, well within district bounds (±150).
// 8 rows × 9 step → mainland z 110–173, island z -110 to -173 (district max ±180).
const HOME_COLS  = 20
const HOME_XBASE = -75
const HOME_XSTEP = 10.0
const HOME_ZSTEP = 9.0

/** Mainland slot → world position.  slotIdx = floor(homeIndex / 2). */
export function mlHomePosition(slotIdx: number): { x: number; z: number } {
  return {
    x: HOME_XBASE + (slotIdx % HOME_COLS) * HOME_XSTEP,
    z: 110 + Math.floor(slotIdx / HOME_COLS) * HOME_ZSTEP,
  }
}

/** Island slot → world position.  slotIdx = floor(homeIndex / 2). */
export function islHomePosition(slotIdx: number): { x: number; z: number } {
  return {
    x: HOME_XBASE + (slotIdx % HOME_COLS) * HOME_XSTEP,
    z: -110 - Math.floor(slotIdx / HOME_COLS) * HOME_ZSTEP,
  }
}

const lagos: CityDef = {
  id:   'lagos',
  name: 'Lagos',
  groundSize: 200,

  districts: [
    { id: 'mainland', name: 'Lagos Mainland',  bounds: { minX: -150, maxX: 150, minZ:  15, maxZ: 180 } },
    { id: 'island',   name: 'Victoria Island', bounds: { minX: -150, maxX: 150, minZ: -180, maxZ: -15 } },
  ],

  waterBodies: [
    {
      id: 'lagoon',
      name: 'Lagos Lagoon',
      color: '#1B7FC7',
      points: [[-150, -15], [150, -15], [150, 15], [-150, 15]],
    },
  ],

  bridges: [
    { id: 'tmb', name: 'Third Mainland Bridge', x1: -2, z1: -15, x2: 2,  z2: 15, w: 4 },
    { id: 'ci',  name: 'Carter Bridge',         x1: 23, z1: -15, x2: 27, z2: 15, w: 4 },
  ],

  buildings: [
    ...COMMERCIAL,
    // All homes are placed dynamically via CityEngine.setUserHomes(users).
    // No static homeBlock entries — every house belongs to a real Twedot user.
  ],
}

export default lagos

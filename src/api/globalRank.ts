type Tier = 'unknown' | 'known' | 'noticed' | 'recognized' | 'influential'
  | 'elite' | 'warlord' | 'titan' | 'legend' | 'supreme'

const THRESHOLDS: { tier: Tier; min: number }[] = [
  { tier: 'unknown', min: 0 },
  { tier: 'known', min: 40 },
  { tier: 'noticed', min: 100 },
  { tier: 'recognized', min: 160 },
  { tier: 'influential', min: 450 },
  { tier: 'elite', min: 900 },
  { tier: 'warlord', min: 1800 },
  { tier: 'titan', min: 3600 },
  { tier: 'legend', min: 7200 },
  { tier: 'supreme', min: 15000 },
]

const LABELS: Record<Tier, string> = {
  unknown: 'Rookie', known: 'Known', noticed: 'Noticed', recognized: 'Veteran',
  influential: 'Influential', elite: 'Elite', warlord: 'Warlord',
  titan: 'Titan', legend: 'Legend', supreme: 'Supreme',
}

export function getRankLabel(activityScore: number | undefined | null): string {
  const score = activityScore ?? 0
  let tier: Tier = 'unknown'
  for (const t of THRESHOLDS) {
    if (score >= t.min) tier = t.tier
  }
  return LABELS[tier]
}

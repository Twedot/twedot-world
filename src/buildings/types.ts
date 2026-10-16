export interface BuildingConfig {
  id: string          // matches BuildingDef.id in lagos.ts
  name: string        // matches BuildingDef.name
  ownerId: string     // Twedot user ID of the building owner
  businessId?: string // Twedot business ID — set for dynamic businesses
  logoUrl?: string    // business logo for map label
  primaryColor: string
  accentColor: string
  description: string
  coverEmoji: string
  category: string
  opening_time?: string | null  // "HH:MM" 24h
  closing_time?: string | null  // "HH:MM" 24h
  working_days?: string[]       // ['mon','tue','wed','thu','fri']
  phone?: string | null
  website?: string | null
}

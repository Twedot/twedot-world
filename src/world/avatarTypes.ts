import { saveAvatarConfigToServer, fetchAvatarConfig } from './worldApi'

export interface AvatarConfig {
  skinColor: string
  hairStyle: 'bald' | 'short' | 'long' | 'afro' | 'braids' | 'mohawk'
  hairColor: string
  shirtStyle: 'tshirt' | 'polo' | 'hoodie' | 'tank'
  shirtColor: string
  pantsStyle: 'pants' | 'shorts' | 'skirt'
  pantsColor: string
  shoeColor: string
}

export const DEFAULT_AVATAR: AvatarConfig = {
  skinColor: '#8B5E3C',
  hairStyle: 'short',
  hairColor: '#1A1A1A',
  shirtStyle: 'tshirt',
  shirtColor: '#2255AA',
  pantsStyle: 'pants',
  pantsColor: '#1A1A2E',
  shoeColor: '#1A1A1A',
}

export const SKIN_COLORS  = ['#3C1F0E', '#6B3A2A', '#8B5E3C', '#C68642', '#E8B87E', '#FFDFC4']
export const HAIR_COLORS  = ['#1A1A1A', '#3B2214', '#8B4513', '#D4A757', '#C0392B', '#E0E0E0']
export const SHIRT_COLORS = ['#FFFFFF', '#1A1A1A', '#2255AA', '#CC0000', '#228B22', '#FFD700', '#FF69B4', '#800080', '#FF8C00', '#4ECDC4']
export const PANTS_COLORS = ['#1A1A2E', '#2C3E50', '#000000', '#8B4513', '#1B5E20', '#4A0A7A', '#C0C0C0', '#D2691E']
export const SHOE_COLORS  = ['#1A1A1A', '#5C3A2A', '#FFFFFF', '#2255AA', '#CC0000', '#808080']

export const HAIR_STYLES: AvatarConfig['hairStyle'][]   = ['bald', 'short', 'long', 'afro', 'braids', 'mohawk']
export const SHIRT_STYLES: AvatarConfig['shirtStyle'][] = ['tshirt', 'polo', 'hoodie', 'tank']
export const PANTS_STYLES: AvatarConfig['pantsStyle'][] = ['pants', 'shorts', 'skirt']

let _cachedConfig: AvatarConfig | null = null

export function loadAvatarConfig(): AvatarConfig {
  if (_cachedConfig) return _cachedConfig
  return DEFAULT_AVATAR
}

export function saveAvatarConfig(c: AvatarConfig): void {
  _cachedConfig = c
  saveAvatarConfigToServer(c)
}

export async function initAvatarConfig(): Promise<AvatarConfig> {
  const server = await fetchAvatarConfig()
  if (server) {
    _cachedConfig = server as AvatarConfig
  }
  return _cachedConfig ?? DEFAULT_AVATAR
}

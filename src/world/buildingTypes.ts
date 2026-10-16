import type { BuildingType, BuildingTypeDef } from './types'

export const BUILDING_TYPES: Record<BuildingType, BuildingTypeDef> = {
  cafe:       { color:'#F0A855', accent:'#7B4F25', win:'#B3D9F5', label:'Cafe',       emoji:'☕', rating:'4.8' },
  shop:       { color:'#5C9ED8', accent:'#1A237E', win:'#C8E6FF', label:'Shop',       emoji:'🛍', rating:'4.6' },
  restaurant: { color:'#E85D5D', accent:'#7B1F1F', win:'#FFCCBC', label:'Restaurant', emoji:'🍽', rating:'4.9' },
  barber:     { color:'#7CC47E', accent:'#2E7D32', win:'#C8E6C9', label:'Barber',     emoji:'✂️', rating:'4.7' },
  beauty:     { color:'#CE93D8', accent:'#6A1B9A', win:'#F3E5F5', label:'Beauty',     emoji:'💅', rating:'4.9' },
  office:     { color:'#90CAF9', accent:'#0D47A1', win:'#E3F2FD', label:'Office',     emoji:'🏢', rating:'4.5' },
  hotel:      { color:'#FFD54F', accent:'#BF360C', win:'#FFF9C4', label:'Hotel',      emoji:'🏨', rating:'4.7' },
  gym:        { color:'#80CBC4', accent:'#004D40', win:'#E0F2F1', label:'Gym',        emoji:'💪', rating:'4.6' },
  bank:       { color:'#B0BEC5', accent:'#263238', win:'#ECEFF1', label:'Bank',       emoji:'🏦', rating:'4.4' },
  bar:        { color:'#FFAB76', accent:'#BF360C', win:'#FFE0B2', label:'Bar',        emoji:'🍺', rating:'4.5' },
  media:      { color:'#E50914', accent:'#1a1a1a', win:'#424242', label:'Media',      emoji:'🎬', rating:'4.7' },
  home:       { color:'#DEB887', accent:'#8B6914', win:'#F5DEB3', label:'Home',       emoji:'🏠', rating:'5.0' },
  club:       { color:'#2A0A3A', accent:'#FF00FF', win:'#E040FB', label:'Club',     emoji:'🎶', rating:'4.8' },
  fintech:    { color:'#1A2F4F', accent:'#00C9A7', win:'#C8F0E8', label:'Fintech', emoji:'💳', rating:'4.7' },
}

import type { LabelUpdate } from '../engine/WorldEngine'
import type { BuildingDef } from '../world/types'
import { BUILDING_TYPES } from '../world/buildingTypes'
import { BRAND_LOGOS } from '../world/brandLogos'
import './Labels.css'

interface Props {
  labels: LabelUpdate
  buildings: BuildingDef[]
}

export default function Labels({ labels, buildings }: Props) {
  const byId = new Map(buildings.map(b => [b.id, b]))

  return (
    <div className="labels-root" aria-hidden>
      {labels.map(({ id, x, y, visible }) => {
        if (!visible) return null
        const def = byId.get(id)
        if (!def) return null
        const ty = BUILDING_TYPES[def.type]
        const logo = BRAND_LOGOS[def.name]
        return (
          <div
            key={id}
            className="bld-label"
            style={{ transform: `translate(${x}px, ${y}px)` }}
          >
            {logo
              ? <img src={logo} alt="" className="bld-logo" />
              : <span className="bld-emoji">{ty.emoji}</span>
            }
            <span className="bld-name">{def.name}</span>
            <span className="bld-rating">★ {ty.rating}</span>
          </div>
        )
      })}
    </div>
  )
}

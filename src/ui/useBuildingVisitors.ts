import { useEffect, useRef, useState } from 'react'
import type { Scene } from '@babylonjs/core'
import { RoomVisitors } from '../engine/RoomVisitors'

export interface VisitorPopupState {
  name: string
  rank: string
}

export function useBuildingVisitors(scene: Scene | null) {
  const visitorsRef = useRef<RoomVisitors | null>(null)
  const [visitorPopup, setVisitorPopup] = useState<VisitorPopupState | null>(null)
  const [visitorMsg, setVisitorMsg] = useState('')

  useEffect(() => {
    if (!scene) return
    const visitors = new RoomVisitors(scene)
    visitorsRef.current = visitors
    visitors.onVisitorClicked = (_id, name, rank) => {
      setVisitorPopup({ name, rank })
      setVisitorMsg('')
    }
    visitors.spawn().catch((err: unknown) => console.warn('[Visitors] spawn failed', err))

    const pointerObs = scene.onPointerObservable.add((info) => {
      if (info.type === 2) {
        const pick = scene.pick(scene.pointerX, scene.pointerY)
        const vid = (pick?.pickedMesh as { metadata?: { visitorId?: string } })?.metadata?.visitorId
        if (typeof vid === 'string') {
          const vi = visitors.getVisitorInfo(vid)
          if (vi) visitors.onVisitorClicked?.(vid, vi.name, vi.rank)
        }
      }
    })

    return () => {
      scene.onPointerObservable.remove(pointerObs)
      visitors.dispose()
      visitorsRef.current = null
    }
  }, [scene])

  const closePopup = () => setVisitorPopup(null)

  return { visitorPopup, visitorMsg, setVisitorMsg, closePopup }
}

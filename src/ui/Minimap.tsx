import { useEffect, useRef } from 'react'
import type { BuildingDef } from '../world/types'
import { BUILDING_TYPES } from '../world/buildingTypes'
import './Minimap.css'

interface Props {
  buildings: BuildingDef[]
  player: { x: number; z: number }
  cars: { x: number; z: number }[]
  groundSize: number
}

export default function Minimap({ buildings, player, cars, groundSize }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const SIZE = 140
    canvas.width = SIZE; canvas.height = SIZE
    const ctx = canvas.getContext('2d')!
    const half = groundSize / 2

    const toMM = (v: number) => ((v + half) / groundSize) * SIZE

    ctx.fillStyle = '#2c4a2c'
    ctx.fillRect(0, 0, SIZE, SIZE)

    // Roads
    ctx.fillStyle = '#505066'
    const rw = (6 / groundSize) * SIZE
    ctx.fillRect(0, SIZE / 2 - rw / 2, SIZE, rw)
    ctx.fillRect(SIZE / 2 - rw / 2, 0, rw, SIZE)
    const rw2 = (5 / groundSize) * SIZE
    const p27 = toMM(27), n27 = toMM(-27)
    ctx.fillRect(p27 - rw2 / 2, 0, rw2, SIZE)
    ctx.fillRect(n27 - rw2 / 2, 0, rw2, SIZE)
    const z27 = toMM(27), zn27 = toMM(-27)
    ctx.fillRect(0, z27 - rw2 / 2, SIZE, rw2)
    ctx.fillRect(0, zn27 - rw2 / 2, SIZE, rw2)

    // Buildings
    buildings.forEach(b => {
      const ty = BUILDING_TYPES[b.type]
      const bx = toMM(b.x), bz = toMM(b.z)
      const bw = (b.w / groundSize) * SIZE, bd = (b.d / groundSize) * SIZE
      ctx.fillStyle = ty.color
      ctx.fillRect(bx - bw / 2, bz - bd / 2, bw, bd)
    })

    // Cars
    ctx.fillStyle = '#ffd060'
    cars.forEach(c => {
      const cx = toMM(c.x), cz = toMM(c.z)
      ctx.beginPath(); ctx.arc(cx, cz, 1.8, 0, Math.PI * 2); ctx.fill()
    })

    // Player
    const px = toMM(player.x), pz = toMM(player.z)
    ctx.fillStyle = '#4F7CF7'
    ctx.beginPath(); ctx.arc(px, pz, 3.5, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5
    ctx.stroke()
  })

  return (
    <div className="minimap-wrap">
      <canvas ref={canvasRef} className="minimap-canvas" />
    </div>
  )
}

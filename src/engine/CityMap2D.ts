/**
 * Isometric 2D city renderer — pure Canvas 2D (no WebGL).
 *
 * Scalability: rendering is 100% client-side. Adding users adds no server
 * rendering load. Only buildings visible in the current viewport are drawn
 * (viewport culling), so perf is constant regardless of total city size.
 *
 * For 1B concurrent users the backend needs:
 *   – CDN-cached city JSON (static, served once per deploy)
 *   – Stateless REST API (horizontal auto-scaling)
 *   – WebSocket sharded by district for real-time presence
 *   – Redis counters for "X online in this building" badges
 */

import type { BuildingDef, CityDef } from '../world/types'
import { BUILDING_TYPES } from '../world/buildingTypes'

// ── Car definition ──────────────────────────────────────────
interface CarState {
  x: number; z: number           // world position
  dx: number; dz: number         // direction unit vector
  speed: number
  color: string
  axisX: boolean                 // true = moving along X axis
  lane: number                   // lane offset from road centre
  lo: number; hi: number         // route bounds
}

const CAR_COLORS = ['#E53935','#1E88E5','#FBC02D','#43A047','#8E24AA','#00838F','#F4511E','#3949AB','#E91E63','#00ACC1']

// ── Event types ─────────────────────────────────────────────
export type MapEvent =
  | { type: 'pick-building'; building: BuildingDef }
  | { type: 'clear-pick' }

export class CityMap2D {
  private readonly cv: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly city: CityDef

  // camera
  private camX = 0; private camY = 0
  private scale = 4.8

  // player
  private px = 0; private pz = 0
  private tx: number | null = null; private tz: number | null = null

  // destination ring
  private destA = 0; private destX = 0; private destZ = 0

  // drag state
  private _dn = false; private _dm = false
  private _dsx = 0; private _dsy = 0; private _dcx = 0; private _dcy = 0

  // cars
  private _cars: CarState[] = []

  // raf
  private _raf = 0; private _frame = 0

  onEvent?: (e: MapEvent) => void

  constructor(canvas: HTMLCanvasElement, city: CityDef) {
    this.cv = canvas
    this.ctx = canvas.getContext('2d')!
    this.city = city
    this._initCars()
    this._setupEvents()
  }

  // ── coordinate system ────────────────────────────────────

  private w2s(wx: number, wz: number, wy = 0) {
    const s = this.scale
    return {
      sx: (wx - wz) * s + this.cv.width  * 0.5 + this.camX,
      sy: (wx + wz) * s * 0.5 - wy * s + this.cv.height * 0.5 + this.camY,
    }
  }

  private s2w(sx: number, sy: number) {
    const s = this.scale
    const A = (sx - this.cv.width  * 0.5 - this.camX) / s
    const B = (sy - this.cv.height * 0.5 - this.camY) / (s * 0.5)
    return { wx: (A + B) * 0.5, wz: (B - A) * 0.5 }
  }

  // Returns true if world point is roughly visible on canvas (+padding px margin)
  private _vis(wx: number, wz: number, pad = 80) {
    const { sx, sy } = this.w2s(wx, wz)
    return sx > -pad && sx < this.cv.width + pad && sy > -pad && sy < this.cv.height + pad
  }

  // ── main draw ────────────────────────────────────────────

  draw() {
    const { cv, ctx, scale: s } = this
    const W = cv.width, H = cv.height

    // ── sky ──
    const sky = ctx.createLinearGradient(0, 0, 0, H)
    sky.addColorStop(0, '#6ab4e0'); sky.addColorStop(1, '#b6dff5')
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H)

    const gs = this.city.groundSize * 0.5

    // ── mainland ground ──
    const gCn = [this.w2s(-gs,-gs), this.w2s(gs,-gs), this.w2s(gs,gs), this.w2s(-gs,gs)]
    ctx.beginPath(); ctx.moveTo(gCn[0].sx, gCn[0].sy)
    gCn.slice(1).forEach(p => ctx.lineTo(p.sx, p.sy)); ctx.closePath()
    ctx.fillStyle = '#6ab86a'; ctx.fill()

    // ── island ground (lighter / sandy) ──
    const islandZ1 = 41, islandZ2 = gs
    const iCn = [this.w2s(-gs,islandZ1), this.w2s(gs,islandZ1), this.w2s(gs,islandZ2), this.w2s(-gs,islandZ2)]
    ctx.beginPath(); ctx.moveTo(iCn[0].sx, iCn[0].sy)
    iCn.slice(1).forEach(p => ctx.lineTo(p.sx, p.sy)); ctx.closePath()
    ctx.fillStyle = '#a8c87c'; ctx.fill()

    // ── water bodies ──
    this.city.waterBodies?.forEach(wb => this._drawWater(wb))

    // ── bridges ──
    this.city.bridges?.forEach(br => this._drawBridge(br))

    // ── roads ──
    this._roads(gs)

    // ── trees ──
    this._trees()

    // ── buildings (depth sorted, viewport culled) ──
    ;[...this.city.buildings]
      .sort((a, b) => (a.x + a.z) - (b.x + b.z))
      .filter(b => this._vis(b.x, b.z, 60 + b.h * s))
      .forEach(b => this._building(b))

    // ── cars ──
    this._cars.forEach(c => { if (this._vis(c.x, c.z, 40)) this._car(c) })

    // ── destination ring ──
    if (this.destA > 0) {
      const { sx, sy } = this.w2s(this.destX, this.destZ)
      const r = (5 + (1.4 - this.destA) * 8) * Math.max(1, s * 0.2)
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(79,124,247,${Math.max(0, Math.min(1, this.destA))})`
      ctx.lineWidth = 2; ctx.stroke()
    }

    // ── player ──
    this._player()

    // ── district labels (far view only) ──
    if (s < 6) this._districtLabels()
  }

  // ── water ────────────────────────────────────────────────

  private _drawWater(wb: { name: string; points: [number,number][]; color: string }) {
    const ctx = this.ctx
    if (!wb.points.length) return
    const pts = wb.points.map(([x,z]) => this.w2s(x, z))

    // Base fill
    ctx.beginPath(); ctx.moveTo(pts[0].sx, pts[0].sy)
    pts.slice(1).forEach(p => ctx.lineTo(p.sx, p.sy)); ctx.closePath()
    const wg = ctx.createLinearGradient(pts[0].sx, pts[0].sy, pts[2].sx, pts[2].sy)
    wg.addColorStop(0, '#2e7ab8'); wg.addColorStop(0.5, '#3b8ec2'); wg.addColorStop(1,'#2e7ab8')
    ctx.fillStyle = wg; ctx.fill()

    // Wave shimmer lines
    const [x1,z1] = wb.points[0], [x2] = wb.points[1]
    const [, z3] = wb.points[2]
    const waveSpacing = Math.max(1, 3)
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1
    for (let wz = z1 + waveSpacing; wz < z3; wz += waveSpacing * 2) {
      const a = this.w2s(x1 + 4, wz); const b = this.w2s(x2 - 4, wz)
      ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke()
    }

    // Water label
    const mid = this.w2s((wb.points[0][0] + wb.points[1][0]) * 0.5, (z1 + z3) * 0.5)
    if (this._vis(0, (z1+z3)*0.5, 0)) {
      ctx.font = `italic bold ${Math.max(10, this.scale * 1.5)}px Nunito,system-ui,sans-serif`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.letterSpacing = '3px'
      ctx.fillText(wb.name.toUpperCase(), mid.sx, mid.sy)
    }
  }

  // ── bridge ───────────────────────────────────────────────

  private _drawBridge(br: { x1: number; z1: number; x2: number; z2: number; w: number }) {
    const ctx = this.ctx
    const hw = br.w * 0.5
    const sides = [
      [this.w2s(br.x1-hw, br.z1), this.w2s(br.x2-hw, br.z2), this.w2s(br.x2+hw, br.z2), this.w2s(br.x1+hw, br.z1)],
    ]
    ctx.beginPath(); ctx.moveTo(sides[0][0].sx, sides[0][0].sy)
    sides[0].slice(1).forEach(p => ctx.lineTo(p.sx, p.sy)); ctx.closePath()
    ctx.fillStyle = '#7a7a8a'; ctx.fill()
    // Bridge railing lines
    ctx.strokeStyle = '#555565'; ctx.lineWidth = 1
    const A = this.w2s(br.x1, br.z1), B = this.w2s(br.x2, br.z2)
    ctx.beginPath(); ctx.moveTo(A.sx, A.sy); ctx.lineTo(B.sx, B.sy); ctx.stroke()
  }

  // ── roads ────────────────────────────────────────────────

  private _roads(gs: number) {
    // Main roads
    this._road(-gs, 0, gs, 0, 3, '#555566')   // E-W
    this._road(0, -gs, 0, gs, 3, '#555566')   // N-S
    // Secondary roads
    this._road(-gs, 27, gs, 27, 2.5, '#555566')
    this._road(-gs, -27, gs, -27, 2.5, '#555566')
    this._road(27, -gs, 27, gs, 2.5, '#555566')
    this._road(-27, -gs, -27, gs, 2.5, '#555566')
    // Island roads
    this._road(-gs, 46, gs, 46, 2.5, '#555566')
    this._road(-gs, 54, gs, 54, 2.5, '#555566')
    this._road(25, 41, 25, gs, 2, '#555566')
    this._road(-25, 41, -25, gs, 2, '#555566')

    // Road centre dashes when zoomed in
    if (this.scale >= 3.5) this._roadDashes()
  }

  private _road(x1: number, z1: number, x2: number, z2: number, w: number, col: string) {
    const ctx = this.ctx
    const dx = x2-x1, dz = z2-z1, len = Math.hypot(dx, dz)
    if (!len) return
    const px = -dz/len*w, pz = dx/len*w
    const v = [this.w2s(x1+px,z1+pz), this.w2s(x1-px,z1-pz), this.w2s(x2-px,z2-pz), this.w2s(x2+px,z2+pz)]
    ctx.beginPath(); ctx.moveTo(v[0].sx, v[0].sy)
    v.slice(1).forEach(p => ctx.lineTo(p.sx, p.sy)); ctx.closePath()
    ctx.fillStyle = col; ctx.fill()
    // Sidewalk edges (1px lighter stroke)
    ctx.strokeStyle = '#666677'; ctx.lineWidth = 1; ctx.stroke()
  }

  private _roadDashes() {
    const ctx = this.ctx
    ctx.fillStyle = 'rgba(210,210,230,0.45)'
    const hl = 0.08, dl = 1.2
    for (let i = -18; i < 18; i++) {
      const o = -36 + i * 4
      const h = [this.w2s(o-dl,-hl), this.w2s(o+dl,-hl), this.w2s(o+dl,hl), this.w2s(o-dl,hl)]
      ctx.beginPath(); ctx.moveTo(h[0].sx, h[0].sy); h.slice(1).forEach(p => ctx.lineTo(p.sx, p.sy)); ctx.closePath(); ctx.fill()
      const v = [this.w2s(-hl,o-dl), this.w2s(hl,o-dl), this.w2s(hl,o+dl), this.w2s(-hl,o+dl)]
      ctx.beginPath(); ctx.moveTo(v[0].sx, v[0].sy); v.slice(1).forEach(p => ctx.lineTo(p.sx, p.sy)); ctx.closePath(); ctx.fill()
    }
  }

  // ── trees ────────────────────────────────────────────────

  private readonly _tPos: [number,number][] = [
    [5,-9],[5,-17],[5,-28],[5,9],[5,17],[-5,-9],[-5,-17],[-5,-28],[-5,9],[-5,17],
    [9,5],[17,5],[28,5],[-9,5],[-17,5],[-28,5],[9,-5],[17,-5],[28,-5],[-9,-5],[-17,-5],[-28,-5],
    [4,4],[4,-4],[-4,4],[-4,-4],[22,0],[0,22],[-22,0],[0,-22],
    // Island trees
    [6,44],[12,44],[-6,44],[-12,44],[6,65],[-6,65],[20,50],[-20,50],[20,62],[-20,62],
  ]

  private _trees() {
    const ctx = this.ctx, s = this.scale
    this._tPos
      .filter(([wx,wz]) => this._vis(wx, wz, 20))
      .forEach(([wx, wz]) => {
        const { sx, sy } = this.w2s(wx, wz)
        const r = Math.max(2, s * 0.58)
        // Trunk
        if (s >= 3.5) {
          ctx.beginPath()
          ctx.rect(sx - r*0.15, sy - r*0.3, r*0.3, r*0.6)
          ctx.fillStyle = '#6D4C41'; ctx.fill()
        }
        // Foliage shadow
        ctx.beginPath(); ctx.arc(sx + r*0.12, sy - r*0.5 + r*0.1, r, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(0,0,0,0.14)'; ctx.fill()
        // Main foliage
        ctx.beginPath(); ctx.arc(sx, sy - r*0.5, r, 0, Math.PI * 2)
        const tg = ctx.createRadialGradient(sx - r*0.3, sy - r*0.9, r*0.1, sx, sy - r*0.5, r)
        tg.addColorStop(0, '#5dc45d'); tg.addColorStop(1, '#2e7d32')
        ctx.fillStyle = tg; ctx.fill()
      })
  }

  // ── buildings ────────────────────────────────────────────

  private _building(b: BuildingDef) {
    const ctx = this.ctx, s = this.scale
    const ty = BUILDING_TYPES[b.type]
    const hw = b.w * 0.5, hd = b.d * 0.5, h = b.h

    const face = (wy: number) => ({
      tl: this.w2s(b.x-hw, b.z-hd, wy), tr: this.w2s(b.x+hw, b.z-hd, wy),
      br: this.w2s(b.x+hw, b.z+hd, wy), bl: this.w2s(b.x-hw, b.z+hd, wy),
    })

    const bt = face(0), t = face(h), acc = face(h * 0.84)

    const quad = (a: {sx:number,sy:number}, b2: {sx:number,sy:number}, c: {sx:number,sy:number}, d: {sx:number,sy:number}, fill: string) => {
      ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b2.sx, b2.sy)
      ctx.lineTo(c.sx, c.sy); ctx.lineTo(d.sx, d.sy); ctx.closePath()
      ctx.fillStyle = fill; ctx.fill()
    }

    // Shadow on ground
    if (s >= 3) {
      const shd = face(-0.04)
      const shOff = h * s * 0.18
      ctx.beginPath()
      ctx.moveTo(shd.bl.sx + shOff, shd.bl.sy + shOff * 0.5)
      ctx.lineTo(shd.br.sx + shOff, shd.br.sy + shOff * 0.5)
      ctx.lineTo(shd.br.sx, shd.br.sy)
      ctx.lineTo(shd.bl.sx, shd.bl.sy)
      ctx.closePath()
      ctx.fillStyle = 'rgba(0,0,0,0.14)'; ctx.fill()
    }

    quad(bt.tl, t.tl, t.bl, bt.bl, this._shade(ty.color, 0.48))   // left face
    quad(bt.tr, t.tr, t.br, bt.br, this._shade(ty.color, 0.65))   // right face
    quad(acc.tl, t.tl, t.bl, acc.bl, this._shade(ty.accent, 0.52)) // accent left
    quad(acc.tr, t.tr, t.br, acc.br, this._shade(ty.accent, 0.68)) // accent right
    quad(t.tl, t.tr, t.br, t.bl, ty.color)                         // top face

    // Subtle top-face highlight
    if (s >= 4) {
      const hl = face(h)
      ctx.beginPath(); ctx.moveTo(hl.tl.sx, hl.tl.sy); ctx.lineTo(hl.tr.sx, hl.tr.sy)
      ctx.lineTo(hl.br.sx, hl.br.sy); ctx.lineTo(hl.bl.sx, hl.bl.sy); ctx.closePath()
      const lg = ctx.createLinearGradient(hl.tl.sx, hl.tl.sy, hl.br.sx, hl.br.sy)
      lg.addColorStop(0, 'rgba(255,255,255,0.22)'); lg.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = lg; ctx.fill()
    }

    // Pill label chip (always shown, shrinks when zoomed out)
    const topC = this.w2s(b.x, b.z, h)
    const labelY = topC.sy - Math.max(4, s * 0.9)
    const label = ty.emoji + ' ' + b.name
    const fs = Math.max(7, Math.min(12, s * 0.9))
    ctx.font = `600 ${fs}px Nunito,system-ui,sans-serif`
    const tw = ctx.measureText(label).width
    const pw = tw + 12, ph = fs + 8, rx = 4
    const lx = topC.sx - pw * 0.5, ly = labelY - ph

    // Pill background
    ctx.beginPath()
    ctx.roundRect(lx, ly, pw, ph, rx)
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.shadowColor = 'rgba(0,0,0,0.18)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2
    ctx.fill(); ctx.shadowBlur = 0; ctx.shadowOffsetY = 0

    // Pill text
    ctx.fillStyle = '#1a1a2e'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText(label, lx + 6, ly + ph * 0.5)

    // Pill connector dot
    ctx.beginPath(); ctx.arc(topC.sx, ly + ph - 0.5, 1.5, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(80,80,120,0.35)'; ctx.fill()
  }

  // ── cars ─────────────────────────────────────────────────

  private _initCars() {
    const gs = this.city.groundSize * 0.5
    const configs: Omit<CarState, 'color'>[] = [
      { x: 1.2,  z:-gs, dx:0,  dz:1,  speed:.20, axisX:false, lane:1.2,  lo:-gs, hi:gs },
      { x: 1.2,  z: 10, dx:0,  dz:1,  speed:.16, axisX:false, lane:1.2,  lo:-gs, hi:gs },
      { x:-1.2,  z: gs, dx:0,  dz:-1, speed:.18, axisX:false, lane:-1.2, lo:-gs, hi:gs },
      { x:-1.2,  z:-12, dx:0,  dz:-1, speed:.22, axisX:false, lane:-1.2, lo:-gs, hi:gs },
      { x:-gs,   z:1.2, dx:1,  dz:0,  speed:.19, axisX:true,  lane:1.2,  lo:-gs, hi:gs },
      { x:-20,   z:1.2, dx:1,  dz:0,  speed:.15, axisX:true,  lane:1.2,  lo:-gs, hi:gs },
      { x: gs,   z:-1.2,dx:-1, dz:0,  speed:.21, axisX:true,  lane:-1.2, lo:-gs, hi:gs },
      { x: 14,   z:-1.2,dx:-1, dz:0,  speed:.17, axisX:true,  lane:-1.2, lo:-gs, hi:gs },
      // Island roads
      { x:-gs,   z:46,  dx:1,  dz:0,  speed:.18, axisX:true,  lane:0,    lo:-gs, hi:gs },
      { x: gs,   z:54,  dx:-1, dz:0,  speed:.16, axisX:true,  lane:0,    lo:-gs, hi:gs },
    ]
    this._cars = configs.map((c, i) => ({ ...c, color: CAR_COLORS[i % CAR_COLORS.length] }))
  }

  private _car(c: CarState) {
    const ctx = this.ctx, s = this.scale
    const L = 0.72, W = 0.34, H = 0.26
    // perpendicular to direction
    const px = -c.dz, pz = c.dx

    const face = (wy: number) => {
      const fl = this.w2s(c.x + c.dx*L*0.5 - px*W*0.5, c.z + c.dz*L*0.5 - pz*W*0.5, wy)
      const fr = this.w2s(c.x + c.dx*L*0.5 + px*W*0.5, c.z + c.dz*L*0.5 + pz*W*0.5, wy)
      const br = this.w2s(c.x - c.dx*L*0.5 + px*W*0.5, c.z - c.dz*L*0.5 + pz*W*0.5, wy)
      const bl = this.w2s(c.x - c.dx*L*0.5 - px*W*0.5, c.z - c.dz*L*0.5 - pz*W*0.5, wy)
      return [fl, fr, br, bl]
    }

    const bot = face(0), top = face(H)

    const quad = (v: {sx:number,sy:number}[], fill: string) => {
      ctx.beginPath(); ctx.moveTo(v[0].sx, v[0].sy)
      v.slice(1).forEach(p => ctx.lineTo(p.sx, p.sy)); ctx.closePath()
      ctx.fillStyle = fill; ctx.fill()
    }

    // Visible side (front or left depending on heading)
    quad([bot[1], top[1], top[2], bot[2]], this._shade(c.color, 0.60))
    quad([bot[0], top[0], top[1], bot[1]], this._shade(c.color, 0.75))
    quad(top, c.color)  // top

    // Windscreen glint
    if (s >= 4) {
      const wf = face(H * 0.85)
      ctx.beginPath(); ctx.moveTo(wf[0].sx, wf[0].sy); ctx.lineTo(wf[1].sx, wf[1].sy)
      ctx.lineTo(top[1].sx, top[1].sy); ctx.lineTo(top[0].sx, top[0].sy); ctx.closePath()
      ctx.fillStyle = 'rgba(180,220,255,0.55)'; ctx.fill()
    }
  }

  // ── player ───────────────────────────────────────────────

  private _player() {
    const ctx = this.ctx, s = this.scale
    const { sx, sy } = this.w2s(this.px, this.pz)
    const r = Math.max(3, s * 0.72)

    ctx.beginPath(); ctx.ellipse(sx, sy + r*0.22, r*1.1, r*0.38, 0, 0, Math.PI*2)
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fill()

    // Body
    const bg = ctx.createRadialGradient(sx - r*0.2, sy - r*0.6, r*0.1, sx, sy - r*0.5, r)
    bg.addColorStop(0, '#7BA8FF'); bg.addColorStop(1, '#2d5fe8')
    ctx.beginPath(); ctx.arc(sx, sy - r*0.5, r, 0, Math.PI*2)
    ctx.fillStyle = bg; ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = Math.max(1, s*0.1); ctx.stroke()

    if (s >= 3.5) {
      ctx.beginPath(); ctx.arc(sx, sy - r*1.72, r*0.6, 0, Math.PI*2)
      ctx.fillStyle = '#FFCC88'; ctx.fill(); ctx.stroke()
    }
  }

  // ── district labels ──────────────────────────────────────

  private _districtLabels() {
    const ctx = this.ctx, s = this.scale
    const labels: [string, number, number][] = [
      ['MAINLAND',       0, -35],
      ['DOWNTOWN',       0,   9],
      ['VICTORIA ISLAND',0,  54],
    ]
    labels.forEach(([text, wx, wz]) => {
      if (!this._vis(wx, wz, 0)) return
      const { sx, sy } = this.w2s(wx, wz)
      ctx.font = `700 ${Math.max(9, s * 1.2)}px Nunito,system-ui,sans-serif`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillStyle = 'rgba(255,255,255,0.38)'
      ctx.letterSpacing = '4px'
      ctx.fillText(text, sx, sy)
    })
    ctx.letterSpacing = '0px'
  }

  // ── helpers ──────────────────────────────────────────────

  private _shade(hex: string, f: number) {
    if (hex.length < 7) return hex
    return `rgb(${Math.round(parseInt(hex.slice(1,3),16)*f)},${Math.round(parseInt(hex.slice(3,5),16)*f)},${Math.round(parseInt(hex.slice(5,7),16)*f)})`
  }

  // ── hit testing ──────────────────────────────────────────

  private _hitBuilding(sx: number, sy: number, b: BuildingDef): boolean {
    const hw = b.w*0.5, hd = b.d*0.5, h = b.h
    const f = (wy: number) => ({
      tl: this.w2s(b.x-hw,b.z-hd,wy), tr: this.w2s(b.x+hw,b.z-hd,wy),
      br: this.w2s(b.x+hw,b.z+hd,wy), bl: this.w2s(b.x-hw,b.z+hd,wy),
    })
    const t = f(h), bt = f(0)
    return (
      this._pip(sx,sy, t.tl,t.tr,t.br,t.bl) ||
      this._pip(sx,sy, t.bl,t.br,bt.br,bt.bl) ||
      this._pip(sx,sy, t.tr,t.br,bt.br,bt.tr)
    )
  }

  private _pip(px: number, py: number, a: {sx:number,sy:number}, b: {sx:number,sy:number}, c: {sx:number,sy:number}, d: {sx:number,sy:number}) {
    return this._piT(px,py,a,b,c) || this._piT(px,py,a,c,d)
  }

  private _piT(px: number, py: number, a: {sx:number,sy:number}, b: {sx:number,sy:number}, c: {sx:number,sy:number}) {
    const s = (p1: {sx:number,sy:number}, p2: {sx:number,sy:number}, p3: {sx:number,sy:number}) =>
      (p1.sx-p3.sx)*(p2.sy-p3.sy)-(p2.sx-p3.sx)*(p1.sy-p3.sy)
    const p={sx:px,sy:py}, d1=s(p,a,b), d2=s(p,b,c), d3=s(p,c,a)
    return !((d1<0||d2<0||d3<0)&&(d1>0||d2>0||d3>0))
  }

  // ── events ───────────────────────────────────────────────

  private _handleClick(sx: number, sy: number) {
    const sorted = [...this.city.buildings].sort((a,b) => (b.x+b.z)-(a.x+a.z))
    for (const b of sorted) {
      if (this._hitBuilding(sx, sy, b)) {
        this.onEvent?.({ type:'pick-building', building:b }); return
      }
    }
    const { wx, wz } = this.s2w(sx, sy)
    const BOUND = this.city.groundSize * 0.47
    this.tx = Math.max(-BOUND, Math.min(BOUND, wx))
    this.tz = Math.max(-BOUND, Math.min(BOUND, wz))
    this.destX = this.tx!; this.destZ = this.tz!; this.destA = 1.4
    this.onEvent?.({ type:'clear-pick' })
  }

  private _setupEvents() {
    const cv = this.cv

    cv.addEventListener('mousedown', e => {
      if (e.button!==0) return
      this._dn=true; this._dm=false
      this._dsx=e.clientX; this._dsy=e.clientY; this._dcx=this.camX; this._dcy=this.camY
    })
    document.addEventListener('mousemove', e => {
      if (!this._dn) return
      const dx=e.clientX-this._dsx, dy=e.clientY-this._dsy
      if (Math.abs(dx)+Math.abs(dy)>4) this._dm=true
      this.camX=this._dcx+dx; this.camY=this._dcy+dy
    })
    document.addEventListener('mouseup', e => {
      if (e.button!==0) return
      if (this._dn && !this._dm) {
        const r=cv.getBoundingClientRect()
        this._handleClick(e.clientX-r.left, e.clientY-r.top)
      }
      this._dn=false
    })
    cv.addEventListener('wheel', e => {
      e.preventDefault()
      const r=cv.getBoundingClientRect()
      const mx=e.clientX-r.left, my=e.clientY-r.top
      const ns=Math.max(1.8, Math.min(24, this.scale*(e.deltaY>0?0.88:1.14)))
      const f=ns/this.scale
      this.camX=(mx-cv.width*0.5)*(1-f)+this.camX*f
      this.camY=(my-cv.height*0.5)*(1-f)+this.camY*f
      this.scale=ns
    }, { passive:false })

    let lastDist=0
    cv.addEventListener('touchstart', e => {
      e.preventDefault()
      if (e.touches.length===1) {
        this._dn=true; this._dm=false
        this._dsx=e.touches[0].clientX; this._dsy=e.touches[0].clientY
        this._dcx=this.camX; this._dcy=this.camY
      } else if (e.touches.length===2) {
        this._dn=false
        lastDist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY)
      }
    }, {passive:false})
    cv.addEventListener('touchmove', e => {
      e.preventDefault()
      if (e.touches.length===1 && this._dn) {
        const dx=e.touches[0].clientX-this._dsx, dy=e.touches[0].clientY-this._dsy
        if (Math.abs(dx)+Math.abs(dy)>6) this._dm=true
        this.camX=this._dcx+dx; this.camY=this._dcy+dy
      } else if (e.touches.length===2) {
        const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY)
        const f=d/lastDist
        const midX=(e.touches[0].clientX+e.touches[1].clientX)*0.5
        const midY=(e.touches[0].clientY+e.touches[1].clientY)*0.5
        const r=cv.getBoundingClientRect()
        const mx=midX-r.left, my=midY-r.top
        const ns=Math.max(1.8, Math.min(24, this.scale*f)), af=ns/this.scale
        this.camX=(mx-cv.width*0.5)*(1-af)+this.camX*af
        this.camY=(my-cv.height*0.5)*(1-af)+this.camY*af
        this.scale=ns; lastDist=d
      }
    }, {passive:false})
    cv.addEventListener('touchend', e => {
      e.preventDefault()
      if (!this._dm && this._dn) {
        const r=cv.getBoundingClientRect(), t=e.changedTouches[0]
        this._handleClick(t.clientX-r.left, t.clientY-r.top)
      }
      this._dn=false
    }, {passive:false})
    cv.addEventListener('contextmenu', e => e.preventDefault())
  }

  // ── game loop ────────────────────────────────────────────

  private _step() {
    this._frame++

    // Player walks toward tap target
    if (this.tx !== null) {
      const dx=this.tx-this.px, dz=this.tz!-this.pz, dist=Math.hypot(dx,dz)
      if (dist>0.22) { const sp=Math.min(dist,.24); this.px+=dx/dist*sp; this.pz+=dz/dist*sp }
      else { this.tx=null; this.tz=null }
    }
    if (this.destA>0) this.destA-=0.014

    // Drive cars
    const gs = this.city.groundSize * 0.5
    this._cars.forEach(c => {
      if (c.axisX) {
        c.x += c.dx * c.speed
        c.z = c.lane
        if (c.dx > 0 && c.x > gs + 2) c.x = -gs - 2
        if (c.dx < 0 && c.x < -gs - 2) c.x = gs + 2
      } else {
        c.z += c.dz * c.speed
        c.x = c.lane
        if (c.dz > 0 && c.z > gs + 2) c.z = -gs - 2
        if (c.dz < 0 && c.z < -gs - 2) c.z = gs + 2
      }
    })
  }

  start() {
    const loop = () => { this._step(); this.draw(); this._raf=requestAnimationFrame(loop) }
    this._raf=requestAnimationFrame(loop)
  }

  stop() { cancelAnimationFrame(this._raf) }

  resize(w: number, h: number) { this.cv.width=w; this.cv.height=h }

  zoom(inward: boolean) {
    this.scale=Math.max(1.8, Math.min(24, this.scale*(inward?1.22:0.82)))
  }

  get playerPos() { return { x: this.px, z: this.pz } }
}

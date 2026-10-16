import {
  Engine, Scene, ArcRotateCamera, HemisphericLight, DirectionalLight,
  MeshBuilder, StandardMaterial, Color3, Color4, Vector3, DynamicTexture, Texture,
} from '@babylonjs/core'

const RW = 14, RD = 12, WALL_H = 6.4, WALL_T = 0.22
const FLOOR2_Y = 3.2
const FLOOR2_T = 0.12

export interface HotelTheme {
  primary: string
  accent: string
  wallTint: string
  floorBase: string
  floorAlt: string
  style: 'luxury' | 'modern'
}

export const HOTEL_THEMES: Record<string, HotelTheme> = {
  'Eko Hotel': {
    primary: '#8B6914', accent: '#1A0A00', wallTint: '#FFF8E8',
    floorBase: '#E8D8C0', floorAlt: '#C8B898', style: 'luxury',
  },
  'Radisson Blu': {
    primary: '#003B7C', accent: '#C0A060', wallTint: '#F0F4FA',
    floorBase: '#D8DDE8', floorAlt: '#B8C0D0', style: 'modern',
  },
}

const DEFAULT_THEME: HotelTheme = {
  primary: '#8B6914', accent: '#1A0A00', wallTint: '#FFF8E8',
  floorBase: '#E8D8C0', floorAlt: '#C8B898', style: 'luxury',
}

export class HotelScene {
  readonly engine: Engine
  readonly scene: Scene
  private _t: HotelTheme

  constructor(canvas: HTMLCanvasElement, private _name: string, private _logo?: string) {
    this._t = HOTEL_THEMES[_name] ?? DEFAULT_THEME
    this.engine = new Engine(canvas, true, { antialias: true, adaptToDeviceRatio: true })
    this.scene  = new Scene(this.engine)
    this.scene.clearColor = new Color4(0.53, 0.81, 0.92, 1)

    const cam = new ArcRotateCamera('cam', -Math.PI / 4, Math.PI / 4, 22, new Vector3(0, 1.5, 0), this.scene)
    cam.lowerAlphaLimit = -Math.PI / 2; cam.upperAlphaLimit = 0
    cam.lowerBetaLimit = Math.PI / 5; cam.upperBetaLimit = Math.PI / 3
    cam.lowerRadiusLimit = 14; cam.upperRadiusLimit = 32
    cam.panningSensibility = 0
    cam.attachControl(canvas, true)

    const amb = new HemisphericLight('hamb', new Vector3(0, 1, 0), this.scene)
    amb.intensity = 0.9; amb.diffuse = new Color3(1, 0.97, 0.92)
    amb.groundColor = new Color3(0.55, 0.50, 0.45)
    const sun = new DirectionalLight('hsun', new Vector3(-0.6, -0.8, 0.6), this.scene)
    sun.intensity = 0.7; sun.diffuse = new Color3(1, 0.96, 0.88)

    this._buildRoom()
    this._buildReception()
    this._buildLounge()
    this._buildElevators()
    this._buildBellhopArea()
    this._buildDecor()
    this._buildUpstairs()
    this._buildPool()
  }

  private _flatMat(hex: string): StandardMaterial {
    const m = new StandardMaterial('hf_' + Math.random(), this.scene)
    m.disableLighting = true
    m.emissiveColor = Color3.FromHexString(hex)
    m.diffuseColor = Color3.Black(); m.specularColor = Color3.Black()
    return m
  }

  private _mat(hex: string): StandardMaterial {
    const m = new StandardMaterial('hm_' + Math.random(), this.scene)
    m.diffuseColor = Color3.FromHexString(hex)
    m.emissiveColor = Color3.FromHexString(hex).scale(0.15)
    m.specularColor = new Color3(0.05, 0.05, 0.05)
    return m
  }

  private _buildRoom(): void {
    const t = this._t
    const platMat = this._flatMat('#479E24')
    const plat = MeshBuilder.CreateCylinder('plat', { height: 0.40, diameter: RW * 1.65, tessellation: 72 }, this.scene)
    plat.position.y = -0.28; plat.material = platMat; plat.isPickable = false

    const floorMat = this._flatMat(t.floorBase)
    const floor = MeshBuilder.CreateBox('floor', { width: RW, height: 0.10, depth: RD }, this.scene)
    floor.position.y = -0.05; floor.material = floorMat; floor.isPickable = false

    // Marble-style checkerboard tiles
    const tileMat1 = this._flatMat(t.floorBase)
    const tileMat2 = this._flatMat(t.floorAlt)
    const TN = 10, tw = RW / TN
    for (let r = 0; r < TN; r++) {
      for (let c = 0; c < TN; c++) {
        const tile = MeshBuilder.CreateBox(`ft_${r}_${c}`,
          { width: tw - 0.03, height: 0.06, depth: tw - 0.03 }, this.scene)
        tile.position.set(-RW / 2 + tw * c + tw / 2, 0.03, -RD / 2 + tw * r + tw / 2)
        tile.material = (r + c) % 2 === 0 ? tileMat1 : tileMat2
        tile.isPickable = false
      }
    }

    const wallMat = this._flatMat(t.wallTint)
    const back = MeshBuilder.CreateBox('wBack', { width: RW + WALL_T * 2, height: WALL_H, depth: WALL_T }, this.scene)
    back.position.set(0, WALL_H / 2, RD / 2 + WALL_T / 2); back.material = wallMat; back.isPickable = false
    const left = MeshBuilder.CreateBox('wLeft', { width: WALL_T, height: WALL_H, depth: RD }, this.scene)
    left.position.set(-RW / 2 - WALL_T / 2, WALL_H / 2, 0); left.material = wallMat; left.isPickable = false

    const accentMat = this._flatMat(t.primary)
    const accB = MeshBuilder.CreateBox('accB', { width: RW + WALL_T * 2, height: 0.15, depth: WALL_T + 0.02 }, this.scene)
    accB.position.set(0, 0.08, RD / 2 + WALL_T / 2); accB.material = accentMat; accB.isPickable = false
    const accL = MeshBuilder.CreateBox('accL', { width: WALL_T + 0.02, height: 0.15, depth: RD }, this.scene)
    accL.position.set(-RW / 2 - WALL_T / 2, 0.08, 0); accL.material = accentMat; accL.isPickable = false

    if (this._logo) {
      const logoMat = new StandardMaterial('logoMat', this.scene)
      logoMat.disableLighting = true; logoMat.emissiveColor = Color3.White(); logoMat.specularColor = Color3.Black()
      logoMat.emissiveTexture = new Texture(this._logo, this.scene)
      const lp = MeshBuilder.CreatePlane('logop', { width: 2.0, height: 2.0 }, this.scene)
      lp.position.set(-4.5, 2.2, RD / 2 - 0.10); lp.material = logoMat
    }
  }

  private _buildReception(): void {
    const t = this._t
    // Long reception desk (back-right area)
    const deskMat = this._mat(t.primary)
    const deskTop = this._mat('#F5F0E8')
    const desk = MeshBuilder.CreateBox('rDesk', { width: 5.5, depth: 1.0, height: 1.1 }, this.scene)
    desk.position.set(2.5, 0.55, RD / 2 - 1.8); desk.material = deskMat
    const top = MeshBuilder.CreateBox('rTop', { width: 5.7, depth: 1.1, height: 0.06 }, this.scene)
    top.position.set(2.5, 1.13, RD / 2 - 1.8); top.material = deskTop

    // Computer monitors (2)
    for (let i = 0; i < 2; i++) {
      const mx = 1.5 + i * 2.5
      const mon = MeshBuilder.CreateBox('rMon' + i, { width: 0.50, depth: 0.06, height: 0.35 }, this.scene)
      mon.position.set(mx, 1.45, RD / 2 - 1.6); mon.material = this._mat('#222222')
      const scr = MeshBuilder.CreatePlane('rScr' + i, { width: 0.44, height: 0.28 }, this.scene)
      scr.position.set(mx, 1.45, RD / 2 - 1.64); scr.material = this._flatMat('#3388CC')
      const stand = MeshBuilder.CreateCylinder('rSt' + i, { height: 0.12, diameter: 0.08, tessellation: 8 }, this.scene)
      stand.position.set(mx, 1.22, RD / 2 - 1.6); stand.material = this._mat('#333333')
    }

    // Key rack behind desk (back wall)
    const rackMat = this._mat(t.accent)
    const rack = MeshBuilder.CreateBox('keyRack', { width: 3.5, depth: 0.12, height: 1.2 }, this.scene)
    rack.position.set(2.5, 2.2, RD / 2 - 0.08); rack.material = rackMat
    // Room key hooks
    const keyColors = ['#FFD700', '#C0C0C0', '#CD7F32', '#FFD700', '#C0C0C0', '#FFD700']
    for (let k = 0; k < 6; k++) {
      const key = MeshBuilder.CreateBox('key' + k, { width: 0.15, depth: 0.04, height: 0.25 }, this.scene)
      key.position.set(1.2 + k * 0.5, 2.1, RD / 2 - 0.14); key.material = this._flatMat(keyColors[k])
    }

    // "WELCOME" sign
    const welTex = new DynamicTexture('welTex', { width: 512, height: 80 }, this.scene, true)
    const wctx = welTex.getContext() as unknown as CanvasRenderingContext2D
    wctx.fillStyle = t.wallTint; wctx.fillRect(0, 0, 512, 80)
    wctx.fillStyle = t.primary; wctx.font = 'bold 44px serif'; wctx.textAlign = 'center'
    wctx.fillText('WELCOME', 256, 56)
    welTex.update()
    const welMat = new StandardMaterial('welM', this.scene)
    welMat.disableLighting = true; welMat.emissiveTexture = welTex; welMat.emissiveColor = Color3.White()
    const welSign = MeshBuilder.CreatePlane('welSign', { width: 3.0, height: 0.5 }, this.scene)
    welSign.position.set(2.5, 3.0, RD / 2 - 0.08); welSign.material = welMat

    // Bell on desk
    const bell = MeshBuilder.CreateSphere('bell', { diameter: 0.18, segments: 8 }, this.scene)
    bell.position.set(4.0, 1.22, RD / 2 - 2.0); bell.material = this._flatMat('#FFD700')
    const bellBase = MeshBuilder.CreateCylinder('bellB', { height: 0.04, diameter: 0.22, tessellation: 10 }, this.scene)
    bellBase.position.set(4.0, 1.15, RD / 2 - 2.0); bellBase.material = this._mat('#333333')
  }

  private _buildLounge(): void {
    const t = this._t
    const cushMat = this._mat(t.primary)
    const frameMat = this._mat(t.accent)
    const tableMat = this._mat('#F5F0E8')

    // 2 sofas facing each other with coffee table
    for (let s = 0; s < 2; s++) {
      const sz = -2.0 + s * 2.8
      const seatD = s === 0 ? 1 : -1
      // Seat
      const seat = MeshBuilder.CreateBox('lSeat' + s, { width: 2.8, depth: 0.8, height: 0.35 }, this.scene)
      seat.position.set(-3.5, 0.38, sz); seat.material = cushMat
      // Back
      const back = MeshBuilder.CreateBox('lBack' + s, { width: 2.8, depth: 0.15, height: 0.50 }, this.scene)
      back.position.set(-3.5, 0.78, sz + seatD * 0.40); back.material = cushMat
      // Armrests
      for (const ax of [-1.25, 1.25]) {
        const arm = MeshBuilder.CreateBox('lArm' + s + ax, { width: 0.15, depth: 0.8, height: 0.35 }, this.scene)
        arm.position.set(-3.5 + ax, 0.55, sz); arm.material = frameMat
      }
    }
    // Coffee table
    const ctTop = MeshBuilder.CreateBox('ctTop', { width: 1.4, depth: 0.7, height: 0.05 }, this.scene)
    ctTop.position.set(-3.5, 0.45, -0.6); ctTop.material = tableMat
    const ctLeg = MeshBuilder.CreateCylinder('ctLeg', { height: 0.42, diameter: 0.08, tessellation: 8 }, this.scene)
    ctLeg.position.set(-3.5, 0.21, -0.6); ctLeg.material = this._mat('#888888')

    // Magazine on table
    const mag = MeshBuilder.CreateBox('mag', { width: 0.30, depth: 0.22, height: 0.015 }, this.scene)
    mag.position.set(-3.3, 0.48, -0.6); mag.material = this._flatMat('#D44444')
  }

  private _buildElevators(): void {
    const t = this._t
    const doorMat = this._mat('#B0B0B0')

    // 2 elevator doors on left wall
    for (let e = 0; e < 2; e++) {
      const ez = 2.5 + e * 3.5
      // Frame
      const frame = MeshBuilder.CreateBox('elFr' + e, { width: 0.08, depth: 1.6, height: 2.6 }, this.scene)
      frame.position.set(-RW / 2 + 0.06, 1.3, ez); frame.material = this._mat(t.accent)
      // Left door
      const doorL = MeshBuilder.CreateBox('elDL' + e, { width: 0.06, depth: 0.70, height: 2.4 }, this.scene)
      doorL.position.set(-RW / 2 + 0.10, 1.2, ez - 0.38); doorL.material = doorMat
      // Right door
      const doorR = MeshBuilder.CreateBox('elDR' + e, { width: 0.06, depth: 0.70, height: 2.4 }, this.scene)
      doorR.position.set(-RW / 2 + 0.10, 1.2, ez + 0.38); doorR.material = doorMat
      // Floor indicator above
      const indMat = this._flatMat('#22CC44')
      const ind = MeshBuilder.CreatePlane('elInd' + e, { width: 0.3, height: 0.15 }, this.scene)
      ind.position.set(-RW / 2 + 0.04, 2.7, ez)
      ind.rotation.y = Math.PI / 2; ind.material = indMat
      // Arrow up
      const arrow = MeshBuilder.CreatePlane('elArr' + e, { width: 0.12, height: 0.12 }, this.scene)
      arrow.position.set(-RW / 2 + 0.03, 2.55, ez)
      arrow.rotation.y = Math.PI / 2; arrow.material = this._flatMat('#44FF66')
    }
  }

  private _buildBellhopArea(): void {
    // Luggage cart near entrance
    const cartMat = this._mat('#C8A84B')
    const cartBase = MeshBuilder.CreateBox('cart', { width: 0.9, depth: 0.5, height: 0.06 }, this.scene)
    cartBase.position.set(5.5, 0.40, -3.5); cartBase.material = cartMat
    // Cart legs/wheels
    for (const [cx, cz] of [[-0.35, -0.18], [0.35, -0.18], [-0.35, 0.18], [0.35, 0.18]]) {
      const wheel = MeshBuilder.CreateCylinder('cW', { height: 0.12, diameter: 0.10, tessellation: 8 }, this.scene)
      wheel.position.set(5.5 + cx, 0.06, -3.5 + cz); wheel.material = this._mat('#333333')
      wheel.rotation.x = Math.PI / 2
    }
    // Cart handle
    const handle = MeshBuilder.CreateBox('cHandle', { width: 0.06, depth: 0.5, height: 0.60 }, this.scene)
    handle.position.set(5.05, 0.70, -3.5); handle.material = cartMat

    // Suitcases on cart
    const suitColors = ['#8B4513', '#2F4F4F', '#8B0000']
    for (let s = 0; s < 3; s++) {
      const suit = MeshBuilder.CreateBox('suit' + s, { width: 0.35, depth: 0.22, height: 0.25 }, this.scene)
      suit.position.set(5.3 + s * 0.25, 0.58, -3.5); suit.material = this._mat(suitColors[s])
    }

    // Stanchion posts near reception
    const poleMat = this._mat('#C8A84B')
    const ropeMat = this._mat('#8B0000')
    for (let p = 0; p < 3; p++) {
      const px = 0.5 + p * 2.0
      const pole = MeshBuilder.CreateCylinder('pole' + p, { height: 0.90, diameter: 0.06, tessellation: 8 }, this.scene)
      pole.position.set(px, 0.45, RD / 2 - 3.8); pole.material = poleMat
      const topBall = MeshBuilder.CreateSphere('pTop' + p, { diameter: 0.12, segments: 8 }, this.scene)
      topBall.position.set(px, 0.93, RD / 2 - 3.8); topBall.material = poleMat
      if (p < 2) {
        const rope = MeshBuilder.CreateCylinder('rope' + p, { height: 0.04, diameter: 2.0, tessellation: 4 }, this.scene)
        rope.position.set(px + 1.0, 0.75, RD / 2 - 3.8); rope.material = ropeMat
        rope.rotation.z = Math.PI / 2
      }
    }
  }

  private _buildDecor(): void {
    const t = this._t
    // Potted palms
    for (const [px, pz] of [[-RW / 2 + 1.0, -5.0], [-RW / 2 + 1.0, 5.0], [6.5, 4.5]]) {
      const pot = MeshBuilder.CreateCylinder('pot', { height: 0.5, diameterTop: 0.42, diameterBottom: 0.30, tessellation: 10 }, this.scene)
      pot.position.set(px, 0.25, pz); pot.material = this._mat('#6B4226')
      const trunk = MeshBuilder.CreateCylinder('trunk', { height: 0.8, diameter: 0.08, tessellation: 6 }, this.scene)
      trunk.position.set(px, 0.85, pz); trunk.material = this._mat('#8B6914')
      const leaves = MeshBuilder.CreateSphere('leaves', { diameter: 0.80, segments: 8 }, this.scene)
      leaves.position.set(px, 1.40, pz); leaves.material = this._mat('#2D8B2D')
      leaves.scaling.y = 0.7
    }

    // Chandelier (center ceiling area)
    const chanBase = MeshBuilder.CreateCylinder('chanB', { height: 0.08, diameter: 1.2, tessellation: 16 }, this.scene)
    chanBase.position.set(0, WALL_H - 0.2, 0); chanBase.material = this._flatMat('#FFD700')
    for (let c = 0; c < 6; c++) {
      const angle = (c / 6) * Math.PI * 2
      const cx = Math.cos(angle) * 0.4
      const cz = Math.sin(angle) * 0.4
      const bulb = MeshBuilder.CreateSphere('chanL' + c, { diameter: 0.12, segments: 6 }, this.scene)
      bulb.position.set(cx, WALL_H - 0.35, cz); bulb.material = this._flatMat('#FFFFCC')
    }
    const chain = MeshBuilder.CreateCylinder('chain', { height: 0.20, diameter: 0.03, tessellation: 6 }, this.scene)
    chain.position.set(0, WALL_H - 0.06, 0); chain.material = this._mat('#C8A84B')

    // Red carpet runner from entrance to reception
    const carpet = MeshBuilder.CreateBox('carpet', { width: 2.0, depth: 10.0, height: 0.02 }, this.scene)
    carpet.position.set(2.5, 0.06, -1.0); carpet.material = this._flatMat('#8B0000')

    // Name sign
    const nameTex = new DynamicTexture('nameTex', { width: 512, height: 80 }, this.scene, true)
    const nctx = nameTex.getContext() as unknown as CanvasRenderingContext2D
    nctx.fillStyle = t.wallTint; nctx.fillRect(0, 0, 512, 80)
    nctx.fillStyle = t.primary; nctx.font = 'bold 42px serif'; nctx.textAlign = 'center'
    nctx.fillText(this._name, 256, 56)
    nameTex.update()
    const nameMat = new StandardMaterial('nameM', this.scene)
    nameMat.disableLighting = true; nameMat.emissiveTexture = nameTex; nameMat.emissiveColor = Color3.White()
    const nameP = MeshBuilder.CreatePlane('nameSign', { width: 5.0, height: 0.7 }, this.scene)
    nameP.position.set(-2.0, 3.0, RD / 2 - 0.08); nameP.material = nameMat
  }

  private _buildUpstairs(): void {
    const t = this._t

    // ── Mezzanine floor slab (left half, overhangs lobby) ──────────
    const slabMat = this._flatMat(t.floorBase)
    const slab = MeshBuilder.CreateBox('f2slab', { width: RW, depth: RD / 2, height: FLOOR2_T }, this.scene)
    slab.position.set(0, FLOOR2_Y, RD / 4 + 0.5); slab.material = slabMat

    // Underside ceiling panel
    const ceilMat = this._flatMat('#F5F0E8')
    const ceil = MeshBuilder.CreateBox('f2ceil', { width: RW - 0.2, depth: RD / 2 - 0.2, height: 0.03 }, this.scene)
    ceil.position.set(0, FLOOR2_Y - 0.06, RD / 4 + 0.5); ceil.material = ceilMat

    // Mezzanine floor tiles
    const t1 = this._flatMat(t.floorBase), t2 = this._flatMat(t.floorAlt)
    const TN = 8, tw = RW / TN
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < TN; c++) {
        const tile = MeshBuilder.CreateBox(`f2t_${r}_${c}`,
          { width: tw - 0.03, height: 0.04, depth: tw - 0.03 }, this.scene)
        tile.position.set(-RW / 2 + tw * c + tw / 2, FLOOR2_Y + 0.05, RD / 4 + 0.5 - RD / 4 + tw * r + tw / 2)
        tile.material = (r + c) % 2 === 0 ? t1 : t2
        tile.isPickable = false
      }
    }

    // ── Glass railing along mezzanine edge (front) ─────────────────
    const railMat = this._mat('#C8A84B')
    const glassMat = new StandardMaterial('glassMez', this.scene)
    glassMat.diffuseColor = Color3.FromHexString('#88CCEE')
    glassMat.alpha = 0.30; glassMat.specularColor = new Color3(0.3, 0.3, 0.3)

    const railBar = MeshBuilder.CreateBox('f2rail', { width: RW - 0.4, depth: 0.06, height: 0.06 }, this.scene)
    railBar.position.set(0, FLOOR2_Y + 1.0, 0.55); railBar.material = railMat
    const railGlass = MeshBuilder.CreateBox('f2glass', { width: RW - 0.6, depth: 0.03, height: 0.90 }, this.scene)
    railGlass.position.set(0, FLOOR2_Y + 0.52, 0.55); railGlass.material = glassMat

    // Railing posts
    for (let p = 0; p < 6; p++) {
      const post = MeshBuilder.CreateCylinder('f2post' + p,
        { height: 1.05, diameter: 0.06, tessellation: 8 }, this.scene)
      post.position.set(-RW / 2 + 1.2 + p * 2.2, FLOOR2_Y + 0.52, 0.55); post.material = railMat
    }

    // ── Grand staircase (right side, connecting floors) ────────────
    const stairMat = this._mat('#E8DCC8')
    const railStairMat = this._mat('#C8A84B')
    const STEPS = 10
    const stepW = 2.0, stepD = 0.50, stepH = FLOOR2_Y / STEPS
    for (let s = 0; s < STEPS; s++) {
      const step = MeshBuilder.CreateBox('stair' + s,
        { width: stepW, depth: stepD, height: 0.08 }, this.scene)
      step.position.set(5.5, stepH * s + stepH / 2, -RD / 2 + 1.5 + s * stepD)
      step.material = stairMat
      // Riser
      const riser = MeshBuilder.CreateBox('riser' + s,
        { width: stepW, depth: 0.04, height: stepH }, this.scene)
      riser.position.set(5.5, stepH * s, -RD / 2 + 1.25 + s * stepD)
      riser.material = this._mat(t.primary)
    }
    // Stair railing (left side)
    for (let r = 0; r < 4; r++) {
      const ry = stepH * r * 3 + stepH
      const rz = -RD / 2 + 1.5 + r * 3 * stepD
      const post = MeshBuilder.CreateCylinder('srPost' + r,
        { height: 0.8, diameter: 0.05, tessellation: 8 }, this.scene)
      post.position.set(4.45, ry + 0.4, rz); post.material = railStairMat
    }

    // ── Upstairs hallway — hotel room doors ────────────────────────
    const doorMat = this._mat('#5C3A2A')
    const doorKnob = this._flatMat('#FFD700')
    const roomNums = ['101', '102', '103', '104', '105']
    for (let d = 0; d < 5; d++) {
      const dx = -5.5 + d * 2.5
      // Door on back wall
      const door = MeshBuilder.CreateBox('rmDoor' + d,
        { width: 0.80, depth: 0.08, height: 1.9 }, this.scene)
      door.position.set(dx, FLOOR2_Y + 1.0, RD / 2 - 0.06); door.material = doorMat
      // Knob
      const knob = MeshBuilder.CreateSphere('rmKnob' + d, { diameter: 0.08, segments: 6 }, this.scene)
      knob.position.set(dx + 0.30, FLOOR2_Y + 0.90, RD / 2 - 0.12); knob.material = doorKnob
      // Room number
      const numTex = new DynamicTexture('rmNum' + d, { width: 64, height: 40 }, this.scene, true)
      const nctx = numTex.getContext() as unknown as CanvasRenderingContext2D
      nctx.fillStyle = t.primary; nctx.fillRect(0, 0, 64, 40)
      nctx.fillStyle = '#FFFFFF'; nctx.font = 'bold 22px sans-serif'; nctx.textAlign = 'center'
      nctx.fillText(roomNums[d], 32, 28)
      numTex.update()
      const numMat = new StandardMaterial('rmNM' + d, this.scene)
      numMat.disableLighting = true; numMat.emissiveTexture = numTex; numMat.emissiveColor = Color3.White()
      const numPlane = MeshBuilder.CreatePlane('rmNP' + d, { width: 0.25, height: 0.16 }, this.scene)
      numPlane.position.set(dx, FLOOR2_Y + 2.05, RD / 2 - 0.08); numPlane.material = numMat
    }

    // ── Hallway runner carpet upstairs ──────────────────────────────
    const carpet2 = MeshBuilder.CreateBox('f2carpet', { width: RW - 2, depth: 2.0, height: 0.02 }, this.scene)
    carpet2.position.set(0, FLOOR2_Y + FLOOR2_T, RD / 2 - 1.8); carpet2.material = this._flatMat('#8B0000')

    // ── Upstairs wall sconce lights ────────────────────────────────
    for (let l = 0; l < 4; l++) {
      const lx = -5.0 + l * 3.3
      const sconce = MeshBuilder.CreateSphere('sconce' + l, { diameter: 0.15, segments: 6 }, this.scene)
      sconce.position.set(lx, FLOOR2_Y + 2.2, RD / 2 - 0.10); sconce.material = this._flatMat('#FFFFCC')
      const bracket = MeshBuilder.CreateBox('scBr' + l, { width: 0.06, depth: 0.10, height: 0.12 }, this.scene)
      bracket.position.set(lx, FLOOR2_Y + 2.08, RD / 2 - 0.06); bracket.material = this._mat('#C8A84B')
    }
  }

  private _buildPool(): void {
    // ── Rooftop pool area (front-left, open-air feel) ──────────────
    const poolX = -4.0, poolZ = -3.5
    const poolW = 5.0, poolD = 3.5

    // Pool basin (sunken)
    const waterMat = new StandardMaterial('poolWater', this.scene)
    waterMat.diffuseColor = Color3.FromHexString('#2299CC')
    waterMat.emissiveColor = Color3.FromHexString('#2299CC').scale(0.35)
    waterMat.alpha = 0.65; waterMat.specularColor = new Color3(0.4, 0.4, 0.4)
    const water = MeshBuilder.CreateBox('poolW', { width: poolW - 0.3, depth: poolD - 0.3, height: 0.04 }, this.scene)
    water.position.set(poolX, 0.08, poolZ); water.material = waterMat

    // Pool walls (inner basin) — shallow ledge
    const basinMat = this._flatMat('#B0E0E6')
    const basinFloor = MeshBuilder.CreateBox('pBasin', { width: poolW - 0.3, depth: poolD - 0.3, height: 0.02 }, this.scene)
    basinFloor.position.set(poolX, -0.05, poolZ); basinFloor.material = basinMat

    // Pool rim/coping
    const copingMat = this._flatMat('#F5F0E8')
    for (const [w, d, x, z] of [
      [poolW, 0.18, poolX, poolZ - poolD / 2],
      [poolW, 0.18, poolX, poolZ + poolD / 2],
      [0.18, poolD + 0.18, poolX - poolW / 2, poolZ],
      [0.18, poolD + 0.18, poolX + poolW / 2, poolZ],
    ] as [number, number, number, number][]) {
      const rim = MeshBuilder.CreateBox('pRim', { width: w, depth: d, height: 0.10 }, this.scene)
      rim.position.set(x, 0.12, z); rim.material = copingMat
    }

    // Pool deck tiles around pool
    const deckMat = this._flatMat('#E8DCC8')
    const deckBorder = MeshBuilder.CreateBox('pDeck', { width: poolW + 1.5, depth: poolD + 1.5, height: 0.03 }, this.scene)
    deckBorder.position.set(poolX, 0.04, poolZ); deckBorder.material = deckMat

    // ── Pool loungers (2) ──────────────────────────────────────────
    const loungerMat = this._mat('#F5F5F5')
    const frameMat = this._mat('#888888')
    for (let l = 0; l < 2; l++) {
      const lx = poolX - poolW / 2 - 0.8, lz = poolZ - 1.0 + l * 2.0
      // Frame
      const frame = MeshBuilder.CreateBox('lnFr' + l, { width: 0.60, depth: 1.6, height: 0.04 }, this.scene)
      frame.position.set(lx, 0.30, lz); frame.material = frameMat
      // Legs
      for (const [fx, fz] of [[-0.22, -0.65], [0.22, -0.65], [-0.22, 0.65], [0.22, 0.65]]) {
        const leg = MeshBuilder.CreateCylinder('lnLg' + l + fx,
          { height: 0.28, diameter: 0.04, tessellation: 6 }, this.scene)
        leg.position.set(lx + fx, 0.14, lz + fz); leg.material = frameMat
      }
      // Cushion
      const cush = MeshBuilder.CreateBox('lnCu' + l, { width: 0.52, depth: 1.4, height: 0.06 }, this.scene)
      cush.position.set(lx, 0.36, lz); cush.material = loungerMat
      // Raised back
      const back = MeshBuilder.CreateBox('lnBk' + l, { width: 0.52, depth: 0.40, height: 0.06 }, this.scene)
      back.position.set(lx, 0.44, lz - 0.55)
      back.rotation.x = -Math.PI / 6; back.material = loungerMat
    }

    // ── Umbrella between loungers ──────────────────────────────────
    const poleMat = this._mat('#6B4226')
    const pole = MeshBuilder.CreateCylinder('pUmPole', { height: 1.8, diameter: 0.05, tessellation: 6 }, this.scene)
    pole.position.set(poolX - poolW / 2 - 0.8, 0.90, poolZ); pole.material = poleMat
    const shade = MeshBuilder.CreateCylinder('pUmShade',
      { height: 0.06, diameterTop: 0, diameterBottom: 1.8, tessellation: 8 }, this.scene)
    shade.position.set(poolX - poolW / 2 - 0.8, 1.85, poolZ)
    shade.material = this._flatMat('#FFD700')

    // ── Towel rack ─────────────────────────────────────────────────
    const rackMat = this._mat('#C0C0C0')
    const rack = MeshBuilder.CreateBox('tRack', { width: 0.80, depth: 0.10, height: 0.60 }, this.scene)
    rack.position.set(poolX + poolW / 2 + 0.7, 0.55, poolZ + 1.0); rack.material = rackMat
    // Towels draped
    const towelColors = ['#FFFFFF', '#2299CC', '#FFD700']
    for (let tw = 0; tw < 3; tw++) {
      const towel = MeshBuilder.CreateBox('towel' + tw, { width: 0.22, depth: 0.12, height: 0.45 }, this.scene)
      towel.position.set(poolX + poolW / 2 + 0.55 + tw * 0.25, 0.55, poolZ + 1.0)
      towel.material = this._flatMat(towelColors[tw])
    }

    // ── "POOL" sign ────────────────────────────────────────────────
    const poolTex = new DynamicTexture('poolTex', { width: 192, height: 56 }, this.scene, true)
    const pctx = poolTex.getContext() as unknown as CanvasRenderingContext2D
    pctx.fillStyle = '#2299CC'; pctx.fillRect(0, 0, 192, 56)
    pctx.fillStyle = '#FFFFFF'; pctx.font = 'bold 28px sans-serif'; pctx.textAlign = 'center'
    pctx.fillText('POOL', 96, 38)
    poolTex.update()
    const poolSignMat = new StandardMaterial('poolSM', this.scene)
    poolSignMat.disableLighting = true; poolSignMat.emissiveTexture = poolTex; poolSignMat.emissiveColor = Color3.White()
    const poolSign = MeshBuilder.CreatePlane('poolSign', { width: 1.0, height: 0.30 }, this.scene)
    poolSign.position.set(poolX, 0.80, poolZ + poolD / 2 + 0.3); poolSign.material = poolSignMat
  }

  start(): void { this.engine.runRenderLoop(() => this.scene.render()) }
  dispose(): void { this.engine.dispose() }
}

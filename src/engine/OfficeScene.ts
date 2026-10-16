import {
  Engine, Scene, ArcRotateCamera, HemisphericLight, DirectionalLight,
  MeshBuilder, StandardMaterial, Color3, Color4, Vector3, DynamicTexture, Texture,
} from '@babylonjs/core'

const RW = 14, RD = 12, WALL_H = 3.4, WALL_T = 0.22

export interface OfficeTheme {
  primary: string
  accent: string
  wallTint: string
  floorBase: string
  floorAlt: string
  industry: string
}

export const OFFICE_THEMES: Record<string, OfficeTheme> = {
  'Dangote HQ': {
    primary: '#003366',
    accent: '#C8A84B',
    wallTint: '#D8D0C0',
    floorBase: '#A8A090',
    floorAlt: '#908878',
    industry: 'conglomerate',
  },
  'MTN Nigeria': {
    primary: '#FFCC00',
    accent: '#003366',
    wallTint: '#FFFDF0',
    floorBase: '#F5F0E0',
    floorAlt: '#E0D8C0',
    industry: 'telecom',
  },
  'Twedot HQ': {
    primary: '#7C3AED',
    accent: '#14B8A6',
    wallTint: '#1A1028',
    floorBase: '#15101E',
    floorAlt: '#0D0818',
    industry: 'social',
  },
  'Jumia HQ': {
    primary: '#F68B1E',
    accent: '#1A1A1A',
    wallTint: '#FAF6F0',
    floorBase: '#E8E0D4',
    floorAlt: '#D0C8B8',
    industry: 'ecommerce',
  },
}

const DEFAULT_THEME: OfficeTheme = {
  primary: '#4A90D9',
  accent: '#1B3A5C',
  wallTint: '#F0F4FA',
  floorBase: '#E8E4DC',
  floorAlt: '#CCC4B8',
  industry: 'office',
}

export class OfficeScene {
  readonly engine: Engine
  readonly scene: Scene
  private _t: OfficeTheme

  constructor(canvas: HTMLCanvasElement, private _name: string, private _logo?: string) {
    this._t = OFFICE_THEMES[_name] ?? DEFAULT_THEME
    this.engine = new Engine(canvas, true, { antialias: true, adaptToDeviceRatio: true })
    this.scene  = new Scene(this.engine)
    this.scene.clearColor = new Color4(0.53, 0.81, 0.92, 1)

    const cam = new ArcRotateCamera('cam', -Math.PI / 4, Math.PI / 3.6, 18, Vector3.Zero(), this.scene)
    cam.lowerAlphaLimit = -Math.PI / 2; cam.upperAlphaLimit = 0
    cam.lowerBetaLimit = Math.PI / 6; cam.upperBetaLimit = Math.PI / 2.5
    cam.lowerRadiusLimit = 10; cam.upperRadiusLimit = 26
    cam.panningSensibility = 0
    cam.attachControl(canvas, true)

    const amb = new HemisphericLight('hamb', new Vector3(0, 1, 0), this.scene)
    amb.intensity = 0.9; amb.diffuse = new Color3(1, 0.97, 0.92)
    amb.groundColor = new Color3(0.55, 0.50, 0.45)

    const sun = new DirectionalLight('hsun', new Vector3(-0.6, -0.8, 0.6), this.scene)
    sun.intensity = 0.7; sun.diffuse = new Color3(1, 0.96, 0.88)

    this._buildRoom()
    switch (this._t.industry) {
      case 'conglomerate': this._buildIndustrialInterior(); break
      case 'telecom':      this._buildTelecomInterior(); break
      case 'social':       this._buildCyberHomeInterior(); break
      case 'ecommerce':    this._buildShoppingMallInterior(); break
      default:
        this._buildReception()
        this._buildWorkstations()
        this._buildMeetingRoom()
        this._buildGenericDashboard()
        this._buildDecor()
        break
    }
  }

  private _flatMat(hex: string): StandardMaterial {
    const m = new StandardMaterial('of_' + Math.random(), this.scene)
    m.disableLighting = true
    m.emissiveColor = Color3.FromHexString(hex)
    m.diffuseColor = Color3.Black(); m.specularColor = Color3.Black()
    return m
  }

  private _mat(hex: string): StandardMaterial {
    const m = new StandardMaterial('om_' + Math.random(), this.scene)
    m.diffuseColor = Color3.FromHexString(hex)
    m.emissiveColor = Color3.FromHexString(hex).scale(0.15)
    m.specularColor = new Color3(0.05, 0.05, 0.05)
    return m
  }

  // ── Room shell ───────────────────────────────────────────────────────────

  private _buildRoom(): void {
    const t = this._t

    const platMat = this._flatMat('#479E24')
    const plat = MeshBuilder.CreateCylinder('plat', { height: 0.40, diameter: RW * 1.65, tessellation: 72 }, this.scene)
    plat.position.y = -0.28; plat.material = platMat; plat.isPickable = false

    const floorMat = this._flatMat(t.floorBase)
    const floor = MeshBuilder.CreateBox('floor', { width: RW, height: 0.10, depth: RD }, this.scene)
    floor.position.y = -0.05; floor.material = floorMat; floor.isPickable = false

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

    const carpetMat = this._flatMat(t.primary)
    const carpet = MeshBuilder.CreateBox('carpet', { width: 1.2, depth: RD - 2, height: 0.07 }, this.scene)
    carpet.position.y = 0.04; carpet.material = carpetMat; carpet.isPickable = false

    const wallMat = this._flatMat(t.wallTint)
    const back = MeshBuilder.CreateBox('wBack', { width: RW + WALL_T * 2, height: WALL_H, depth: WALL_T }, this.scene)
    back.position.set(0, WALL_H / 2, RD / 2 + WALL_T / 2); back.material = wallMat; back.isPickable = false

    const left = MeshBuilder.CreateBox('wLeft', { width: WALL_T, height: WALL_H, depth: RD }, this.scene)
    left.position.set(-RW / 2 - WALL_T / 2, WALL_H / 2, 0); left.material = wallMat; left.isPickable = false

    const accentMat = this._flatMat(t.primary)
    const accentStrip = MeshBuilder.CreateBox('wallAcc', { width: RW + WALL_T * 2, height: 0.15, depth: WALL_T + 0.02 }, this.scene)
    accentStrip.position.set(0, 0.08, RD / 2 + WALL_T / 2); accentStrip.material = accentMat; accentStrip.isPickable = false

    // Left wall accent
    const leftAcc = MeshBuilder.CreateBox('wallAccL', { width: WALL_T + 0.02, height: 0.15, depth: RD }, this.scene)
    leftAcc.position.set(-RW / 2 - WALL_T / 2, 0.08, 0); leftAcc.material = accentMat; leftAcc.isPickable = false

    this._buildLogo()
    this._buildNameSign()
  }

  private _buildLogo(): void {
    if (!this._logo) return
    const logoMat = new StandardMaterial('logoMat', this.scene)
    logoMat.disableLighting = true; logoMat.emissiveColor = Color3.White(); logoMat.specularColor = Color3.Black()
    logoMat.emissiveTexture = new Texture(this._logo, this.scene)
    const lp = MeshBuilder.CreatePlane('logop', { width: 2.4, height: 2.4 }, this.scene)
    lp.position.set(-3.5, 2.0, RD / 2 - 0.10); lp.material = logoMat
  }

  private _buildNameSign(): void {
    const t = this._t
    const tex = new DynamicTexture('nameTex', { width: 512, height: 80 }, this.scene, true)
    const ctx = tex.getContext() as unknown as CanvasRenderingContext2D
    ctx.fillStyle = t.wallTint; ctx.fillRect(0, 0, 512, 80)
    ctx.fillStyle = t.accent; ctx.font = 'bold 42px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(this._name, 256, 56)
    tex.update()
    const mat = new StandardMaterial('nameMat', this.scene)
    mat.disableLighting = true; mat.emissiveTexture = tex; mat.emissiveColor = Color3.White()
    const plane = MeshBuilder.CreatePlane('nameSign', { width: 5.0, height: 0.7 }, this.scene)
    plane.position.set(1.5, 2.9, RD / 2 - 0.08); plane.material = mat
  }

  // ── Reception ────────────────────────────────────────────────────────────

  private _buildReception(): void {
    const t = this._t
    const deskMat = this._mat(t.accent)
    const topMat = this._mat('#E8E0D4')

    const front = MeshBuilder.CreateBox('rcpF', { width: 3.5, depth: 0.7, height: 1.1 }, this.scene)
    front.position.set(3.5, 0.55, -4.5); front.material = deskMat
    const frontTop = MeshBuilder.CreateBox('rcpFT', { width: 3.7, depth: 0.8, height: 0.06 }, this.scene)
    frontTop.position.set(3.5, 1.13, -4.5); frontTop.material = topMat

    const side = MeshBuilder.CreateBox('rcpS', { width: 0.7, depth: 2.0, height: 1.1 }, this.scene)
    side.position.set(5.15, 0.55, -3.35); side.material = deskMat
    const sideTop = MeshBuilder.CreateBox('rcpST', { width: 0.8, depth: 2.1, height: 0.06 }, this.scene)
    sideTop.position.set(5.15, 1.13, -3.35); sideTop.material = topMat

    this._monitor(3.0, -4.8, 0)
    this._monitor(4.2, -4.8, 0)
    this._chair(3.5, -3.8, t.primary)

    const signTex = new DynamicTexture('rcpTex', { width: 256, height: 48 }, this.scene, true)
    const ctx = signTex.getContext() as unknown as CanvasRenderingContext2D
    ctx.fillStyle = t.accent; ctx.fillRect(0, 0, 256, 48)
    ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 28px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('RECEPTION', 128, 35)
    signTex.update()
    const signMat = new StandardMaterial('rcpSignMat', this.scene)
    signMat.disableLighting = true; signMat.emissiveTexture = signTex; signMat.emissiveColor = Color3.White()
    const signP = MeshBuilder.CreatePlane('rcpSign', { width: 1.8, height: 0.3 }, this.scene)
    signP.position.set(3.5, 0.70, -4.86); signP.material = signMat
  }

  // ── Workstations ─────────────────────────────────────────────────────────

  private _buildWorkstations(): void {
    const t = this._t
    const deskMat = this._mat('#E8E0D4')
    const legMat = this._mat('#888888')

    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 3; col++) {
        const x = -5.0 + col * 3.0
        const z = 1.5 + row * 2.8

        const desk = MeshBuilder.CreateBox('desk' + row + col, { width: 2.2, depth: 1.0, height: 0.06 }, this.scene)
        desk.position.set(x, 0.78, z); desk.material = deskMat

        for (const [lx, lz] of [[-0.95, -0.40], [0.95, -0.40], [-0.95, 0.40], [0.95, 0.40]]) {
          const leg = MeshBuilder.CreateBox('dl', { width: 0.05, depth: 0.05, height: 0.76 }, this.scene)
          leg.position.set(x + lx, 0.38, z + lz); leg.material = legMat
        }

        this._monitor(x - 0.45, z + 0.25, Math.PI)
        this._monitor(x + 0.45, z + 0.25, Math.PI)

        const kb = MeshBuilder.CreateBox('kb', { width: 0.6, depth: 0.2, height: 0.02 }, this.scene)
        kb.position.set(x, 0.82, z - 0.15); kb.material = this._mat('#333333')

        this._chair(x, z - 0.8, t.primary)
      }
    }
  }

  private _monitor(x: number, z: number, rotY: number): void {
    const monMat = this._mat('#2A2A2A')
    const base = MeshBuilder.CreateCylinder('mbase', { height: 0.03, diameter: 0.22, tessellation: 12 }, this.scene)
    base.position.set(x, 0.82, z); base.material = monMat
    const pole = MeshBuilder.CreateCylinder('mpole', { height: 0.22, diameter: 0.04 }, this.scene)
    pole.position.set(x, 0.94, z); pole.material = monMat
    const screen = MeshBuilder.CreateBox('mscr', { width: 0.55, depth: 0.03, height: 0.38 }, this.scene)
    screen.position.set(x, 1.25, z); screen.rotation.y = rotY; screen.material = monMat
    const face = MeshBuilder.CreatePlane('msf', { width: 0.50, height: 0.33 }, this.scene)
    face.position.set(x, 1.25, z + (rotY === 0 ? -0.02 : 0.02))
    face.rotation.y = rotY; face.material = this._flatMat(this._t.primary)
  }

  private _chair(x: number, z: number, colorHex: string): void {
    const mat = this._mat(colorHex)
    const legMat = this._mat('#666666')
    const seat = MeshBuilder.CreateBox('cs', { width: 0.55, depth: 0.55, height: 0.06 }, this.scene)
    seat.position.set(x, 0.50, z); seat.material = mat
    const bk = MeshBuilder.CreateBox('cb', { width: 0.55, depth: 0.06, height: 0.50 }, this.scene)
    bk.position.set(x, 0.80, z + 0.28); bk.material = mat
    const pl = MeshBuilder.CreateCylinder('cp', { height: 0.46, diameter: 0.05 }, this.scene)
    pl.position.set(x, 0.24, z); pl.material = legMat
    const bs = MeshBuilder.CreateCylinder('cbs', { height: 0.03, diameter: 0.38, tessellation: 12 }, this.scene)
    bs.position.set(x, 0.02, z); bs.material = legMat
  }

  // ── Meeting room (back-left) ─────────────────────────────────────────────

  private _buildMeetingRoom(): void {
    const t = this._t

    const tableMat = this._mat(t.accent)
    const table = MeshBuilder.CreateBox('mtbl', { width: 3.0, depth: 1.4, height: 0.06 }, this.scene)
    table.position.set(-4.8, 0.78, -3.0); table.material = tableMat
    const legMat = this._mat('#555555')
    for (const [lx, lz] of [[-1.35, -0.55], [1.35, -0.55], [-1.35, 0.55], [1.35, 0.55]]) {
      const leg = MeshBuilder.CreateBox('mtl', { width: 0.06, depth: 0.06, height: 0.76 }, this.scene)
      leg.position.set(-4.8 + lx, 0.38, -3.0 + lz); leg.material = legMat
    }

    this._chair(-5.6, -3.0, t.primary)
    this._chair(-4.0, -3.0, t.primary)
    this._chair(-4.8, -2.0, t.primary)
    this._chair(-4.8, -4.0, t.primary)

    // TV screen on left wall for meeting room
    const tvMat = this._mat('#1A1A1A')
    const tv = MeshBuilder.CreateBox('mtv', { width: 0.06, depth: 2.8, height: 1.6 }, this.scene)
    tv.position.set(-RW / 2 + 0.06, 2.0, -3.0); tv.material = tvMat
    const tvFace = MeshBuilder.CreatePlane('mtvf', { width: 2.6, height: 1.4 }, this.scene)
    tvFace.position.set(-RW / 2 + 0.04, 2.0, -3.0)
    tvFace.rotation.y = Math.PI / 2; tvFace.material = this._flatMat(t.primary)
  }

  // (industry routing moved to constructor switch)

  // ── Full industrial interior for Dangote ──────────────────────────────────

  private _buildIndustrialInterior(): void {
    const steelMat = this._mat('#888888')
    const darkSteelMat = this._mat('#555555')
    const yellowMat = this._flatMat('#FFD700')
    const warnMat = this._flatMat('#FFA500')

    // ── Cement silos (back wall, 3 tall cylinders) ──────────────────────
    for (let i = 0; i < 3; i++) {
      const sx = -4.5 + i * 3.0
      // Silo body
      const silo = MeshBuilder.CreateCylinder('silo' + i,
        { height: 2.8, diameter: 1.6, tessellation: 16 }, this.scene)
      silo.position.set(sx, 1.4, RD / 2 - 1.2); silo.material = this._mat('#B0A898')
      // Cone top
      const cone = MeshBuilder.CreateCylinder('silotop' + i,
        { height: 0.6, diameterTop: 0.0, diameterBottom: 1.6, tessellation: 16 }, this.scene)
      cone.position.set(sx, 3.1, RD / 2 - 1.2); cone.material = this._mat('#A09888')
      // Support ring
      const ring = MeshBuilder.CreateTorus('siloring' + i,
        { diameter: 1.7, thickness: 0.08, tessellation: 20 }, this.scene)
      ring.position.set(sx, 1.8, RD / 2 - 1.2); ring.material = steelMat
      // Level indicator strip
      const fill = MeshBuilder.CreateBox('silofill' + i,
        { width: 0.12, depth: 0.04, height: 1.4 + i * 0.4 }, this.scene)
      fill.position.set(sx + 0.75, 0.7 + (1.4 + i * 0.4) / 2, RD / 2 - 1.2)
      fill.material = this._flatMat(i === 0 ? '#FF4444' : i === 1 ? '#FFAA00' : '#44CC44')
      // Label
      const labelTex = new DynamicTexture('siloLbl' + i, { width: 128, height: 40 }, this.scene, true)
      const lctx = labelTex.getContext() as unknown as CanvasRenderingContext2D
      lctx.fillStyle = '#003366'; lctx.fillRect(0, 0, 128, 40)
      lctx.fillStyle = '#FFFFFF'; lctx.font = 'bold 18px sans-serif'; lctx.textAlign = 'center'
      lctx.fillText(['OPC 42.5', 'OPC 32.5', 'BLC'][i], 64, 28)
      labelTex.update()
      const lmat = new StandardMaterial('siloLblM' + i, this.scene)
      lmat.disableLighting = true; lmat.emissiveTexture = labelTex; lmat.emissiveColor = Color3.White()
      const lp = MeshBuilder.CreatePlane('siloLblP' + i, { width: 1.0, height: 0.3 }, this.scene)
      lp.position.set(sx, 0.5, RD / 2 - 2.02); lp.material = lmat
    }

    // ── Conveyor belt (center, diagonal) ───────────────────────────────
    const beltMat = this._mat('#444444')
    const belt = MeshBuilder.CreateBox('convBelt', { width: 10, depth: 1.2, height: 0.20 }, this.scene)
    belt.position.set(0, 0.50, 1.0); belt.material = beltMat
    // Belt surface (rubber)
    const rubber = MeshBuilder.CreateBox('convRubber', { width: 9.6, depth: 1.0, height: 0.04 }, this.scene)
    rubber.position.set(0, 0.61, 1.0); rubber.material = this._flatMat('#333333')
    // Belt legs
    for (const lx of [-4.0, -1.5, 1.5, 4.0]) {
      for (const lz of [0.5, 1.5]) {
        const leg = MeshBuilder.CreateBox('bleg', { width: 0.10, depth: 0.10, height: 0.50 }, this.scene)
        leg.position.set(lx, 0.25, lz); leg.material = steelMat
      }
    }
    // Rollers on belt
    for (let r = 0; r < 8; r++) {
      const roller = MeshBuilder.CreateCylinder('roller' + r,
        { height: 1.0, diameter: 0.12, tessellation: 8 }, this.scene)
      roller.position.set(-3.8 + r * 1.2, 0.48, 1.0)
      roller.rotation.x = Math.PI / 2; roller.material = darkSteelMat
    }

    // ── Cement bags on conveyor + stacked pallets ──────────────────────
    const bagMat = this._mat('#C8B898')
    const bagBrandMat = this._flatMat('#003366')
    // Bags riding the belt
    for (let i = 0; i < 5; i++) {
      const bag = MeshBuilder.CreateBox('cbag' + i,
        { width: 0.7, depth: 0.5, height: 0.30 }, this.scene)
      bag.position.set(-3.5 + i * 1.8, 0.78, 1.0)
      bag.rotation.y = i * 0.15
      bag.material = i % 2 === 0 ? bagMat : bagBrandMat
    }
    // Stacked pallets (right side, 2 tall stacks)
    for (let stack = 0; stack < 2; stack++) {
      const px = 5.0 + stack * 1.6
      // Wooden pallet base
      const pallet = MeshBuilder.CreateBox('pallet' + stack,
        { width: 1.2, depth: 1.0, height: 0.10 }, this.scene)
      pallet.position.set(px, 0.05, -2.5); pallet.material = this._mat('#8B6914')
      // Stack of bags (4 high, 2 wide)
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 2; col++) {
          const sbag = MeshBuilder.CreateBox('sbag' + stack + row + col,
            { width: 0.55, depth: 0.45, height: 0.28 }, this.scene)
          sbag.position.set(px - 0.28 + col * 0.56, 0.24 + row * 0.30, -2.5)
          sbag.material = (row + col) % 3 === 0 ? bagBrandMat : bagMat
        }
      }
    }

    // ── Forklift (left side) ───────────────────────────────────────────
    const forkBody = MeshBuilder.CreateBox('fkBody',
      { width: 1.2, depth: 2.0, height: 0.8 }, this.scene)
    forkBody.position.set(-5.5, 0.6, -3.0); forkBody.material = yellowMat
    // Cab/cage
    const fkCab = MeshBuilder.CreateBox('fkCab',
      { width: 1.0, depth: 0.8, height: 1.0 }, this.scene)
    fkCab.position.set(-5.5, 1.3, -3.5); fkCab.material = darkSteelMat
    // Mast
    const mast = MeshBuilder.CreateBox('fkMast',
      { width: 0.10, depth: 0.10, height: 2.0 }, this.scene)
    mast.position.set(-5.5, 1.2, -2.0); mast.material = steelMat
    const mast2 = MeshBuilder.CreateBox('fkMast2',
      { width: 0.10, depth: 0.10, height: 2.0 }, this.scene)
    mast2.position.set(-5.0, 1.2, -2.0); mast2.material = steelMat
    // Forks
    for (const fx of [-5.6, -4.9]) {
      const fork = MeshBuilder.CreateBox('fork',
        { width: 0.12, depth: 1.0, height: 0.05 }, this.scene)
      fork.position.set(fx, 0.22, -1.6); fork.material = steelMat
    }
    // Wheels
    for (const [wx, wz] of [[-5.9, -3.8], [-5.1, -3.8], [-5.9, -2.3], [-5.1, -2.3]]) {
      const wheel = MeshBuilder.CreateCylinder('fkwh',
        { height: 0.15, diameter: 0.35, tessellation: 12 }, this.scene)
      wheel.position.set(wx, 0.18, wz)
      wheel.rotation.z = Math.PI / 2; wheel.material = this._mat('#1A1A1A')
    }

    // ── Quality control station ────────────────────────────────────────
    const qcDeskMat = this._mat('#E8E0D4')
    const qcDesk = MeshBuilder.CreateBox('qcDesk',
      { width: 2.0, depth: 0.8, height: 0.06 }, this.scene)
    qcDesk.position.set(-5.0, 0.78, 3.5); qcDesk.material = qcDeskMat
    for (const [lx, lz] of [[-0.85, -0.30], [0.85, -0.30], [-0.85, 0.30], [0.85, 0.30]]) {
      const leg = MeshBuilder.CreateBox('qcl', { width: 0.05, depth: 0.05, height: 0.76 }, this.scene)
      leg.position.set(-5.0 + lx, 0.38, 3.5 + lz); leg.material = steelMat
    }
    this._monitor(-5.3, 3.8, Math.PI)
    this._chair(-5.0, 2.7, '#003366')
    // Test tubes/beakers
    for (let i = 0; i < 4; i++) {
      const tube = MeshBuilder.CreateCylinder('tube' + i,
        { height: 0.25, diameterTop: 0.06, diameterBottom: 0.08, tessellation: 8 }, this.scene)
      tube.position.set(-4.3 + i * 0.18, 0.94, 3.5)
      tube.material = this._flatMat(i % 2 === 0 ? '#88BBDD' : '#AADDAA')
    }
    // "QUALITY CONTROL" sign on left wall
    const qcTex = new DynamicTexture('qcTex', { width: 384, height: 56 }, this.scene, true)
    const qcCtx = qcTex.getContext() as unknown as CanvasRenderingContext2D
    qcCtx.fillStyle = '#003366'; qcCtx.fillRect(0, 0, 384, 56)
    qcCtx.fillStyle = '#FFD700'; qcCtx.font = 'bold 28px sans-serif'; qcCtx.textAlign = 'center'
    qcCtx.fillText('⚗ QUALITY CONTROL', 192, 40)
    qcTex.update()
    const qcSignMat = new StandardMaterial('qcSM', this.scene)
    qcSignMat.disableLighting = true; qcSignMat.emissiveTexture = qcTex; qcSignMat.emissiveColor = Color3.White()
    const qcSign = MeshBuilder.CreatePlane('qcSign', { width: 2.8, height: 0.4 }, this.scene)
    qcSign.position.set(-RW / 2 + 0.04, 2.4, 3.5)
    qcSign.rotation.y = Math.PI / 2; qcSign.material = qcSignMat

    // ── Safety equipment (hard hats, vest rack) ────────────────────────
    // Hard hat rack near entrance
    const rackBoard = MeshBuilder.CreateBox('hhRack',
      { width: 0.12, depth: 1.8, height: 1.2 }, this.scene)
    rackBoard.position.set(-RW / 2 + 0.12, 1.4, -4.5); rackBoard.material = this._mat('#AA8844')
    const hatColors = ['#FFD700', '#FF6600', '#FFFFFF']
    for (let i = 0; i < 3; i++) {
      const hat = MeshBuilder.CreateCylinder('hat' + i,
        { height: 0.12, diameterTop: 0.30, diameterBottom: 0.35, tessellation: 12 }, this.scene)
      hat.position.set(-RW / 2 + 0.20, 1.7, -5.1 + i * 0.6); hat.material = this._flatMat(hatColors[i])
    }

    // High-vis vests on pegs
    for (let i = 0; i < 2; i++) {
      const vest = MeshBuilder.CreateBox('vest' + i,
        { width: 0.05, depth: 0.30, height: 0.45 }, this.scene)
      vest.position.set(-RW / 2 + 0.18, 1.1, -4.8 + i * 0.6); vest.material = warnMat
    }

    // ── Warning signs & safety board ───────────────────────────────────
    // "SAFETY FIRST" sign on back wall
    const sfTex = new DynamicTexture('sfTex', { width: 300, height: 100 }, this.scene, true)
    const sfCtx = sfTex.getContext() as unknown as CanvasRenderingContext2D
    sfCtx.fillStyle = '#FFD700'; sfCtx.fillRect(0, 0, 300, 100)
    sfCtx.fillStyle = '#000000'; sfCtx.font = 'bold 36px sans-serif'; sfCtx.textAlign = 'center'
    sfCtx.fillText('⚠ SAFETY FIRST', 150, 45)
    sfCtx.font = '16px sans-serif'
    sfCtx.fillText('0 Days Without Incident', 150, 78)
    sfTex.update()
    const sfMat = new StandardMaterial('sfMat', this.scene)
    sfMat.disableLighting = true; sfMat.emissiveTexture = sfTex; sfMat.emissiveColor = Color3.White()
    const sfSign = MeshBuilder.CreatePlane('sfSign', { width: 2.0, height: 0.65 }, this.scene)
    sfSign.position.set(-3.5, 2.8, RD / 2 - 0.08); sfSign.material = sfMat

    // Hazard stripes on floor near conveyor
    const hazMat = this._flatMat('#FFD700')
    for (let i = 0; i < 6; i++) {
      const stripe = MeshBuilder.CreateBox('haz' + i,
        { width: 0.15, depth: 1.8, height: 0.075 }, this.scene)
      stripe.position.set(-3.5 + i * 1.5, 0.04, -0.5)
      stripe.material = i % 2 === 0 ? hazMat : this._flatMat('#222222')
    }

    // ── Production dashboard (back wall, right side) ───────────────────
    this._buildDashboard('Production Output', [
      { label: 'Cement (MT)', value: '29.3M' },
      { label: 'Capacity', value: '87%' },
      { label: 'Factories', value: '14' },
    ], [80, 65, 90, 55, 75, 95, 60, 85, 70, 100, 88, 92])

    // ── Dangote logo on back wall ──────────────────────────────────────
    this._buildLogo()
    this._buildNameSign()

    // ── Barrel / oil drums (right back corner) ─────────────────────────
    const drumColors = ['#003366', '#444444', '#003366']
    for (let i = 0; i < 3; i++) {
      const drum = MeshBuilder.CreateCylinder('drum' + i,
        { height: 0.9, diameter: 0.55, tessellation: 12 }, this.scene)
      drum.position.set(6.0, 0.45, 3.5 + i * 0.65); drum.material = this._mat(drumColors[i])
      // Drum ring
      const dring = MeshBuilder.CreateTorus('dring' + i,
        { diameter: 0.56, thickness: 0.03, tessellation: 12 }, this.scene)
      dring.position.set(6.0, 0.7, 3.5 + i * 0.65); dring.material = steelMat
    }
  }

  // ── MTN: Customer service center ──────────────────────────────────────────

  private _buildTelecomInterior(): void {
    const steelMat = this._mat('#888888')

    // ── Service counters (4 booths along back wall) ────────────────────
    const counterMat = this._mat('#003366')
    const topMat = this._mat('#E8E0D4')
    for (let i = 0; i < 4; i++) {
      const cx = -4.5 + i * 3.2
      // Counter body
      const counter = MeshBuilder.CreateBox('cnt' + i,
        { width: 2.4, depth: 0.8, height: 1.1 }, this.scene)
      counter.position.set(cx, 0.55, RD / 2 - 1.5); counter.material = counterMat
      // Counter top
      const cTop = MeshBuilder.CreateBox('cntT' + i,
        { width: 2.5, depth: 0.9, height: 0.06 }, this.scene)
      cTop.position.set(cx, 1.13, RD / 2 - 1.5); cTop.material = topMat
      // Glass partition
      const glassMat = new StandardMaterial('cntGlass' + i, this.scene)
      glassMat.diffuseColor = new Color3(0.85, 0.90, 0.95); glassMat.alpha = 0.3
      const glass = MeshBuilder.CreateBox('cntG' + i,
        { width: 2.2, depth: 0.04, height: 1.0 }, this.scene)
      glass.position.set(cx, 1.65, RD / 2 - 1.2); glass.material = glassMat
      // Speaking slot
      const slot = MeshBuilder.CreateBox('cntSlot' + i,
        { width: 0.8, depth: 0.06, height: 0.15 }, this.scene)
      slot.position.set(cx, 1.30, RD / 2 - 1.2); slot.material = this._mat('#333333')
      // Monitor behind counter
      this._monitor(cx, RD / 2 - 2.0, Math.PI)
      // Staff chair
      this._chair(cx, RD / 2 - 2.8, '#FFCC00')
      // Counter number
      const numTex = new DynamicTexture('cntNum' + i, { width: 64, height: 64 }, this.scene, true)
      const nctx = numTex.getContext() as unknown as CanvasRenderingContext2D
      nctx.fillStyle = '#FFCC00'; nctx.fillRect(0, 0, 64, 64)
      nctx.fillStyle = '#003366'; nctx.font = 'bold 40px sans-serif'; nctx.textAlign = 'center'
      nctx.fillText(String(i + 1), 32, 48)
      numTex.update()
      const numMat = new StandardMaterial('cntNM' + i, this.scene)
      numMat.disableLighting = true; numMat.emissiveTexture = numTex; numMat.emissiveColor = Color3.White()
      const numP = MeshBuilder.CreatePlane('cntNP' + i, { width: 0.4, height: 0.4 }, this.scene)
      numP.position.set(cx, 2.3, RD / 2 - 1.18); numP.material = numMat
    }

    // ── Ticket/queue machine (entrance area) ──────────────────────────
    const ticketMat = this._flatMat('#FFCC00')
    const machine = MeshBuilder.CreateBox('tktMachine',
      { width: 0.5, depth: 0.4, height: 1.3 }, this.scene)
    machine.position.set(5.5, 0.65, -4.5); machine.material = ticketMat
    // Pole stand
    const tktPole = MeshBuilder.CreateCylinder('tktPole',
      { height: 0.50, diameter: 0.35, tessellation: 12 }, this.scene)
    tktPole.position.set(5.5, 0.0, -4.5); tktPole.material = steelMat
    // Screen
    const tktScreen = MeshBuilder.CreatePlane('tktScr', { width: 0.35, height: 0.25 }, this.scene)
    tktScreen.position.set(5.5, 1.05, -4.72); tktScreen.material = this._flatMat('#003366')
    // "TAKE A TICKET" label
    const tktTex = new DynamicTexture('tktTex', { width: 200, height: 48 }, this.scene, true)
    const tctx = tktTex.getContext() as unknown as CanvasRenderingContext2D
    tctx.fillStyle = '#003366'; tctx.fillRect(0, 0, 200, 48)
    tctx.fillStyle = '#FFFFFF'; tctx.font = 'bold 16px sans-serif'; tctx.textAlign = 'center'
    tctx.fillText('TAKE A TICKET', 100, 32)
    tktTex.update()
    const tktLblMat = new StandardMaterial('tktLM', this.scene)
    tktLblMat.disableLighting = true; tktLblMat.emissiveTexture = tktTex; tktLblMat.emissiveColor = Color3.White()
    const tktLbl = MeshBuilder.CreatePlane('tktLbl', { width: 0.45, height: 0.12 }, this.scene)
    tktLbl.position.set(5.5, 0.80, -4.72); tktLbl.material = tktLblMat

    // ── Waiting area (rows of chairs) ─────────────────────────────────
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 5; col++) {
        const sx = -4.5 + col * 2.2
        const sz = -1.5 - row * 1.4
        const seatMat = this._mat(col % 2 === 0 ? '#FFCC00' : '#003366')
        // Seat
        const seat = MeshBuilder.CreateBox('wseat' + row + col,
          { width: 0.50, depth: 0.50, height: 0.06 }, this.scene)
        seat.position.set(sx, 0.42, sz); seat.material = seatMat
        // Back
        const back = MeshBuilder.CreateBox('wback' + row + col,
          { width: 0.50, depth: 0.06, height: 0.40 }, this.scene)
        back.position.set(sx, 0.68, sz + 0.25); back.material = seatMat
        // Legs
        const legMat = this._mat('#AAAAAA')
        for (const [lx, lz] of [[-0.20, -0.20], [0.20, -0.20], [-0.20, 0.20], [0.20, 0.20]]) {
          const leg = MeshBuilder.CreateCylinder('wleg', { height: 0.38, diameter: 0.03 }, this.scene)
          leg.position.set(sx + lx, 0.20, sz + lz); leg.material = legMat
        }
      }
    }

    // ── Phone/device display case (left wall) ─────────────────────────
    const caseMat = this._mat('#222222')
    const displayCase = MeshBuilder.CreateBox('phoneCase',
      { width: 0.15, depth: 4.5, height: 1.6 }, this.scene)
    displayCase.position.set(-RW / 2 + 0.15, 0.95, 1.0); displayCase.material = caseMat

    // Glass front
    const dcGlass = new StandardMaterial('dcGlass', this.scene)
    dcGlass.diffuseColor = new Color3(0.85, 0.90, 0.95); dcGlass.alpha = 0.25
    const dcFront = MeshBuilder.CreateBox('dcFront',
      { width: 0.03, depth: 4.3, height: 1.4 }, this.scene)
    dcFront.position.set(-RW / 2 + 0.30, 0.95, 1.0); dcFront.material = dcGlass

    // Phones on shelves (3 shelves, 4 phones each)
    for (let shelf = 0; shelf < 3; shelf++) {
      const shelfPlate = MeshBuilder.CreateBox('dcShelf' + shelf,
        { width: 0.14, depth: 4.3, height: 0.03 }, this.scene)
      shelfPlate.position.set(-RW / 2 + 0.15, 0.45 + shelf * 0.5, 1.0); shelfPlate.material = steelMat
      for (let p = 0; p < 4; p++) {
        const phone = MeshBuilder.CreateBox('phone' + shelf + p,
          { width: 0.04, depth: 0.15, height: 0.28 }, this.scene)
        phone.position.set(-RW / 2 + 0.20, 0.60 + shelf * 0.5, -0.5 + p * 1.0)
        phone.material = this._mat(p % 2 === 0 ? '#1A1A1A' : '#FFCC00')
      }
    }
    // "DEVICES" sign
    const devTex = new DynamicTexture('devTex', { width: 256, height: 48 }, this.scene, true)
    const dvctx = devTex.getContext() as unknown as CanvasRenderingContext2D
    dvctx.fillStyle = '#FFCC00'; dvctx.fillRect(0, 0, 256, 48)
    dvctx.fillStyle = '#003366'; dvctx.font = 'bold 24px sans-serif'; dvctx.textAlign = 'center'
    dvctx.fillText('📱 DEVICES', 128, 34)
    devTex.update()
    const devMat = new StandardMaterial('devM', this.scene)
    devMat.disableLighting = true; devMat.emissiveTexture = devTex; devMat.emissiveColor = Color3.White()
    const devSign = MeshBuilder.CreatePlane('devSign', { width: 1.8, height: 0.34 }, this.scene)
    devSign.position.set(-RW / 2 + 0.04, 2.2, 1.0)
    devSign.rotation.y = Math.PI / 2; devSign.material = devMat

    // ── SIM registration desk (right side) ────────────────────────────
    const simDeskMat = this._mat('#FFCC00')
    const simDesk = MeshBuilder.CreateBox('simDesk',
      { width: 2.0, depth: 0.8, height: 0.85 }, this.scene)
    simDesk.position.set(5.5, 0.43, 0); simDesk.material = simDeskMat
    this._monitor(5.5, 0.4, Math.PI)
    // SIM packs on desk
    const simColors = ['#FFCC00', '#0033A0', '#00AA44']
    for (let i = 0; i < 6; i++) {
      const sim = MeshBuilder.CreateBox('simPk' + i,
        { width: 0.22, depth: 0.14, height: 0.03 }, this.scene)
      sim.position.set(5.0 + (i % 3) * 0.35, 0.88, -0.15 + Math.floor(i / 3) * 0.25)
      sim.material = this._flatMat(simColors[i % 3])
    }
    // "SIM REGISTRATION" sign
    const simTex = new DynamicTexture('simTex', { width: 256, height: 48 }, this.scene, true)
    const sctx = simTex.getContext() as unknown as CanvasRenderingContext2D
    sctx.fillStyle = '#003366'; sctx.fillRect(0, 0, 256, 48)
    sctx.fillStyle = '#FFCC00'; sctx.font = 'bold 20px sans-serif'; sctx.textAlign = 'center'
    sctx.fillText('SIM REGISTRATION', 128, 34)
    simTex.update()
    const simSMat = new StandardMaterial('simSM', this.scene)
    simSMat.disableLighting = true; simSMat.emissiveTexture = simTex; simSMat.emissiveColor = Color3.White()
    const simSign = MeshBuilder.CreatePlane('simSign', { width: 1.6, height: 0.3 }, this.scene)
    simSign.position.set(5.5, 1.6, -0.42); simSign.material = simSMat

    // ── Queue number display (above counters on back wall) ────────────
    const qTex = new DynamicTexture('qTex', { width: 512, height: 128 }, this.scene, true)
    const qctx = qTex.getContext() as unknown as CanvasRenderingContext2D
    qctx.fillStyle = '#002244'; qctx.fillRect(0, 0, 512, 128)
    qctx.fillStyle = '#FFCC00'; qctx.font = 'bold 20px sans-serif'; qctx.textAlign = 'center'
    qctx.fillText('NOW SERVING', 256, 30)
    qctx.font = 'bold 56px sans-serif'
    qctx.fillText('A - 047', 140, 95)
    qctx.fillText('B - 023', 380, 95)
    qctx.fillStyle = '#FFFFFF'; qctx.font = '14px sans-serif'
    qctx.fillText('Counter 1-2', 140, 118); qctx.fillText('Counter 3-4', 380, 118)
    qTex.update()
    const qMat = new StandardMaterial('qMat', this.scene)
    qMat.disableLighting = true; qMat.emissiveTexture = qTex; qMat.emissiveColor = Color3.White()
    const qBoard = MeshBuilder.CreatePlane('qBoard', { width: 5.0, height: 1.2 }, this.scene)
    qBoard.position.set(0, 3.0, RD / 2 - 0.08); qBoard.material = qMat
    const qFrame = MeshBuilder.CreateBox('qFrame',
      { width: 5.2, depth: 0.06, height: 1.3 }, this.scene)
    qFrame.position.set(0, 3.0, RD / 2 - 0.04); qFrame.material = this._mat('#111111')

    // Logo + name
    this._buildLogo()
    this._buildNameSign()
  }

  // ── Twedot: Cyber home / tech lounge ────────────────────────────────────

  private _buildCyberHomeInterior(): void {
    // ── Neon-lit floor (dark base with glow strips) ───────────────────
    const glowPurple = this._flatMat('#7C3AED')
    const glowTeal = this._flatMat('#14B8A6')
    const darkFloor = this._flatMat('#1A1028')

    // Dark floor overlay
    const dkFloor = MeshBuilder.CreateBox('dkFloor',
      { width: RW - 0.5, depth: RD - 0.5, height: 0.075 }, this.scene)
    dkFloor.position.y = 0.04; dkFloor.material = darkFloor; dkFloor.isPickable = false

    // Neon floor strips
    for (let i = 0; i < 6; i++) {
      const strip = MeshBuilder.CreateBox('nStrip' + i,
        { width: RW - 1, depth: 0.06, height: 0.08 }, this.scene)
      strip.position.set(0, 0.05, -RD / 2 + 2 + i * 2)
      strip.material = i % 2 === 0 ? glowPurple : glowTeal
      strip.isPickable = false
    }

    // ── Giant screen wall (back wall — live feed) ─────────────────────
    const feedTex = new DynamicTexture('feedTex', { width: 640, height: 400 }, this.scene, true)
    const ctx = feedTex.getContext() as unknown as CanvasRenderingContext2D
    ctx.fillStyle = '#0D0818'; ctx.fillRect(0, 0, 640, 400)

    // Animated-look gradient bg
    const grad = ctx.createLinearGradient(0, 0, 640, 400)
    grad.addColorStop(0, '#1A0A30'); grad.addColorStop(0.5, '#2D1050'); grad.addColorStop(1, '#0A1828')
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 640, 400)

    // "TWEDOT" big title
    ctx.fillStyle = '#7C3AED'; ctx.font = 'bold 60px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('TWEDOT', 320, 75)
    ctx.fillStyle = '#14B8A6'; ctx.font = '18px sans-serif'
    ctx.fillText('Connect · Share · Earn', 320, 105)

    // Live stats ticker
    ctx.fillStyle = 'rgba(124,58,237,0.3)'; ctx.fillRect(20, 125, 600, 50)
    ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 16px sans-serif'
    ctx.fillText('🟢 12,847 ONLINE', 160, 155)
    ctx.fillText('📱 1.2M POSTS TODAY', 360, 155)
    ctx.fillText('💰 ₦8.4M EARNED', 540, 155)

    // Feed cards
    const cards = [
      { user: 'CyberKing', msg: 'Building the future 🚀', likes: '2.4K' },
      { user: 'LagosVibes', msg: 'New music video dropped! 🎬', likes: '5.1K' },
      { user: 'TechQueen', msg: 'Crypto portfolio up 200% 📈', likes: '890' },
    ]
    cards.forEach((c, i) => {
      const y = 195 + i * 65
      ctx.fillStyle = 'rgba(45,16,80,0.7)'; ctx.fillRect(30, y, 580, 55)
      ctx.fillStyle = '#14B8A6'; ctx.beginPath()
      ctx.arc(58, y + 28, 14, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'left'
      ctx.fillText(c.user, 80, y + 22)
      ctx.fillStyle = '#CCBBEE'; ctx.font = '12px sans-serif'
      ctx.fillText(c.msg, 80, y + 42)
      ctx.fillStyle = '#FF6B9D'; ctx.textAlign = 'right'
      ctx.fillText('❤ ' + c.likes, 596, y + 22); ctx.textAlign = 'left'
    })

    feedTex.update()
    const feedMat = new StandardMaterial('feedMat', this.scene)
    feedMat.disableLighting = true; feedMat.emissiveTexture = feedTex; feedMat.emissiveColor = Color3.White()

    // Full-width screen
    const screenFrame = MeshBuilder.CreateBox('bigScr',
      { width: RW - 1, depth: 0.08, height: 3.0 }, this.scene)
    screenFrame.position.set(0, 1.8, RD / 2 - 0.06); screenFrame.material = this._mat('#111111')
    const screenFace = MeshBuilder.CreatePlane('bigScrF',
      { width: RW - 1.5, height: 2.7 }, this.scene)
    screenFace.position.set(0, 1.8, RD / 2 - 0.12); screenFace.material = feedMat

    // ── Gaming/browsing pods (6 stations in 2 rows) ───────────────────
    const deskMat = this._mat('#2D2040')
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 3; col++) {
        const px = -4.5 + col * 3.5
        const pz = -1.0 - row * 3.0
        // Pod desk (curved front)
        const desk = MeshBuilder.CreateBox('pod' + row + col,
          { width: 1.8, depth: 0.9, height: 0.06 }, this.scene)
        desk.position.set(px, 0.72, pz); desk.material = deskMat
        // Desk legs
        for (const [lx, lz] of [[-0.75, -0.35], [0.75, -0.35], [-0.75, 0.35], [0.75, 0.35]]) {
          const leg = MeshBuilder.CreateBox('pdl', { width: 0.04, depth: 0.04, height: 0.70 }, this.scene)
          leg.position.set(px + lx, 0.36, pz + lz); leg.material = this._mat('#333333')
        }
        // Widescreen monitor
        const monBody = MeshBuilder.CreateBox('pmon' + row + col,
          { width: 0.80, depth: 0.03, height: 0.50 }, this.scene)
        monBody.position.set(px, 1.25, pz + 0.30); monBody.material = this._mat('#111111')
        const monFace = MeshBuilder.CreatePlane('pmf' + row + col, { width: 0.75, height: 0.45 }, this.scene)
        monFace.position.set(px, 1.25, pz + 0.28)
        monFace.material = this._flatMat(row === 0 && col === 1 ? '#14B8A6' : '#7C3AED')
        // Monitor stand
        const mstand = MeshBuilder.CreateCylinder('pms', { height: 0.20, diameter: 0.04 }, this.scene)
        mstand.position.set(px, 0.88, pz + 0.30); mstand.material = this._mat('#222222')
        const mbase = MeshBuilder.CreateCylinder('pmb', { height: 0.03, diameter: 0.22, tessellation: 10 }, this.scene)
        mbase.position.set(px, 0.77, pz + 0.30); mbase.material = this._mat('#222222')
        // RGB keyboard
        const kb = MeshBuilder.CreateBox('pkb', { width: 0.55, depth: 0.18, height: 0.02 }, this.scene)
        kb.position.set(px, 0.76, pz - 0.10)
        kb.material = this._flatMat(col === 0 ? '#FF006620' : col === 1 ? '#00FF6620' : '#0066FF20')
        // Gaming mouse
        const mouse = MeshBuilder.CreateBox('pmouse', { width: 0.08, depth: 0.12, height: 0.03 }, this.scene)
        mouse.position.set(px + 0.55, 0.76, pz - 0.10); mouse.material = this._mat('#1A1A1A')
        // RGB gaming chair
        const chairColor = ['#FF0066', '#00FF88', '#0088FF'][col]
        const cseat = MeshBuilder.CreateBox('gcseat', { width: 0.55, depth: 0.55, height: 0.08 }, this.scene)
        cseat.position.set(px, 0.44, pz - 0.7); cseat.material = this._mat('#1A1A1A')
        const cback = MeshBuilder.CreateBox('gcback', { width: 0.55, depth: 0.06, height: 0.65 }, this.scene)
        cback.position.set(px, 0.80, pz - 0.95); cback.material = this._mat('#1A1A1A')
        // RGB accent strip on chair back
        const cStrip = MeshBuilder.CreateBox('gcStrip', { width: 0.08, depth: 0.04, height: 0.50 }, this.scene)
        cStrip.position.set(px, 0.80, pz - 0.97); cStrip.material = this._flatMat(chairColor)
        const cpole = MeshBuilder.CreateCylinder('gcp', { height: 0.40, diameter: 0.05 }, this.scene)
        cpole.position.set(px, 0.22, pz - 0.7); cpole.material = this._mat('#444444')
      }
    }

    // ── Neon wall strips (left wall) ──────────────────────────────────
    for (let i = 0; i < 4; i++) {
      const neon = MeshBuilder.CreateBox('wNeon' + i,
        { width: 0.04, depth: 0.08, height: 0.08 }, this.scene)
      neon.position.set(-RW / 2 + 0.04, 1.0 + i * 0.7, -2.0 + i * 1.5)
      neon.material = i % 2 === 0 ? glowPurple : glowTeal
    }
    // Long horizontal neon on left wall
    const hNeon = MeshBuilder.CreateBox('hNeon',
      { width: 0.04, depth: RD - 2, height: 0.06 }, this.scene)
    hNeon.position.set(-RW / 2 + 0.04, 2.8, 0); hNeon.material = glowPurple
    const hNeon2 = MeshBuilder.CreateBox('hNeon2',
      { width: 0.04, depth: RD - 2, height: 0.06 }, this.scene)
    hNeon2.position.set(-RW / 2 + 0.04, 0.25, 0); hNeon2.material = glowTeal

    // ── Vending / snack machine (right side) ──────────────────────────
    const vendMat = this._mat('#2D1050')
    const vend = MeshBuilder.CreateBox('vend',
      { width: 0.8, depth: 0.6, height: 1.8 }, this.scene)
    vend.position.set(6.2, 0.90, -2.0); vend.material = vendMat
    // Vending screen
    const vScreen = MeshBuilder.CreatePlane('vScr', { width: 0.6, height: 0.5 }, this.scene)
    vScreen.position.set(6.2, 1.3, -2.32); vScreen.material = this._flatMat('#14B8A6')
    // Snack slots
    for (let r = 0; r < 3; r++) {
      const slotRow = MeshBuilder.CreateBox('vSlot' + r,
        { width: 0.65, depth: 0.04, height: 0.03 }, this.scene)
      slotRow.position.set(6.2, 0.35 + r * 0.25, -2.30); slotRow.material = this._mat('#444444')
    }

    // ── Server rack (right back corner, blinking LEDs) ────────────────
    const rackMat = this._mat('#111111')
    const rack = MeshBuilder.CreateBox('rack',
      { width: 0.6, depth: 0.5, height: 2.4 }, this.scene)
    rack.position.set(6.2, 1.2, 3.5); rack.material = rackMat
    for (let j = 0; j < 8; j++) {
      const led = MeshBuilder.CreateBox('led' + j,
        { width: 0.04, depth: 0.02, height: 0.04 }, this.scene)
      led.position.set(6.2 - 0.15 + (j % 4) * 0.10, 0.5 + Math.floor(j / 4) * 0.8, 3.23)
      led.material = this._flatMat(j % 3 === 0 ? '#FF0066' : j % 3 === 1 ? '#00FF88' : '#7C3AED')
    }

    // Logo + name
    this._buildLogo()
  }

  // ── Jumia: Shopping mall ────────────────────────────────────────────────

  private _buildShoppingMallInterior(): void {
    // ── Product shelving aisles (3 aisles) ────────────────────────────
    const shelfMat = this._mat('#E8E0D4')
    const shelfFrameMat = this._mat('#8B8178')

    for (let aisle = 0; aisle < 3; aisle++) {
      const az = -1.0 + aisle * 3.2
      // Shelf unit (back-to-back pair)
      for (const side of [-1, 1]) {
        const sx = side * 2.8
        // Shelf frame
        const frame = MeshBuilder.CreateBox('shFrame' + aisle + side,
          { width: 3.5, depth: 0.12, height: 2.2 }, this.scene)
        frame.position.set(sx, 1.10, az); frame.material = shelfFrameMat
        // 4 shelf plates
        for (let s = 0; s < 4; s++) {
          const shelf = MeshBuilder.CreateBox('shPlate' + aisle + side + s,
            { width: 3.5, depth: 0.50, height: 0.03 }, this.scene)
          shelf.position.set(sx, 0.35 + s * 0.55, az + side * 0.28); shelf.material = shelfMat
          // Products on each shelf (colorful boxes)
          const prodColors = ['#F68B1E', '#E74C3C', '#3498DB', '#2ECC71', '#9B59B6', '#F39C12']
          for (let p = 0; p < 6; p++) {
            const prod = MeshBuilder.CreateBox('prod' + aisle + side + s + p,
              { width: 0.35, depth: 0.25, height: 0.22 + Math.random() * 0.12 }, this.scene)
            prod.position.set(sx - 1.3 + p * 0.52, 0.50 + s * 0.55, az + side * 0.28)
            prod.material = this._mat(prodColors[(s + p + aisle) % prodColors.length])
          }
        }
      }
      // Aisle label
      const aisleNames = ['Electronics', 'Fashion', 'Home & Kitchen']
      const aisleTex = new DynamicTexture('aisleTex' + aisle, { width: 256, height: 48 }, this.scene, true)
      const actx = aisleTex.getContext() as unknown as CanvasRenderingContext2D
      actx.fillStyle = '#F68B1E'; actx.fillRect(0, 0, 256, 48)
      actx.fillStyle = '#FFFFFF'; actx.font = 'bold 22px sans-serif'; actx.textAlign = 'center'
      actx.fillText(aisleNames[aisle], 128, 34)
      aisleTex.update()
      const aisleMat = new StandardMaterial('aisleM' + aisle, this.scene)
      aisleMat.disableLighting = true; aisleMat.emissiveTexture = aisleTex; aisleMat.emissiveColor = Color3.White()
      const aisleSign = MeshBuilder.CreatePlane('aisleSign' + aisle, { width: 1.6, height: 0.3 }, this.scene)
      aisleSign.position.set(0, 2.5, az); aisleSign.material = aisleMat
    }

    // ── Checkout counters (front area, 3 lanes) ───────────────────────
    const counterMat = this._mat('#1A1A1A')
    const beltMat = this._mat('#555555')
    for (let i = 0; i < 3; i++) {
      const cx = -4.5 + i * 3.5
      const cz = -4.5
      // Counter body
      const cnt = MeshBuilder.CreateBox('chkCnt' + i,
        { width: 2.4, depth: 0.7, height: 0.85 }, this.scene)
      cnt.position.set(cx, 0.43, cz); cnt.material = counterMat
      // Counter top
      const cTop = MeshBuilder.CreateBox('chkTop' + i,
        { width: 2.5, depth: 0.8, height: 0.04 }, this.scene)
      cTop.position.set(cx, 0.87, cz); cTop.material = this._mat('#E8E0D4')
      // Scanner belt
      const sBelt = MeshBuilder.CreateBox('chkBelt' + i,
        { width: 1.2, depth: 0.3, height: 0.04 }, this.scene)
      sBelt.position.set(cx + 0.3, 0.90, cz - 0.15); sBelt.material = beltMat
      // Cash register / POS terminal
      const pos = MeshBuilder.CreateBox('pos' + i,
        { width: 0.30, depth: 0.25, height: 0.35 }, this.scene)
      pos.position.set(cx - 0.8, 1.05, cz); pos.material = this._mat('#222222')
      const posScr = MeshBuilder.CreatePlane('posScr' + i, { width: 0.25, height: 0.18 }, this.scene)
      posScr.position.set(cx - 0.8, 1.15, cz - 0.13); posScr.material = this._flatMat('#F68B1E')
      // Lane number
      const lnTex = new DynamicTexture('lnTex' + i, { width: 64, height: 64 }, this.scene, true)
      const lctx = lnTex.getContext() as unknown as CanvasRenderingContext2D
      lctx.fillStyle = '#F68B1E'; lctx.fillRect(0, 0, 64, 64)
      lctx.fillStyle = '#FFFFFF'; lctx.font = 'bold 40px sans-serif'; lctx.textAlign = 'center'
      lctx.fillText(String(i + 1), 32, 48)
      lnTex.update()
      const lnMat = new StandardMaterial('lnM' + i, this.scene)
      lnMat.disableLighting = true; lnMat.emissiveTexture = lnTex; lnMat.emissiveColor = Color3.White()
      const lnSign = MeshBuilder.CreatePlane('lnSign' + i, { width: 0.35, height: 0.35 }, this.scene)
      lnSign.position.set(cx, 1.7, cz - 0.36); lnSign.material = lnMat
    }

    // ── Shopping carts (scattered near entrance) ──────────────────────
    const cartMat = this._mat('#AAAAAA')
    for (let i = 0; i < 3; i++) {
      const cartX = 5.0 + i * 0.6
      const cartZ = -5.0
      // Cart basket
      const basket = MeshBuilder.CreateBox('cart' + i,
        { width: 0.5, depth: 0.4, height: 0.35 }, this.scene)
      basket.position.set(cartX, 0.55, cartZ); basket.material = cartMat
      // Handle
      const handle = MeshBuilder.CreateBox('cartH' + i,
        { width: 0.5, depth: 0.04, height: 0.20 }, this.scene)
      handle.position.set(cartX, 0.80, cartZ + 0.20); handle.material = cartMat
      // Wheels
      for (const [wx, wz] of [[-0.18, -0.15], [0.18, -0.15], [-0.18, 0.15], [0.18, 0.15]]) {
        const wh = MeshBuilder.CreateCylinder('cwh', { height: 0.04, diameter: 0.10, tessellation: 8 }, this.scene)
        wh.position.set(cartX + wx, 0.10, cartZ + wz)
        wh.rotation.z = Math.PI / 2; wh.material = this._mat('#333333')
      }
    }

    // ── Promotional banner on back wall ───────────────────────────────
    const promoTex = new DynamicTexture('promoTex', { width: 640, height: 200 }, this.scene, true)
    const pctx = promoTex.getContext() as unknown as CanvasRenderingContext2D
    const pgrad = pctx.createLinearGradient(0, 0, 640, 0)
    pgrad.addColorStop(0, '#F68B1E'); pgrad.addColorStop(1, '#E74C3C')
    pctx.fillStyle = pgrad; pctx.fillRect(0, 0, 640, 200)
    pctx.fillStyle = '#FFFFFF'; pctx.font = 'bold 48px sans-serif'; pctx.textAlign = 'center'
    pctx.fillText('MEGA SALE! 🔥', 320, 70)
    pctx.font = 'bold 30px sans-serif'
    pctx.fillText('UP TO 70% OFF', 320, 120)
    pctx.font = '20px sans-serif'
    pctx.fillText('Free delivery on orders above ₦10,000', 320, 165)
    promoTex.update()
    const promoMat = new StandardMaterial('promoMat', this.scene)
    promoMat.disableLighting = true; promoMat.emissiveTexture = promoTex; promoMat.emissiveColor = Color3.White()
    const promoBanner = MeshBuilder.CreatePlane('promo', { width: RW - 2, height: 1.8 }, this.scene)
    promoBanner.position.set(0, 2.4, RD / 2 - 0.10); promoBanner.material = promoMat
    const promoFrame = MeshBuilder.CreateBox('promoFr',
      { width: RW - 1.5, depth: 0.06, height: 2.0 }, this.scene)
    promoFrame.position.set(0, 2.4, RD / 2 - 0.06); promoFrame.material = this._mat('#1A1A1A')

    // ── Price tags / deals board (left wall) ──────────────────────────
    const dealsTex = new DynamicTexture('dealsTex', { width: 300, height: 400 }, this.scene, true)
    const dctx = dealsTex.getContext() as unknown as CanvasRenderingContext2D
    dctx.fillStyle = '#FFFFFF'; dctx.fillRect(0, 0, 300, 400)
    dctx.fillStyle = '#F68B1E'; dctx.font = 'bold 22px sans-serif'; dctx.textAlign = 'center'
    dctx.fillText("TODAY'S DEALS", 150, 35)
    const deals = [
      { item: 'Samsung Galaxy', price: '₦185,000', was: '₦250,000' },
      { item: 'Nike Air Max', price: '₦32,000', was: '₦55,000' },
      { item: 'Blender Pro', price: '₦18,500', was: '₦28,000' },
      { item: 'Laptop Bag', price: '₦8,900', was: '₦15,000' },
      { item: 'Wireless Earbuds', price: '₦12,000', was: '₦22,000' },
    ]
    deals.forEach((d, i) => {
      const y = 60 + i * 66
      dctx.fillStyle = '#FFF5EB'; dctx.fillRect(10, y, 280, 55)
      dctx.fillStyle = '#333'; dctx.font = 'bold 14px sans-serif'; dctx.textAlign = 'left'
      dctx.fillText(d.item, 20, y + 22)
      dctx.fillStyle = '#F68B1E'; dctx.font = 'bold 16px sans-serif'
      dctx.fillText(d.price, 20, y + 44)
      dctx.fillStyle = '#999'; dctx.font = '12px sans-serif line-through'; dctx.textAlign = 'right'
      dctx.fillText(d.was, 280, y + 44); dctx.textAlign = 'left'
    })
    dealsTex.update()
    const dealsMat = new StandardMaterial('dealsM', this.scene)
    dealsMat.disableLighting = true; dealsMat.emissiveTexture = dealsTex; dealsMat.emissiveColor = Color3.White()
    const dealsBoard = MeshBuilder.CreatePlane('dealsP', { width: 2.2, height: 2.8 }, this.scene)
    dealsBoard.position.set(-RW / 2 + 0.04, 1.8, -1.0)
    dealsBoard.rotation.y = Math.PI / 2; dealsBoard.material = dealsMat

    // Logo + name
    this._buildLogo()
    this._buildNameSign()
  }

  // Generic dashboard (fallback for unknown offices)
  private _buildGenericDashboard(): void {
    this._buildDashboard('Performance', [
      { label: 'Revenue', value: '₦1.2B' },
      { label: 'Employees', value: '850' },
      { label: 'Growth', value: '+18%' },
    ], [60, 70, 50, 80, 65, 90, 55, 75, 85, 60, 70, 88])
  }

  private _buildDashboard(
    title: string,
    stats: { label: string; value: string }[],
    bars: number[],
  ): void {
    const t = this._t
    const dashBg = this._mat('#1A1A2E')
    const dashboard = MeshBuilder.CreateBox('dash', { width: 3.5, depth: 0.06, height: 2.0 }, this.scene)
    dashboard.position.set(2.5, 2.0, RD / 2 - 0.06); dashboard.material = dashBg

    const tex = new DynamicTexture('dashTex', { width: 512, height: 292 }, this.scene, true)
    const ctx = tex.getContext() as unknown as CanvasRenderingContext2D

    ctx.fillStyle = '#111122'; ctx.fillRect(0, 0, 512, 292)

    ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText(title, 20, 36)

    const pc = Color3.FromHexString(t.primary)
    const pcStr = `rgb(${Math.round(pc.r * 255)},${Math.round(pc.g * 255)},${Math.round(pc.b * 255)})`

    const boxW = 140
    stats.forEach((s, i) => {
      ctx.fillStyle = pcStr; ctx.fillRect(20 + i * 160, 55, boxW, 70)
      ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(s.label, 90 + i * 160, 80)
      ctx.font = 'bold 24px sans-serif'
      ctx.fillText(s.value, 90 + i * 160, 110)
    })

    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(20, 145, 472, 130)
    bars.forEach((h, i) => {
      ctx.fillStyle = pcStr
      ctx.fillRect(30 + i * 38, 265 - h, 28, h)
    })
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'
    const months = ['J','F','M','A','M','J','J','A','S','O','N','D']
    months.forEach((m, i) => ctx.fillText(m, 44 + i * 38, 280))

    tex.update()
    const dashMat = new StandardMaterial('dashMat', this.scene)
    dashMat.disableLighting = true; dashMat.emissiveTexture = tex; dashMat.emissiveColor = Color3.White()
    const dashP = MeshBuilder.CreatePlane('dashP', { width: 3.3, height: 1.85 }, this.scene)
    dashP.position.set(2.5, 2.0, RD / 2 - 0.10); dashP.material = dashMat
  }

  // ── Decorations ──────────────────────────────────────────────────────────

  private _buildDecor(): void {
    const t = this._t

    // Potted plants
    for (const [px, pz] of [[-RW / 2 + 1.0, -5.0], [-RW / 2 + 1.0, 4.5], [6.0, -5.5]]) {
      const pot = MeshBuilder.CreateCylinder('pot', { height: 0.48, diameterTop: 0.45, diameterBottom: 0.30, tessellation: 12 }, this.scene)
      pot.position.set(px, 0.24, pz); pot.material = this._mat('#6B4226')
      const leaf = MeshBuilder.CreateSphere('leaf', { diameter: 0.80, segments: 8 }, this.scene)
      leaf.position.set(px, 0.78, pz); leaf.material = this._mat('#2D8B2D')
    }

    // Water cooler
    const wc = MeshBuilder.CreateBox('wc', { width: 0.35, depth: 0.30, height: 1.1 }, this.scene)
    wc.position.set(6.2, 0.55, 0); wc.material = this._mat('#DDDDDD')
    const bottle = MeshBuilder.CreateCylinder('wcb', { height: 0.45, diameter: 0.22, tessellation: 12 }, this.scene)
    bottle.position.set(6.2, 1.35, 0); bottle.material = this._mat('#88CCEE')

    // Whiteboard on left wall
    const frame = MeshBuilder.CreateBox('wbframe', { width: 0.06, depth: 3.2, height: 1.8 }, this.scene)
    frame.position.set(-RW / 2 + 0.06, 1.8, 2.0); frame.material = this._mat('#AAAAAA')

    const wbTex = new DynamicTexture('wbTex', { width: 400, height: 224 }, this.scene, true)
    const ctx = wbTex.getContext() as unknown as CanvasRenderingContext2D
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, 400, 224)
    ctx.fillStyle = '#333'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('Sprint Goals', 15, 30)
    ctx.font = '14px sans-serif'
    const goals = this._getWhiteboardGoals()
    goals.forEach((g, i) => ctx.fillText(g, 15, 58 + i * 24))
    const pc = Color3.FromHexString(t.primary)
    ctx.strokeStyle = `rgb(${Math.round(pc.r * 255)},${Math.round(pc.g * 255)},${Math.round(pc.b * 255)})`
    ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(15, 58 + goals.length * 24 + 8); ctx.lineTo(385, 58 + goals.length * 24 + 8); ctx.stroke()
    wbTex.update()

    const wbMat = new StandardMaterial('wbMat', this.scene)
    wbMat.disableLighting = true; wbMat.emissiveTexture = wbTex; wbMat.emissiveColor = Color3.White()
    const wbP = MeshBuilder.CreatePlane('wbP', { width: 3.0, height: 1.68 }, this.scene)
    wbP.position.set(-RW / 2 + 0.04, 1.8, 2.0)
    wbP.rotation.y = Math.PI / 2; wbP.material = wbMat

    // Visitor sofa near entrance
    this._buildSofa(2.0, -1.5)
  }

  private _getWhiteboardGoals(): string[] {
    switch (this._t.industry) {
      case 'conglomerate': return ['✓ Cement plant #15 commissioned', '✓ Sugar refinery expansion', '→ Pan-African export rollout', '→ Fertilizer Q4 target']
      case 'telecom':      return ['✓ 5G Lagos rollout', '✓ MoMo 20M users', '→ Rural coverage push', '→ Fibre broadband pilot']
      case 'social':       return ['✓ Video stories launch', '✓ Wallet integration', '→ Group rooms v2', '→ Creator monetization']
      case 'ecommerce':    return ['✓ Same-day delivery Lagos', '✓ JumiaPay expansion', '→ Warehouse automation', '→ Black Friday prep']
      default:             return ['✓ Q3 targets met', '→ Q4 planning', '→ Hire 20 engineers']
    }
  }

  private _buildSofa(x: number, z: number): void {
    const t = this._t
    const cushMat = this._mat(t.accent)
    const legMat = this._mat('#555555')

    const seat = MeshBuilder.CreateBox('sofa', { width: 2.4, depth: 0.8, height: 0.30 }, this.scene)
    seat.position.set(x, 0.35, z); seat.material = cushMat
    const back = MeshBuilder.CreateBox('sofab', { width: 2.4, depth: 0.18, height: 0.5 }, this.scene)
    back.position.set(x, 0.65, z - 0.35); back.material = cushMat
    for (const side of [-1.05, 1.05]) {
      const arm = MeshBuilder.CreateBox('sofaarm', { width: 0.18, depth: 0.8, height: 0.40 }, this.scene)
      arm.position.set(x + side, 0.50, z); arm.material = cushMat
    }
    for (const [lx, lz] of [[-1.0, -0.3], [1.0, -0.3], [-1.0, 0.3], [1.0, 0.3]]) {
      const leg = MeshBuilder.CreateCylinder('sofleg', { height: 0.18, diameter: 0.06 }, this.scene)
      leg.position.set(x + lx, 0.09, z + lz); leg.material = legMat
    }
  }

  start(): void { this.engine.runRenderLoop(() => this.scene.render()) }
  dispose(): void { this.engine.dispose() }
}

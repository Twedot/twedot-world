import {
  Engine, Scene, ArcRotateCamera, HemisphericLight, DirectionalLight,
  MeshBuilder, StandardMaterial, Color3, Color4, Vector3, DynamicTexture, Texture,
} from '@babylonjs/core'

const RW = 14, RD = 12, WALL_H = 3.4, WALL_T = 0.22

export interface FintechTheme {
  primary: string
  accent: string
  wallTint: string
  floorBase: string
  floorAlt: string
}

export const FINTECH_THEMES: Record<string, FintechTheme> = {
  'Paystack HQ': {
    primary: '#0BA4DB',
    accent: '#09327A',
    wallTint: '#F0F6FA',
    floorBase: '#E8EEF5',
    floorAlt: '#C8D6E8',
  },
  'Flutterwave HQ': {
    primary: '#F5A623',
    accent: '#1C1C4A',
    wallTint: '#FFF8EE',
    floorBase: '#F5EDE0',
    floorAlt: '#E0D0B8',
  },
  'Interswitch': {
    primary: '#E4002B',
    accent: '#1A1A2E',
    wallTint: '#FAF0F0',
    floorBase: '#F0E8E8',
    floorAlt: '#D8C8C8',
  },
}

const DEFAULT_THEME: FintechTheme = {
  primary: '#4A90D9',
  accent: '#1B3A5C',
  wallTint: '#F0F4FA',
  floorBase: '#E8E4DC',
  floorAlt: '#CCC4B8',
}

export class FintechScene {
  readonly engine: Engine
  readonly scene: Scene
  private _theme: FintechTheme

  constructor(canvas: HTMLCanvasElement, private _name: string, private _logo?: string) {
    this._theme = FINTECH_THEMES[_name] ?? DEFAULT_THEME
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
    this._buildReception()
    this._buildWorkstations()
    this._buildMeetingArea()
    this._buildServerRack()
    this._buildDecor()
  }

  private _flatMat(hex: string): StandardMaterial {
    const m = new StandardMaterial('ff_' + Math.random(), this.scene)
    m.disableLighting = true
    m.emissiveColor = Color3.FromHexString(hex)
    m.diffuseColor = Color3.Black()
    m.specularColor = Color3.Black()
    return m
  }

  private _mat(hex: string): StandardMaterial {
    const m = new StandardMaterial('fm_' + Math.random(), this.scene)
    m.diffuseColor = Color3.FromHexString(hex)
    m.emissiveColor = Color3.FromHexString(hex).scale(0.15)
    m.specularColor = new Color3(0.05, 0.05, 0.05)
    return m
  }

  // ── Room shell ───────────────────────────────────────────────────────────

  private _buildRoom(): void {
    const t = this._theme

    // Green circular base
    const platMat = this._flatMat('#479E24')
    const plat = MeshBuilder.CreateCylinder('plat', { height: 0.40, diameter: RW * 1.65, tessellation: 72 }, this.scene)
    plat.position.y = -0.28; plat.material = platMat; plat.isPickable = false

    // Floor base
    const floorMat = this._flatMat(t.floorBase)
    const floor = MeshBuilder.CreateBox('floor', { width: RW, height: 0.10, depth: RD }, this.scene)
    floor.position.y = -0.05; floor.material = floorMat; floor.isPickable = false

    // Checkered tiles
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

    // Accent carpet strip down center
    const carpetMat = this._flatMat(t.primary)
    const carpet = MeshBuilder.CreateBox('carpet', { width: 1.2, depth: RD - 2, height: 0.07 }, this.scene)
    carpet.position.y = 0.04; carpet.material = carpetMat; carpet.isPickable = false

    // Walls: back + left only
    const wallMat = this._flatMat(t.wallTint)
    const back = MeshBuilder.CreateBox('wBack', { width: RW + WALL_T * 2, height: WALL_H, depth: WALL_T }, this.scene)
    back.position.set(0, WALL_H / 2, RD / 2 + WALL_T / 2); back.material = wallMat; back.isPickable = false

    const left = MeshBuilder.CreateBox('wLeft', { width: WALL_T, height: WALL_H, depth: RD }, this.scene)
    left.position.set(-RW / 2 - WALL_T / 2, WALL_H / 2, 0); left.material = wallMat; left.isPickable = false

    // Accent stripe along back wall bottom
    const accentMat = this._flatMat(t.primary)
    const accentStrip = MeshBuilder.CreateBox('wallAccent', { width: RW + WALL_T * 2, height: 0.15, depth: WALL_T + 0.02 }, this.scene)
    accentStrip.position.set(0, 0.08, RD / 2 + WALL_T / 2); accentStrip.material = accentMat; accentStrip.isPickable = false

    // Logo on back wall
    this._buildLogo()

    // Company name sign
    this._buildNameSign()
  }

  private _buildLogo(): void {
    const bz = RD / 2 - 0.04
    if (this._logo) {
      const logoMat = new StandardMaterial('logoMat', this.scene)
      logoMat.disableLighting = true
      logoMat.emissiveColor = Color3.White()
      logoMat.specularColor = Color3.Black()
      logoMat.emissiveTexture = new Texture(this._logo, this.scene)
      const lp = MeshBuilder.CreatePlane('logop', { width: 2.4, height: 2.4 }, this.scene)
      lp.position.set(-3.5, 2.0, bz - 0.06); lp.material = logoMat
    }
  }

  private _buildNameSign(): void {
    const bz = RD / 2 - 0.06
    const t = this._theme
    const tex = new DynamicTexture('nameTex', { width: 512, height: 80 }, this.scene, true)
    const ctx = tex.getContext() as unknown as CanvasRenderingContext2D
    ctx.fillStyle = t.wallTint; ctx.fillRect(0, 0, 512, 80)
    ctx.fillStyle = t.accent; ctx.font = 'bold 42px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(this._name, 256, 56)
    tex.update()
    const mat = new StandardMaterial('nameMat', this.scene)
    mat.disableLighting = true; mat.emissiveTexture = tex; mat.emissiveColor = Color3.White()
    const plane = MeshBuilder.CreatePlane('nameSign', { width: 5.0, height: 0.7 }, this.scene)
    plane.position.set(1.5, 2.9, bz); plane.material = mat
  }

  // ── Reception desk (near entrance, right side) ───────────────────────────

  private _buildReception(): void {
    const t = this._theme

    // Curved reception desk (L-shape)
    const deskMat = this._mat(t.accent)
    const topMat = this._mat('#E8E0D4')

    // Front section
    const front = MeshBuilder.CreateBox('rcpF', { width: 3.5, depth: 0.7, height: 1.1 }, this.scene)
    front.position.set(3.5, 0.55, -4.5); front.material = deskMat
    const frontTop = MeshBuilder.CreateBox('rcpFT', { width: 3.7, depth: 0.8, height: 0.06 }, this.scene)
    frontTop.position.set(3.5, 1.13, -4.5); frontTop.material = topMat

    // Side section (perpendicular)
    const side = MeshBuilder.CreateBox('rcpS', { width: 0.7, depth: 2.0, height: 1.1 }, this.scene)
    side.position.set(5.15, 0.55, -3.35); side.material = deskMat
    const sideTop = MeshBuilder.CreateBox('rcpST', { width: 0.8, depth: 2.1, height: 0.06 }, this.scene)
    sideTop.position.set(5.15, 1.13, -3.35); sideTop.material = topMat

    // Monitor on desk
    this._buildMonitor(3.0, -4.8, 0)
    this._buildMonitor(4.2, -4.8, 0)

    // Reception chair
    this._buildOfficeChair(3.5, -3.8, t.primary)

    // "RECEPTION" sign on desk front
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

  // ── Workstations (dev desks with dual monitors) ──────────────────────────

  private _buildWorkstations(): void {
    const t = this._theme
    const deskMat = this._mat('#E8E0D4')
    const legMat = this._mat('#888888')

    // 2 rows of 3 desks
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 3; col++) {
        const x = -5.0 + col * 3.0
        const z = 1.5 + row * 2.8

        // Desk surface
        const desk = MeshBuilder.CreateBox('desk', { width: 2.2, depth: 1.0, height: 0.06 }, this.scene)
        desk.position.set(x, 0.78, z); desk.material = deskMat

        // Legs
        for (const [lx, lz] of [[-0.95, -0.40], [0.95, -0.40], [-0.95, 0.40], [0.95, 0.40]]) {
          const leg = MeshBuilder.CreateBox('dleg', { width: 0.05, depth: 0.05, height: 0.76 }, this.scene)
          leg.position.set(x + lx, 0.38, z + lz); leg.material = legMat
        }

        // Dual monitors
        this._buildMonitor(x - 0.45, z + 0.25, Math.PI)
        this._buildMonitor(x + 0.45, z + 0.25, Math.PI)

        // Keyboard
        const kbMat = this._mat('#333333')
        const kb = MeshBuilder.CreateBox('kb', { width: 0.6, depth: 0.2, height: 0.02 }, this.scene)
        kb.position.set(x, 0.82, z - 0.15); kb.material = kbMat

        // Office chair
        this._buildOfficeChair(x, z - 0.8, t.primary)
      }
    }
  }

  private _buildMonitor(x: number, z: number, rotY: number): void {
    const monMat = this._mat('#2A2A2A')

    // Stand base
    const base = MeshBuilder.CreateCylinder('mbase', { height: 0.03, diameter: 0.22, tessellation: 12 }, this.scene)
    base.position.set(x, 0.82, z); base.material = monMat

    // Stand pole
    const pole = MeshBuilder.CreateCylinder('mpole', { height: 0.22, diameter: 0.04 }, this.scene)
    pole.position.set(x, 0.94, z); pole.material = monMat

    // Screen panel
    const screen = MeshBuilder.CreateBox('mscr', { width: 0.55, depth: 0.03, height: 0.38 }, this.scene)
    screen.position.set(x, 1.25, z); screen.rotation.y = rotY; screen.material = monMat

    // Screen face (glowing)
    const scrFace = MeshBuilder.CreatePlane('mscrface', { width: 0.50, height: 0.33 }, this.scene)
    const offset = rotY === 0 ? -0.02 : 0.02
    scrFace.position.set(x, 1.25, z + offset)
    scrFace.rotation.y = rotY
    scrFace.material = this._flatMat(this._theme.primary)
  }

  private _buildOfficeChair(x: number, z: number, colorHex: string): void {
    const mat = this._mat(colorHex)
    const legMat = this._mat('#666666')

    // Seat
    const seat = MeshBuilder.CreateBox('ocseat', { width: 0.55, depth: 0.55, height: 0.06 }, this.scene)
    seat.position.set(x, 0.50, z); seat.material = mat

    // Back
    const back = MeshBuilder.CreateBox('ocback', { width: 0.55, depth: 0.06, height: 0.50 }, this.scene)
    back.position.set(x, 0.80, z + 0.28); back.material = mat

    // Center pole
    const pole = MeshBuilder.CreateCylinder('ocpole', { height: 0.46, diameter: 0.05 }, this.scene)
    pole.position.set(x, 0.24, z); pole.material = legMat

    // Star base
    const base = MeshBuilder.CreateCylinder('ocbase', { height: 0.03, diameter: 0.38, tessellation: 12 }, this.scene)
    base.position.set(x, 0.02, z); base.material = legMat
  }

  // ── Meeting / customer service area (back-left) ──────────────────────────

  private _buildMeetingArea(): void {
    const t = this._theme

    // Large meeting table
    const tableMat = this._mat(t.accent)
    const table = MeshBuilder.CreateBox('mtbl', { width: 3.0, depth: 1.4, height: 0.06 }, this.scene)
    table.position.set(-4.8, 0.78, -3.0); table.material = tableMat
    const legMat = this._mat('#555555')
    for (const [lx, lz] of [[-1.35, -0.55], [1.35, -0.55], [-1.35, 0.55], [1.35, 0.55]]) {
      const leg = MeshBuilder.CreateBox('mtleg', { width: 0.06, depth: 0.06, height: 0.76 }, this.scene)
      leg.position.set(-4.8 + lx, 0.38, -3.0 + lz); leg.material = legMat
    }

    // 4 chairs around table
    this._buildOfficeChair(-5.6, -3.0, t.primary)
    this._buildOfficeChair(-4.0, -3.0, t.primary)
    this._buildOfficeChair(-4.8, -2.0, t.primary)
    this._buildOfficeChair(-4.8, -4.0, t.primary)

    // "CUSTOMER SERVICE" sign on left wall
    const csTex = new DynamicTexture('csTex', { width: 512, height: 64 }, this.scene, true)
    const ctx = csTex.getContext() as unknown as CanvasRenderingContext2D
    ctx.fillStyle = t.wallTint; ctx.fillRect(0, 0, 512, 64)
    ctx.fillStyle = t.primary; ctx.font = 'bold 32px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('CUSTOMER SERVICE', 256, 46)
    csTex.update()
    const csMat = new StandardMaterial('csMat', this.scene)
    csMat.disableLighting = true; csMat.emissiveTexture = csTex; csMat.emissiveColor = Color3.White()
    const csSign = MeshBuilder.CreatePlane('csSign', { width: 3.2, height: 0.4 }, this.scene)
    csSign.position.set(-RW / 2 + 0.02, 2.6, -3.0)
    csSign.rotation.y = Math.PI / 2
    csSign.material = csMat
  }

  // ── Server rack / payment terminal display (back-right) ──────────────────

  private _buildServerRack(): void {
    const t = this._theme

    // Server rack cabinet
    const rackMat = this._mat('#2A2A2A')
    const rack = MeshBuilder.CreateBox('rack', { width: 0.8, depth: 0.6, height: 2.2 }, this.scene)
    rack.position.set(5.5, 1.10, 5.2); rack.material = rackMat

    // Blinking LEDs
    for (let j = 0; j < 6; j++) {
      const led = MeshBuilder.CreateBox('led' + j, { width: 0.06, depth: 0.02, height: 0.06 }, this.scene)
      led.position.set(5.5 - 0.25 + (j % 3) * 0.25, 0.6 + Math.floor(j / 3) * 0.8, 4.88)
      led.material = this._flatMat(j % 2 === 0 ? '#00FF44' : t.primary)
    }

    // Payment terminal display (big screen on wall)
    const dashBg = this._flatMat(t.accent)
    const dashboard = MeshBuilder.CreateBox('dash', { width: 3.5, depth: 0.06, height: 2.0 }, this.scene)
    dashboard.position.set(2.5, 2.0, RD / 2 - 0.06); dashboard.material = dashBg

    // Dashboard content
    const dashTex = new DynamicTexture('dashTex', { width: 512, height: 292 }, this.scene, true)
    const ctx = dashTex.getContext() as unknown as CanvasRenderingContext2D

    // Dark background
    const ac = Color3.FromHexString(t.accent)
    ctx.fillStyle = `rgb(${Math.round(ac.r * 255)},${Math.round(ac.g * 255)},${Math.round(ac.b * 255)})`
    ctx.fillRect(0, 0, 512, 292)

    // Title
    ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('Transaction Dashboard', 20, 36)

    // Stats boxes
    const pc = Color3.FromHexString(t.primary)
    const pcStr = `rgb(${Math.round(pc.r * 255)},${Math.round(pc.g * 255)},${Math.round(pc.b * 255)})`
    ctx.fillStyle = pcStr
    ctx.fillRect(20, 55, 140, 70); ctx.fillRect(180, 55, 140, 70); ctx.fillRect(340, 55, 140, 70)
    ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('Total Txns', 90, 80); ctx.fillText('Success Rate', 250, 80); ctx.fillText('Volume', 410, 80)
    ctx.font = 'bold 24px sans-serif'
    ctx.fillText('1.2M', 90, 110); ctx.fillText('99.7%', 250, 110); ctx.fillText('₦8.4B', 410, 110)

    // Mini bar chart
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(20, 145, 472, 130)
    const bars = [60, 85, 45, 90, 70, 100, 55, 80, 95, 65, 75, 88]
    bars.forEach((h, i) => {
      ctx.fillStyle = pcStr
      ctx.fillRect(30 + i * 38, 265 - h, 28, h)
    })
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'
    const months = ['J','F','M','A','M','J','J','A','S','O','N','D']
    months.forEach((m, i) => ctx.fillText(m, 44 + i * 38, 280))

    dashTex.update()
    const dashMat = new StandardMaterial('dashMat', this.scene)
    dashMat.disableLighting = true; dashMat.emissiveTexture = dashTex; dashMat.emissiveColor = Color3.White()
    const dashP = MeshBuilder.CreatePlane('dashP', { width: 3.3, height: 1.85 }, this.scene)
    dashP.position.set(2.5, 2.0, RD / 2 - 0.10); dashP.material = dashMat
  }

  // ── Decorations ──────────────────────────────────────────────────────────

  private _buildDecor(): void {
    // Potted plants
    for (const [px, pz] of [[-RW / 2 + 1.0, -5.0], [-RW / 2 + 1.0, 4.5], [6.0, -5.5]]) {
      const potMat = this._mat('#6B4226')
      const pot = MeshBuilder.CreateCylinder('pot', { height: 0.48, diameterTop: 0.45, diameterBottom: 0.30, tessellation: 12 }, this.scene)
      pot.position.set(px, 0.24, pz); pot.material = potMat
      const leafMat = this._mat('#2D8B2D')
      const leaf = MeshBuilder.CreateSphere('leaf', { diameter: 0.80, segments: 8 }, this.scene)
      leaf.position.set(px, 0.78, pz); leaf.material = leafMat
    }

    // Water cooler (right side)
    const wcMat = this._mat('#DDDDDD')
    const wc = MeshBuilder.CreateBox('wc', { width: 0.35, depth: 0.30, height: 1.1 }, this.scene)
    wc.position.set(6.2, 0.55, 0); wc.material = wcMat
    const bottleMat = this._mat('#88CCEE')
    const bottle = MeshBuilder.CreateCylinder('wcb', { height: 0.45, diameter: 0.22, tessellation: 12 }, this.scene)
    bottle.position.set(6.2, 1.35, 0); bottle.material = bottleMat

    // Whiteboard on left wall
    const frameMat = this._mat('#AAAAAA')
    const frame = MeshBuilder.CreateBox('wbframe', { width: 0.06, depth: 3.2, height: 1.8 }, this.scene)
    frame.position.set(-RW / 2 + 0.06, 1.8, 2.0); frame.material = frameMat

    const wbTex = new DynamicTexture('wbTex', { width: 400, height: 224 }, this.scene, true)
    const ctx = wbTex.getContext() as unknown as CanvasRenderingContext2D
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, 400, 224)
    ctx.fillStyle = '#333'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('Sprint Goals', 15, 30)
    ctx.font = '14px sans-serif'
    ctx.fillText('✓ API v3 rollout', 15, 58)
    ctx.fillText('✓ PCI compliance audit', 15, 82)
    ctx.fillText('→ Settlement engine refactor', 15, 106)
    ctx.fillText('→ Mobile SDK beta', 15, 130)
    ctx.strokeStyle = this._theme.primary; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(15, 150); ctx.lineTo(385, 150); ctx.stroke()
    ctx.fillStyle = '#888'; ctx.font = '12px sans-serif'
    ctx.fillText('Q4 Target: 99.99% uptime', 15, 172)
    wbTex.update()

    const wbMat = new StandardMaterial('wbMat', this.scene)
    wbMat.disableLighting = true; wbMat.emissiveTexture = wbTex; wbMat.emissiveColor = Color3.White()
    const wbP = MeshBuilder.CreatePlane('wbP', { width: 3.0, height: 1.68 }, this.scene)
    wbP.position.set(-RW / 2 + 0.04, 1.8, 2.0)
    wbP.rotation.y = Math.PI / 2
    wbP.material = wbMat

    // Visitor sofa (near entrance)
    this._buildSofa(2.0, -1.5)
  }

  private _buildSofa(x: number, z: number): void {
    const t = this._theme
    const cushMat = this._mat(t.accent)
    const legMat = this._mat('#555555')

    // Seat cushion
    const seat = MeshBuilder.CreateBox('sofa', { width: 2.4, depth: 0.8, height: 0.30 }, this.scene)
    seat.position.set(x, 0.35, z); seat.material = cushMat

    // Back cushion
    const back = MeshBuilder.CreateBox('sofab', { width: 2.4, depth: 0.18, height: 0.5 }, this.scene)
    back.position.set(x, 0.65, z - 0.35); back.material = cushMat

    // Armrests
    for (const side of [-1.05, 1.05]) {
      const arm = MeshBuilder.CreateBox('sofaarm', { width: 0.18, depth: 0.8, height: 0.40 }, this.scene)
      arm.position.set(x + side, 0.50, z); arm.material = cushMat
    }

    // Legs
    for (const [lx, lz] of [[-1.0, -0.3], [1.0, -0.3], [-1.0, 0.3], [1.0, 0.3]]) {
      const leg = MeshBuilder.CreateCylinder('sofleg', { height: 0.18, diameter: 0.06 }, this.scene)
      leg.position.set(x + lx, 0.09, z + lz); leg.material = legMat
    }
  }

  start(): void { this.engine.runRenderLoop(() => this.scene.render()) }
  dispose(): void { this.engine.dispose() }
}

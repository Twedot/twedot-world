import {
  Engine, Scene, ArcRotateCamera, HemisphericLight, DirectionalLight,
  MeshBuilder, StandardMaterial, Color3, Color4, Vector3, DynamicTexture, Texture,
} from '@babylonjs/core'

const RW = 14, RD = 12, WALL_H = 3.4, WALL_T = 0.22

export interface RestTheme {
  primary: string
  accent: string
  wallTint: string
  floorBase: string
  floorAlt: string
  menuItems: { name: string; price: string }[]
}

export const REST_THEMES: Record<string, RestTheme> = {
  'Chicken Republic': {
    primary: '#D4202C',
    accent: '#FFD700',
    wallTint: '#FFF5F0',
    floorBase: '#F0E0D0',
    floorAlt: '#D8C8B4',
    menuItems: [
      { name: 'Chicken & Chips', price: '₦2,500' },
      { name: 'Burger Meal', price: '₦1,800' },
      { name: 'Rice & Chicken', price: '₦2,200' },
      { name: 'Chicken Wrap', price: '₦1,500' },
      { name: 'Family Bucket', price: '₦6,500' },
      { name: 'Meat Pie', price: '₦600' },
    ],
  },
  'KFC Mainland': {
    primary: '#E4002B',
    accent: '#FFFFFF',
    wallTint: '#FFF0F0',
    floorBase: '#E8D8D0',
    floorAlt: '#D0C0B4',
    menuItems: [
      { name: 'Zinger Burger', price: '₦3,200' },
      { name: 'Streetwise Two', price: '₦2,800' },
      { name: 'Mighty Bucket', price: '₦7,500' },
      { name: 'Twister Wrap', price: '₦2,400' },
      { name: 'Popcorn Chicken', price: '₦1,800' },
      { name: 'Krushems', price: '₦1,200' },
    ],
  },
  'Mr Biggs': {
    primary: '#FF6B00',
    accent: '#1A5C1A',
    wallTint: '#FFF8F0',
    floorBase: '#F0E4D4',
    floorAlt: '#D8CCB8',
    menuItems: [
      { name: 'Jollof Rice & Chk', price: '₦2,000' },
      { name: 'Meat Pie', price: '₦500' },
      { name: 'Sausage Roll', price: '₦400' },
      { name: 'Fried Rice Combo', price: '₦2,500' },
      { name: 'Doughnut (6pcs)', price: '₦1,200' },
      { name: 'Chicken Suya', price: '₦1,800' },
    ],
  },
}

const DEFAULT_THEME: RestTheme = {
  primary: '#E85D5D', accent: '#7B1F1F',
  wallTint: '#FFF5F0', floorBase: '#F0E0D0', floorAlt: '#D8C8B4',
  menuItems: [
    { name: 'Combo Meal', price: '₦2,000' },
    { name: 'Sides', price: '₦800' },
    { name: 'Drink', price: '₦500' },
    { name: 'Dessert', price: '₦700' },
    { name: 'Special', price: '₦3,000' },
    { name: 'Kids Meal', price: '₦1,500' },
  ],
}

export class RestaurantScene {
  readonly engine: Engine
  readonly scene: Scene
  private _t: RestTheme

  constructor(canvas: HTMLCanvasElement, private _name: string, private _logo?: string) {
    this._t = REST_THEMES[_name] ?? DEFAULT_THEME
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
    this._buildOrderCounter()
    this._buildMenuBoard()
    this._buildDiningArea()
    this._buildKitchen()
    this._buildDecor()
  }

  private _flatMat(hex: string): StandardMaterial {
    const m = new StandardMaterial('rf_' + Math.random(), this.scene)
    m.disableLighting = true
    m.emissiveColor = Color3.FromHexString(hex)
    m.diffuseColor = Color3.Black(); m.specularColor = Color3.Black()
    return m
  }

  private _mat(hex: string): StandardMaterial {
    const m = new StandardMaterial('rm_' + Math.random(), this.scene)
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

    // Logo
    if (this._logo) {
      const logoMat = new StandardMaterial('logoMat', this.scene)
      logoMat.disableLighting = true; logoMat.emissiveColor = Color3.White(); logoMat.specularColor = Color3.Black()
      logoMat.emissiveTexture = new Texture(this._logo, this.scene)
      const lp = MeshBuilder.CreatePlane('logop', { width: 2.0, height: 2.0 }, this.scene)
      lp.position.set(-4.5, 2.2, RD / 2 - 0.10); lp.material = logoMat
    }
  }

  // ── Order counter (front-right, where customers order) ───────────────────

  private _buildOrderCounter(): void {
    const t = this._t
    const cntMat = this._mat(t.primary)
    const topMat = this._mat('#F0E8DC')

    // Main counter (L-shape)
    const front = MeshBuilder.CreateBox('cnt', { width: 5.0, depth: 0.8, height: 1.1 }, this.scene)
    front.position.set(3.5, 0.55, RD / 2 - 2.0); front.material = cntMat
    const frontTop = MeshBuilder.CreateBox('cntT', { width: 5.2, depth: 0.9, height: 0.06 }, this.scene)
    frontTop.position.set(3.5, 1.13, RD / 2 - 2.0); frontTop.material = topMat

    // Side wing
    const side = MeshBuilder.CreateBox('cntS', { width: 0.8, depth: 2.5, height: 1.1 }, this.scene)
    side.position.set(5.9, 0.55, RD / 2 - 0.8); side.material = cntMat
    const sideTop = MeshBuilder.CreateBox('cntST', { width: 0.9, depth: 2.6, height: 0.06 }, this.scene)
    sideTop.position.set(5.9, 1.13, RD / 2 - 0.8); sideTop.material = topMat

    // Cash registers (2)
    for (let i = 0; i < 2; i++) {
      const rx = 2.5 + i * 2.5
      const reg = MeshBuilder.CreateBox('reg' + i, { width: 0.35, depth: 0.30, height: 0.30 }, this.scene)
      reg.position.set(rx, 1.30, RD / 2 - 2.0); reg.material = this._mat('#222222')
      const regScr = MeshBuilder.CreatePlane('regS' + i, { width: 0.28, height: 0.18 }, this.scene)
      regScr.position.set(rx, 1.38, RD / 2 - 2.42); regScr.material = this._flatMat(t.primary)
    }

    // "ORDER HERE" sign
    const ordTex = new DynamicTexture('ordTex', { width: 256, height: 56 }, this.scene, true)
    const octx = ordTex.getContext() as unknown as CanvasRenderingContext2D
    octx.fillStyle = t.primary; octx.fillRect(0, 0, 256, 56)
    octx.fillStyle = '#FFFFFF'; octx.font = 'bold 26px sans-serif'; octx.textAlign = 'center'
    octx.fillText('ORDER HERE', 128, 40)
    ordTex.update()
    const ordMat = new StandardMaterial('ordM', this.scene)
    ordMat.disableLighting = true; ordMat.emissiveTexture = ordTex; ordMat.emissiveColor = Color3.White()
    const ordSign = MeshBuilder.CreatePlane('ordSign', { width: 1.8, height: 0.40 }, this.scene)
    ordSign.position.set(3.5, 1.80, RD / 2 - 2.44); ordSign.material = ordMat

    // Tray stack
    const trayMat = this._mat('#CC8844')
    for (let i = 0; i < 5; i++) {
      const tray = MeshBuilder.CreateBox('tray' + i, { width: 0.45, depth: 0.35, height: 0.02 }, this.scene)
      tray.position.set(1.5, 1.16 + i * 0.025, RD / 2 - 2.0); tray.material = trayMat
    }

    // Food display case (glass, with items)
    const glassMat = new StandardMaterial('fdGlass', this.scene)
    glassMat.diffuseColor = new Color3(0.9, 0.92, 0.95); glassMat.alpha = 0.22
    const fdCase = MeshBuilder.CreateBox('fdCase', { width: 2.0, depth: 0.6, height: 0.7 }, this.scene)
    fdCase.position.set(5.0, 1.50, RD / 2 - 2.0); fdCase.material = glassMat
    // Food items inside
    const foodColors = ['#8B4513', '#D4782A', '#FFD700', '#CD853F']
    for (let f = 0; f < 4; f++) {
      const food = MeshBuilder.CreateCylinder('food' + f,
        { height: 0.12, diameter: 0.25, tessellation: 8 }, this.scene)
      food.position.set(4.4 + f * 0.4, 1.25, RD / 2 - 2.0); food.material = this._mat(foodColors[f])
    }
  }

  // ── Menu board (back wall, above counter) ────────────────────────────────

  private _buildMenuBoard(): void {
    const t = this._t
    const menuTex = new DynamicTexture('menuTex', { width: 640, height: 360 }, this.scene, true)
    const ctx = menuTex.getContext() as unknown as CanvasRenderingContext2D

    // Background
    const pc = Color3.FromHexString(t.primary)
    ctx.fillStyle = `rgb(${Math.round(pc.r * 255)},${Math.round(pc.g * 255)},${Math.round(pc.b * 255)})`
    ctx.fillRect(0, 0, 640, 360)

    // Title
    ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 32px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('MENU', 320, 45)

    // Divider
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(60, 58, 520, 2)

    // Menu items in 2 columns
    const items = t.menuItems
    items.forEach((item, i) => {
      const col = i < 3 ? 0 : 1
      const row = i % 3
      const x = col === 0 ? 50 : 340
      const y = 90 + row * 90

      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x, y, 250, 70)
      ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'left'
      ctx.fillText(item.name, x + 15, y + 30)
      ctx.fillStyle = '#FFD700'; ctx.font = 'bold 22px sans-serif'
      ctx.fillText(item.price, x + 15, y + 58)
    })

    menuTex.update()
    const menuMat = new StandardMaterial('menuMat', this.scene)
    menuMat.disableLighting = true; menuMat.emissiveTexture = menuTex; menuMat.emissiveColor = Color3.White()

    // Frame
    const frame = MeshBuilder.CreateBox('menuFr', { width: 6.5, depth: 0.06, height: 3.0 }, this.scene)
    frame.position.set(1.5, 2.2, RD / 2 - 0.04); frame.material = this._mat('#111111')
    // Screen
    const screen = MeshBuilder.CreatePlane('menuScr', { width: 6.2, height: 2.8 }, this.scene)
    screen.position.set(1.5, 2.2, RD / 2 - 0.10); screen.material = menuMat
  }

  // ── Dining area (tables & chairs, center-left) ───────────────────────────

  private _buildDiningArea(): void {
    const t = this._t

    // 4-seater tables (2x2 grid)
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 2; col++) {
        const tx = -4.5 + col * 3.8
        const tz = -1.5 - row * 3.0
        this._buildDiningTable(tx, tz, t.primary)
      }
    }

    // 2-seater booth along left wall
    for (let b = 0; b < 2; b++) {
      const bz = 1.5 + b * 3.0
      this._buildBooth(-RW / 2 + 1.5, bz, t.primary)
    }
  }

  private _buildDiningTable(x: number, z: number, color: string): void {
    const tableMat = this._mat('#E8DCC8')
    const legMat = this._mat('#888888')

    // Table top
    const top = MeshBuilder.CreateBox('dt', { width: 1.6, depth: 1.2, height: 0.05 }, this.scene)
    top.position.set(x, 0.75, z); top.material = tableMat
    // Center leg
    const leg = MeshBuilder.CreateCylinder('dtleg', { height: 0.72, diameter: 0.08, tessellation: 8 }, this.scene)
    leg.position.set(x, 0.36, z); leg.material = legMat
    const base = MeshBuilder.CreateCylinder('dtbase', { height: 0.04, diameter: 0.50, tessellation: 12 }, this.scene)
    base.position.set(x, 0.02, z); base.material = legMat

    // 4 chairs
    const offsets: [number, number][] = [[0, -0.8], [0, 0.8], [-0.9, 0], [0.9, 0]]
    for (const [dx, dz] of offsets) {
      this._buildChair(x + dx, z + dz, color)
    }

    // Food tray + items on table
    const tray = MeshBuilder.CreateBox('ftray', { width: 0.40, depth: 0.30, height: 0.015 }, this.scene)
    tray.position.set(x + 0.2, 0.78, z); tray.material = this._mat('#CC8844')
    const cup = MeshBuilder.CreateCylinder('fcup', { height: 0.18, diameterTop: 0.08, diameterBottom: 0.06, tessellation: 8 }, this.scene)
    cup.position.set(x - 0.3, 0.87, z); cup.material = this._mat('#DD2222')
  }

  private _buildChair(x: number, z: number, color: string): void {
    const mat = this._mat(color)
    const legMat = this._mat('#888888')
    const seat = MeshBuilder.CreateBox('cs', { width: 0.42, depth: 0.42, height: 0.04 }, this.scene)
    seat.position.set(x, 0.44, z); seat.material = mat
    const back = MeshBuilder.CreateBox('cb', { width: 0.42, depth: 0.04, height: 0.38 }, this.scene)
    back.position.set(x, 0.66, z + 0.20); back.material = mat
    for (const [lx, lz] of [[-0.16, -0.16], [0.16, -0.16], [-0.16, 0.16], [0.16, 0.16]]) {
      const leg = MeshBuilder.CreateCylinder('cl', { height: 0.42, diameter: 0.03, tessellation: 6 }, this.scene)
      leg.position.set(x + lx, 0.21, z + lz); leg.material = legMat
    }
  }

  private _buildBooth(x: number, z: number, color: string): void {
    const cushMat = this._mat(color)
    const wallMat = this._mat('#3A3028')

    // Bench seat
    const bench = MeshBuilder.CreateBox('booth', { width: 1.6, depth: 0.6, height: 0.30 }, this.scene)
    bench.position.set(x, 0.35, z); bench.material = cushMat
    // High back
    const boothBack = MeshBuilder.CreateBox('boothB', { width: 1.6, depth: 0.10, height: 1.0 }, this.scene)
    boothBack.position.set(x - 0.75, 0.80, z); boothBack.material = wallMat
    // Small table
    const tbl = MeshBuilder.CreateBox('btbl', { width: 0.9, depth: 0.6, height: 0.05 }, this.scene)
    tbl.position.set(x + 0.6, 0.72, z); tbl.material = this._mat('#E8DCC8')
    const tblLeg = MeshBuilder.CreateCylinder('btlg', { height: 0.70, diameter: 0.06 }, this.scene)
    tblLeg.position.set(x + 0.6, 0.36, z); tblLeg.material = this._mat('#888888')
    // Condiment tray
    const cond = MeshBuilder.CreateBox('cond', { width: 0.20, depth: 0.15, height: 0.10 }, this.scene)
    cond.position.set(x + 0.6, 0.80, z); cond.material = this._mat('#CC4444')
  }

  // ── Kitchen visible behind counter ───────────────────────────────────────

  private _buildKitchen(): void {
    const steelMat = this._mat('#B0B0B0')

    // Fryer unit
    const fryer = MeshBuilder.CreateBox('fryer', { width: 0.8, depth: 0.6, height: 0.9 }, this.scene)
    fryer.position.set(2.0, 0.45, RD / 2 - 0.5); fryer.material = steelMat
    // Oil basin (dark)
    const oil = MeshBuilder.CreateBox('oil', { width: 0.60, depth: 0.40, height: 0.15 }, this.scene)
    oil.position.set(2.0, 0.95, RD / 2 - 0.5); oil.material = this._mat('#8B6914')

    // Grill
    const grill = MeshBuilder.CreateBox('grill', { width: 1.0, depth: 0.6, height: 0.9 }, this.scene)
    grill.position.set(3.5, 0.45, RD / 2 - 0.5); grill.material = steelMat
    // Grill grate
    const grate = MeshBuilder.CreateBox('grate', { width: 0.80, depth: 0.40, height: 0.03 }, this.scene)
    grate.position.set(3.5, 0.93, RD / 2 - 0.5); grate.material = this._mat('#333333')
    // Food on grill
    for (let i = 0; i < 3; i++) {
      const meat = MeshBuilder.CreateCylinder('meat' + i,
        { height: 0.06, diameter: 0.18, tessellation: 8 }, this.scene)
      meat.position.set(3.2 + i * 0.3, 0.98, RD / 2 - 0.5); meat.material = this._mat('#8B4513')
    }

    // Prep counter
    const prep = MeshBuilder.CreateBox('prep', { width: 1.5, depth: 0.6, height: 0.9 }, this.scene)
    prep.position.set(5.2, 0.45, RD / 2 - 0.5); prep.material = steelMat
    const prepTop = MeshBuilder.CreateBox('prepT', { width: 1.5, depth: 0.6, height: 0.04 }, this.scene)
    prepTop.position.set(5.2, 0.92, RD / 2 - 0.5); prepTop.material = this._mat('#E8E8E8')

    // Drink dispenser (on counter)
    const dispMat = this._mat('#333333')
    const disp = MeshBuilder.CreateBox('disp', { width: 0.35, depth: 0.25, height: 0.50 }, this.scene)
    disp.position.set(5.5, 1.20, RD / 2 - 0.5); disp.material = dispMat
    // Nozzles
    for (let n = 0; n < 3; n++) {
      const nozzle = MeshBuilder.CreateCylinder('nozzle' + n,
        { height: 0.06, diameter: 0.04, tessellation: 6 }, this.scene)
      nozzle.position.set(5.38 + n * 0.12, 1.05, RD / 2 - 0.65); nozzle.material = this._mat('#AAAAAA')
    }
  }

  // ── Decorations ──────────────────────────────────────────────────────────

  private _buildDecor(): void {
    const t = this._t

    // Waste bins near entrance
    for (let i = 0; i < 2; i++) {
      const binMat = this._mat(i === 0 ? '#444444' : t.primary)
      const bin = MeshBuilder.CreateCylinder('bin' + i,
        { height: 0.65, diameterTop: 0.35, diameterBottom: 0.28, tessellation: 10 }, this.scene)
      bin.position.set(0.5 + i * 0.55, 0.33, -5.2); bin.material = binMat
      // Lid
      const lid = MeshBuilder.CreateCylinder('lid' + i,
        { height: 0.04, diameter: 0.38, tessellation: 10 }, this.scene)
      lid.position.set(0.5 + i * 0.55, 0.68, -5.2); lid.material = this._mat('#555555')
    }

    // Condiment station
    const station = MeshBuilder.CreateBox('condSt', { width: 0.8, depth: 0.4, height: 0.80 }, this.scene)
    station.position.set(-1.5, 0.40, -5.0); station.material = this._mat('#8B6914')
    // Sauce dispensers
    const sauceColors = ['#FF0000', '#FFD700', '#228B22']
    for (let s = 0; s < 3; s++) {
      const sauce = MeshBuilder.CreateCylinder('sauce' + s,
        { height: 0.20, diameterTop: 0.04, diameterBottom: 0.08, tessellation: 6 }, this.scene)
      sauce.position.set(-1.7 + s * 0.20, 0.92, -5.0); sauce.material = this._flatMat(sauceColors[s])
    }
    // Napkin dispenser
    const napkin = MeshBuilder.CreateBox('napkin', { width: 0.20, depth: 0.10, height: 0.15 }, this.scene)
    napkin.position.set(-1.2, 0.88, -5.0); napkin.material = this._mat('#CCCCCC')

    // Potted plants
    for (const [px, pz] of [[-RW / 2 + 0.8, -5.0], [-RW / 2 + 0.8, 4.5]]) {
      const pot = MeshBuilder.CreateCylinder('pot', { height: 0.48, diameterTop: 0.40, diameterBottom: 0.28, tessellation: 10 }, this.scene)
      pot.position.set(px, 0.24, pz); pot.material = this._mat('#6B4226')
      const leaf = MeshBuilder.CreateSphere('leaf', { diameter: 0.70, segments: 8 }, this.scene)
      leaf.position.set(px, 0.72, pz); leaf.material = this._mat('#2D8B2D')
    }

    // "WASH YOUR HANDS" sign on left wall
    const washTex = new DynamicTexture('washTex', { width: 256, height: 64 }, this.scene, true)
    const wctx = washTex.getContext() as unknown as CanvasRenderingContext2D
    wctx.fillStyle = '#2196F3'; wctx.fillRect(0, 0, 256, 64)
    wctx.fillStyle = '#FFFFFF'; wctx.font = 'bold 18px sans-serif'; wctx.textAlign = 'center'
    wctx.fillText('🧼 WASH YOUR HANDS', 128, 42)
    washTex.update()
    const washMat = new StandardMaterial('washM', this.scene)
    washMat.disableLighting = true; washMat.emissiveTexture = washTex; washMat.emissiveColor = Color3.White()
    const washSign = MeshBuilder.CreatePlane('washSign', { width: 1.6, height: 0.40 }, this.scene)
    washSign.position.set(-RW / 2 + 0.04, 2.2, -2.0)
    washSign.rotation.y = Math.PI / 2; washSign.material = washMat

    // Name sign on back wall
    const nameTex = new DynamicTexture('nameTex', { width: 512, height: 80 }, this.scene, true)
    const nctx = nameTex.getContext() as unknown as CanvasRenderingContext2D
    nctx.fillStyle = t.wallTint; nctx.fillRect(0, 0, 512, 80)
    nctx.fillStyle = t.primary; nctx.font = 'bold 42px sans-serif'; nctx.textAlign = 'center'
    nctx.fillText(this._name, 256, 56)
    nameTex.update()
    const nameMat = new StandardMaterial('nameM', this.scene)
    nameMat.disableLighting = true; nameMat.emissiveTexture = nameTex; nameMat.emissiveColor = Color3.White()
    const nameP = MeshBuilder.CreatePlane('nameSign', { width: 5.0, height: 0.7 }, this.scene)
    nameP.position.set(-2.0, 3.0, RD / 2 - 0.08); nameP.material = nameMat
  }

  start(): void { this.engine.runRenderLoop(() => this.scene.render()) }
  dispose(): void { this.engine.dispose() }
}

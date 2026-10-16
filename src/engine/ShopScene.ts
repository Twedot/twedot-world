import {
  Engine, Scene, ArcRotateCamera, HemisphericLight, DirectionalLight,
  MeshBuilder, StandardMaterial, Color3, Color4, Vector3, DynamicTexture, Texture,
} from '@babylonjs/core'

const RW = 14, RD = 12, WALL_H = 3.4, WALL_T = 0.22

export interface ShopTheme {
  primary: string
  accent: string
  wallTint: string
  floorBase: string
  floorAlt: string
  kind: 'supermarket' | 'electronics'
}

export const SHOP_THEMES: Record<string, ShopTheme> = {
  'Shoprite Yaba': {
    primary: '#E31837',
    accent: '#1A3A6B',
    wallTint: '#FFF8F0',
    floorBase: '#F0E8DC',
    floorAlt: '#D8CEB8',
    kind: 'supermarket',
  },
  'Konga': {
    primary: '#ED1C24',
    accent: '#1A1A1A',
    wallTint: '#FAF5F0',
    floorBase: '#E8E0D4',
    floorAlt: '#D0C4B4',
    kind: 'electronics',
  },
}

const DEFAULT_THEME: ShopTheme = {
  primary: '#5C9ED8',
  accent: '#1A237E',
  wallTint: '#F0F4FA',
  floorBase: '#E8E4DC',
  floorAlt: '#CCC4B8',
  kind: 'supermarket',
}

export class ShopScene {
  readonly engine: Engine
  readonly scene: Scene
  private _t: ShopTheme

  constructor(canvas: HTMLCanvasElement, private _name: string, private _logo?: string) {
    this._t = SHOP_THEMES[_name] ?? DEFAULT_THEME
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
    if (this._t.kind === 'supermarket') {
      this._buildSupermarket()
    } else {
      this._buildElectronicsStore()
    }
  }

  private _flatMat(hex: string): StandardMaterial {
    const m = new StandardMaterial('sf_' + Math.random(), this.scene)
    m.disableLighting = true
    m.emissiveColor = Color3.FromHexString(hex)
    m.diffuseColor = Color3.Black(); m.specularColor = Color3.Black()
    return m
  }

  private _mat(hex: string): StandardMaterial {
    const m = new StandardMaterial('sm_' + Math.random(), this.scene)
    m.diffuseColor = Color3.FromHexString(hex)
    m.emissiveColor = Color3.FromHexString(hex).scale(0.15)
    m.specularColor = new Color3(0.05, 0.05, 0.05)
    return m
  }

  // ── Room shell (shared) ──────────────────────────────────────────────────

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
    const accentStrip = MeshBuilder.CreateBox('wallAcc', { width: RW + WALL_T * 2, height: 0.15, depth: WALL_T + 0.02 }, this.scene)
    accentStrip.position.set(0, 0.08, RD / 2 + WALL_T / 2); accentStrip.material = accentMat; accentStrip.isPickable = false
    const leftAcc = MeshBuilder.CreateBox('wallAccL', { width: WALL_T + 0.02, height: 0.15, depth: RD }, this.scene)
    leftAcc.position.set(-RW / 2 - WALL_T / 2, 0.08, 0); leftAcc.material = accentMat; leftAcc.isPickable = false

    // Logo on back wall
    if (this._logo) {
      const logoMat = new StandardMaterial('logoMat', this.scene)
      logoMat.disableLighting = true; logoMat.emissiveColor = Color3.White(); logoMat.specularColor = Color3.Black()
      logoMat.emissiveTexture = new Texture(this._logo, this.scene)
      const lp = MeshBuilder.CreatePlane('logop', { width: 2.2, height: 2.2 }, this.scene)
      lp.position.set(-4.5, 2.2, RD / 2 - 0.10); lp.material = logoMat
    }

    // Name sign
    const nameTex = new DynamicTexture('nameTex', { width: 512, height: 80 }, this.scene, true)
    const ctx = nameTex.getContext() as unknown as CanvasRenderingContext2D
    ctx.fillStyle = t.wallTint; ctx.fillRect(0, 0, 512, 80)
    ctx.fillStyle = t.primary; ctx.font = 'bold 42px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(this._name, 256, 56)
    nameTex.update()
    const nameMat = new StandardMaterial('nameMat', this.scene)
    nameMat.disableLighting = true; nameMat.emissiveTexture = nameTex; nameMat.emissiveColor = Color3.White()
    const nameP = MeshBuilder.CreatePlane('nameSign', { width: 5.0, height: 0.7 }, this.scene)
    nameP.position.set(1.0, 2.9, RD / 2 - 0.08); nameP.material = nameMat
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SHOPRITE — Grocery supermarket
  // ══════════════════════════════════════════════════════════════════════════

  private _buildSupermarket(): void {
    this._buildGroceryAisles()
    this._buildFreshSection()
    this._buildCheckouts()
    this._buildCarts()
    this._buildPromoBanner()
  }

  private _buildGroceryAisles(): void {
    const shelfFrame = this._mat('#D8D0C0')
    const shelfPlate = this._mat('#F0E8DC')

    const aisleData = [
      { label: 'Beverages & Snacks', z: 1.5, colors: ['#E31837','#F5A623','#2ECC71','#3498DB','#8E44AD','#E74C3C'] },
      { label: 'Canned & Packaged',  z: 4.0, colors: ['#F39C12','#1ABC9C','#E74C3C','#3498DB','#D35400','#27AE60'] },
    ]

    for (const aisle of aisleData) {
      for (const side of [-1, 1]) {
        const sx = side * 2.8
        // Shelf back panel
        const panel = MeshBuilder.CreateBox('shP', { width: 5.0, depth: 0.10, height: 2.0 }, this.scene)
        panel.position.set(sx, 1.0, aisle.z); panel.material = shelfFrame

        // 4 shelves with products
        for (let s = 0; s < 4; s++) {
          const plate = MeshBuilder.CreateBox('shL', { width: 5.0, depth: 0.55, height: 0.03 }, this.scene)
          plate.position.set(sx, 0.25 + s * 0.50, aisle.z + side * 0.30); plate.material = shelfPlate

          for (let p = 0; p < 8; p++) {
            const h = 0.18 + Math.random() * 0.12
            const prod = MeshBuilder.CreateBox('gp',
              { width: 0.40, depth: 0.22, height: h }, this.scene)
            prod.position.set(sx - 2.0 + p * 0.58, 0.28 + s * 0.50 + h / 2, aisle.z + side * 0.30)
            prod.material = this._mat(aisle.colors[(s + p) % aisle.colors.length])
          }
        }
      }

      // Aisle sign hanging above
      const signTex = new DynamicTexture('aisT', { width: 300, height: 48 }, this.scene, true)
      const ctx = signTex.getContext() as unknown as CanvasRenderingContext2D
      ctx.fillStyle = '#E31837'; ctx.fillRect(0, 0, 300, 48)
      ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(aisle.label, 150, 34)
      signTex.update()
      const signMat = new StandardMaterial('aisM', this.scene)
      signMat.disableLighting = true; signMat.emissiveTexture = signTex; signMat.emissiveColor = Color3.White()
      const sign = MeshBuilder.CreatePlane('aisS', { width: 2.4, height: 0.38 }, this.scene)
      sign.position.set(0, 2.4, aisle.z); sign.material = signMat
    }
  }

  private _buildFreshSection(): void {
    // Refrigerated display along left wall — fruits, vegs, dairy
    const fridgeMat = this._mat('#DDDDDD')
    const glassMat = new StandardMaterial('fGlass', this.scene)
    glassMat.diffuseColor = new Color3(0.85, 0.92, 0.95); glassMat.alpha = 0.25

    // Fridge unit
    const fridge = MeshBuilder.CreateBox('fridge', { width: 0.15, depth: 5.5, height: 1.8 }, this.scene)
    fridge.position.set(-RW / 2 + 0.20, 0.90, -1.5); fridge.material = fridgeMat
    // Glass door
    const door = MeshBuilder.CreateBox('fDoor', { width: 0.04, depth: 5.3, height: 1.6 }, this.scene)
    door.position.set(-RW / 2 + 0.38, 0.90, -1.5); door.material = glassMat

    // 3 shelves of produce
    const produceColors = [
      ['#FF4444', '#FF6B35', '#FFD700'],  // fruits
      ['#2ECC71', '#27AE60', '#16A085'],  // vegs
      ['#F5F0E8', '#FFFDE0', '#E8DCC8'],  // dairy
    ]
    for (let shelf = 0; shelf < 3; shelf++) {
      const shelfPlate = MeshBuilder.CreateBox('fShelf' + shelf,
        { width: 0.14, depth: 5.3, height: 0.03 }, this.scene)
      shelfPlate.position.set(-RW / 2 + 0.20, 0.30 + shelf * 0.55, -1.5); shelfPlate.material = this._mat('#CCCCCC')

      for (let p = 0; p < 6; p++) {
        const item = MeshBuilder.CreateSphere('fprod' + shelf + p,
          { diameter: 0.22 + Math.random() * 0.10, segments: 6 }, this.scene)
        item.position.set(-RW / 2 + 0.26, 0.46 + shelf * 0.55, -3.6 + p * 0.85)
        item.material = this._mat(produceColors[shelf][p % 3])
      }
    }

    // "FRESH" sign
    const freshTex = new DynamicTexture('freshTex', { width: 200, height: 48 }, this.scene, true)
    const fctx = freshTex.getContext() as unknown as CanvasRenderingContext2D
    fctx.fillStyle = '#2ECC71'; fctx.fillRect(0, 0, 200, 48)
    fctx.fillStyle = '#FFFFFF'; fctx.font = 'bold 26px sans-serif'; fctx.textAlign = 'center'
    fctx.fillText('🥬 FRESH', 100, 35)
    freshTex.update()
    const freshMat = new StandardMaterial('freshM', this.scene)
    freshMat.disableLighting = true; freshMat.emissiveTexture = freshTex; freshMat.emissiveColor = Color3.White()
    const freshSign = MeshBuilder.CreatePlane('freshSign', { width: 1.4, height: 0.34 }, this.scene)
    freshSign.position.set(-RW / 2 + 0.04, 2.2, -1.5)
    freshSign.rotation.y = Math.PI / 2; freshSign.material = freshMat

    // Open freezer bin (right side near back)
    const binMat = this._mat('#BBBBBB')
    const bin = MeshBuilder.CreateBox('freezer', { width: 2.5, depth: 1.2, height: 0.75 }, this.scene)
    bin.position.set(5.0, 0.38, 4.5); bin.material = binMat
    // Frozen items inside
    for (let i = 0; i < 6; i++) {
      const frozen = MeshBuilder.CreateBox('frz' + i,
        { width: 0.35, depth: 0.25, height: 0.15 }, this.scene)
      frozen.position.set(4.2 + (i % 3) * 0.55, 0.62, 4.2 + Math.floor(i / 3) * 0.5)
      frozen.material = this._mat(i % 2 === 0 ? '#88CCEE' : '#AADDFF')
    }
    // "FROZEN" label
    const frzTex = new DynamicTexture('frzTex', { width: 180, height: 40 }, this.scene, true)
    const zctx = frzTex.getContext() as unknown as CanvasRenderingContext2D
    zctx.fillStyle = '#3498DB'; zctx.fillRect(0, 0, 180, 40)
    zctx.fillStyle = '#FFFFFF'; zctx.font = 'bold 20px sans-serif'; zctx.textAlign = 'center'
    zctx.fillText('❄ FROZEN', 90, 28)
    frzTex.update()
    const frzMat = new StandardMaterial('frzM', this.scene)
    frzMat.disableLighting = true; frzMat.emissiveTexture = frzTex; frzMat.emissiveColor = Color3.White()
    const frzSign = MeshBuilder.CreatePlane('frzSign', { width: 1.2, height: 0.26 }, this.scene)
    frzSign.position.set(5.0, 1.0, 3.88); frzSign.material = frzMat
  }

  private _buildCheckouts(): void {
    const counterMat = this._mat('#E31837')
    const topMat = this._mat('#E8E0D4')

    for (let i = 0; i < 3; i++) {
      const cx = -4.0 + i * 3.5
      const cz = -4.8

      const cnt = MeshBuilder.CreateBox('chk' + i, { width: 2.2, depth: 0.6, height: 0.85 }, this.scene)
      cnt.position.set(cx, 0.43, cz); cnt.material = counterMat
      const cTop = MeshBuilder.CreateBox('chkT' + i, { width: 2.3, depth: 0.7, height: 0.04 }, this.scene)
      cTop.position.set(cx, 0.87, cz); cTop.material = topMat

      // Belt
      const belt = MeshBuilder.CreateBox('chkB' + i, { width: 1.4, depth: 0.3, height: 0.03 }, this.scene)
      belt.position.set(cx + 0.2, 0.90, cz - 0.10); belt.material = this._mat('#555555')

      // POS / cash register
      const pos = MeshBuilder.CreateBox('pos' + i, { width: 0.28, depth: 0.22, height: 0.30 }, this.scene)
      pos.position.set(cx - 0.75, 1.02, cz); pos.material = this._mat('#222222')
      const posScr = MeshBuilder.CreatePlane('posS' + i, { width: 0.22, height: 0.16 }, this.scene)
      posScr.position.set(cx - 0.75, 1.10, cz - 0.12); posScr.material = this._flatMat('#E31837')

      // Lane number sign
      const lnTex = new DynamicTexture('lnTex' + i, { width: 64, height: 64 }, this.scene, true)
      const lctx = lnTex.getContext() as unknown as CanvasRenderingContext2D
      lctx.fillStyle = '#E31837'; lctx.fillRect(0, 0, 64, 64)
      lctx.fillStyle = '#FFFFFF'; lctx.font = 'bold 40px sans-serif'; lctx.textAlign = 'center'
      lctx.fillText(String(i + 1), 32, 48)
      lnTex.update()
      const lnMat = new StandardMaterial('lnM' + i, this.scene)
      lnMat.disableLighting = true; lnMat.emissiveTexture = lnTex; lnMat.emissiveColor = Color3.White()
      const lnSign = MeshBuilder.CreatePlane('lnS' + i, { width: 0.35, height: 0.35 }, this.scene)
      lnSign.position.set(cx, 1.65, cz - 0.32); lnSign.material = lnMat

      // Plastic bag holder
      const bagHolder = MeshBuilder.CreateCylinder('bagH' + i,
        { height: 0.35, diameterTop: 0.25, diameterBottom: 0.10, tessellation: 8 }, this.scene)
      bagHolder.position.set(cx + 0.8, 1.05, cz); bagHolder.material = this._mat('#CCCCCC')
    }
  }

  private _buildCarts(): void {
    const cartMat = this._mat('#AAAAAA')
    for (let i = 0; i < 4; i++) {
      const cx = 5.5, cz = -4.0 + i * 0.7
      const basket = MeshBuilder.CreateBox('cart' + i, { width: 0.5, depth: 0.4, height: 0.30 }, this.scene)
      basket.position.set(cx, 0.50, cz); basket.material = cartMat
      const handle = MeshBuilder.CreateBox('cartH' + i, { width: 0.5, depth: 0.04, height: 0.18 }, this.scene)
      handle.position.set(cx, 0.72, cz + 0.20); handle.material = cartMat
      for (const [wx, wz] of [[-0.18, -0.15], [0.18, -0.15], [-0.18, 0.15], [0.18, 0.15]]) {
        const wh = MeshBuilder.CreateCylinder('cwh', { height: 0.04, diameter: 0.10, tessellation: 8 }, this.scene)
        wh.position.set(cx + wx, 0.08, cz + wz); wh.rotation.z = Math.PI / 2; wh.material = this._mat('#333333')
      }
    }
  }

  private _buildPromoBanner(): void {
    const t = this._t
    const promoTex = new DynamicTexture('promoTex', { width: 640, height: 160 }, this.scene, true)
    const pctx = promoTex.getContext() as unknown as CanvasRenderingContext2D
    pctx.fillStyle = t.primary; pctx.fillRect(0, 0, 640, 160)
    pctx.fillStyle = '#FFFFFF'; pctx.font = 'bold 44px sans-serif'; pctx.textAlign = 'center'
    pctx.fillText('WEEKLY SPECIALS!', 320, 55)
    pctx.font = 'bold 26px sans-serif'
    pctx.fillText('Save up to 40% on 500+ items', 320, 100)
    pctx.font = '18px sans-serif'
    pctx.fillText('Valid this week only • While stocks last', 320, 140)
    promoTex.update()
    const promoMat = new StandardMaterial('promoMat', this.scene)
    promoMat.disableLighting = true; promoMat.emissiveTexture = promoTex; promoMat.emissiveColor = Color3.White()
    const banner = MeshBuilder.CreatePlane('promo', { width: 6.0, height: 1.4 }, this.scene)
    banner.position.set(1.0, 3.0, RD / 2 - 0.10); banner.material = promoMat
  }

  // ══════════════════════════════════════════════════════════════════════════
  // KONGA — Electronics / gadget store
  // ══════════════════════════════════════════════════════════════════════════

  private _buildElectronicsStore(): void {
    this._buildPhoneDisplays()
    this._buildLaptopSection()
    this._buildAccessoriesWall()
    this._buildElecCheckout()
    this._buildElecPromo()
  }

  private _buildPhoneDisplays(): void {
    // Glass display tables (3 tables in center)
    const tableMat = this._mat('#1A1A1A')
    const glassMat = new StandardMaterial('tGlass', this.scene)
    glassMat.diffuseColor = new Color3(0.9, 0.92, 0.95); glassMat.alpha = 0.2

    for (let t = 0; t < 3; t++) {
      const tx = -3.5 + t * 3.5
      const tz = 2.0
      // Table body
      const table = MeshBuilder.CreateBox('pTable' + t, { width: 2.5, depth: 1.0, height: 0.85 }, this.scene)
      table.position.set(tx, 0.43, tz); table.material = tableMat
      // Glass top
      const glass = MeshBuilder.CreateBox('pGlass' + t, { width: 2.4, depth: 0.9, height: 0.04 }, this.scene)
      glass.position.set(tx, 0.87, tz); glass.material = glassMat

      // Phones on display (4 per table)
      for (let p = 0; p < 4; p++) {
        // Phone body
        const phone = MeshBuilder.CreateBox('phone' + t + p,
          { width: 0.14, depth: 0.28, height: 0.02 }, this.scene)
        phone.position.set(tx - 0.7 + p * 0.50, 0.90, tz)
        phone.material = this._mat(p % 2 === 0 ? '#1A1A1A' : '#F0F0F0')
        // Phone screen
        const scr = MeshBuilder.CreatePlane('pScr' + t + p, { width: 0.12, height: 0.22 }, this.scene)
        scr.position.set(tx - 0.7 + p * 0.50, 0.92, tz)
        scr.rotation.x = -Math.PI / 2
        scr.material = this._flatMat(p % 3 === 0 ? '#3498DB' : p % 3 === 1 ? '#E74C3C' : '#2ECC71')
        // Small stand
        const stand = MeshBuilder.CreateBox('pStand' + t + p,
          { width: 0.06, depth: 0.08, height: 0.04 }, this.scene)
        stand.position.set(tx - 0.7 + p * 0.50, 0.89, tz + 0.18)
        stand.material = this._mat('#CCCCCC')
        // Price tag
        const tagMat = this._flatMat('#ED1C24')
        const tag = MeshBuilder.CreateBox('pTag' + t + p,
          { width: 0.18, depth: 0.08, height: 0.01 }, this.scene)
        tag.position.set(tx - 0.7 + p * 0.50, 0.89, tz - 0.25)
        tag.material = tagMat
      }
    }
  }

  private _buildLaptopSection(): void {
    // Laptop display shelves along back wall
    const shelfMat = this._mat('#2A2A2A')

    for (let shelf = 0; shelf < 2; shelf++) {
      const sy = 0.50 + shelf * 1.2
      // Shelf plate
      const plate = MeshBuilder.CreateBox('lShelf' + shelf,
        { width: RW - 2, depth: 0.55, height: 0.04 }, this.scene)
      plate.position.set(0, sy, RD / 2 - 0.8); plate.material = shelfMat

      // Laptops (5 per shelf)
      for (let l = 0; l < 5; l++) {
        const lx = -4.5 + l * 2.2
        // Laptop base
        const lBase = MeshBuilder.CreateBox('lBase' + shelf + l,
          { width: 0.65, depth: 0.42, height: 0.02 }, this.scene)
        lBase.position.set(lx, sy + 0.03, RD / 2 - 0.8); lBase.material = this._mat('#444444')
        // Laptop screen (angled up)
        const lScreen = MeshBuilder.CreateBox('lScr' + shelf + l,
          { width: 0.62, depth: 0.02, height: 0.40 }, this.scene)
        lScreen.position.set(lx, sy + 0.24, RD / 2 - 0.55)
        lScreen.rotation.x = -0.15
        lScreen.material = this._mat('#333333')
        // Screen face
        const lFace = MeshBuilder.CreatePlane('lFace' + shelf + l, { width: 0.56, height: 0.34 }, this.scene)
        lFace.position.set(lx, sy + 0.24, RD / 2 - 0.56)
        lFace.rotation.x = -0.15
        lFace.material = this._flatMat(l % 2 === 0 ? '#1A1A1A' : '#ED1C24')
      }
    }
  }

  private _buildAccessoriesWall(): void {
    // Left wall — headphones, speakers, cables on pegboard
    const pegMat = this._mat('#D4C8B8')
    const peg = MeshBuilder.CreateBox('pegboard', { width: 0.08, depth: 5.0, height: 2.4 }, this.scene)
    peg.position.set(-RW / 2 + 0.08, 1.4, 0); peg.material = pegMat

    // Headphones (hooks)
    const hookColors = ['#1A1A1A', '#ED1C24', '#3498DB', '#F39C12']
    for (let i = 0; i < 4; i++) {
      // Hook
      const hook = MeshBuilder.CreateCylinder('hook' + i,
        { height: 0.15, diameter: 0.03, tessellation: 6 }, this.scene)
      hook.position.set(-RW / 2 + 0.18, 2.0, -1.5 + i * 1.0)
      hook.rotation.z = Math.PI / 2; hook.material = this._mat('#888888')
      // Headphone band
      const band = MeshBuilder.CreateTorus('hpBand' + i,
        { diameter: 0.25, thickness: 0.03, tessellation: 16 }, this.scene)
      band.position.set(-RW / 2 + 0.25, 2.0, -1.5 + i * 1.0)
      band.material = this._mat(hookColors[i])
    }

    // Speaker display (bottom shelf area)
    for (let s = 0; s < 3; s++) {
      const spk = MeshBuilder.CreateCylinder('spk' + s,
        { height: 0.45, diameter: 0.30, tessellation: 12 }, this.scene)
      spk.position.set(-RW / 2 + 0.30, 0.45, -1.0 + s * 1.0)
      spk.material = this._mat(s === 0 ? '#1A1A1A' : s === 1 ? '#ED1C24' : '#3498DB')
      // Speaker cone
      const cone = MeshBuilder.CreateCylinder('spkC' + s,
        { height: 0.02, diameter: 0.20, tessellation: 12 }, this.scene)
      cone.position.set(-RW / 2 + 0.18, 0.45, -1.0 + s * 1.0)
      cone.rotation.z = Math.PI / 2; cone.material = this._mat('#333333')
    }

    // "ACCESSORIES" sign
    const accTex = new DynamicTexture('accTex', { width: 256, height: 48 }, this.scene, true)
    const actx = accTex.getContext() as unknown as CanvasRenderingContext2D
    actx.fillStyle = '#1A1A1A'; actx.fillRect(0, 0, 256, 48)
    actx.fillStyle = '#ED1C24'; actx.font = 'bold 22px sans-serif'; actx.textAlign = 'center'
    actx.fillText('🎧 ACCESSORIES', 128, 34)
    accTex.update()
    const accMat = new StandardMaterial('accM', this.scene)
    accMat.disableLighting = true; accMat.emissiveTexture = accTex; accMat.emissiveColor = Color3.White()
    const accSign = MeshBuilder.CreatePlane('accSign', { width: 1.8, height: 0.34 }, this.scene)
    accSign.position.set(-RW / 2 + 0.04, 2.8, 0)
    accSign.rotation.y = Math.PI / 2; accSign.material = accMat
  }

  private _buildElecCheckout(): void {
    // Checkout / payment counter (front right)
    const cntMat = this._mat('#1A1A1A')
    const cnt = MeshBuilder.CreateBox('eCnt', { width: 3.0, depth: 0.7, height: 1.0 }, this.scene)
    cnt.position.set(4.5, 0.50, -4.5); cnt.material = cntMat
    const cTop = MeshBuilder.CreateBox('eCntT', { width: 3.1, depth: 0.8, height: 0.05 }, this.scene)
    cTop.position.set(4.5, 1.02, -4.5); cTop.material = this._mat('#E8E0D4')

    // POS terminal
    const pos = MeshBuilder.CreateBox('ePos', { width: 0.30, depth: 0.25, height: 0.35 }, this.scene)
    pos.position.set(3.5, 1.22, -4.5); pos.material = this._mat('#222222')
    const posScr = MeshBuilder.CreatePlane('ePosS', { width: 0.25, height: 0.20 }, this.scene)
    posScr.position.set(3.5, 1.30, -4.63); posScr.material = this._flatMat('#ED1C24')

    // Bagged products behind counter
    for (let i = 0; i < 4; i++) {
      const bag = MeshBuilder.CreateBox('eBag' + i,
        { width: 0.30, depth: 0.25, height: 0.35 }, this.scene)
      bag.position.set(4.0 + i * 0.45, 1.20, -4.2); bag.material = this._mat('#ED1C24')
    }

    // "PAY HERE" sign
    const payTex = new DynamicTexture('payTex', { width: 200, height: 48 }, this.scene, true)
    const pctx = payTex.getContext() as unknown as CanvasRenderingContext2D
    pctx.fillStyle = '#ED1C24'; pctx.fillRect(0, 0, 200, 48)
    pctx.fillStyle = '#FFFFFF'; pctx.font = 'bold 24px sans-serif'; pctx.textAlign = 'center'
    pctx.fillText('💳 PAY HERE', 100, 34)
    payTex.update()
    const payMat = new StandardMaterial('payM', this.scene)
    payMat.disableLighting = true; payMat.emissiveTexture = payTex; payMat.emissiveColor = Color3.White()
    const paySign = MeshBuilder.CreatePlane('paySign', { width: 1.4, height: 0.34 }, this.scene)
    paySign.position.set(4.5, 1.8, -4.86); paySign.material = payMat
  }

  private _buildElecPromo(): void {
    // Big promo screen on back wall (between laptops and logo)
    const promoTex = new DynamicTexture('ePromo', { width: 512, height: 220 }, this.scene, true)
    const ctx = promoTex.getContext() as unknown as CanvasRenderingContext2D
    const grad = ctx.createLinearGradient(0, 0, 512, 0)
    grad.addColorStop(0, '#ED1C24'); grad.addColorStop(1, '#8B0000')
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 512, 220)
    ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 36px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('TECH DEALS 🔥', 256, 55)
    ctx.font = 'bold 22px sans-serif'
    ctx.fillText('iPhone 15 — ₦780,000', 256, 100)
    ctx.fillText('Galaxy S24 — ₦550,000', 256, 135)
    ctx.fillText('MacBook Air — ₦920,000', 256, 170)
    ctx.font = '16px sans-serif'
    ctx.fillText('Free delivery • 12-month warranty', 256, 205)
    promoTex.update()
    const promoMat = new StandardMaterial('ePromoM', this.scene)
    promoMat.disableLighting = true; promoMat.emissiveTexture = promoTex; promoMat.emissiveColor = Color3.White()
    const screen = MeshBuilder.CreatePlane('ePromoP', { width: 4.5, height: 1.8 }, this.scene)
    screen.position.set(1.5, 2.8, RD / 2 - 0.10); screen.material = promoMat
  }

  start(): void { this.engine.runRenderLoop(() => this.scene.render()) }
  dispose(): void { this.engine.dispose() }
}

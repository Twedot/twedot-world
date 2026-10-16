import {
  Engine, Scene, ArcRotateCamera, HemisphericLight, DirectionalLight,
  MeshBuilder, StandardMaterial, Color3, Color4, Vector3, DynamicTexture, Texture,
} from '@babylonjs/core'

const RW = 14, RD = 12, WALL_H = 3.4, WALL_T = 0.22

export class BankScene {
  readonly engine: Engine
  readonly scene: Scene

  constructor(canvas: HTMLCanvasElement, private _logo?: string) {
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
    this._buildCounters()
    this._buildATMs()
    this._buildWaitingArea()
    this._buildQueueBarriers()
    this._buildDecor()
  }

  private _flatMat(hex: string): StandardMaterial {
    const m = new StandardMaterial('bkf_' + hex + Math.random(), this.scene)
    m.disableLighting = true
    m.emissiveColor = Color3.FromHexString(hex)
    m.diffuseColor = Color3.Black()
    m.specularColor = Color3.Black()
    return m
  }

  private _mat(hex: string): StandardMaterial {
    const m = new StandardMaterial('bk_' + hex + Math.random(), this.scene)
    m.diffuseColor = Color3.FromHexString(hex)
    m.emissiveColor = Color3.FromHexString(hex).scale(0.15)
    m.specularColor = new Color3(0.05, 0.05, 0.05)
    return m
  }

  // ── Room shell (back + left walls only, like house/school) ───────────────

  private _buildRoom(): void {
    // Green circular base
    const platMat = this._flatMat('#479E24')
    const plat = MeshBuilder.CreateCylinder('plat', { height: 0.40, diameter: RW * 1.65, tessellation: 72 }, this.scene)
    plat.position.y = -0.28; plat.material = platMat; plat.isPickable = false

    // Marble floor base
    const floorMat = this._flatMat('#E8E0D4')
    const floor = MeshBuilder.CreateBox('floor', { width: RW, height: 0.10, depth: RD }, this.scene)
    floor.position.y = -0.05; floor.material = floorMat; floor.isPickable = false

    // Checkered marble tiles
    const tileMat1 = this._flatMat('#EDE6DC')
    const tileMat2 = this._flatMat('#C8BFB2')
    const TN = 10, tw = RW / TN
    for (let r = 0; r < TN; r++) {
      for (let c = 0; c < TN; c++) {
        const tile = MeshBuilder.CreateBox(`bt_${r}_${c}`,
          { width: tw - 0.03, height: 0.06, depth: tw - 0.03 }, this.scene)
        tile.position.set(
          -RW / 2 + tw * c + tw / 2,
          0.03,
          -RD / 2 + tw * r + tw / 2,
        )
        tile.material = (r + c) % 2 === 0 ? tileMat1 : tileMat2
        tile.isPickable = false
      }
    }

    // Navy accent strip down center aisle
    const stripMat = this._flatMat('#1B3A5C')
    const strip = MeshBuilder.CreateBox('strip', { width: 1.0, depth: RD - 1, height: 0.07 }, this.scene)
    strip.position.y = 0.04; strip.material = stripMat; strip.isPickable = false

    // Walls: back (north) + left (west) only
    const wallMat = this._flatMat('#F0EBE3')
    const back = MeshBuilder.CreateBox('wBack', { width: RW + WALL_T * 2, height: WALL_H, depth: WALL_T }, this.scene)
    back.position.set(0, WALL_H / 2, RD / 2 + WALL_T / 2); back.material = wallMat; back.isPickable = false

    const left = MeshBuilder.CreateBox('wLeft', { width: WALL_T, height: WALL_H, depth: RD }, this.scene)
    left.position.set(-RW / 2 - WALL_T / 2, WALL_H / 2, 0); left.material = wallMat; left.isPickable = false

    // Skirting boards
    const skirtMat = this._flatMat('#B8AD9E')
    const skB = MeshBuilder.CreateBox('skB', { width: RW + WALL_T * 2, height: 0.22, depth: WALL_T }, this.scene)
    skB.position.set(0, 0.11, RD / 2 + WALL_T / 2); skB.material = skirtMat; skB.isPickable = false
    const skL = MeshBuilder.CreateBox('skL', { width: WALL_T, height: 0.22, depth: RD }, this.scene)
    skL.position.set(-RW / 2 - WALL_T / 2, 0.11, 0); skL.material = skirtMat; skL.isPickable = false

    // Logo sign on back wall
    this._buildBackSign()
  }

  private _buildBackSign(): void {
    const bz = RD / 2 - 0.04
    const signMat = this._flatMat('#1B3A5C')
    const sign = MeshBuilder.CreateBox('sign', { width: 3.5, depth: 0.08, height: 2.0 }, this.scene)
    sign.position.set(0, 2.0, bz); sign.material = signMat

    if (this._logo) {
      const logoMat = new StandardMaterial('logoMat', this.scene)
      logoMat.disableLighting = true
      logoMat.emissiveColor = Color3.White()
      logoMat.specularColor = Color3.Black()
      const tex = new Texture(this._logo, this.scene)
      logoMat.emissiveTexture = tex
      const lp = MeshBuilder.CreatePlane('logop', { width: 3.0, height: 1.6 }, this.scene)
      lp.position.set(0, 2.0, bz - 0.06); lp.material = logoMat
    }
  }

  // ── Teller counters (3 stations along the back wall) ─────────────────────

  private _buildCounters(): void {
    const counterMat = this._mat('#1B3A5C')
    const topMat     = this._mat('#D4CBC0')

    const glassMat = new StandardMaterial('glass', this.scene)
    glassMat.diffuseColor = new Color3(0.78, 0.88, 0.96)
    glassMat.alpha = 0.30
    glassMat.specularColor = new Color3(0.4, 0.4, 0.4)

    for (let i = 0; i < 3; i++) {
      const x = -4.0 + i * 3.8

      // Counter body
      const base = MeshBuilder.CreateBox('cnt' + i, { width: 3.0, depth: 0.9, height: 1.1 }, this.scene)
      base.position.set(x, 0.55, 4.5); base.material = counterMat

      // Counter top surface
      const top = MeshBuilder.CreateBox('cnttop' + i, { width: 3.2, depth: 1.0, height: 0.06 }, this.scene)
      top.position.set(x, 1.13, 4.5); top.material = topMat

      // Glass partition above counter
      const glass = MeshBuilder.CreateBox('gls' + i, { width: 2.8, depth: 0.04, height: 1.3 }, this.scene)
      glass.position.set(x, 1.78, 4.45); glass.material = glassMat

      // Speaking slot in glass
      const slotMat = this._flatMat('#88BBDD')
      const slot = MeshBuilder.CreateBox('slot' + i, { width: 1.2, depth: 0.06, height: 0.25 }, this.scene)
      slot.position.set(x, 1.30, 4.43); slot.material = slotMat

      // Counter number label
      const numTex = new DynamicTexture('num' + i, { width: 128, height: 64 }, this.scene, true)
      const ctx = numTex.getContext() as unknown as CanvasRenderingContext2D
      ctx.fillStyle = '#1B3A5C'; ctx.fillRect(0, 0, 128, 64)
      ctx.fillStyle = '#fff'; ctx.font = 'bold 36px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(String(i + 1), 64, 46)
      numTex.update()
      const numMat = new StandardMaterial('numm' + i, this.scene)
      numMat.disableLighting = true; numMat.emissiveTexture = numTex; numMat.emissiveColor = Color3.White()
      const numP = MeshBuilder.CreatePlane('nump' + i, { width: 0.5, height: 0.25 }, this.scene)
      numP.position.set(x, 2.55, RD / 2 - 0.06); numP.material = numMat

      // Teller chair behind counter
      this._buildChair(x, 5.2, '#3A3A3A')

      // Desktop monitor
      const monMat = this._mat('#2A2A2A')
      const mon = MeshBuilder.CreateBox('mon' + i, { width: 0.6, depth: 0.04, height: 0.45 }, this.scene)
      mon.position.set(x - 0.5, 1.40, 4.8); mon.material = monMat
      const mbase = MeshBuilder.CreateCylinder('mbase' + i, { height: 0.18, diameter: 0.25, tessellation: 12 }, this.scene)
      mbase.position.set(x - 0.5, 1.25, 4.8); mbase.material = monMat
      const screenMat = this._flatMat('#3399FF')
      const mscr = MeshBuilder.CreatePlane('mscr' + i, { width: 0.54, height: 0.38 }, this.scene)
      mscr.position.set(x - 0.5, 1.40, 4.77); mscr.material = screenMat
    }
  }

  // ── ATM machines (along the left wall) ───────────────────────────────────

  private _buildATMs(): void {
    const bodyMat   = this._mat('#3A3A3A')
    const panelMat  = this._mat('#4A4A4A')
    const screenMat = this._flatMat('#00CCAA')
    const keypadMat = this._flatMat('#555555')
    const slotMat   = this._flatMat('#222222')

    for (let i = 0; i < 2; i++) {
      const z = -1.5 + i * 3.0
      const x = -RW / 2 + 0.5

      // ATM body
      const body = MeshBuilder.CreateBox('atm' + i, { width: 0.65, depth: 0.55, height: 1.7 }, this.scene)
      body.position.set(x, 0.85, z); body.material = bodyMat

      // Front panel
      const panel = MeshBuilder.CreateBox('atmpnl' + i, { width: 0.62, depth: 0.02, height: 1.65 }, this.scene)
      panel.position.set(x + 0.30, 0.85, z); panel.material = panelMat

      // Screen
      const screen = MeshBuilder.CreatePlane('atms' + i, { width: 0.42, height: 0.32 }, this.scene)
      screen.position.set(x + 0.32, 1.25, z)
      screen.rotation.y = -Math.PI / 2
      screen.material = screenMat

      // Keypad
      const kp = MeshBuilder.CreatePlane('atmkp' + i, { width: 0.30, height: 0.20 }, this.scene)
      kp.position.set(x + 0.32, 0.80, z)
      kp.rotation.y = -Math.PI / 2
      kp.material = keypadMat

      // Card slot
      const cs = MeshBuilder.CreateBox('atmcs' + i, { width: 0.02, depth: 0.10, height: 0.02 }, this.scene)
      cs.position.set(x + 0.32, 0.95, z + 0.15); cs.material = slotMat

      // Cash dispenser slot
      const cd = MeshBuilder.CreateBox('atmcd' + i, { width: 0.02, depth: 0.18, height: 0.04 }, this.scene)
      cd.position.set(x + 0.32, 0.50, z); cd.material = slotMat
    }
  }

  // ── Waiting area (chairs in the open area) ───────────────────────────────

  private _buildWaitingArea(): void {
    // Row of linked waiting chairs
    for (let col = 0; col < 4; col++) {
      this._buildWaitingChair(-3.0 + col * 1.8, -2.0)
    }
    for (let col = 0; col < 4; col++) {
      this._buildWaitingChair(-3.0 + col * 1.8, -4.2)
    }

    // Small coffee table
    const tableMat = this._mat('#8B7B6B')
    const tbl = MeshBuilder.CreateBox('coffeetbl', { width: 1.6, depth: 0.8, height: 0.06 }, this.scene)
    tbl.position.set(0.6, 0.48, -3.1); tbl.material = tableMat
    for (const [lx, lz] of [[-0.65, -0.3], [0.65, -0.3], [-0.65, 0.3], [0.65, 0.3]]) {
      const leg = MeshBuilder.CreateCylinder('tleg', { height: 0.45, diameter: 0.06 }, this.scene)
      leg.position.set(0.6 + lx, 0.23, -3.1 + lz); leg.material = this._mat('#666666')
    }
  }

  private _buildWaitingChair(x: number, z: number): void {
    const seatMat = this._mat('#2C5F8A')
    const legMat  = this._mat('#888888')

    // Seat cushion
    const seat = MeshBuilder.CreateBox('wseat', { width: 0.8, depth: 0.8, height: 0.10 }, this.scene)
    seat.position.set(x, 0.48, z); seat.material = seatMat

    // Backrest
    const back = MeshBuilder.CreateBox('wback', { width: 0.8, depth: 0.08, height: 0.55 }, this.scene)
    back.position.set(x, 0.80, z - 0.38); back.material = seatMat

    // Metal legs
    for (const [lx, lz] of [[-0.32, -0.32], [0.32, -0.32], [-0.32, 0.32], [0.32, 0.32]]) {
      const leg = MeshBuilder.CreateCylinder('wleg', { height: 0.43, diameter: 0.05 }, this.scene)
      leg.position.set(x + lx, 0.22, z + lz); leg.material = legMat
    }
  }

  private _buildChair(x: number, z: number, hex: string): void {
    const mat = this._mat(hex)
    const seat = MeshBuilder.CreateBox('tcseat', { width: 0.6, depth: 0.6, height: 0.08 }, this.scene)
    seat.position.set(x, 0.52, z); seat.material = mat
    const back = MeshBuilder.CreateBox('tcback', { width: 0.6, depth: 0.06, height: 0.55 }, this.scene)
    back.position.set(x, 0.82, z + 0.30); back.material = mat
    const legMat = this._mat('#666666')
    const pole = MeshBuilder.CreateCylinder('tcpole', { height: 0.50, diameter: 0.06 }, this.scene)
    pole.position.set(x, 0.26, z); pole.material = legMat
    const base = MeshBuilder.CreateCylinder('tcbase', { height: 0.04, diameter: 0.40, tessellation: 12 }, this.scene)
    base.position.set(x, 0.02, z); base.material = legMat
  }

  // ── Queue barriers (rope and poles) ──────────────────────────────────────

  private _buildQueueBarriers(): void {
    const poleMat = this._mat('#C5A43B')
    const ropeMat = this._flatMat('#8B2020')

    const poles: [number, number][] = [
      [-3.5, 2.0], [0, 2.0], [3.5, 2.0],
      [-3.5, 0.5], [0, 0.5], [3.5, 0.5],
    ]

    for (const [px, pz] of poles) {
      const pole = MeshBuilder.CreateCylinder('qpole', { height: 0.95, diameter: 0.07, tessellation: 12 }, this.scene)
      pole.position.set(px, 0.48, pz); pole.material = poleMat
      const ball = MeshBuilder.CreateSphere('qball', { diameter: 0.14, segments: 8 }, this.scene)
      ball.position.set(px, 0.97, pz); ball.material = poleMat
    }

    // Horizontal ropes
    const ropes: [number, number, number, number][] = [
      [-3.5, 0, 2.0, 2.0], [0, 3.5, 2.0, 2.0],
      [-3.5, 0, 0.5, 0.5], [0, 3.5, 0.5, 0.5],
    ]
    for (const [x1, x2, z1, z2] of ropes) {
      const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2
      const len = Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2)
      const rope = MeshBuilder.CreateCylinder('qrope', { height: len, diameter: 0.035 }, this.scene)
      rope.position.set(mx, 0.82, mz)
      rope.rotation.z = Math.PI / 2
      rope.material = ropeMat
    }
  }

  // ── Decorations ──────────────────────────────────────────────────────────

  private _buildDecor(): void {
    // Potted plants (near left wall corners)
    for (const z of [-4.5, 3.5]) {
      const potMat = this._mat('#6B4226')
      const pot = MeshBuilder.CreateCylinder('pot', { height: 0.50, diameterTop: 0.48, diameterBottom: 0.32, tessellation: 12 }, this.scene)
      pot.position.set(-RW / 2 + 1.0, 0.25, z); pot.material = potMat
      const leafMat = this._mat('#2D8B2D')
      const leaf = MeshBuilder.CreateSphere('leaf', { diameter: 0.85, segments: 8 }, this.scene)
      leaf.position.set(-RW / 2 + 1.0, 0.80, z); leaf.material = leafMat
    }

    // Ticket/queue number dispenser near entrance (right side)
    const dispMat = this._mat('#555555')
    const disp = MeshBuilder.CreateBox('disp', { width: 0.35, depth: 0.28, height: 1.15 }, this.scene)
    disp.position.set(4.5, 0.58, -5.0); disp.material = dispMat
    const dscreenMat = this._flatMat('#00CC66')
    const dscreen = MeshBuilder.CreatePlane('dscr', { width: 0.28, height: 0.18 }, this.scene)
    dscreen.position.set(4.5, 0.95, -5.15); dscreen.material = dscreenMat

    // Wall clock on the back wall
    const clockMat = this._mat('#F5F0EB')
    const clock = MeshBuilder.CreateCylinder('clock', { height: 0.06, diameter: 0.8, tessellation: 24 }, this.scene)
    clock.position.set(4.5, 2.8, RD / 2 - 0.04); clock.rotation.x = Math.PI / 2; clock.material = clockMat
    const faceMat = this._flatMat('#FFFFFF')
    const face = MeshBuilder.CreateCylinder('cface', { height: 0.02, diameter: 0.72, tessellation: 24 }, this.scene)
    face.position.set(4.5, 2.8, RD / 2 - 0.08); face.rotation.x = Math.PI / 2; face.material = faceMat

    // "CASHIER" sign above counters on back wall
    const signTex = new DynamicTexture('cashierTex', { width: 512, height: 64 }, this.scene, true)
    const ctx = signTex.getContext() as unknown as CanvasRenderingContext2D
    ctx.fillStyle = '#F0EBE3'; ctx.fillRect(0, 0, 512, 64)
    ctx.fillStyle = '#1B3A5C'; ctx.font = 'bold 40px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('CASHIER', 256, 46)
    signTex.update()
    const signMat = new StandardMaterial('cashierMat', this.scene)
    signMat.disableLighting = true; signMat.emissiveTexture = signTex; signMat.emissiveColor = Color3.White()
    const signP = MeshBuilder.CreatePlane('cashierSign', { width: 4.5, height: 0.5 }, this.scene)
    signP.position.set(0, 3.0, RD / 2 - 0.06); signP.material = signMat

    // Brochure stand (right area)
    const standMat = this._mat('#4A4A4A')
    const stand = MeshBuilder.CreateBox('bstand', { width: 0.5, depth: 0.3, height: 1.2 }, this.scene)
    stand.position.set(5.5, 0.6, -2.0); stand.material = standMat
    // Paper slots
    for (let j = 0; j < 3; j++) {
      const paper = MeshBuilder.CreateBox('bpaper' + j, { width: 0.44, depth: 0.02, height: 0.25 }, this.scene)
      paper.position.set(5.5, 0.40 + j * 0.35, -1.87); paper.material = this._flatMat(j === 0 ? '#3399FF' : j === 1 ? '#FF6633' : '#33CC66')
    }
  }

  start(): void { this.engine.runRenderLoop(() => this.scene.render()) }
  dispose(): void { this.engine.dispose() }
}

import {
  Engine, Scene, ArcRotateCamera, HemisphericLight, DirectionalLight,
  MeshBuilder, StandardMaterial, Color3, Color4, Vector3, DynamicTexture, Texture,
} from '@babylonjs/core'

const RW = 14, RD = 12, WALL_H = 3.4, WALL_T = 0.22

export interface MediaTheme {
  primary: string
  accent: string
  wallTint: string
  floorBase: string
  floorAlt: string
}

export const MEDIA_THEMES: Record<string, MediaTheme> = {
  'TVC Studios': {
    primary: '#C8102E', accent: '#1A3A6B', wallTint: '#1A1A2A',
    floorBase: '#222233', floorAlt: '#1A1A28',
  },
  'Channels TV': {
    primary: '#003DA5', accent: '#C8A84B', wallTint: '#1A1A2A',
    floorBase: '#222233', floorAlt: '#1A1A28',
  },
}

const DEFAULT_THEME: MediaTheme = {
  primary: '#C8102E', accent: '#1A3A6B', wallTint: '#1A1A2A',
  floorBase: '#222233', floorAlt: '#1A1A28',
}

export class MediaScene {
  readonly engine: Engine
  readonly scene: Scene
  private _t: MediaTheme

  constructor(canvas: HTMLCanvasElement, private _name: string, private _logo?: string) {
    this._t = MEDIA_THEMES[_name] ?? DEFAULT_THEME
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
    amb.intensity = 0.85; amb.diffuse = new Color3(1, 0.97, 0.92)
    amb.groundColor = new Color3(0.35, 0.35, 0.40)
    const sun = new DirectionalLight('hsun', new Vector3(-0.6, -0.8, 0.6), this.scene)
    sun.intensity = 0.6; sun.diffuse = new Color3(1, 0.96, 0.88)

    this._buildRoom()
    this._buildNewsDesk()
    this._buildCameras()
    this._buildGreenScreen()
    this._buildControlRoom()
    this._buildLightingRig()
    this._buildDecor()
  }

  private _flatMat(hex: string): StandardMaterial {
    const m = new StandardMaterial('mf_' + Math.random(), this.scene)
    m.disableLighting = true
    m.emissiveColor = Color3.FromHexString(hex)
    m.diffuseColor = Color3.Black(); m.specularColor = Color3.Black()
    return m
  }

  private _mat(hex: string): StandardMaterial {
    const m = new StandardMaterial('mm_' + Math.random(), this.scene)
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
      const lp = MeshBuilder.CreatePlane('logop', { width: 1.8, height: 1.8 }, this.scene)
      lp.position.set(5.0, 2.5, RD / 2 - 0.10); lp.material = logoMat
    }
  }

  private _buildNewsDesk(): void {
    const t = this._t
    // Curved-front anchor desk (center-back)
    const deskMat = this._mat(t.primary)
    const desk = MeshBuilder.CreateBox('nDesk', { width: 4.5, depth: 1.2, height: 1.0 }, this.scene)
    desk.position.set(0, 0.50, RD / 2 - 2.5); desk.material = deskMat
    const deskTop = MeshBuilder.CreateBox('nDTop', { width: 4.7, depth: 1.3, height: 0.06 }, this.scene)
    deskTop.position.set(0, 1.03, RD / 2 - 2.5); deskTop.material = this._mat('#2A2A3A')

    // 2 anchor chairs
    for (let i = 0; i < 2; i++) {
      const cx = -1.0 + i * 2.0
      const seat = MeshBuilder.CreateBox('aCh' + i, { width: 0.50, depth: 0.50, height: 0.06 }, this.scene)
      seat.position.set(cx, 0.52, RD / 2 - 3.8); seat.material = this._mat('#333333')
      const chBack = MeshBuilder.CreateBox('aChB' + i, { width: 0.50, depth: 0.06, height: 0.55 }, this.scene)
      chBack.position.set(cx, 0.82, RD / 2 - 4.0); chBack.material = this._mat('#333333')
      const chLeg = MeshBuilder.CreateCylinder('aChL' + i, { height: 0.50, diameter: 0.06, tessellation: 8 }, this.scene)
      chLeg.position.set(cx, 0.25, RD / 2 - 3.8); chLeg.material = this._mat('#666666')
    }

    // Microphones on desk
    for (let i = 0; i < 2; i++) {
      const mx = -0.8 + i * 1.6
      const mic = MeshBuilder.CreateCylinder('mic' + i, { height: 0.22, diameterTop: 0.04, diameterBottom: 0.03, tessellation: 6 }, this.scene)
      mic.position.set(mx, 1.15, RD / 2 - 2.8); mic.material = this._mat('#222222')
      const micHead = MeshBuilder.CreateSphere('micH' + i, { diameter: 0.07, segments: 6 }, this.scene)
      micHead.position.set(mx, 1.28, RD / 2 - 2.8); micHead.material = this._mat('#444444')
    }

    // Backdrop screen (large monitor behind desk)
    const bgFrame = MeshBuilder.CreateBox('bgFr', { width: 6.0, depth: 0.08, height: 2.5 }, this.scene)
    bgFrame.position.set(0, 2.0, RD / 2 - 0.06); bgFrame.material = this._mat('#111111')
    const bgTex = new DynamicTexture('bgTex', { width: 640, height: 280 }, this.scene, true)
    const ctx = bgTex.getContext() as unknown as CanvasRenderingContext2D
    const pc = Color3.FromHexString(t.primary)
    ctx.fillStyle = `rgb(${Math.round(pc.r * 255)},${Math.round(pc.g * 255)},${Math.round(pc.b * 255)})`
    ctx.fillRect(0, 0, 640, 280)
    ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 36px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(this._name.toUpperCase(), 320, 80)
    ctx.font = '20px sans-serif'
    ctx.fillText('BREAKING NEWS', 320, 130)
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(40, 150, 560, 2)
    ctx.fillStyle = '#FFD700'; ctx.font = 'bold 22px sans-serif'
    ctx.fillText('LIVE FROM LAGOS', 320, 190)
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '16px sans-serif'
    ctx.fillText('09:00 WAT  •  TOP STORIES  •  MARKETS UP 2.4%', 320, 240)
    bgTex.update()
    const bgMat = new StandardMaterial('bgMat', this.scene)
    bgMat.disableLighting = true; bgMat.emissiveTexture = bgTex; bgMat.emissiveColor = Color3.White()
    const bgScr = MeshBuilder.CreatePlane('bgScr', { width: 5.8, height: 2.3 }, this.scene)
    bgScr.position.set(0, 2.0, RD / 2 - 0.12); bgScr.material = bgMat
  }

  private _buildCameras(): void {
    // 3 camera tripods facing the desk
    const camPositions = [[-3.5, -2.0], [0, -4.5], [3.5, -2.0]]
    for (let c = 0; c < 3; c++) {
      const [cx, cz] = camPositions[c]
      // Tripod legs
      const tripod = MeshBuilder.CreateCylinder('tri' + c, { height: 1.2, diameter: 0.05, tessellation: 6 }, this.scene)
      tripod.position.set(cx, 0.60, cz); tripod.material = this._mat('#333333')
      // Camera body
      const cam = MeshBuilder.CreateBox('cam' + c, { width: 0.45, depth: 0.30, height: 0.25 }, this.scene)
      cam.position.set(cx, 1.30, cz); cam.material = this._mat('#1A1A1A')
      // Lens
      const lens = MeshBuilder.CreateCylinder('lens' + c, { height: 0.15, diameter: 0.12, tessellation: 8 }, this.scene)
      lens.position.set(cx, 1.30, cz + 0.22); lens.material = this._mat('#333333')
      lens.rotation.x = Math.PI / 2
      // Red recording light
      const rec = MeshBuilder.CreateSphere('rec' + c, { diameter: 0.06, segments: 6 }, this.scene)
      rec.position.set(cx + 0.18, 1.42, cz); rec.material = this._flatMat('#FF0000')
      // Viewfinder
      const vf = MeshBuilder.CreateBox('vf' + c, { width: 0.10, depth: 0.08, height: 0.08 }, this.scene)
      vf.position.set(cx - 0.15, 1.42, cz - 0.08); vf.material = this._mat('#222222')
    }
  }

  private _buildGreenScreen(): void {
    // Green screen on left wall (for effects/keying)
    const gsMat = this._flatMat('#00B140')
    const gs = MeshBuilder.CreatePlane('greenSc', { width: 4.0, height: 2.8 }, this.scene)
    gs.position.set(-RW / 2 + 0.06, 1.6, -3.0)
    gs.rotation.y = Math.PI / 2; gs.material = gsMat
    // Frame
    const gsFrame = MeshBuilder.CreateBox('gsFr', { width: 0.08, depth: 4.2, height: 3.0 }, this.scene)
    gsFrame.position.set(-RW / 2 + 0.10, 1.6, -3.0); gsFrame.material = this._mat('#333333')
  }

  private _buildControlRoom(): void {
    // Control desk (left-back corner) with mixer board and monitors
    const dMat = this._mat('#2A2A3A')
    const ctrlDesk = MeshBuilder.CreateBox('ctrlD', { width: 3.5, depth: 1.2, height: 0.80 }, this.scene)
    ctrlDesk.position.set(-4.5, 0.40, 3.5); ctrlDesk.material = dMat

    // Mixer board (sliders)
    const mixerMat = this._mat('#1A1A1A')
    const mixer = MeshBuilder.CreateBox('mixer', { width: 2.5, depth: 0.8, height: 0.08 }, this.scene)
    mixer.position.set(-4.5, 0.84, 3.5); mixer.material = mixerMat
    // Slider rows
    for (let s = 0; s < 8; s++) {
      const slider = MeshBuilder.CreateBox('sl' + s, { width: 0.04, depth: 0.15, height: 0.12 }, this.scene)
      slider.position.set(-5.4 + s * 0.30, 0.92, 3.5)
      slider.material = this._flatMat(s % 2 === 0 ? '#44FF44' : '#FF4444')
    }

    // 3 small monitors above mixer
    for (let m = 0; m < 3; m++) {
      const mon = MeshBuilder.CreateBox('ctrlM' + m, { width: 0.80, depth: 0.06, height: 0.50 }, this.scene)
      mon.position.set(-5.2 + m * 1.0, 1.40, 3.8); mon.material = this._mat('#111111')
      const scr = MeshBuilder.CreatePlane('ctrlS' + m, { width: 0.70, height: 0.40 }, this.scene)
      scr.position.set(-5.2 + m * 1.0, 1.40, 3.77)
      const scrColors = ['#224488', '#228844', '#882244']
      scr.material = this._flatMat(scrColors[m])
    }

    // Control chair
    const cSeat = MeshBuilder.CreateBox('cSeat', { width: 0.55, depth: 0.55, height: 0.06 }, this.scene)
    cSeat.position.set(-4.5, 0.50, 2.0); cSeat.material = this._mat('#333333')
    const cBack = MeshBuilder.CreateBox('cBack', { width: 0.55, depth: 0.06, height: 0.55 }, this.scene)
    cBack.position.set(-4.5, 0.80, 1.75); cBack.material = this._mat('#333333')
  }

  private _buildLightingRig(): void {
    // Overhead studio lights (3 across ceiling area)
    for (let l = 0; l < 3; l++) {
      const lx = -3.0 + l * 3.0
      // Mounting arm
      const arm = MeshBuilder.CreateCylinder('lArm' + l, { height: 0.60, diameter: 0.04, tessellation: 6 }, this.scene)
      arm.position.set(lx, WALL_H - 0.5, 0); arm.material = this._mat('#444444')
      // Light housing
      const housing = MeshBuilder.CreateBox('lHouse' + l, { width: 0.50, depth: 0.40, height: 0.30 }, this.scene)
      housing.position.set(lx, WALL_H - 0.95, 0); housing.material = this._mat('#222222')
      // Barn doors
      for (const side of [-0.28, 0.28]) {
        const door = MeshBuilder.CreateBox('lDoor' + l + side, { width: 0.50, depth: 0.02, height: 0.15 }, this.scene)
        door.position.set(lx, WALL_H - 0.85, side); door.material = this._mat('#111111')
      }
      // Light face (warm glow)
      const face = MeshBuilder.CreatePlane('lFace' + l, { width: 0.40, height: 0.20 }, this.scene)
      face.position.set(lx, WALL_H - 1.10, 0)
      face.rotation.x = Math.PI / 2; face.material = this._flatMat('#FFFFAA')
    }
  }

  private _buildDecor(): void {
    // "ON AIR" sign on left wall
    const oaTex = new DynamicTexture('oaTex', { width: 256, height: 80 }, this.scene, true)
    const ctx = oaTex.getContext() as unknown as CanvasRenderingContext2D
    ctx.fillStyle = '#CC0000'; ctx.fillRect(0, 0, 256, 80)
    ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 40px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('ON AIR', 128, 56)
    oaTex.update()
    const oaMat = new StandardMaterial('oaM', this.scene)
    oaMat.disableLighting = true; oaMat.emissiveTexture = oaTex; oaMat.emissiveColor = Color3.White()
    const oaSign = MeshBuilder.CreatePlane('oaSign', { width: 1.2, height: 0.40 }, this.scene)
    oaSign.position.set(-RW / 2 + 0.04, 2.8, 1.5)
    oaSign.rotation.y = Math.PI / 2; oaSign.material = oaMat

    // Teleprompter (in front of center camera)
    const tpFrame = MeshBuilder.CreateBox('tpFr', { width: 0.45, depth: 0.35, height: 0.35 }, this.scene)
    tpFrame.position.set(0, 1.55, -3.8); tpFrame.material = this._mat('#111111')
    const tpGlass = new StandardMaterial('tpGl', this.scene)
    tpGlass.diffuseColor = new Color3(0.8, 0.85, 0.9); tpGlass.alpha = 0.3
    const tpScr = MeshBuilder.CreatePlane('tpScr', { width: 0.40, height: 0.30 }, this.scene)
    tpScr.position.set(0, 1.55, -3.6); tpScr.material = tpGlass

    // Cable runs on floor
    const cableMat = this._mat('#222222')
    for (let c = 0; c < 3; c++) {
      const cable = MeshBuilder.CreateCylinder('cable' + c, { height: 6.0, diameter: 0.04, tessellation: 4 }, this.scene)
      cable.position.set(-2.0 + c * 2.0, 0.02, -1.0)
      cable.rotation.x = Math.PI / 2; cable.material = cableMat
    }
  }

  start(): void { this.engine.runRenderLoop(() => this.scene.render()) }
  dispose(): void { this.engine.dispose() }
}

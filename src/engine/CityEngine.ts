import {
  Engine, Scene, ArcRotateCamera, Vector3, Color3, Color4,
  HemisphericLight, DirectionalLight, MeshBuilder, StandardMaterial,
  Matrix, Mesh, DynamicTexture, Texture, ParticleSystem, TransformNode,
} from '@babylonjs/core'
import type { BuildingDef, CityDef, WorldUser } from '../world/types'
import { mlHomePosition, islHomePosition } from '../world/lagos'
import { BUILDING_TYPES } from '../world/buildingTypes'
import type { ModelTemplate } from './ModelLoader'
import { loadModel, placeModel } from './ModelLoader'

export interface LabelData {
  id: string; name: string; emoji: string; sx: number; sy: number
}

export interface PostBubbleData {
  id: string; name: string; avatarUrl?: string
  sx: number; sy: number; remaining: number  // 0→1, used for fade-out
}

export type CityEvent =
  | { type: 'pick-building';  building: BuildingDef }
  | { type: 'pick-signpost';  building: BuildingDef; ownerId: string }
  | { type: 'pick-empty' }

interface CarState {
  mesh: Mesh        // invisible phantom used for freeze tracking
  node: TransformNode  // visual root (GLB or plain mesh parent)
  route: { ax: number; az: number; bx: number; bz: number }
  t: number; speed: number
}

export class CityEngine {
  readonly engine: Engine
  readonly scene: Scene
  readonly camera: ArcRotateCamera

  onEvent?:      (e: CityEvent) => void
  onLabels?:     (labels: LabelData[]) => void
  onPostBubble?: (bubbles: PostBubbleData[]) => void
  onProgress?:   (pct: number) => void
  onStatus?:     (msg: string) => void

  private readonly _bscale = 0.62         // visual scale — city layout designed at this value
  private _mats = new Map<string, StandardMaterial>()
  private _signTextures = new Map<string, DynamicTexture>()
  private _signMeshes   = new Map<string, BuildingDef>()   // sign mesh name → def (only pickable user signs)
  private _userHomesPlaced = new Set<string>()
  private _buildings: Array<{ mesh: Mesh; def: BuildingDef }> = []
  private _cars: CarState[] = []
  private _rotors: Mesh[] = []
  private _down = false; private _rdown = false
  private _mx = 0; private _my = 0; private _moved = false
  private _lastTimeUpdate = 0
  private _wmove!: (e: PointerEvent) => void
  private _wup!:   (e: PointerEvent) => void
  private _ambLight?: HemisphericLight
  private _sunLight?: DirectionalLight
  private _streetLampMeshes: Mesh[] = []
  private _streetLightsOn = false
  private _rainSystem?: ParticleSystem
  private _rainActive = false
  private _rainStartMs = 0
  private _ledMat?: StandardMaterial
  private _slideAccMs = 0
  private _lastLodMs = 0
  private _modelTmpls = new Map<string, ModelTemplate>()
  private _homeWorldPos = new Map<string, Vector3>()
  private _postBubbles: Array<{
    userId: string; name: string; avatarUrl?: string
    worldPos: Vector3; expiresAt: number
  }> = []

  constructor(private cv: HTMLCanvasElement) {
    // Cap DPR at 1.5 on mobile — a 3× backbuffer (iPhone DPR=3) is 9× the GPU work for no visible gain
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    this.engine = new Engine(cv, true, { antialias: false, preserveDrawingBuffer: false, adaptToDeviceRatio: false })
    this.engine.setHardwareScalingLevel(1 / dpr)
    this.scene = new Scene(this.engine)
    this.scene.hoverCursor = 'crosshair'
    this.scene.clearColor = new Color4(0.55, 0.80, 0.95, 1)
    this.scene.fogMode = Scene.FOGMODE_LINEAR
    this.scene.fogColor = new Color3(0.55, 0.78, 0.95)
    this.scene.fogStart = 90
    this.scene.fogEnd = 260

    this.camera = this._makeCamera()
    this._lighting()
    this._ground()
    this._roads()
    this._streetGrid()
    this._palms()
    this._billboards()
    this._scatterTrees()
    this._fountains()
    // player character disabled — will re-enable when cars/movement feature ships
    this._input()
  }

  // ── Model loading + city build (async) ────────────────────────────────────

  async loadAndBuild(city: CityDef): Promise<void> {
    const KK  = '/models/kaykit/'
    const OLD = '/models/buildings/'

    const kkCars = ['sedan','hatchback','taxi','police','stationwagon']

    const knSky = ['a','b','c','d','e'].map(l => ({ file: `building-skyscraper-${l}`, key: `kn_sky_${l}` }))
    const knBld = ['a','b','c','d','e','f','g','h'].map(l => ({ file: `building-${l}`, key: `kn_${l}` }))
    const knQut = [
      { file: 'quat_1story',        key: 'kn_q1'   },
      { file: 'quat_1story_gableroof', key: 'kn_q1g' },
      { file: 'quat_1story_roundroof', key: 'kn_q1rr' },
      { file: 'quat_2story_sidehouse', key: 'kn_q2sh' },
      { file: 'quat_2story',        key: 'kn_q2'   },
      { file: 'quat_3story_small',  key: 'kn_q3'   },
      { file: 'quat_4story',        key: 'kn_q4'   },
    ]
    const knAll = [...knSky, ...knBld, ...knQut]

    let loaded = 0
    const total = kkCars.length + knAll.length
    // Track the highest progress value emitted so far — late-finishing model loads
    // (after the 12s race timeout) must never pull the bar backward from 90/100.
    let emittedMax = 0
    const emitProgress = (pct: number) => {
      if (pct > emittedMax) { emittedMax = pct; this.onProgress?.(pct) }
    }

    const safeLoad = (basePath: string, filename: string, key: string) =>
      loadModel(this.scene, basePath, filename + (basePath === KK ? '.gltf' : '.glb'))
        .then(t => {
          if (!t) return
          this._modelTmpls.set(key, t)
        })
        .catch(() => {})
        .finally(() => { emitProgress(Math.round(++loaded / total * 85)) })

    const loads = Promise.all([
      ...kkCars.map(c =>      safeLoad(KK,  `car_${c}`,  `car_${c}`)),
      ...knAll.map(({ file, key }) => safeLoad(OLD, file, key)),
    ]).catch(() => {})
    console.log('[CityEngine] awaiting model load race…')
    await Promise.race([loads, new Promise<void>(r => setTimeout(r, 12000))])
    console.log('[CityEngine] models done, setting 90%')
    emitProgress(90)
    this.onStatus?.(`Models loaded: ${this._modelTmpls.size}/${total}`)

    // Yield to the event loop so React can paint 90% before the synchronous city build blocks the thread
    await new Promise<void>(r => setTimeout(r, 50))

    try {
      this._buildCity(city)
      this._cars_spawn()
    } catch (e) {
      console.error('[CityEngine] build error:', e)
    }
    try {
      this._freezeStaticMeshes()
      this._initRain()
      this._updateTimeOfDay()
    } catch (e) {
      console.error('[CityEngine] post-build error:', e)
    }
    emitProgress(100)
    console.log('[CityEngine] load complete 100%')
  }

  // ── Camera ────────────────────────────────────────────────────────────────

  private _makeCamera(): ArcRotateCamera {
    const cam = new ArcRotateCamera('cam', -Math.PI / 2, Math.PI / 3.6, 160, new Vector3(0, 0, 0), this.scene)
    cam.minZ = 0.5; cam.maxZ = 900
    cam.lowerRadiusLimit = 20; cam.upperRadiusLimit = 280
    cam.lowerBetaLimit = 0.22; cam.upperBetaLimit = Math.PI / 2.05
    return cam
  }

  // ── Lighting ──────────────────────────────────────────────────────────────

  private _lighting(): void {
    const amb = new HemisphericLight('amb', new Vector3(0, 1, 0), this.scene)
    amb.intensity = 0.60
    amb.diffuse = new Color3(1, 0.97, 0.93)
    amb.groundColor = new Color3(0.28, 0.36, 0.22)
    this._ambLight = amb

    const sun = new DirectionalLight('sun', new Vector3(-0.5, -1.2, 0.8), this.scene)
    sun.intensity = 0.80
    sun.diffuse = new Color3(1, 0.96, 0.88)
    this._sunLight = sun
  }

  // ── Materials ─────────────────────────────────────────────────────────────

  private _mat(hex: string): StandardMaterial {
    if (this._mats.has(hex)) return this._mats.get(hex)!
    const m = new StandardMaterial('m' + hex, this.scene)
    m.diffuseColor = Color3.FromHexString(hex)
    m.specularColor = new Color3(0.04, 0.04, 0.04)
    this._mats.set(hex, m)
    return m
  }

  // ── Ground ────────────────────────────────────────────────────────────────

  private _ground(): void {
    const ml = MeshBuilder.CreateBox('gml', { width: 300, height: 0.5, depth: 200 }, this.scene)
    ml.position.set(0, -0.25, 80); ml.material = this._mat('#7B8C52')

    const lag = MeshBuilder.CreateBox('glag', { width: 300, height: 0.6, depth: 30 }, this.scene)
    lag.position.set(0, 0.1, 0); lag.material = this._mat('#1B7FC7'); lag.isPickable = false

    const isl = MeshBuilder.CreateBox('gisl', { width: 300, height: 0.5, depth: 200 }, this.scene)
    isl.position.set(0, -0.25, -80); isl.material = this._mat('#899558')
  }

  // ── Roads ─────────────────────────────────────────────────────────────────

  private _roads(): void {
    const roadM   = this._mat('#1A1A1A')
    const bridgeM = this._mat('#222222')
    const medM    = this._mat('#F5C518')

    const ml = MeshBuilder.CreateBox('rml', { width: 190, height: 0.12, depth: 3.0 }, this.scene)
    ml.position.set(0, 0.06, 22); ml.material = roadM; ml.isPickable = false

    const isl = MeshBuilder.CreateBox('risl', { width: 190, height: 0.12, depth: 3.0 }, this.scene)
    isl.position.set(0, 0.06, -22); isl.material = roadM; isl.isPickable = false

    const med1 = MeshBuilder.CreateBox('med1', { width: 190, height: 0.18, depth: 0.28 }, this.scene)
    med1.position.set(0, 0.13, 22); med1.material = medM; med1.isPickable = false

    const med2 = MeshBuilder.CreateBox('med2', { width: 190, height: 0.18, depth: 0.28 }, this.scene)
    med2.position.set(0, 0.13, -22); med2.material = medM; med2.isPickable = false

    const b1 = MeshBuilder.CreateBox('br1', { width: 4, height: 0.7, depth: 30 }, this.scene)
    b1.position.set(0, 0.35, 0); b1.material = bridgeM; b1.isPickable = false

    const b2 = MeshBuilder.CreateBox('br2', { width: 4, height: 0.7, depth: 30 }, this.scene)
    b2.position.set(25, 0.35, 0); b2.material = bridgeM; b2.isPickable = false

    // Road & bridge text painted on the surface
    this._roadText('ml',  'MAINLAND',               -20, 22,  0,         18, 2.2, 0.22, 512,  'bold 44px Arial')
    this._roadText('isl', 'ISLAND',                  20, -22, 0,         12, 2.2, 0.22, 512,  'bold 44px Arial')
    this._roadText('br',  'THIRD MAINLAND BRIDGE',    0,  0,  Math.PI/2, 28, 1.8, 0.76, 1024, 'bold 34px Arial')
  }

  private _roadText(id: string, text: string, x: number, z: number, rotY: number, planeW: number, planeD: number, y = 0.22, texW = 512, font = 'bold 44px Arial'): void {
    const tex = new DynamicTexture('rdt' + id, { width: texW, height: 64 }, this.scene, false)
    tex.drawText(text, null, null, font, '#FFD700', '#1A1A1A', true, true)
    tex.hasAlpha = false

    const mat = new StandardMaterial('rdm' + id, this.scene)
    mat.diffuseTexture = tex
    mat.emissiveColor = new Color3(1, 0.85, 0)
    mat.backFaceCulling = false
    mat.disableLighting = true

    const plane = MeshBuilder.CreatePlane('rdp' + id, { width: planeW, height: planeD }, this.scene)
    plane.rotation.x = Math.PI / 2
    plane.rotation.y = rotY
    plane.position.set(x, y, z)
    plane.material = mat
    plane.isPickable = false
  }

  // ── Buildings ─────────────────────────────────────────────────────────────

  private _buildCity(city: CityDef): void {
    const boxes: Array<{ cx: number; cz: number; hw: number; hd: number }> = []
    for (const b of city.buildings) {
      const s = this._applySpread(b)
      const p = this._pushClear(s, boxes)
      this._makeBuilding(p)
      if (p.type !== 'club') {
        const S = this._bscale
        boxes.push({ cx: p.x, cz: p.z, hw: p.w * S / 2 + 1.5, hd: p.d * S / 2 + 1.5 })
      }
    }
  }

  private _pushClear(
    b: BuildingDef,
    boxes: Array<{ cx: number; cz: number; hw: number; hd: number }>,
  ): BuildingDef {
    if (b.type === 'home' || b.type === 'club') return b
    const S = this._bscale
    let x = b.x, z = b.z
    const hw = b.w * S / 2 + 1.5
    const hd = b.d * S / 2 + 1.5
    for (let pass = 0; pass < 3; pass++) {
      for (const o of boxes) {
        const ox = hw + o.hw - Math.abs(x - o.cx)
        const oz = hd + o.hd - Math.abs(z - o.cz)
        if (ox > 0 && oz > 0) {
          if (ox <= oz) x += x >= o.cx ? ox : -ox
          else          z += z >= o.cz ? oz : -oz
        }
      }
    }
    return { ...b, x, z }
  }

  private _applySpread(b: BuildingDef): BuildingDef {
    if (b.type === 'home' || b.type === 'club' || b.businessId) return b
    const zone = b.z > 0 ? 22 : -22
    const S = this._bscale
    let nx = b.x * 1.5
    let nz = zone + (b.z - zone) * 1.4

    // Push away from N-S avenues (x = -24, -8, 8, 24) — road width 3
    for (const ax of [-24, -8, 8, 24]) {
      const clearance = (b.w * S) / 2 + 1.5
      if (Math.abs(nx - ax) < clearance) {
        nx = ax + (nx >= ax ? clearance : -clearance)
      }
    }
    // Push away from main E-W road (zone) and mid cross road (zone±34)
    const crossZ = zone > 0 ? 56 : -56
    for (const rz of [crossZ]) {
      const clearance = (b.d * S) / 2 + 2.2
      if (Math.abs(nz - rz) < clearance) {
        nz = rz + (nz >= rz ? clearance : -clearance)
      }
    }

    // Keep commercial buildings clear of residential zones (homes start at ±98)
    if (zone > 0) nz = Math.min(nz, 88)
    else          nz = Math.max(nz, -88)

    return { ...b, x: nx, z: nz }
  }

  // All buildings → Kenney/Quaternius pack.
  private static readonly _B_MODELS: Partial<Record<string, string[]>> = {
    home:       ['kn_q1','kn_q1g','kn_q1rr','kn_q2sh'],
    office:     ['kn_sky_a','kn_sky_b','kn_sky_c','kn_sky_d','kn_sky_e'],
    hotel:      ['kn_sky_b','kn_sky_c','kn_sky_d'],
    bank:       ['kn_a','kn_b','kn_c','kn_d'],
    shop:       ['kn_e','kn_f','kn_q4'],
    cafe:       ['kn_q2','kn_g'],
    restaurant: ['kn_q2','kn_q3','kn_f'],
    gym:        ['kn_q3','kn_h'],
    barber:     ['kn_q2'],
    beauty:     ['kn_q2','kn_q3'],
    bar:        ['kn_q2','kn_g'],
    media:      ['kn_d','kn_e'],
  }

  private _makeBuilding(b: BuildingDef): void {
    if (b.type === 'club') { this._makeClubCampus(b); return }

    // Procedural fallbacks for special types (used when GLB not available)
    const noGlb = !CityEngine._B_MODELS[b.type] ||
      !CityEngine._B_MODELS[b.type]!.some(n => this._modelTmpls.has(n))
    if (noGlb) {
      if (b.type === 'home') { this._makeHome(b); return }
    }

    const S = this._bscale
    const w = b.w * S, d = b.d * S, h = b.h * S

    // Try GLB model first
    const modelList = CityEngine._B_MODELS[b.type]
    if (modelList) {
      // Pick model deterministically per building id; try others if chosen one isn't loaded
      const hash = b.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
      let tmpl: ModelTemplate | undefined
      for (let i = 0; i < modelList.length; i++) {
        const k = modelList[(hash + i) % modelList.length]
        tmpl = this._modelTmpls.get(k)
        if (tmpl) break
      }
      if (tmpl) {
        this._pavement(b.id, b.x, b.z, w + 1.2, d + 1.2)
        const scale = Math.max(w, d) / 2.0
        // Random facing (90° increments) for visual variety
        const rotVariants = [0, Math.PI / 2, Math.PI, -Math.PI / 2]
        const ry = rotVariants[hash % 4]
        placeModel(this.scene, tmpl, b.id, b.x, 0, b.z, ry, scale)
        if (b.type === 'home') this._addHomeSignpost(b)
        // Invisible click box for interactivity
        const hitBox = MeshBuilder.CreateBox(b.id + '_hit', { width: w, height: h, depth: d }, this.scene)
        hitBox.position.set(b.x, h / 2, b.z)
        hitBox.visibility = 0
        hitBox.material = this._mat('#000000')
        this._buildings.push({ mesh: hitBox, def: b })
        return
      }
    }

    // Fallback: procedural box
    const ty = BUILDING_TYPES[b.type]
    this._pavement(b.id, b.x, b.z, w + 1.0, d + 1.0)
    const mesh = MeshBuilder.CreateBox(b.id, { width: w, height: h, depth: d }, this.scene)
    mesh.position.set(b.x, h / 2, b.z)
    mesh.material = this._mat(ty.color)
    this._buildings.push({ mesh, def: b })
    if (h > 1.8) {
      const c = Color3.FromHexString(ty.color)
      const darkHex = '#' + [c.r, c.g, c.b].map(v =>
        Math.round(v * 0.65 * 255).toString(16).padStart(2, '0')
      ).join('')
      const roof = MeshBuilder.CreateBox(b.id + '_r', { width: w * 0.94, height: 0.22, depth: d * 0.94 }, this.scene)
      roof.position.set(b.x, h + 0.11, b.z)
      roof.material = this._mat(darkHex); roof.isPickable = false
    }

    // Logo sign on front face
    const brand = CityEngine._BRAND_LOGOS[b.name]
    if (brand) {
      const signW = Math.min(w * 0.85, 2.5), signH = Math.min(h * 0.25, 1.2)
      const mat = new StandardMaterial(b.id + '_logom', this.scene)
      mat.disableLighting = true; mat.emissiveColor = Color3.White()

      if (brand.img) {
        const imgTex = new Texture('/logos/' + brand.img, this.scene)
        mat.emissiveTexture = imgTex
      } else {
        const tex = new DynamicTexture(b.id + '_logo', { width: 512, height: 128 }, this.scene, false)
        const lc = tex.getContext() as unknown as CanvasRenderingContext2D
        lc.fillStyle = brand.bg; lc.fillRect(0, 0, 512, 128)
        lc.fillStyle = brand.fg; lc.font = `bold ${brand.size ?? 38}px ${brand.font ?? 'Arial'}`
        lc.textAlign = 'center'; lc.textBaseline = 'middle'
        lc.fillText(brand.text, 256, 64)
        tex.update()
        mat.emissiveTexture = tex
      }

      const signMesh = MeshBuilder.CreateBox(b.id + '_sign', { width: signW, height: signH, depth: 0.04 }, this.scene)
      const fz = b.z < 0 ? b.z + d / 2 + 0.03 : b.z - d / 2 - 0.03
      signMesh.position.set(b.x, h * 0.75, fz)
      signMesh.material = mat; signMesh.isPickable = false
    }
  }

  private static readonly _BRAND_LOGOS: Record<string, { text: string; bg: string; fg: string; font?: string; size?: number; img?: string }> = {
    'Dangote HQ':       { text: 'DANGOTE',         bg: '#003399', fg: '#FFFFFF', font: 'Arial', size: 44, img: 'dangote.webp' },
    'MTN Nigeria':      { text: 'MTN',             bg: '#FFCC00', fg: '#000000', font: 'Arial', size: 56, img: 'mtn.webp' },
    'First Bank':       { text: 'FirstBank',       bg: '#003366', fg: '#FFFFFF', font: 'Arial', size: 42, img: 'firstbank.webp' },
    'Shoprite Yaba':    { text: 'Shoprite',        bg: '#EE1C25', fg: '#FFFFFF', font: 'Arial', size: 42, img: 'shoprite.webp' },
    'Chicken Republic': { text: 'Chicken Republic',bg: '#D4001A', fg: '#FFD700', font: 'Arial', size: 28, img: 'chicken republic.webp' },
    'KFC Mainland':     { text: 'KFC',             bg: '#E4002B', fg: '#FFFFFF', font: 'Arial', size: 56, img: 'kfc-logo-.webp' },
    'Konga':            { text: 'KONGA',           bg: '#ED1C24', fg: '#FFFFFF', font: 'Arial', size: 48, img: 'konga.webp' },
    'Mr Biggs':         { text: 'Mr Biggs',        bg: '#D4001A', fg: '#FFFFFF', font: 'Arial', size: 38, img: 'Mr-Biggs.png' },
    'TVC Studios':      { text: 'TVC News',        bg: '#1A1A1A', fg: '#E50914', font: 'Arial', size: 42, img: 'tvc.webp' },
    'Twedot HQ':        { text: 'twedot',          bg: '#1A1A2E', fg: '#4F7CF7', font: 'Arial', size: 48, img: 'twedot.svg' },
    'Eko Hotel':        { text: 'EKO Hotels',      bg: '#1A3C6E', fg: '#C8A84B', font: 'Arial', size: 38, img: 'eko hotel.jpg' },
    'Flutterwave HQ':   { text: 'Flutterwave',    bg: '#FFF5D6', fg: '#F5A623', font: 'Arial', size: 38, img: 'flutterwave.png' },
    'Paystack HQ':      { text: 'paystack',       bg: '#011B33', fg: '#00C3F7', font: 'Arial', size: 44, img: 'paystack.jpeg' },
    'UBA HQ':           { text: 'UBA',             bg: '#CC0000', fg: '#FFFFFF', font: 'Arial', size: 56, img: 'uba.jpg' },
    'Radisson Blu':     { text: 'Radisson Blu',    bg: '#003580', fg: '#FFFFFF', font: 'Arial', size: 36, img: 'radisson-blu.png' },
    'Jumia HQ':         { text: 'JUMIA',           bg: '#FF6900', fg: '#FFFFFF', font: 'Arial', size: 48, img: 'jumia.jpg' },
    'Interswitch':      { text: 'Interswitch',     bg: '#003366', fg: '#F7941D', font: 'Arial', size: 36, img: 'interswitch.jpg' },
    'Channels TV':      { text: 'Channels',        bg: '#003399', fg: '#FF6600', font: 'Arial', size: 42, img: 'channels.webp' },
  }


  // ── Home ──────────────────────────────────────────────────────────────────

  private _makeHome(b: BuildingDef): void {
    const S = this._bscale
    const x = b.x, z = b.z
    const w = b.w * S, d = b.d * S, h = b.h * S

    // Per-user wall colour derived from the building id
    const palette = [
      '#E8D5B7','#F4C6A0','#D4B896','#C9A882',
      '#B8D4C8','#A8C5B8','#D4E8D4','#C8D4B8',
      '#D4C8E8','#C8C0E0','#FADADD','#C5E8C8',
      '#B8CCE8','#F0E0B8','#E8CCDC','#CCE0F0',
    ]
    const idx = b.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % palette.length
    const wallCol = palette[idx]

    const mesh = MeshBuilder.CreateBox(b.id, { width: w, height: h, depth: d }, this.scene)
    mesh.position.set(x, h / 2, z)
    mesh.material = this._mat(wallCol)
    mesh.isPickable = false   // hitbox handles all picking

    // Invisible full-footprint hitbox — only pickable mesh per home
    const hit = MeshBuilder.CreateBox(b.id + '_hit', { width: w + 0.4, height: h + 1.2, depth: d + 0.4 }, this.scene)
    hit.position.set(x, (h + 1.2) / 2, z)
    hit.isVisible = false
    this._buildings.push({ mesh: hit, def: b })

    // Pyramid roof
    const roof = MeshBuilder.CreateCylinder(b.id + '_r', {
      height: w * 0.65, diameterBottom: w * 1.35, diameterTop: 0, tessellation: 4,
    }, this.scene)
    roof.rotation.y = Math.PI / 4
    roof.position.set(x, h + w * 0.32, z)
    roof.material = this._mat('#B03020')
    roof.isPickable = false

    // Front face: toward nearest road
    // Mainland homes (z > 0) face -Z; island homes (z < 0) face +Z
    const frontZ = z > 0 ? z - d / 2 - 0.03 : z + d / 2 + 0.03

    // Door
    const doorW = w * 0.24, doorH = h * 0.36
    const door = MeshBuilder.CreateBox(b.id + '_doo', {
      width: doorW, height: doorH, depth: 0.05,
    }, this.scene)
    door.position.set(x, doorH / 2, frontZ)
    door.material = this._mat('#5A2D0C')
    door.isPickable = false

    // Two windows
    const winW = w * 0.22, winH = h * 0.20
    for (const wx of [-w * 0.28, w * 0.28]) {
      const win = MeshBuilder.CreateBox(b.id + `_w${wx > 0 ? 'r' : 'l'}`, {
        width: winW, height: winH, depth: 0.05,
      }, this.scene)
      win.position.set(x + wx, h * 0.58, frontZ)
      win.material = this._mat('#A8D8F0')
      win.isPickable = false
    }

    // Ad billboard post in front of each house (supports real images via loadAdImage)
    const signOffX = x + w * 0.4
    const signZ2 = z > 0 ? frontZ - 0.9 : frontZ + 0.9
    const poleH = 2.6
    const pole = MeshBuilder.CreateCylinder(b.id + '_hsp', {
      height: poleH, diameter: 0.13, tessellation: 6,
    }, this.scene)
    pole.position.set(signOffX, poleH / 2, signZ2)
    pole.material = this._mat('#4A2A0A'); pole.isPickable = false

    const signW = 2.6, signH = 1.4
    const hTex = new DynamicTexture(b.id + '_htex', { width: 512, height: 256 }, this.scene, false)
    // Static nameplate — house number + colour-matched background, never animated
    {
      const ctx2 = hTex.getContext() as unknown as CanvasRenderingContext2D
      const hnum = (b.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 99) + 1
      ctx2.fillStyle = wallCol
      ctx2.fillRect(0, 0, 512, 256)
      ctx2.strokeStyle = 'rgba(0,0,0,0.25)'
      ctx2.lineWidth = 8
      ctx2.strokeRect(4, 4, 504, 248)
      ctx2.fillStyle = '#FFFFFF'
      ctx2.font = 'bold 100px Arial'
      ctx2.textAlign = 'center'
      ctx2.textBaseline = 'middle'
      ctx2.fillText(String(hnum), 90, 128)
      ctx2.font = 'bold 44px Arial'
      ctx2.fillText('TWEDOT HOME', 310, 90)
      ctx2.font = '34px Arial'
      ctx2.fillStyle = 'rgba(255,255,255,0.75)'
      ctx2.fillText('Twedot World', 310, 160)
      hTex.update()
    }
    const hMat = new StandardMaterial(b.id + '_hmat', this.scene)
    hMat.diffuseTexture = hTex
    hMat.emissiveColor = new Color3(0.90, 0.90, 0.90)
    hMat.backFaceCulling = false
    hMat.disableLighting = true
    const hSign = MeshBuilder.CreatePlane(b.id + '_hsign', { width: signW, height: signH }, this.scene)
    hSign.position.set(signOffX, poleH + signH / 2 + 0.1, signZ2)
    hSign.rotation.y = Math.PI
    hSign.material = hMat
    this._buildings.push({ mesh: hSign, def: b })  // clicking the sign opens the home
    this._signTextures.set(b.id + '_sign', hTex)
    // NOT added to _slides — home signs are static
  }

  // ── Home signpost (GLB path) ──────────────────────────────────────────────
  // Small rentable ad sign placed beside every house. Smaller than city billboards.

  private _addHomeSignpost(b: BuildingDef): void {
    const S = this._bscale
    const d = b.d * S

    // Wide billboard directly in front of each house
    const signW = 7.0
    const signH = 3.94   // 16:9 ratio
    const poleH = 8.0

    const px  = b.x
    const pz  = b.z > 0 ? b.z - d * 0.5 - 0.6 : b.z + d * 0.5 + 0.6

    // Single pole
    const pole = MeshBuilder.CreateBox(b.id + '_sp', { width: 0.15, height: poleH, depth: 0.15 }, this.scene)
    pole.position.set(px, poleH / 2, pz)
    pole.material = this._mat('#1C1C1C')
    pole.isPickable = false

    const tw = 1024, th = 576   // 16:9
    const tex = new DynamicTexture(b.id + '_stex', { width: tw, height: th }, this.scene, false)
    this._drawSignDefault(tex, b.ownerId ? b.name : undefined)

    const mat = new StandardMaterial(b.id + '_smat', this.scene)
    mat.diffuseTexture = tex
    mat.emissiveColor = new Color3(1, 1, 1)
    mat.backFaceCulling = false
    mat.disableLighting = true

    const signMeshName = b.id + '_sign'
    const sign = MeshBuilder.CreatePlane(signMeshName, { width: signW, height: signH }, this.scene)
    sign.position.set(px, poleH - signH * 0.5 - 0.1, pz)
    sign.rotation.y = b.z > 0 ? Math.PI : 0   // face toward road
    sign.material = mat
    sign.isPickable = !!b.ownerId   // only user homes are rentable

    this._signTextures.set(signMeshName, tex)
    if (b.ownerId) this._signMeshes.set(signMeshName, b)
  }

  /** Draw the default "AD SPACE / FOR RENT" texture, optionally showing ownerName in the header. */
  private _drawSignDefault(tex: DynamicTexture, ownerName?: string): void {
    const tw = 1024, th = 576
    const ctx = tex.getContext() as unknown as CanvasRenderingContext2D
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, tw, th)
    ctx.fillStyle = '#EA580C'
    ctx.fillRect(0, 0, tw, 100)
    ctx.fillStyle = '#FFFFFF'
    ctx.font = 'bold 52px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(ownerName ? `🏠  ${ownerName}'s Space` : 'ADVERTISE HERE', tw / 2, 50)
    ctx.fillStyle = '#111111'
    ctx.font = 'bold 150px Arial'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText('AD SPACE', tw / 2, 360)
    ctx.fillStyle = '#EA580C'
    ctx.font = 'bold 58px Arial'
    ctx.fillText(ownerName ? '⚡  TAP TO RENT' : 'FOR RENT', tw / 2, 470)
    ctx.strokeStyle = '#EA580C'
    ctx.lineWidth = 10
    ctx.strokeRect(5, 5, tw - 10, th - 10)
    tex.update()
  }

  /** Replace a sign's texture with an uploaded ad image (data URL). */
  updateSignAd(buildingId: string, imageDataUrl: string): void {
    const tex = this._signTextures.get(buildingId + '_sign')
    if (!tex) return
    const ctx = tex.getContext() as unknown as CanvasRenderingContext2D
    const img = new window.Image()
    img.onload = () => {
      ctx.clearRect(0, 0, 1024, 576)
      ctx.drawImage(img, 0, 0, 1024, 576)
      tex.update()
    }
    img.src = imageDataUrl
  }

  /** Reset a sign back to the default "AD SPACE" placeholder. */
  resetSignAd(buildingId: string, ownerName?: string): void {
    const tex = this._signTextures.get(buildingId + '_sign')
    if (!tex) return
    this._drawSignDefault(tex, ownerName)
  }

  // ── Club Campus ─────────────────────────────────────────────────────────────

  private _makeClubCampus(b: BuildingDef): void {
    const x = b.x, z = b.z

    // Ground pad
    const pad = MeshBuilder.CreateBox('club_pad', { width: 20, height: 0.14, depth: 16 }, this.scene)
    pad.position.set(x, 0.07, z); pad.material = this._mat('#1A0A2A'); pad.isPickable = false

    // Invisible hit box for clicks
    const hit = MeshBuilder.CreateBox('club_hit', { width: 20, height: 6, depth: 16 }, this.scene)
    hit.position.set(x, 3, z); hit.visibility = 0
    this._buildings.push({ mesh: hit, def: b })

    // Main club building — wide, low
    const bw = 8, bh = 3.5, bd = 5
    const body = MeshBuilder.CreateBox('club_body', { width: bw, height: bh, depth: bd }, this.scene)
    body.position.set(x, bh / 2, z + 2); body.material = this._mat('#2A0A3A')

    // Roof
    const roof = MeshBuilder.CreateBox('club_roof', { width: bw + 0.4, height: 0.2, depth: bd + 0.4 }, this.scene)
    roof.position.set(x, bh + 0.1, z + 2); roof.material = this._mat('#1A0530'); roof.isPickable = false

    // Neon sign on front
    const signTex = new DynamicTexture('club_sign', { width: 512, height: 128 }, this.scene, false)
    const ctx = signTex.getContext() as unknown as CanvasRenderingContext2D
    ctx.fillStyle = '#1A0A2A'; ctx.fillRect(0, 0, 512, 128)
    ctx.fillStyle = '#FF00FF'; ctx.font = 'bold 48px Arial'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('PABLO CUBANA', 256, 64)
    signTex.update()
    const signMat = new StandardMaterial('club_signm', this.scene)
    signMat.emissiveTexture = signTex; signMat.disableLighting = true
    signMat.emissiveColor = Color3.White()
    const sign = MeshBuilder.CreateBox('club_signb', { width: 5, height: 1.2, depth: 0.08 }, this.scene)
    sign.position.set(x, bh + 1, z + 2); sign.material = signMat; sign.isPickable = false

    // Neon strips on building
    const neonM = new StandardMaterial('club_neon', this.scene)
    neonM.emissiveColor = Color3.FromHexString('#FF00FF'); neonM.disableLighting = true
    const n1 = MeshBuilder.CreateBox('cn1', { width: bw, height: 0.08, depth: 0.04 }, this.scene)
    n1.position.set(x, bh - 0.2, z + 2 - bd / 2 - 0.02); n1.material = neonM; n1.isPickable = false
    const n2 = MeshBuilder.CreateBox('cn2', { width: bw, height: 0.08, depth: 0.04 }, this.scene)
    n2.position.set(x, bh * 0.5, z + 2 - bd / 2 - 0.02); n2.material = neonM; n2.isPickable = false

    // Cyan strip
    const cyanM = new StandardMaterial('club_cyan', this.scene)
    cyanM.emissiveColor = Color3.FromHexString('#00FFFF'); cyanM.disableLighting = true
    const n3 = MeshBuilder.CreateBox('cn3', { width: 0.04, height: bh, depth: bd }, this.scene)
    n3.position.set(x - bw / 2 - 0.02, bh / 2, z + 2); n3.material = cyanM; n3.isPickable = false
    const n4 = MeshBuilder.CreateBox('cn4', { width: 0.04, height: bh, depth: bd }, this.scene)
    n4.position.set(x + bw / 2 + 0.02, bh / 2, z + 2); n4.material = cyanM; n4.isPickable = false

    // Windows with purple glow
    const winM = new StandardMaterial('club_winm', this.scene)
    winM.emissiveColor = Color3.FromHexString('#8800CC'); winM.disableLighting = true
    for (let i = 0; i < 4; i++) {
      const win = MeshBuilder.CreateBox(`cw${i}`, { width: 1.2, height: 1.0, depth: 0.05 }, this.scene)
      win.position.set(x - 3 + i * 2, bh * 0.55, z + 2 - bd / 2 - 0.03)
      win.material = winM; win.isPickable = false
    }

    // Entrance canopy
    const canopy = MeshBuilder.CreateBox('club_canopy', { width: 3, height: 0.12, depth: 1.5 }, this.scene)
    canopy.position.set(x, bh * 0.7, z + 2 - bd / 2 - 0.75); canopy.material = this._mat('#2A0A3A'); canopy.isPickable = false

    // Bouncer posts
    for (const dx of [-1.2, 1.2]) {
      const post = MeshBuilder.CreateCylinder(`bp${dx}`, { height: 1.0, diameter: 0.15, tessellation: 8 }, this.scene)
      post.position.set(x + dx, 0.5, z + 2 - bd / 2 - 1.2); post.material = this._mat('#888888'); post.isPickable = false
    }
    // Rope between posts
    const rope = MeshBuilder.CreateBox('club_rope', { width: 2.4, height: 0.06, depth: 0.06 }, this.scene)
    rope.position.set(x, 0.85, z + 2 - bd / 2 - 1.2); rope.material = neonM; rope.isPickable = false

    // Small VIP lounge building (right side)
    const vw = 3, vh = 2.5, vd = 3
    const vip = MeshBuilder.CreateBox('club_vip', { width: vw, height: vh, depth: vd }, this.scene)
    vip.position.set(x + 6, vh / 2, z + 3); vip.material = this._mat('#1A0530'); vip.isPickable = false
    const vipRoof = MeshBuilder.CreateBox('club_vipr', { width: vw + 0.3, height: 0.15, depth: vd + 0.3 }, this.scene)
    vipRoof.position.set(x + 6, vh + 0.08, z + 3); vipRoof.material = this._mat('#0D0320'); vipRoof.isPickable = false

    // VIP sign
    const vipTex = new DynamicTexture('vip_lbl', { width: 256, height: 64 }, this.scene, false)
    const vc = vipTex.getContext() as unknown as CanvasRenderingContext2D
    vc.fillStyle = '#1A0530'; vc.fillRect(0, 0, 256, 64)
    vc.fillStyle = '#FFD700'; vc.font = 'bold 36px Arial'; vc.textAlign = 'center'; vc.textBaseline = 'middle'
    vc.fillText('VIP LOUNGE', 128, 34); vipTex.update()
    const vipMat = new StandardMaterial('vip_lm', this.scene)
    vipMat.emissiveTexture = vipTex; vipMat.disableLighting = true; vipMat.emissiveColor = Color3.White()
    const vipSign = MeshBuilder.CreateBox('vip_sign', { width: 2.5, height: 0.6, depth: 0.05 }, this.scene)
    vipSign.position.set(x + 6, vh + 0.5, z + 3); vipSign.material = vipMat; vipSign.isPickable = false

    // Parking area (left side) — dark asphalt
    const parking = MeshBuilder.CreateBox('club_park', { width: 5, height: 0.06, depth: 6 }, this.scene)
    parking.position.set(x - 6.5, 0.03, z); parking.material = this._mat('#2A2A2A'); parking.isPickable = false

    // Parking lines
    for (let i = 0; i < 4; i++) {
      const line = MeshBuilder.CreateBox(`pline${i}`, { width: 0.08, height: 0.01, depth: 2.5 }, this.scene)
      line.position.set(x - 8 + i * 1.4, 0.07, z); line.material = this._mat('#CCCCCC'); line.isPickable = false
    }

    // Ground label
    const lblTex = new DynamicTexture('club_lbl', { width: 512, height: 128 }, this.scene, false)
    const lc = lblTex.getContext() as unknown as CanvasRenderingContext2D
    lc.clearRect(0, 0, 512, 128)
    lc.fillStyle = '#FF00FF'; lc.font = 'bold 42px Arial'; lc.textAlign = 'center'; lc.textBaseline = 'middle'
    lc.fillText(b.name, 256, 64); lblTex.update()
    const lblMat = new StandardMaterial('club_lblm', this.scene)
    lblMat.emissiveTexture = lblTex; lblMat.disableLighting = true
    lblMat.emissiveColor = Color3.White(); lblMat.backFaceCulling = false
    const lbl = MeshBuilder.CreateGround('club_glbl', { width: 8, height: 2 }, this.scene)
    lbl.position.set(x, 0.16, z - 6); lbl.material = lblMat; lbl.isPickable = false

    // Palm trees
    const trunkTmpl = this.scene.getMeshByName('palm_trunk_tmpl') as Mesh | null
    const frondTmpl = this.scene.getMeshByName('palm_frond_tmpl') as Mesh | null
    if (trunkTmpl && frondTmpl) {
      const treePos: [number, number][] = [
        [x - 9, z + 6], [x - 9, z - 4], [x + 9, z + 6], [x + 9, z - 4],
        [x - 4, z - 6], [x + 4, z - 6], [x - 9, z + 1], [x + 9, z + 1],
      ]
      treePos.forEach(([tx, tz], i) => {
        const ti = trunkTmpl.createInstance(`cbt${i}`); ti.position.set(tx, 0, tz)
        const fi = frondTmpl.createInstance(`cbf${i}`); fi.position.set(tx, 3.4, tz)
      })
    }
  }

  // ── Pavement slab with corner flowers ─────────────────────────────────────

  private _pavement(id: string, x: number, z: number, pw: number, pd: number): void {
    const slab = MeshBuilder.CreateBox(id + '_pav', { width: pw, height: 0.1, depth: pd }, this.scene)
    slab.position.set(x, 0.05, z)
    slab.material = this._mat('#C4BAA8')
    slab.isPickable = false

  }

  // ── Zebra crossing ────────────────────────────────────────────────────────

  private _makeZebraCrossing(cx: number, cz: number, nsOriented: boolean): void {
    const stripeCount = 5
    for (let i = 0; i < stripeCount; i++) {
      const off = (i - 2) * 0.75
      const s = MeshBuilder.CreateBox(`zbr${cx}_${cz}_${i}`.replace(/-/g, 'n'), {
        width:  nsOriented ? 0.55 : 4.5,
        height: 0.025,
        depth:  nsOriented ? 4.5 : 0.55,
      }, this.scene)
      s.position.set(nsOriented ? cx + off : cx, 0.16, nsOriented ? cz : cz + off)
      s.material = this._mat('#EEEEEE'); s.isPickable = false
    }
  }

  // ── Street light ──────────────────────────────────────────────────────────

  private _makeStreetLight(x: number, z: number): void {
    const id = `sl${x}_${z}`.replace(/-/g, 'n')
    const pole = MeshBuilder.CreateCylinder(id + '_p', { height: 5.0, diameter: 0.13, tessellation: 6 }, this.scene)
    pole.position.set(x, 2.5, z); pole.material = this._mat('#7A7A7A'); pole.isPickable = false

    const arm = MeshBuilder.CreateBox(id + '_a', { width: 0.09, height: 0.09, depth: 0.9 }, this.scene)
    arm.position.set(x, 5.1, z - 0.45); arm.material = this._mat('#7A7A7A'); arm.isPickable = false

    const lamp = MeshBuilder.CreateBox(id + '_l', { width: 0.45, height: 0.22, depth: 0.65 }, this.scene)
    lamp.position.set(x, 5.0, z - 0.90); lamp.isPickable = false
    const lampMat = new StandardMaterial(id + '_lm', this.scene)
    lampMat.emissiveColor = Color3.Black()
    lampMat.diffuseColor = new Color3(0.4, 0.4, 0.35)
    lamp.material = lampMat
    this._streetLampMeshes.push(lamp)
  }

  // ── Street grid ───────────────────────────────────────────────────────────

  private _streetGrid(): void {
    const roadM = this._mat('#1A1A1A')

    // 4 N-S avenues per zone at x = -24, -8, 8, 24
    // Mainland: z = 22 → 94  (depth 72, centre z=58)
    // Island:   z = -22 → -94 (depth 72, centre z=-58)
    const avXs = [-24, -8, 8, 24]

    for (const ax of avXs) {
      const ml = MeshBuilder.CreateBox(`mla${ax}`, { width: 2.0, height: 0.12, depth: 72 }, this.scene)
      ml.position.set(ax, 0.06, 58); ml.material = roadM; ml.isPickable = false

      const isl = MeshBuilder.CreateBox(`isla${ax}`, { width: 2.0, height: 0.12, depth: 72 }, this.scene)
      isl.position.set(ax, 0.06, -58); isl.material = roadM; isl.isPickable = false
    }

    // Mid-zone E-W cross road
    const mlx = MeshBuilder.CreateBox('mlcross', { width: 100, height: 0.12, depth: 2.0 }, this.scene)
    mlx.position.set(0, 0.06, 56); mlx.material = roadM; mlx.isPickable = false

    const islx = MeshBuilder.CreateBox('islcross', { width: 100, height: 0.12, depth: 2.0 }, this.scene)
    islx.position.set(0, 0.06, -56); islx.material = roadM; islx.isPickable = false

    // Residential boundary road (z=±94)
    const mlb = MeshBuilder.CreateBox('mlbound', { width: 100, height: 0.12, depth: 2.0 }, this.scene)
    mlb.position.set(0, 0.06, 94); mlb.material = roadM; mlb.isPickable = false

    const islb = MeshBuilder.CreateBox('islbound', { width: 100, height: 0.12, depth: 2.0 }, this.scene)
    islb.position.set(0, 0.06, -94); islb.material = roadM; islb.isPickable = false

    // Route text labels
    this._roadText('mlcr',  'COMMERCIAL RD', 0,   56,  0,          22, 2.4, 0.22, 768, 'bold 36px Arial')
    this._roadText('islcr', 'MARINA DR',      0,  -56,  0,          16, 2.4, 0.22, 512, 'bold 36px Arial')
    this._roadText('av1', 'WESTERN AVE',  -24, 38, Math.PI / 2, 16, 2.2, 0.22, 512, 'bold 28px Arial')
    this._roadText('av2', 'BROAD ST',      -8, 38, Math.PI / 2, 12, 2.2, 0.22, 512, 'bold 28px Arial')
    this._roadText('av3', 'MARINA RD',      8, 38, Math.PI / 2, 12, 2.2, 0.22, 512, 'bold 28px Arial')
    this._roadText('av4', 'EASTERN AVE',   24, 38, Math.PI / 2, 16, 2.2, 0.22, 512, 'bold 28px Arial')
    this._roadText('av5', 'WESTERN AVE', -24, -38, Math.PI / 2, 16, 2.2, 0.22, 512, 'bold 28px Arial')
    this._roadText('av6', 'BROAD ST',      -8, -38, Math.PI / 2, 12, 2.2, 0.22, 512, 'bold 28px Arial')
    this._roadText('av7', 'MARINA RD',      8, -38, Math.PI / 2, 12, 2.2, 0.22, 512, 'bold 28px Arial')
    this._roadText('av8', 'EASTERN AVE',   24, -38, Math.PI / 2, 16, 2.2, 0.22, 512, 'bold 28px Arial')

    // Zebra crossings — at main E-W roads (z=±22) crossing avenues
    for (const ax of avXs) {
      this._makeZebraCrossing(ax, 22, true)   // mainland road
      this._makeZebraCrossing(ax, -22, true)  // island road
    }

    // Street lights — along main E-W road shoulders
    for (const lx of [-75, -48, -24, 0, 24, 48, 75]) {
      this._makeStreetLight(lx, 24.5)
      this._makeStreetLight(lx, -24.5)
    }
    // Along mid cross roads
    for (const lx of [-45, -18, 0, 18, 45]) {
      this._makeStreetLight(lx, 57.5)
      this._makeStreetLight(lx, -57.5)
    }
  }

  // ── Palm trees ────────────────────────────────────────────────────────────

  private _palms(): void {
    const spots: [number, number][] = [
      [-60, 26], [-45, 26], [-32, 26], [-18, 26], [0, 26], [18, 26], [36, 26], [54, 26],
      [-50, 19], [-28, 19], [8, 19], [40, 19], [62, 19],
      [-40, 60], [38, 60], [0, 65], [-18, 68], [18, 68],
      [-55, 35], [50, 38], [-42, 48], [44, 50], [8, 40], [-8, 40],
      [-55, -26], [-38, -26], [-18, -26], [6, -26], [28, -26], [52, -26],
      [-48, -19], [-24, -19], [10, -19], [42, -19], [60, -19],
      [-38, -62], [35, -60], [0, -66], [-20, -70], [20, -70],
      [-52, -40], [46, -42], [-36, -55], [42, -56], [5, -43], [-5, -38],
    ]

    // Unit-height trunk (1 m tall); each instance stretches it to the real palm height
    const trunkTmpl = MeshBuilder.CreateCylinder('palm_trunk_tmpl', {
      height: 1.0, diameterBottom: 0.30, diameterTop: 0.13, tessellation: 6,
    }, this.scene)
    trunkTmpl.material = this._mat('#7A5C2E'); trunkTmpl.isVisible = false; trunkTmpl.isPickable = false

    const frondTmpl = MeshBuilder.CreateBox('palm_frond_tmpl', {
      width: 0.26, height: 0.06, depth: 2.5,
    }, this.scene)
    frondTmpl.material = this._mat('#2D6B1F'); frondTmpl.isVisible = false; frondTmpl.isPickable = false

    for (const [px, pz] of spots) {
      // Deterministic height based on position so scene looks stable across reloads
      const h = 3.4 + ((Math.abs(px * 17 + pz * 31) % 13) / 10)

      const trunk = trunkTmpl.createInstance(`pt${px}${pz}`)
      trunk.position.set(px, h / 2, pz)
      trunk.scaling.set(1, h, 1)
      trunk.isPickable = false

      for (let i = 0; i < 5; i++) {
        const ang = (i / 5) * Math.PI * 2
        const frond = frondTmpl.createInstance(`pf${px}${pz}${i}`)
        frond.position.set(px + Math.sin(ang) * 0.55, h + 0.45, pz + Math.cos(ang) * 0.55)
        frond.rotation.set(Math.PI / 5, ang, 0)
        frond.isPickable = false
      }
    }
  }

  // ── Billboards ────────────────────────────────────────────────────────────

  private _billboards(): void {
    // Put your ad images in public/ads/ named 0.jpg, 1.jpg … 5.jpg (JPG or PNG).
    // Each billboard picks images[i % images.length].
    const images = [
      '/ads/0.jpg', '/ads/1.jpg', '/ads/2.jpg',
      '/ads/3.jpg', '/ads/4.jpg', '/ads/5.jpg',
    ]

    // Billboards at road shoulders: mainland road z=22 (edge z=23.5), island road z=-22 (edge z=-23.5)
    const spots: [number, number][] = [
      [-82, 25], [-32, 25], [28, 25], [82, 25],
      [-78, -25], [-22, -25], [32, -25], [78, -25],
      [-112, 25], [112, 25], [-112, -25], [112, -25],
    ]

    spots.forEach(([bx, bz], i) => {
      const sid = `sign_${bx}_${bz}`.replace(/-/g, 'n')
      this._make3DBillboard(sid, bx, bz, images[i % images.length], 13.0, 5.0, 6.5)
    })
  }

  private _make3DBillboard(
    id: string, bx: number, bz: number, imgPath: string,
    signW = 13.0, signH = 5.0, legH = 6.5,
  ): void {
    const poleM = this._mat('#252525')

    if (!this._ledMat) {
      this._ledMat = new StandardMaterial('_globalLedMat', this.scene)
      this._ledMat.emissiveColor = new Color3(1.0, 0.82, 0.05)
      this._ledMat.disableLighting = true
    }

    const centerY = legH + signH / 2 + 0.55

    // Two thick square structural legs
    for (const lx of [-signW * 0.37, signW * 0.37]) {
      const leg = MeshBuilder.CreateBox(id + `_lg${lx > 0 ? 'r' : 'l'}`, {
        width: 0.60, height: legH, depth: 0.60,
      }, this.scene)
      leg.position.set(bx + lx, legH / 2, bz)
      leg.material = poleM; leg.isPickable = false
    }

    // Horizontal brace
    const brace = MeshBuilder.CreateBox(id + '_brc', {
      width: signW * 0.74, height: 0.38, depth: 0.38,
    }, this.scene)
    brace.position.set(bx, legH * 0.52, bz)
    brace.material = poleM; brace.isPickable = false

    // Depth order (camera is at -Z):
    //   backing center:   bz       → front face at bz - 0.325
    //   frame center:     bz-0.38  → front face at bz - 0.39 (emissive gold border peeks around face)
    //   face plane:       bz - 0.42 (clearly in front of both)

    const back = MeshBuilder.CreateBox(id + '_bk', {
      width: signW + 0.9, height: signH + 0.8, depth: 0.65,
    }, this.scene)
    back.position.set(bx, centerY, bz)
    back.material = this._mat('#080810'); back.isPickable = false

    const frame = MeshBuilder.CreateBox(id + '_fr', {
      width: signW + 0.48, height: signH + 0.38, depth: 0.04,
    }, this.scene)
    frame.position.set(bx, centerY, bz - 0.38)
    frame.material = this._ledMat; frame.isPickable = false

    // Sign face: real image texture loaded from /ads/
    // uScale=-1, uOffset=1 flips U horizontally — corrects the UV mirror on both faces
    // (BJS 6 CreatePlane has UV(0,0) at local +W/2, which appears at the wrong screen side without this flip)
    const tex = new Texture(imgPath, this.scene)
    tex.uScale = -1
    tex.uOffset = 1
    const mat = new StandardMaterial(id + '_smat', this.scene)
    mat.diffuseTexture = tex
    mat.emissiveColor = new Color3(0.90, 0.90, 0.90)
    mat.disableLighting = true
    mat.backFaceCulling = false  // must stay false — rotation.y=PI flips winding, backCull=true hides the face
    // South face: rotation.y=PI faces camera (-Z)
    const faceS = MeshBuilder.CreatePlane(id + '_faceS', { width: signW, height: signH }, this.scene)
    faceS.position.set(bx, centerY, bz - 0.46)
    faceS.rotation.y = Math.PI
    faceS.material = mat; faceS.isPickable = false
    // North face: rotation.y=0, front (+Z) faces north; backing box occludes it from south camera
    const faceN = MeshBuilder.CreatePlane(id + '_faceN', { width: signW, height: signH }, this.scene)
    faceN.position.set(bx, centerY, bz + 0.46)
    faceN.material = mat; faceN.isPickable = false
  }

  private _advanceSlides(): void { /* static image billboards — no slideshow */ }

  private _updateLOD(nowMs: number): void {
    if (nowMs - this._lastLodMs < 2500) return
    this._lastLodMs = nowMs
    const r = this.camera.radius
    const showFine = r < 130
    for (const m of this.scene.meshes) {
      const n = m.name
      if (n.includes('_bloom') || n.includes('_stem') ||
          (n.startsWith('pf') && n.length < 16) || (n.startsWith('pt') && n.length < 10)) {
        m.isVisible = showFine
      }
    }
  }


  // ── Fountain ───────────────────────────────────────────────────────────────

  private _makeFountain(id: string, x: number, z: number): void {
    const pool = MeshBuilder.CreateCylinder(id + '_pool', { diameter: 5.2, height: 0.45, tessellation: 24 }, this.scene)
    pool.position.set(x, 0.225, z); pool.material = this._mat('#8AACB8'); pool.isPickable = false
    const water = MeshBuilder.CreateCylinder(id + '_w', { diameter: 4.6, height: 0.08, tessellation: 24 }, this.scene)
    water.position.set(x, 0.46, z); water.material = this._mat('#2266AA'); water.isPickable = false
    const pillar = MeshBuilder.CreateCylinder(id + '_pil', { diameter: 0.50, height: 1.40, tessellation: 10 }, this.scene)
    pillar.position.set(x, 0.90, z); pillar.material = this._mat('#C8C0B0'); pillar.isPickable = false
    const bowl = MeshBuilder.CreateCylinder(id + '_bowl', { diameterBottom: 1.0, diameterTop: 1.6, height: 0.30, tessellation: 16 }, this.scene)
    bowl.position.set(x, 1.55, z); bowl.material = this._mat('#B8B0A0'); bowl.isPickable = false
    // Water jets (4 outward arcs — white cylinders tilted out)
    for (let ji = 0; ji < 4; ji++) {
      const ang = (ji / 4) * Math.PI * 2
      const jet = MeshBuilder.CreateCylinder(id + `_jet${ji}`, { diameter: 0.08, height: 1.0, tessellation: 4 }, this.scene)
      jet.position.set(x + Math.cos(ang) * 0.5, 1.60, z + Math.sin(ang) * 0.5)
      jet.rotation.z = -0.45 * Math.cos(ang); jet.rotation.x = -0.45 * Math.sin(ang)
      jet.material = this._mat('#AADDEE'); jet.isPickable = false
    }
    // Outer decorative ring
    const outer = MeshBuilder.CreateTorus(id + '_ot', { diameter: 4.0, thickness: 0.30, tessellation: 24 }, this.scene)
    outer.position.set(x, 0.50, z); outer.material = this._mat('#A0A088'); outer.isPickable = false
  }

  private _fountains(): void {
    this._makeFountain('fnt_ml', -2, 44)    // mainland city center
  }

  // ── Scattered road trees ───────────────────────────────────────────────────

  private _scatterTrees(): void {
    const greens = ['#1A7A1A', '#228B22', '#2E8B57', '#006400', '#267326', '#1F6B1F']
    const spots: [number, number, number][] = [
      // Both sides of mainland E-W road (z=22)
      ...([-84,-66,-50,-32,-14,14,32,50,66,84] as number[]).flatMap(px => [[px, 24.0, 1.9], [px, 20.0, 1.9]] as [number,number,number][]),
      // Both sides of island E-W road (z=-22)
      ...([-84,-66,-50,-32,-14,14,32,50,66,84] as number[]).flatMap(px => [[px, -24.0, 1.9], [px, -20.0, 1.9]] as [number,number,number][]),
      // Along mainland cross road (z=56)
      ...[-44,-28,-10,10,28,44].map(px => [px, 57.0, 1.7] as [number,number,number]),
      // Along island cross road (z=-56)
      ...[-44,-28,-10,10,28,44].map(px => [px, -57.0, 1.7] as [number,number,number]),
      // Avenues (alongside each, every 8 units)
      ...[-24,-8,8,24].flatMap(ax => [30,38,46,54,62].map(sz => [ax + 1.4, sz, 1.6] as [number,number,number])),
      ...[-24,-8,8,24].flatMap(ax => [-30,-38,-46,-54,-62].map(sz => [ax + 1.4, sz, 1.6] as [number,number,number])),
    ]

    // Unit-size base meshes — each color gets its own canopy so instances stay batched
    const trunkTmpl = MeshBuilder.CreateCylinder('rt_trunk_tmpl', { height: 0.75, diameter: 0.13, tessellation: 5 }, this.scene)
    trunkTmpl.material = this._mat('#5C3A1A'); trunkTmpl.isVisible = false; trunkTmpl.isPickable = false

    const canopyTmpls = greens.map((col, gi) => {
      const c = MeshBuilder.CreateSphere(`rt_can_tmpl${gi}`, { diameter: 1.0, segments: 4 }, this.scene)
      c.material = this._mat(col); c.isVisible = false; c.isPickable = false
      return c
    })

    for (let i = 0; i < spots.length; i++) {
      const [tx, tz, sc] = spots[i]

      const ti = trunkTmpl.createInstance(`rt_trunk${i}`)
      ti.position.set(tx, sc * 0.375, tz); ti.scaling.setAll(sc); ti.isPickable = false

      const ci = canopyTmpls[i % greens.length].createInstance(`rt_can${i}`)
      ci.position.set(tx, sc * 0.87, tz); ci.scaling.setAll(sc); ci.isPickable = false
    }
  }

  // ── Update rotors ──────────────────────────────────────────────────────────

  private _updateRotors(dt: number): void {
    for (let i = 0; i < this._rotors.length; i++) {
      // Main rotors (even indices) spin fast, tail rotors (odd indices) spin fast around their own axis
      if (i % 2 === 0) {
        this._rotors[i].rotation.y += dt * 18
      } else {
        this._rotors[i].rotation.x += dt * 22
      }
    }
  }

  // ── Cars ──────────────────────────────────────────────────────────────────

  private _cars_spawn(): void {
    const routes = [
      // Main E-W roads
      { ax: -120, az:  22.55, bx:  120, bz:  22.55 },
      { ax:  120, az:  21.45, bx: -120, bz:  21.45 },
      { ax: -120, az: -22.55, bx:  120, bz: -22.55 },
      { ax:  120, az: -21.45, bx: -120, bz: -21.45 },
      // Bridges
      { ax:   0.5, az: -14, bx:   0.5, bz:  14 },
      { ax:  -0.5, az:  14, bx:  -0.5, bz: -14 },
      { ax:  25.5, az: -14, bx:  25.5, bz:  14 },
      { ax:  24.5, az:  14, bx:  24.5, bz: -14 },
      // Cross roads (commercial zone, z=±56)
      { ax: -48, az:  56.45, bx:  48, bz:  56.45 },
      { ax:  48, az:  55.55, bx: -48, bz:  55.55 },
      { ax: -48, az: -56.45, bx:  48, bz: -56.45 },
      { ax:  48, az: -55.55, bx: -48, bz: -55.55 },
      // N-S avenues (mainland + island)
      { ax:  -7.5, az:  22, bx:  -7.5, bz:  94 },
      { ax:   8.5, az:  94, bx:   8.5, bz:  22 },
      { ax: -23.5, az: -22, bx: -23.5, bz: -94 },
      { ax:  24.5, az: -94, bx:  24.5, bz: -22 },
    ]
    const colors = ['#E53935','#1565C0','#2E7D32','#F9A825','#6A1B9A','#00838F','#BF360C','#37474F','#880E4F','#004D40','#F06292','#26C6DA','#D4E157','#FFA726','#AB47BC','#EF5350']

    // KayKit car keys match _modelTmpls keys: 'car_' + name
    const carModelNames = ['sedan','hatchback','taxi','police','stationwagon','sedan','hatchback','taxi','police','stationwagon','sedan','hatchback','taxi','police','stationwagon','sedan']

    for (let i = 0; i < 24; i++) {
      const route = routes[i % routes.length]
      const t = Math.random()
      const sx = route.ax + (route.bx - route.ax) * t
      const sz = route.az + (route.bz - route.az) * t
      const ew = Math.abs(route.bx - route.ax) > Math.abs(route.bz - route.az)
      const rotY = ew ? Math.PI / 2 : 0

      // Invisible phantom mesh for freeze tracking + dynamic set bookkeeping
      const phantom = MeshBuilder.CreateBox(`car_ph${i}`, { width: 0.01, height: 0.01, depth: 0.01 }, this.scene)
      phantom.position.set(sx, 0.22, sz)
      phantom.visibility = 0; phantom.isPickable = false

      // Visual: GLB car instanced under a TransformNode parented to phantom
      const modelKey = 'car_' + carModelNames[i % carModelNames.length]
      const tmpl = this._modelTmpls.get(modelKey)
      const node = new TransformNode(`car_node${i}`, this.scene)
      node.position.set(0, 0, 0)
      node.rotation.y = rotY
      node.scaling.setAll(0.7)
      node.parent = phantom

      if (tmpl) {
        tmpl.meshes.forEach((m, mi) => {
          const inst = m.createInstance(`car${i}_m${mi}`)
          inst.parent = node
          // Apply GLTF right→left-hand conversion (same X-flip as placeModel)
          inst.position.set(-m.position.x, m.position.y, m.position.z)
          inst.rotation.copyFrom(m.rotation)
          inst.scaling.set(-m.scaling.x, m.scaling.y, m.scaling.z)
          inst.isPickable = false
        })
      } else {
        // Box fallback
        const box = MeshBuilder.CreateBox(`car_vis${i}`, { width: 2.9, height: 1.45, depth: 5.3 }, this.scene)
        const mat = new StandardMaterial(`carm${i}`, this.scene)
        mat.diffuseColor = Color3.FromHexString(colors[i % colors.length])
        box.material = mat; box.parent = node; box.isPickable = false
      }

      this._cars.push({ mesh: phantom, node, route, t, speed: 0.035 + Math.random() * 0.04 })
    }
  }

  // ── Performance: freeze static world matrices ────────────────────────────

  private _freezeStaticMeshes(): void {
    // Collect everything that moves so we skip freezing them
    const carVisuals = this._cars.flatMap(c => c.node.getChildMeshes() as Mesh[])
    const dynamic = new Set<Mesh>([
      ...this._cars.map(c => c.mesh),     // phantom boxes
      ...carVisuals,                        // GLB instances or box visuals
      ...this._rotors,
    ])
    for (const m of this.scene.meshes) {
      if (dynamic.has(m as Mesh)) continue
      m.freezeWorldMatrix()
      ;(m as Mesh).doNotSyncBoundingInfo = true
    }
    for (const mat of this.scene.materials) {
      mat.freeze()
    }
    this.scene.skipPointerMovePicking = true
    this.scene.autoClearDepthAndStencil = false
  }

  // ── Input ─────────────────────────────────────────────────────────────────

  private _input(): void {
    const cv = this.cv
    cv.addEventListener('contextmenu', e => e.preventDefault())

    const _pan = (dx: number, dy: number) => {
      const f = this.camera.radius * 0.0016
      // Fixed world-space pan: right=left, left=right, up=down, down=up — always consistent
      this.camera.target.x -= dx * f
      this.camera.target.z -= dy * f
    }


    // Native canvas pointerdown — no Babylon middleware
    cv.addEventListener('pointerdown', (e: PointerEvent) => {
      if (e.button !== 0 && e.button !== 2) return
      this._down = true
      this._rdown = e.button === 2
      this._mx = e.clientX; this._my = e.clientY; this._moved = false
      this.scene.skipPointerMovePicking = true   // no pick passes during drag
      try { cv.setPointerCapture(e.pointerId) } catch { /* ignore */ }
      e.preventDefault()
    })

    // POINTERMOVE and POINTERUP on window — fires regardless of which element the pointer is over,
    // solving the "drag stops when cursor moves fast" problem with canvas-only listeners
    this._wmove = (e: PointerEvent) => {
      if (!this._down) return
      const dx = e.clientX - this._mx
      const dy = e.clientY - this._my
      this._mx = e.clientX; this._my = e.clientY
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) this._moved = true
      if (!this._rdown) {
        // Left drag = pan (move camera target forward/backward/left/right)
        _pan(dx, -dy)
      } else {
        // Right drag = orbit 360 (rotate around target)
        this.camera.alpha -= dx * 0.007
        this.camera.beta = Math.max(0.22, Math.min(Math.PI / 2, this.camera.beta - dy * 0.007))
      }
    }

    this._wup = (e: PointerEvent) => {
      if (!this._down) return
      if (!this._moved && e.button === 0) {
        const r = cv.getBoundingClientRect()
        this._click(e.clientX - r.left, e.clientY - r.top)
      }
      this._down = false
      this.scene.skipPointerMovePicking = false  // re-enable hover cursor
      try { cv.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
    }

    window.addEventListener('pointermove', this._wmove)
    window.addEventListener('pointerup',   this._wup)

    cv.addEventListener('wheel', e => {
      const delta = e.deltaY > 0 ? 1.12 : 0.89
      this.camera.radius = Math.max(20, Math.min(280, this.camera.radius * delta))
      e.preventDefault()
    }, { passive: false })

    // Touch
    let touches: { x: number; y: number }[] = []
    let pinchD = 0

    cv.addEventListener('touchstart', e => {
      e.preventDefault()
      touches = Array.from(e.touches).map(t => ({ x: t.clientX, y: t.clientY }))
      if (e.touches.length === 2)
        pinchD = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY)
      this._moved = false
    }, { passive: false })

    cv.addEventListener('touchmove', e => {
      e.preventDefault()
      if (e.touches.length === 1 && touches.length >= 1) {
        const dx = e.touches[0].clientX - touches[0].x
        const dy = e.touches[0].clientY - touches[0].y
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) this._moved = true
        touches[0] = { x: e.touches[0].clientX, y: e.touches[0].clientY }
        _pan(dx, -dy)
      } else if (e.touches.length === 2) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY)
        this.camera.radius = Math.max(20, Math.min(280, this.camera.radius * (pinchD / d)))
        pinchD = d; this._moved = true
      }
    }, { passive: false })

    cv.addEventListener('touchend', e => {
      if (!this._moved && e.changedTouches.length > 0) {
        const t = e.changedTouches[0]
        const r = cv.getBoundingClientRect()
        this._click(t.clientX - r.left, t.clientY - r.top)
      }
      touches = []
    })
  }

  private _click(ox: number, oy: number): void {
    const pick = this.scene.pick(ox, oy)
    if (!pick?.hit || !pick.pickedPoint) {
      this.onEvent?.({ type: 'pick-empty' })
      return
    }

    // Signpost rental check (before building check so the plane wins over the hitbox)
    if (pick.pickedMesh) {
      const signDef = this._signMeshes.get(pick.pickedMesh.name)
      if (signDef?.ownerId) {
        this.onEvent?.({ type: 'pick-signpost', building: signDef, ownerId: signDef.ownerId })
        return
      }
    }

    for (const { mesh, def } of this._buildings) {
      if (pick.pickedMesh === mesh) {
        this.onEvent?.({ type: 'pick-building', building: def })
        return
      }
    }

    // Hit something non-interactive (road, ground, etc.)
    this.onEvent?.({ type: 'pick-empty' })
  }

  // ── Per-frame updates ─────────────────────────────────────────────────────

  private _updateCars(dt: number): void {
    for (const car of this._cars) {
      car.t = (car.t + car.speed * dt) % 1.0
      car.mesh.position.x = car.route.ax + (car.route.bx - car.route.ax) * car.t
      car.mesh.position.z = car.route.az + (car.route.bz - car.route.az) * car.t
      // node inherits position from parent phantom automatically
    }
  }

  private _emitLabels(): void {
    if (!this.onLabels) return
    const RW = this.engine.getRenderWidth()
    const RH = this.engine.getRenderHeight()
    const CW = this.cv.clientWidth
    const CH = this.cv.clientHeight
    const vp = this.camera.viewport.toGlobal(RW, RH)
    const tm = this.scene.getTransformMatrix()

    const labels: LabelData[] = []
    for (const { def } of this._buildings) {
      const topY = def.h * this._bscale + 0.3
      const top = new Vector3(def.x, topY, def.z)
      const p = Vector3.Project(top, Matrix.Identity(), tm, vp)
      if (p.z > 0 && p.z < 1) {
        const sx = (p.x / RW) * CW
        const sy = (p.y / RH) * CH
        if (sx > -40 && sx < CW + 40 && sy > -30 && sy < CH + 30)
          labels.push({ id: def.id, name: def.name, emoji: BUILDING_TYPES[def.type].emoji, sx, sy })
      }
    }
    this.onLabels(labels)
  }

  // ── Time of day & rain ───────────────────────────────────────────────────

  private _updateTimeOfDay(): void {
    const h = 12 // forced daytime

    // Sky color by hour
    let r: number, g: number, b: number
    if (h >= 5 && h < 7) {
      const t = (h - 5) / 2
      r = 0.15 + t * 0.65; g = 0.08 + t * 0.50; b = 0.22 + t * 0.55
    } else if (h >= 7 && h < 9) {
      const t = (h - 7) / 2
      r = 0.80 - t * 0.25; g = 0.58 + t * 0.22; b = 0.77 + t * 0.18
    } else if (h >= 9 && h < 18) {
      r = 0.55; g = 0.80; b = 0.95
    } else if (h >= 18 && h < 20) {
      const t = (h - 18) / 2
      r = 0.90 - t * 0.82; g = 0.30 - t * 0.26; b = 0.15 + t * 0.22
    } else {
      r = 0.04; g = 0.04; b = 0.14
    }

    const isDaytime = h >= 7 && h < 19
    const raining = this._isRaining()

    if (raining) { r *= 0.62; g *= 0.68; b *= 0.78 }

    this.scene.clearColor = new Color4(r, g, b, 1)
    this.scene.fogColor = new Color3(r, g, b)

    if (this._ambLight) {
      this._ambLight.intensity = isDaytime ? (raining ? 0.35 : 0.60) : 0.12
      this._ambLight.diffuse = isDaytime
        ? (raining ? new Color3(0.75, 0.82, 0.90) : new Color3(1, 0.97, 0.93))
        : new Color3(0.25, 0.30, 0.55)
    }
    if (this._sunLight) {
      this._sunLight.intensity = isDaytime ? (raining ? 0.25 : 0.80) : 0.04
    }

    // Toggle street lights
    const lightsNeeded = !isDaytime
    if (lightsNeeded !== this._streetLightsOn) {
      this._streetLightsOn = lightsNeeded
      const glow = lightsNeeded ? new Color3(1.0, 0.96, 0.72) : Color3.Black()
      for (const lamp of this._streetLampMeshes) {
        const m = lamp.material as StandardMaterial
        if (m) {
          m.emissiveColor = glow
          m.disableLighting = lightsNeeded
        }
      }
    }

    // Toggle rain
    if (this._rainSystem) {
      if (raining && !this._rainActive) {
        this._rainSystem.start(); this._rainActive = true; this._rainStartMs = performance.now()
      } else if (!raining && this._rainActive) {
        this._rainSystem.stop(); this._rainActive = false
      }
    }
  }

  private _isRaining(): boolean {
    return false // forced off for daytime preview; restore block below to re-enable
    const now = new Date()
    const h = now.getHours()
    const month = now.getMonth() + 1
    // Lagos rainy season April–October
    const isRainySeason = month >= 4 && month <= 10
    const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000)
    const pseudo = (Math.sin(dayOfYear * 1.618) + 1) / 2  // 0–1 stable per day
    const rainThreshold = isRainySeason ? 0.35 : 0.80
    const isRainyDay = pseudo > rainThreshold
    const isRainHour = (h >= 13 && h < 17) || (h >= 4 && h < 6)
    return isRainyDay && isRainHour
  }

  private _initRain(): void {
    // Skip rain on mobile — 2000 particles are too expensive for mobile GPUs
    if (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) return
    const ps = new ParticleSystem('rain', 2000, this.scene)

    // Raindrop texture — thin vertical line
    const rainTex = new DynamicTexture('rainTex', { width: 8, height: 32 }, this.scene, false)
    const ctx = rainTex.getContext()
    const grad = ctx.createLinearGradient(0, 0, 0, 32)
    grad.addColorStop(0, 'rgba(180,210,255,0)')
    grad.addColorStop(0.3, 'rgba(200,225,255,0.9)')
    grad.addColorStop(1, 'rgba(160,200,255,0.4)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 8, 32)
    rainTex.update()
    ps.particleTexture = rainTex

    ps.emitter = new Vector3(0, 38, 0)
    ps.minEmitBox = new Vector3(-110, 0, -90)
    ps.maxEmitBox = new Vector3(110, 0, 90)

    ps.direction1 = new Vector3(-0.4, -1, -0.2)
    ps.direction2 = new Vector3(0.4, -1, 0.2)
    ps.minEmitPower = 26
    ps.maxEmitPower = 36

    ps.minLifeTime = 0.9
    ps.maxLifeTime = 1.5
    ps.emitRate = 700
    ps.updateSpeed = 0.018

    ps.minSize = 0.06
    ps.maxSize = 0.10
    ps.minScaleX = 0.25
    ps.maxScaleX = 0.30

    ps.color1 = new Color4(0.75, 0.85, 1.0, 0.80)
    ps.color2 = new Color4(0.65, 0.78, 0.98, 0.55)
    ps.colorDead = new Color4(0.60, 0.75, 0.95, 0)

    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD

    this._rainSystem = ps
  }

  // ── Public API ────────────────────────────────────────────────────────────

  start(): void {
    let last = performance.now()
    this.engine.runRenderLoop(() => {
      const now = performance.now()
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      this._updateCars(dt)
      this._updateRotors(dt)
      this._emitLabels()
      this._emitPostBubbles()
      this._updateLOD(now)
      // Cap rain at 5 minutes
      if (this._rainActive && now - this._rainStartMs > 300_000) {
        this._rainSystem?.stop(); this._rainActive = false
      }
      // Slideshow: advance every 15 s
      this._slideAccMs += dt * 1000
      if (this._slideAccMs > 15000) {
        this._slideAccMs = 0
        this._advanceSlides()
      }
      // Sync sky/rain every 60 s
      if (now - this._lastTimeUpdate > 60000) {
        this._updateTimeOfDay()
        this._lastTimeUpdate = now
      }
      this.scene.render()
    })
  }

  /** Load a real image URL onto any sign/billboard in the scene */
  loadAdImage(signId: string, imageUrl: string): void {
    const tex = this._signTextures.get(signId)
    if (!tex) return
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const ctx = tex.getContext()
      if (!ctx) return
      ctx.clearRect(0, 0, 512, 274)
      ctx.drawImage(img, 0, 0, 512, 274)
      tex.update()
    }
    img.src = imageUrl
  }

  zoom(inward: boolean): void {
    this.camera.radius = Math.max(20, Math.min(280, this.camera.radius * (inward ? 0.85 : 1.18)))
  }

  addBuilding(def: BuildingDef): void {
    this._makeBuilding(this._applySpread(def))
  }

  /** Place a home in the city for each user in the array (idempotent per user id). */
  setUserHomes(users: WorldUser[]): void {
    users.forEach((user, arrIdx) => {
      if (this._userHomesPlaced.has(user.id)) return
      const hIdx    = user.homeIndex ?? arrIdx
      const slotIdx = Math.floor(hIdx / 2)
      // Even homeIndex → mainland (positive Z), odd → island (negative Z)
      const pos = hIdx % 2 === 0 ? mlHomePosition(slotIdx) : islHomePosition(slotIdx)
      const def: BuildingDef = {
        id:   `user_${user.id}`,
        name: `${user.name}'s Home`,
        type: 'home',
        x: pos.x, z: pos.z,
        w: 4.5, d: 4.5, h: 4.0,
        ownerId: user.id,
      }
      this._makeBuilding(def)
      // y=8 puts the bubble above the roof
      this._homeWorldPos.set(user.id, new Vector3(pos.x, 8, pos.z))
      this._userHomesPlaced.add(user.id)
    })
  }

  /** Fly the camera to the user's home and zoom in. */
  flyToHome(userId: string): void {
    const pos = this._homeWorldPos.get(userId)
    if (!pos) return
    this.camera.setTarget(new Vector3(pos.x, 0, pos.z))
    this.camera.radius = 35
    this.camera.beta   = Math.PI / 3.5
  }

  /** Remove a specific bubble immediately (e.g. user dismissed it). */
  dismissBubble(userId: string): void {
    this._postBubbles = this._postBubbles.filter(b => b.userId !== userId)
  }

  /** Clear all active bubbles (e.g. user muted notifications). */
  clearAllBubbles(): void {
    this._postBubbles = []
  }

  /** Show a floating post notification bubble above a user's home for 30 seconds. */
  showPostBubble(userId: string, name: string, avatarUrl?: string): void {
    const worldPos = this._homeWorldPos.get(userId)
    if (!worldPos) return
    this._postBubbles = this._postBubbles.filter(b => b.userId !== userId)
    this._postBubbles.push({ userId, name, avatarUrl, worldPos, expiresAt: performance.now() + 30000 })
  }

  private _lastBubbleMs = 0
  private _emitPostBubbles(): void {
    if (!this.onPostBubble) return
    const t = performance.now()
    if (t - this._lastBubbleMs < 100) return
    this._lastBubbleMs = t
    const now = performance.now()
    this._postBubbles = this._postBubbles.filter(b => b.expiresAt > now)
    if (this._postBubbles.length === 0) { this.onPostBubble([]); return }

    const RW = this.engine.getRenderWidth()
    const RH = this.engine.getRenderHeight()
    const CW = this.cv.clientWidth
    const CH = this.cv.clientHeight
    const vp = this.camera.viewport.toGlobal(RW, RH)
    const tm = this.scene.getTransformMatrix()

    const out: PostBubbleData[] = []
    for (const b of this._postBubbles) {
      const p = Vector3.Project(b.worldPos, Matrix.Identity(), tm, vp)
      if (p.z > 0 && p.z < 1) {
        const sx = (p.x / RW) * CW
        const sy = (p.y / RH) * CH
        if (sx > -120 && sx < CW + 120 && sy > -60 && sy < CH + 60) {
          const remaining = (b.expiresAt - now) / 30000
          out.push({ id: b.userId, name: b.name, avatarUrl: b.avatarUrl, sx, sy, remaining })
        }
      }
    }
    this.onPostBubble(out)
  }

  pause(): void {
    this.engine.stopRenderLoop()
  }

  resume(): void {
    this.engine.stopRenderLoop()
    this.engine.resize()
    this.start()
  }

  dispose(): void {
    window.removeEventListener('pointermove', this._wmove)
    window.removeEventListener('pointerup',   this._wup)
    this.engine.stopRenderLoop()
    this.scene.dispose()
    this.engine.dispose()
  }
}

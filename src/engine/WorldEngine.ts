import {
  Engine, Scene, ArcRotateCamera, Vector3, Color3, Color4,
  HemisphericLight, DirectionalLight, StandardMaterial, MeshBuilder,
  Mesh, TransformNode, DefaultRenderingPipeline, Matrix,
} from '@babylonjs/core'
import { BUILDING_TYPES } from '../world/buildingTypes'
import type { BuildingDef, CityDef } from '../world/types'

export interface PickedBuilding {
  def: BuildingDef
  distanceFromPlayer: number
}

export type LabelUpdate = { id: string; x: number; y: number; visible: boolean }[]

export class WorldEngine {
  readonly engine: Engine
  readonly scene: Scene
  readonly camera: ArcRotateCamera

  private readonly _bldMap = new Map<string, BuildingDef>()
  private readonly _detailMeshes: Mesh[] = []
  private readonly _labelPositions = new Map<string, Vector3>()
  private readonly _routes: RouteState[] = []
  private _player!: TransformNode
  private _playerBody!: Mesh
  private _playerHead!: Mesh
  private _destMesh!: Mesh
  private _destAlpha = 0
  private _moveTarget: Vector3 | null = null
  private _detVis = true
  private _lodFrame = 0
  private readonly _t0 = performance.now()
  private readonly _keys: Record<string, boolean> = Object.create(null)

  // Camera drag state
  private _panOn = false
  private _panMoved = false
  private _panX = 0
  private _panY = 0
  private _orbitOn = false
  private _orbitX = 0
  private _orbitY = 0

  onBuildingPicked?: (b: PickedBuilding | null) => void
  onLabelsUpdate?: (labels: LabelUpdate) => void
  onDistrictChange?: (name: string) => void

  constructor(canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true })
    this.scene = new Scene(this.engine)
    this.scene.clearColor = new Color4(0.52, 0.80, 0.98, 1)

    this.camera = new ArcRotateCamera('cam', -Math.PI * 0.75, Math.PI / 3.2, 58, Vector3.Zero(), this.scene)
    this.camera.lowerBetaLimit = Math.PI / 6
    this.camera.upperBetaLimit = Math.PI / 2.4
    this.camera.lowerRadiusLimit = 14
    this.camera.upperRadiusLimit = 110

    this._setupMouseControls(canvas)
    this._setupLighting()
    this._setupKeyboard()
    this._setupClickHandler()
  }

  private _setupMouseControls(canvas: HTMLCanvasElement) {
    canvas.addEventListener('mousedown', e => {
      if (e.button === 0) { this._panOn = true; this._panMoved = false; this._panX = e.clientX; this._panY = e.clientY }
      if (e.button === 2) { this._orbitOn = true; this._orbitX = e.clientX; this._orbitY = e.clientY }
    })
    document.addEventListener('mousemove', e => {
      if (this._panOn) {
        const ddx = e.clientX - this._panX, ddy = e.clientY - this._panY
        if (!this._panMoved && Math.abs(ddx) + Math.abs(ddy) > 4) this._panMoved = true
        if (this._panMoved) {
          // inverted / map-drag: drag moves the world in drag direction
          const a = this.camera.alpha, s = this.camera.radius * 0.0018
          this.camera.target.x += (-Math.sin(a) * ddx + Math.cos(a) * ddy) * s
          this.camera.target.z += ( Math.cos(a) * ddx + Math.sin(a) * ddy) * s
        }
        this._panX = e.clientX; this._panY = e.clientY
      }
      if (this._orbitOn) {
        const ox = e.clientX - this._orbitX, oy = e.clientY - this._orbitY
        this.camera.alpha -= ox * 0.008
        this.camera.beta = Math.max(this.camera.lowerBetaLimit!, Math.min(this.camera.upperBetaLimit!, this.camera.beta + oy * 0.006))
        this._orbitX = e.clientX; this._orbitY = e.clientY
      }
    })
    document.addEventListener('mouseup', e => {
      if (e.button === 0) this._panOn = false
      if (e.button === 2) this._orbitOn = false
    })
    canvas.addEventListener('contextmenu', e => e.preventDefault())
    canvas.addEventListener('wheel', e => {
      e.preventDefault()
      const r = this.camera.radius * (e.deltaY > 0 ? 1.12 : 0.89)
      this.camera.radius = Math.max(this.camera.lowerRadiusLimit!, Math.min(this.camera.upperRadiusLimit!, r))
    }, { passive: false })
  }

  zoom(inward: boolean) {
    const r = this.camera.radius * (inward ? 0.82 : 1.22)
    this.camera.radius = Math.max(this.camera.lowerRadiusLimit!, Math.min(this.camera.upperRadiusLimit!, r))
  }

  private _setupLighting() {
    const amb = new HemisphericLight('amb', new Vector3(0, 1, 0), this.scene)
    amb.intensity = 0.7; amb.diffuse = new Color3(1, 0.98, 0.92); amb.groundColor = new Color3(0.3, 0.5, 0.3)
    const sun = new DirectionalLight('sun', new Vector3(-1, -2, 0.5), this.scene)
    sun.intensity = 0.9; sun.diffuse = new Color3(1, 0.97, 0.88)
  }

  private _setupKeyboard() {
    window.addEventListener('keydown', e => { this._keys[e.key] = true })
    window.addEventListener('keyup', e => { this._keys[e.key] = false })
  }

  private _setupClickHandler() {
    this.scene.onPointerObservable.add(pi => {
      if (pi.type !== 4 || pi.event.button !== 0) return  // POINTERUP = 4
      if (this._panMoved) return
      const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY)
      if (pick.hit && pick.pickedMesh) {
        const def = this._bldMap.get(pick.pickedMesh.name)
        if (def) {
          const dx = this._player.position.x - def.x, dz = this._player.position.z - def.z
          this.onBuildingPicked?.({ def, distanceFromPlayer: Math.round(Math.sqrt(dx * dx + dz * dz)) })
          return
        }
      }
      // Tap on empty ground → walk player there
      if (pick.pickedPoint) {
        this._moveTarget = new Vector3(pick.pickedPoint.x, 0, pick.pickedPoint.z)
        this._destMesh.position.set(this._moveTarget.x, 0.08, this._moveTarget.z)
        this._destMesh.scaling.set(1, 1, 1)
        this._destAlpha = 1.2
      }
      this.onBuildingPicked?.(null)
    })
  }

  private _mat(id: string, hex: string, sp = 0.05) {
    const m = new StandardMaterial(id, this.scene)
    m.diffuseColor = Color3.FromHexString(hex)
    m.specularColor = new Color3(sp, sp, sp)
    return m
  }

  loadCity(city: CityDef) {
    this._buildGround(city.groundSize)
    this._buildRoads()
    this._buildCrosswalks()
    this._buildStreetLights()
    this._plantTrees()
    city.buildings.forEach(b => this._buildBuilding(b))
    this._buildPlayer()
    this._spawnCars()
    this._startLoop()
  }

  private _buildGround(size: number) {
    const g = MeshBuilder.CreateGround('gnd', { width: size, height: size }, this.scene)
    g.material = this._mat('gnd_m', '#5aab5a'); g.isPickable = true  // pickable for click-to-move
  }

  private _buildRoads() {
    const road = (id: string, x: number, z: number, w: number, d: number) => {
      const r = MeshBuilder.CreateBox(id, { width: w, height: 0.07, depth: d }, this.scene)
      r.position.set(x, 0.035, z); r.material = this._mat(id + '_m', '#4a4a5a'); r.isPickable = false
    }
    const sw = (id: string, x: number, z: number, w: number, d: number) => {
      const s = MeshBuilder.CreateBox(id, { width: w, height: 0.08, depth: d }, this.scene)
      s.position.set(x, 0.04, z); s.material = this._mat(id + '_m', '#8a8a9a'); s.isPickable = false
    }
    road('rns', 0, 0, 6, 160); road('rew', 0, 0, 160, 6)
    road('rns2', 27, 0, 5, 160); road('rns3', -27, 0, 5, 160)
    road('rew2', 0, 27, 160, 5); road('rew3', 0, -27, 160, 5)
    sw('sne', 3.8, 0, 1.2, 160); sw('snw', -3.8, 0, 1.2, 160)
    sw('sen', 0, 3.8, 160, 1.2); sw('ses', 0, -3.8, 160, 1.2)
    // Road centre dashes
    const dashM = this._mat('dash_m', '#d8d8e4')
    for (let i = 0; i < 20; i++) {
      const h = MeshBuilder.CreateBox('dh' + i, { width: 3, height: 0.06, depth: 0.18 }, this.scene)
      h.position.set(-38 + i * 4, 0.05, 0); h.material = dashM; h.isPickable = false
      const v = MeshBuilder.CreateBox('dv' + i, { width: 0.18, height: 0.06, depth: 3 }, this.scene)
      v.position.set(0, 0.05, -38 + i * 4); v.material = dashM; v.isPickable = false
    }
  }

  private _buildCrosswalks() {
    const m = this._mat('cw_m', '#d8d8e4')
    for (let i = 0; i < 5; i++) {
      const cx = -1.4 + i * 0.7
      ;['n', 's'].forEach((side, si) => {
        const z = si === 0 ? 4.6 : -4.6
        const s = MeshBuilder.CreateBox(`cw${side}${i}`, { width: 0.7, height: 0.06, depth: 2.2 }, this.scene)
        s.position.set(cx, 0.05, z); s.material = m; s.isPickable = false
      })
      const cz = -1.4 + i * 0.7
      ;['e', 'w'].forEach((side, si) => {
        const x = si === 0 ? 4.6 : -4.6
        const s = MeshBuilder.CreateBox(`cw${side}${i}`, { width: 2.2, height: 0.06, depth: 0.7 }, this.scene)
        s.position.set(x, 0.05, cz); s.material = m; s.isPickable = false
      })
    }
  }

  private _buildStreetLights() {
    const poleM = this._mat('sl_m', '#555565')
    const bulbM = this._mat('slg_m', '#dddd88', 0.8)
    const positions: [number, number][] = [
      [4.5,8],[4.5,18],[4.5,-8],[4.5,-18],[4.5,30],[4.5,-30],
      [-4.5,8],[-4.5,18],[-4.5,-8],[-4.5,-18],[-4.5,30],[-4.5,-30],
      [8,4.5],[18,4.5],[-8,4.5],[-18,4.5],[30,4.5],[-30,4.5],
      [8,-4.5],[18,-4.5],[-8,-4.5],[-18,-4.5],[30,-4.5],[-30,-4.5],
    ]
    positions.forEach(([x, z]) => {
      const pole = MeshBuilder.CreateCylinder(`slp${x}_${z}`, { height: 3.8, diameter: 0.18, tessellation: 6 }, this.scene)
      pole.position.set(x, 1.9, z); pole.material = poleM; pole.isPickable = false
      const arm = MeshBuilder.CreateBox(`sla${x}_${z}`, { width: 0.12, height: 0.12, depth: 1.1 }, this.scene)
      arm.position.set(x, 3.7, z + 0.55); arm.material = poleM; arm.isPickable = false
      const bulb = MeshBuilder.CreateSphere(`slb${x}_${z}`, { diameter: 0.3, segments: 4 }, this.scene)
      bulb.position.set(x, 3.55, z + 1.05); bulb.material = bulbM; bulb.isPickable = false
    })
  }

  private _plantTrees() {
    const trunkM = this._mat('trk_m', '#6D4C41')
    const leaf1M = this._mat('lf1_m', '#43A047')
    const leaf2M = this._mat('lf2_m', '#2E7D32')
    const positions: [number, number][] = [
      [4.5,-9],[4.5,-17],[4.5,-28],[4.5,9],[4.5,17],[4.5,28],
      [-4.5,-9],[-4.5,-17],[-4.5,-28],[-4.5,9],[-4.5,17],[-4.5,28],
      [9,4.5],[17,4.5],[28,4.5],[-9,4.5],[-17,4.5],[-28,4.5],
      [9,-4.5],[17,-4.5],[28,-4.5],[-9,-4.5],[-17,-4.5],[-28,-4.5],
      [4,4],[4,-4],[-4,4],[-4,-4],[22,0],[0,22],[-22,0],[0,-22],
    ]
    positions.forEach(([x, z]) => {
      const s = 0.72 + Math.random() * 0.3
      const tk = MeshBuilder.CreateCylinder(`tk${x}_${z}`, { height: 1.5*s, diameterTop: 0.22*s, diameterBottom: 0.42*s, tessellation: 7 }, this.scene)
      tk.position.set(x, 0.75*s, z); tk.material = trunkM; tk.isPickable = false
      const lf = MeshBuilder.CreateCylinder(`lf${x}_${z}`, { height: 2.5*s, diameterTop: 0, diameterBottom: 2.7*s, tessellation: 8 }, this.scene)
      lf.position.set(x, 2.6*s, z); lf.material = Math.random() > 0.45 ? leaf1M : leaf2M; lf.isPickable = false
    })
  }

  private _buildBuilding(b: BuildingDef) {
    const Ty = BUILDING_TYPES[b.type]
    const bm = this._mat('bm_' + b.id, Ty.color, 0.06)
    const am = this._mat('am_' + b.id, Ty.accent, 0.04)
    const wm = this._mat('wm_' + b.id, Ty.win, 0.42); wm.specularPower = 90

    // Main body
    const body = MeshBuilder.CreateBox('bld_' + b.id, { width: b.w, height: b.h, depth: b.d }, this.scene)
    body.position.set(b.x, b.h / 2, b.z); body.material = bm
    this._bldMap.set('bld_' + b.id, b)

    // Accent band near top
    const bh = Math.min(0.5, b.h * 0.12)
    const band = MeshBuilder.CreateBox('bnd_' + b.id, { width: b.w + 0.08, height: bh, depth: b.d + 0.08 }, this.scene)
    band.position.set(b.x, b.h - bh * 0.9, b.z); band.material = am; band.isPickable = false

    // Roof parapet
    const rf = MeshBuilder.CreateBox('rf_' + b.id, { width: b.w + 0.32, height: 0.22, depth: b.d + 0.32 }, this.scene)
    rf.position.set(b.x, b.h + 0.11, b.z); rf.material = am; rf.isPickable = false
    const rft = MeshBuilder.CreateBox('rft_' + b.id, { width: b.w - 0.1, height: 0.08, depth: b.d - 0.1 }, this.scene)
    rft.position.set(b.x, b.h + 0.04, b.z); rft.material = this._mat('rftm_' + b.id, Ty.accent, 0.02); rft.isPickable = false

    // Window bands
    const floors = Math.max(1, Math.floor((b.h - 1.4) / 1.9))
    for (let row = 0; row < floors; row++) {
      const wy = 1.1 + row * 1.9; if (wy > b.h - 1.2) break
      const wf = MeshBuilder.CreateBox(`wbf${b.id}_${row}`, { width: b.w * 0.74, height: 0.52, depth: 0.07 }, this.scene)
      wf.position.set(b.x, wy, b.z + b.d / 2 + 0.04); wf.material = wm; wf.isPickable = false
      const wb = MeshBuilder.CreateBox(`wbb${b.id}_${row}`, { width: b.w * 0.74, height: 0.52, depth: 0.07 }, this.scene)
      wb.position.set(b.x, wy, b.z - b.d / 2 - 0.04); wb.material = wm; wb.isPickable = false
      const we = MeshBuilder.CreateBox(`wbe${b.id}_${row}`, { width: 0.07, height: 0.52, depth: b.d * 0.74 }, this.scene)
      we.position.set(b.x + b.w / 2 + 0.04, wy, b.z); we.material = wm; we.isPickable = false
      const ww = MeshBuilder.CreateBox(`wbw${b.id}_${row}`, { width: 0.07, height: 0.52, depth: b.d * 0.74 }, this.scene)
      ww.position.set(b.x - b.w / 2 - 0.04, wy, b.z); ww.material = wm; ww.isPickable = false
      this._detailMeshes.push(wf as Mesh, wb as Mesh, we as Mesh, ww as Mesh)
    }

    // Door + step + awning
    const dr = MeshBuilder.CreateBox('dr_' + b.id, { width: b.w * 0.22, height: 1.9, depth: 0.08 }, this.scene)
    dr.position.set(b.x, 0.95, b.z + b.d / 2 + 0.04); dr.material = this._mat('drm_' + b.id, '#2a1e14'); dr.isPickable = false
    const stp = MeshBuilder.CreateBox('stp_' + b.id, { width: b.w * 0.38, height: 0.1, depth: 0.6 }, this.scene)
    stp.position.set(b.x, 0.05, b.z + b.d / 2 + 0.3); stp.material = this._mat('stpm_' + b.id, '#B0B0C0'); stp.isPickable = false
    const aw = MeshBuilder.CreateBox('aw_' + b.id, { width: b.w * 0.48, height: 0.1, depth: 0.7 }, this.scene)
    aw.position.set(b.x, 2.3, b.z + b.d / 2 + 0.35); aw.material = am; aw.isPickable = false
    this._detailMeshes.push(dr as Mesh, stp as Mesh, aw as Mesh)

    // Rooftop AC
    if (b.h >= 5) {
      const ac = MeshBuilder.CreateBox('ac_' + b.id, { width: 0.9, height: 0.5, depth: 0.7 }, this.scene)
      ac.position.set(b.x + b.w * 0.18, b.h + 0.4, b.z + b.d * 0.14)
      ac.material = this._mat('acm_' + b.id, '#808090'); ac.isPickable = false
      this._detailMeshes.push(ac as Mesh)
    }

    // Stepped crown for tall buildings
    if (b.h >= 7) {
      const uh = b.h * 0.22
      const up = MeshBuilder.CreateBox('up_' + b.id, { width: b.w * 0.68, height: uh, depth: b.d * 0.68 }, this.scene)
      up.position.set(b.x, b.h + uh / 2, b.z); up.material = bm; up.isPickable = false
      const uprf = MeshBuilder.CreateBox('uprf_' + b.id, { width: b.w * 0.72, height: 0.18, depth: b.d * 0.72 }, this.scene)
      uprf.position.set(b.x, b.h + uh + 0.09, b.z); uprf.material = am; uprf.isPickable = false
      this._detailMeshes.push(up as Mesh, uprf as Mesh)
      if (b.h >= 11) {
        const wt = MeshBuilder.CreateCylinder('wt_' + b.id, { diameter: 0.65, height: 1.1, tessellation: 8 }, this.scene)
        wt.position.set(b.x - b.w * 0.24, b.h + uh + 0.75, b.z - b.d * 0.22)
        wt.material = this._mat('wtm_' + b.id, '#6D4C41'); wt.isPickable = false
        this._detailMeshes.push(wt as Mesh)
      }
    }

    // Label anchor: just above the roof so the arrow points to the building top
    this._labelPositions.set(b.id, new Vector3(b.x, b.h + 0.6, b.z))
  }

  private _buildPlayer() {
    const plM = this._mat('pl_m', '#4F7CF7', 0.15)
    const phM = this._mat('ph_m', '#FFCC88', 0.08)
    this._player = new TransformNode('player', this.scene)
    this._player.position.set(0, 0, 0)
    this._playerBody = MeshBuilder.CreateCylinder('pb', { height: 1.2, diameterTop: 0.48, diameterBottom: 0.54, tessellation: 14 }, this.scene) as Mesh
    this._playerBody.position.y = 0.6; this._playerBody.parent = this._player; this._playerBody.material = plM; this._playerBody.isPickable = false
    this._playerHead = MeshBuilder.CreateSphere('ph', { diameter: 0.56, segments: 9 }, this.scene) as Mesh
    this._playerHead.position.y = 1.46; this._playerHead.parent = this._player; this._playerHead.material = phM; this._playerHead.isPickable = false
    const shadow = MeshBuilder.CreateDisc('psh', { radius: 0.38, tessellation: 16 }, this.scene)
    shadow.rotation.x = Math.PI / 2; shadow.position.y = 0.01; shadow.parent = this._player; shadow.isPickable = false
    const shM = new StandardMaterial('shm', this.scene); shM.diffuseColor = new Color3(0.04, 0.04, 0.1); shM.alpha = 0.35
    shadow.material = shM

    // Destination marker ring (click-to-move indicator)
    const destM = new StandardMaterial('destm', this.scene)
    destM.diffuseColor = new Color3(0.3, 0.85, 1); destM.emissiveColor = new Color3(0.2, 0.7, 1); destM.alpha = 0
    this._destMesh = MeshBuilder.CreateTorus('dest', { diameter: 1.1, thickness: 0.1, tessellation: 24 }, this.scene) as Mesh
    this._destMesh.rotation.x = Math.PI / 2; this._destMesh.material = destM; this._destMesh.isPickable = false
  }

  private _spawnCars() {
    const colors = ['#E53935','#1E88E5','#F57F17','#43A047','#8E24AA','#00838F','#C62828','#0277BD']
    const routes: RouteConfig[] = [
      { x: 1.3,  z:-75, dx:0,  dz:1,  sp:.22, ax:'z', lo:-75, hi:75 },
      { x: 1.3,  z:  0, dx:0,  dz:1,  sp:.18, ax:'z', lo:-75, hi:75 },
      { x:-1.3,  z: 75, dx:0,  dz:-1, sp:.20, ax:'z', lo:-75, hi:75 },
      { x:-1.3,  z: 22, dx:0,  dz:-1, sp:.25, ax:'z', lo:-75, hi:75 },
      { x:-75,   z:1.3, dx:1,  dz:0,  sp:.21, ax:'x', lo:-75, hi:75 },
      { x:-14,   z:1.3, dx:1,  dz:0,  sp:.17, ax:'x', lo:-75, hi:75 },
      { x: 75,   z:-1.3,dx:-1, dz:0,  sp:.23, ax:'x', lo:-75, hi:75 },
      { x: 30,   z:-1.3,dx:-1, dz:0,  sp:.19, ax:'x', lo:-75, hi:75 },
    ]
    routes.forEach((cfg, i) => {
      const node = this._makeCar(i, colors[i % 8])
      node.position.set(cfg.x, 0, cfg.z)
      node.rotation.y = Math.atan2(cfg.dx, cfg.dz)
      this._routes.push({ ...cfg, node })
    })
  }

  private _makeCar(id: number, hex: string) {
    const root = new TransformNode('car_' + id, this.scene)
    const bm = this._mat('cm_' + id, hex, 0.2)
    const wm = this._mat('cw_' + id, '#90CAF9', 0.4); wm.specularPower = 120
    const rim = this._mat('cr_' + id, '#1a1a1a', 0.08)
    const body = MeshBuilder.CreateBox('cb' + id, { width: 0.9, height: 0.38, depth: 1.6 }, this.scene)
    body.position.y = 0.3; body.parent = root; body.material = bm; body.isPickable = false
    const cab = MeshBuilder.CreateBox('cc' + id, { width: 0.82, height: 0.32, depth: 0.9 }, this.scene)
    cab.position.set(-0.04, 0.58, 0.06); cab.parent = root; cab.material = bm; cab.isPickable = false
    const fw = MeshBuilder.CreateBox('cfw' + id, { width: 0.74, height: 0.26, depth: 0.06 }, this.scene)
    fw.position.set(0, 0.58, -0.37); fw.parent = root; fw.material = wm; fw.isPickable = false
    const rw = fw.clone('crw' + id); rw.position.z = 0.51; rw.parent = root
    const wheelPos: [number, number, number][] = [[-0.47,.17,-.56],[-0.47,.17,.56],[.47,.17,-.56],[.47,.17,.56]]
    wheelPos.forEach(([wx, wy, wz], wi) => {
      const w = MeshBuilder.CreateCylinder('cw' + wi + '_' + id, { diameter: 0.3, height: 0.16, tessellation: 10 }, this.scene)
      w.rotation.z = Math.PI / 2; w.position.set(wx, wy, wz); w.parent = root; w.material = rim; w.isPickable = false
    })
    return root
  }

  private _startLoop() {
    const WALK_SPEED = 0.16, BOUND = 55
    const camTgt = Vector3.Zero()

    this.scene.registerBeforeRender(() => {
      const t = (performance.now() - this._t0) * 0.001
      const a = this.camera.alpha
      const PAN = this.camera.radius * 0.022

      // WASD/arrows pan the CAMERA (inverse of player movement — keyboard moves the world, not the avatar)
      if (this._keys['w'] || this._keys['W'] || this._keys['ArrowUp'])
        { this.camera.target.x -= Math.sin(a) * PAN; this.camera.target.z -= Math.cos(a) * PAN }
      if (this._keys['s'] || this._keys['S'] || this._keys['ArrowDown'])
        { this.camera.target.x += Math.sin(a) * PAN; this.camera.target.z += Math.cos(a) * PAN }
      if (this._keys['a'] || this._keys['A'] || this._keys['ArrowLeft'])
        { this.camera.target.x += Math.cos(a) * PAN; this.camera.target.z -= Math.sin(a) * PAN }
      if (this._keys['d'] || this._keys['D'] || this._keys['ArrowRight'])
        { this.camera.target.x -= Math.cos(a) * PAN; this.camera.target.z += Math.sin(a) * PAN }

      // Click-to-move: walk player toward tapped destination
      if (this._moveTarget) {
        const dx = this._moveTarget.x - this._player.position.x
        const dz = this._moveTarget.z - this._player.position.z
        const dist = Math.sqrt(dx * dx + dz * dz)
        if (dist > 0.28) {
          const step = Math.min(dist, WALK_SPEED)
          const nx = this._player.position.x + (dx / dist) * step
          const nz = this._player.position.z + (dz / dist) * step
          if (Math.abs(nx) < BOUND) this._player.position.x = nx
          if (Math.abs(nz) < BOUND) this._player.position.z = nz
          this._player.rotation.y = Math.atan2(dx, dz)
          camTgt.set(this._player.position.x, 1.2, this._player.position.z)
          Vector3.LerpToRef(this.camera.target, camTgt, 0.06, this.camera.target)
        } else {
          this._moveTarget = null
        }
      }

      // Destination ring pulse-fade
      if (this._destAlpha > 0) {
        this._destAlpha -= 0.012
        const a = Math.max(0, Math.min(1, this._destAlpha))
        ;(this._destMesh.material as StandardMaterial).alpha = a
        const s = 1 + (1.2 - this._destAlpha) * 0.4
        this._destMesh.scaling.set(s, 1, s)
      }

      this._playerBody.position.y = 0.6 + Math.sin(t * 2.2) * 0.045
      this._playerHead.position.y = 1.46 + Math.sin(t * 2.2) * 0.045

      this._routes.forEach(r => {
        if (r.ax === 'z') {
          r.node.position.z += r.dz * r.sp; r.node.position.x = r.x
          if (r.dz > 0 && r.node.position.z > r.hi) r.node.position.z = r.lo
          if (r.dz < 0 && r.node.position.z < r.lo) r.node.position.z = r.hi
        } else {
          r.node.position.x += r.dx * r.sp; r.node.position.z = r.z
          if (r.dx > 0 && r.node.position.x > r.hi) r.node.position.x = r.lo
          if (r.dx < 0 && r.node.position.x < r.lo) r.node.position.x = r.hi
        }
      })
      if (++this._lodFrame % 15 === 0) this._updateLOD()
    })

    this.scene.executeWhenReady(() => {
      try {
        const pp = new DefaultRenderingPipeline('pp', true, this.scene, [this.camera])
        pp.fxaaEnabled = true; pp.bloomEnabled = true; pp.bloomThreshold = 0.72; pp.bloomWeight = 0.1; pp.bloomScale = 0.5
      } catch (_) { /* unsupported */ }
    })
  }

  private _updateLOD() {
    const visible = this.camera.radius < 68
    if (visible !== this._detVis) {
      this._detVis = visible
      this._detailMeshes.forEach(m => { m.isVisible = visible })
    }
  }

  /** Call each frame from the render loop to get 2D label positions */
  computeLabels(): LabelUpdate {
    const rw = this.engine.getRenderWidth(), rh = this.engine.getRenderHeight()
    const vp = this.camera.viewport.toGlobal(rw, rh)
    const tfm = this.scene.getTransformMatrix()
    const result: LabelUpdate = []
    this._labelPositions.forEach((pos, id) => {
      const sp = Vector3.Project(pos, Matrix.Identity(), tfm, vp)
      result.push({
        id,
        x: sp.x,
        y: sp.y,
        visible: sp.z > 0 && sp.z < 1 && sp.x > -20 && sp.x < rw + 20 && sp.y > -20 && sp.y < rh + 20,
      })
    })
    return result
  }

  get playerPosition() { return this._player.position }

  getMinimapData() {
    return {
      routes: this._routes.map(r => ({ x: r.node.position.x, z: r.node.position.z })),
      player: { x: this._player.position.x, z: this._player.position.z },
    }
  }

  dispose() {
    this.engine.dispose()
  }
}

interface RouteConfig {
  x: number; z: number; dx: number; dz: number; sp: number; ax: 'x' | 'z'; lo: number; hi: number
}
interface RouteState extends RouteConfig {
  node: TransformNode
}

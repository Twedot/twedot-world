import {
  Engine, Scene, ArcRotateCamera, Vector3, Color3, Color4,
  HemisphericLight, DirectionalLight, MeshBuilder, StandardMaterial,
  DynamicTexture, TransformNode, Mesh,
} from '@babylonjs/core'
import { saveHouseState, type HouseStateData } from '../world/worldApi'

export type FurnitureType = 'chair' | 'table' | 'tv' | 'ac' | 'sofa' | 'bed' | 'sink' | 'wardrobe' | 'lamp'
  | 'toilet' | 'bathtub' | 'stove' | 'counter' | 'fridge'

export type RoomZone = 'living' | 'bathroom' | 'kitchen'
export type HouseType = 'selfcon' | '2bed' | '3bed' | 'upstairs'

// Zone rectangles (world coords, xMin/xMax/zMin/zMax)
const ZONE_BATHROOM = { xMin: 2.8, xMax: 6.0, zMin: 2.8, zMax: 6.0 }
const ZONE_KITCHEN  = { xMin: -6.0, xMax: -2.8, zMin: 2.8, zMax: 6.0 }

const ZONE_FOR_TYPE: Partial<Record<FurnitureType, RoomZone>> = {
  toilet: 'bathroom', bathtub: 'bathroom',
  stove: 'kitchen', counter: 'kitchen', fridge: 'kitchen',
}

export function getZoneForType(t: FurnitureType): RoomZone { return ZONE_FOR_TYPE[t] ?? 'living' }

function pointInZone(x: number, z: number, zone: { xMin: number; xMax: number; zMin: number; zMax: number }): boolean {
  return x >= zone.xMin && x <= zone.xMax && z >= zone.zMin && z <= zone.zMax
}

export function getZoneAt(x: number, z: number): RoomZone {
  if (pointInZone(x, z, ZONE_BATHROOM)) return 'bathroom'
  if (pointInZone(x, z, ZONE_KITCHEN))  return 'kitchen'
  return 'living'
}

const ROOM_W  = 12
const ROOM_D  = 12
const WALL_H  = 3.2
const WALL_T  = 0.22

const CAM_ALPHA_DEFAULT = -Math.PI / 4
const CAM_ALPHA_MIN     = -Math.PI / 2
const CAM_ALPHA_MAX     = 0
const CAM_BETA          = Math.PI / 3.6
const CAM_BETA_MIN      = Math.PI / 6     // ~30° — near top-down
const CAM_BETA_MAX      = Math.PI / 2.5   // ~72° — low angle

interface FurniturePiece { id: number; type: FurnitureType; root: TransformNode; x: number; z: number; rotY: number; color?: string }

export class HouseScene {
  readonly engine: Engine
  readonly scene:  Scene
  readonly camera: ArcRotateCamera

  private _wallMat!:  StandardMaterial
  private _tileMat1!: StandardMaterial
  private _tileMat2!: StandardMaterial
  private _floorColor = '#C89650'
  private _keys      = new Set<string>()
  private _furniture: FurniturePiece[] = []
  private _furnIdCounter = 0
  private _placingType: FurnitureType | null = null
  private _movingFurnId: number | null = null
  private _ghost: TransformNode | null = null
  private _loading = false
  private _floorMesh!: Mesh
  private _houseType: HouseType = 'selfcon'
  private _interiorMeshes: Mesh[] = []
  private _keyDown!: (e: KeyboardEvent) => void
  private _keyUp!:   (e: KeyboardEvent) => void

  constructor(
    private readonly _cv: HTMLCanvasElement,
    _userId: string,
    _avatarUrl: string | null,
    _userName: string,
  ) {
    this.engine = new Engine(this._cv, true, { antialias: true, adaptToDeviceRatio: true, preserveDrawingBuffer: true })
    this.scene  = new Scene(this.engine)
    this.scene.clearColor = new Color4(0.53, 0.81, 0.92, 1)

    // Limited rotation: ±45° horizontal from default; elevation locked
    this.camera = new ArcRotateCamera('hcam', CAM_ALPHA_DEFAULT, CAM_BETA, 18, Vector3.Zero(), this.scene)
    this.camera.lowerAlphaLimit  = CAM_ALPHA_MIN
    this.camera.upperAlphaLimit  = CAM_ALPHA_MAX
    this.camera.lowerBetaLimit   = CAM_BETA_MIN
    this.camera.upperBetaLimit   = CAM_BETA_MAX
    this.camera.lowerRadiusLimit = 10
    this.camera.upperRadiusLimit = 26
    this.camera.panningSensibility = 0
    this.camera.attachControl(this._cv, true)

    this._lighting()
    this._buildRoom()
    this._buildGarage()
    this._buildTrees()
    this._initInput()
    this._placeDefaultAmenities()
  }

  // ── Lighting ──────────────────────────────────────────────────────────────

  private _lighting(): void {
    const amb = new HemisphericLight('hamb', new Vector3(0, 1, 0), this.scene)
    amb.intensity = 0.9; amb.diffuse = new Color3(1, 0.97, 0.90)
    amb.groundColor = new Color3(0.60, 0.48, 0.35)

    const sun = new DirectionalLight('hsun', new Vector3(-0.6, -0.8, 0.6), this.scene)
    sun.intensity = 0.8; sun.diffuse = new Color3(1, 0.95, 0.85)
  }

  // ── Materials ─────────────────────────────────────────────────────────────

  /**
   * Flat material: bypasses Babylon lighting entirely.
   * emissiveColor = the exact colour that appears on screen regardless of lights.
   * Used for walls and floor tiles to guarantee they show the right colour.
   */
  private _flatMat(hex: string): StandardMaterial {
    const c = this._hex2col(hex)
    const m = new StandardMaterial('fm' + Math.random(), this.scene)
    m.disableLighting = true
    m.emissiveColor   = c
    m.diffuseColor    = Color3.Black()
    m.specularColor   = Color3.Black()
    return m
  }

  /** Normal lit material for furniture */
  private _mat(hex: string, alpha = 1): StandardMaterial {
    const c = this._hex2col(hex)
    const m = new StandardMaterial('m' + Math.random(), this.scene)
    m.diffuseColor  = c
    m.emissiveColor = c.scale(0.18)
    m.specularColor = new Color3(0.05, 0.05, 0.05)
    m.alpha = alpha
    return m
  }

  private _hex2col(hex: string): Color3 {
    const h = hex.length === 7 ? hex : '#CCCCCC'
    return Color3.FromHexString(h)
  }

  private _darken(hex: string, f: number): string {
    const c = this._hex2col(hex)
    return '#' + new Color3(c.r * f, c.g * f, c.b * f).toHexString()
  }

  // ── Room ──────────────────────────────────────────────────────────────────

  private _buildRoom(): void {
    const wallHex = '#C8A251'
    this._floorColor = '#C89650'

    // Wall material — flat lit so colour always shows correctly
    this._wallMat = this._flatMat(wallHex)

    // ── Green circular base ────────────────────────────────────────────────
    const platMat = new StandardMaterial('platm', this.scene)
    platMat.disableLighting = true
    platMat.emissiveColor   = new Color3(0.28, 0.56, 0.14)
    const plat = MeshBuilder.CreateCylinder('plat',
      { height: 0.40, diameter: ROOM_W * 1.65, tessellation: 72 }, this.scene)
    plat.position.y = -0.28; plat.material = platMat; plat.isPickable = false

    // ── Solid floor base (fills tile gaps, same colour as primary tile) ────
    this._tileMat1 = this._flatMat(this._floorColor)
    this._tileMat2 = this._flatMat(this._darken(this._floorColor, 0.74))

    const floorBase = MeshBuilder.CreateBox('hfloorbase',
      { width: ROOM_W, height: 0.10, depth: ROOM_D }, this.scene)
    floorBase.position.y = -0.05
    floorBase.material   = this._tileMat1
    floorBase.isPickable = false

    // ── Checkered tiles on top ─────────────────────────────────────────────
    const TN = 10, tw = ROOM_W / TN
    for (let r = 0; r < TN; r++) {
      for (let c = 0; c < TN; c++) {
        const tile = MeshBuilder.CreateBox(`htile_${r}_${c}`,
          { width: tw - 0.03, height: 0.06, depth: tw - 0.03 }, this.scene)
        tile.position.set(
          -ROOM_W / 2 + tw * c + tw / 2,
          0.03,
          -ROOM_D / 2 + tw * r + tw / 2,
        )
        tile.material   = (r + c) % 2 === 0 ? this._tileMat1 : this._tileMat2
        tile.isPickable = false
      }
    }

    // ── Invisible ground for furniture raycasting ─────────────────────────
    this._floorMesh = MeshBuilder.CreateGround('hfloor',
      { width: ROOM_W, height: ROOM_D, subdivisions: 1 }, this.scene)
    this._floorMesh.position.y = 0.07  // just above tiles
    this._floorMesh.visibility = 0
    this._floorMesh.isPickable = true

    // ── Walls: north (back) + west (left) ─────────────────────────────────
    const wallDefs: [string, number, number, number, number, number][] = [
      ['hwN',  0,                         WALL_H / 2, ROOM_D / 2 + WALL_T / 2, ROOM_W + WALL_T * 2, WALL_T],
      ['hwW', -ROOM_W / 2 - WALL_T / 2,  WALL_H / 2, 0,                        WALL_T,               ROOM_D],
    ]
    for (const [id, x, y, z, w, d] of wallDefs) {
      const wall = MeshBuilder.CreateBox(id, { width: w, height: WALL_H, depth: d }, this.scene)
      wall.position.set(x, y, z)
      wall.material = this._wallMat; wall.isPickable = false
    }

    // Skirting boards (slightly darker flat colour)
    const skirtMat = this._flatMat(this._darken(wallHex, 0.72))
    for (const [id, x, _y, z, w, d] of wallDefs) {
      const sk = MeshBuilder.CreateBox('sk_' + id, { width: w, height: 0.22, depth: d }, this.scene)
      sk.position.set(x, 0.11, z); sk.material = skirtMat; sk.isPickable = false
    }

    // ── Interior (zones, partitions, bedrooms — depends on house type) ──
    this._buildInterior()

    // Window and door on north wall
    this._buildWindow()
    this._buildDoor()
  }

  private _buildWindow(): void {
    const wZ = ROOM_D / 2 - 0.04
    const wX = 2.2, wCY = 1.6, wW = 1.80, wH = 1.05
    const frameMat = this._flatMat('#F0EEE8')

    // Outer frame
    const parts: [number, number, number, number, number, number][] = [
      [wX, wCY + wH / 2 + 0.07, wZ, wW + 0.30, 0.14, 0.11],  // top
      [wX, wCY - wH / 2 - 0.07, wZ, wW + 0.30, 0.14, 0.11],  // bottom
      [wX - wW / 2 - 0.07, wCY, wZ, 0.14, wH + 0.28, 0.11],  // left
      [wX + wW / 2 + 0.07, wCY, wZ, 0.14, wH + 0.28, 0.11],  // right
    ]
    parts.forEach(([fx, fy, fz, fw, fh, fd], i) => {
      const f = MeshBuilder.CreateBox('wf' + i,
        { width: fw, height: fh, depth: fd }, this.scene)
      f.position.set(fx, fy, fz); f.material = frameMat; f.isPickable = false
    })

    // Vertical bars
    for (let i = -1; i <= 1; i++) {
      const bar = MeshBuilder.CreateBox('wbar' + i,
        { width: 0.08, height: wH, depth: 0.08 }, this.scene)
      bar.position.set(wX + i * (wW / 3), wCY, wZ)
      bar.material = frameMat; bar.isPickable = false
    }

    // Glass
    const gm = new StandardMaterial('gm', this.scene)
    gm.diffuseColor = new Color3(0.55, 0.72, 0.90); gm.alpha = 0.45
    const glass = MeshBuilder.CreateBox('wglass',
      { width: wW, height: wH, depth: 0.04 }, this.scene)
    glass.position.set(wX, wCY, wZ - 0.04)
    glass.material = gm; glass.isPickable = false
  }

  private _buildDoor(): void {
    // Door on north wall, to the left of the window (window is at x=2.2)
    const dX  = -2.0
    const dZ  = ROOM_D / 2 - 0.03   // just inside the room face
    const dW  = 0.90, dH = 2.10

    // Dark opening panel — sits on wall face to simulate open doorway
    const darkMat = new StandardMaterial('dkm', this.scene)
    darkMat.disableLighting = true
    darkMat.emissiveColor   = new Color3(0.07, 0.05, 0.04)
    const opening = MeshBuilder.CreateBox('hdropening',
      { width: dW, height: dH, depth: 0.02 }, this.scene)
    opening.position.set(dX, dH / 2, dZ); opening.material = darkMat; opening.isPickable = false

    // Door panel (wood, slightly open — pivots from left hinge)
    const doorRoot = new TransformNode('hdoorroot', this.scene)
    doorRoot.position.set(dX - dW / 2, 0, dZ - 0.02)
    doorRoot.rotation.y = -Math.PI * 0.22   // ~40° open into room
    const doorMat = this._flatMat('#9C5E28')
    const doorPanel = MeshBuilder.CreateBox('hdoor',
      { width: dW - 0.04, height: dH - 0.04, depth: 0.06 }, this.scene)
    doorPanel.parent   = doorRoot
    doorPanel.position.set(dW / 2, dH / 2, 0)
    doorPanel.material = doorMat; doorPanel.isPickable = false

    // Decorative inset panels on door
    const insetMat = this._flatMat('#7A4518')
    for (const iy of [dH * 0.70, dH * 0.34]) {
      const inset = MeshBuilder.CreateBox('dinset' + iy,
        { width: dW * 0.70, height: dH * 0.24, depth: 0.025 }, this.scene)
      inset.parent = doorRoot
      inset.position.set(dW / 2, iy, -0.04)
      inset.material = insetMat; inset.isPickable = false
    }

    // Door knob
    const knobMat = this._flatMat('#C8962A')
    const knob = MeshBuilder.CreateSphere('hdknob', { diameter: 0.10, segments: 5 }, this.scene)
    knob.parent   = doorRoot
    knob.position.set(dW - 0.12, dH * 0.46, -0.06)
    knob.material = knobMat; knob.isPickable = false

    // Door frame
    const frameMat = this._flatMat('#E8DCC8')
    const frameParts: [number, number, number, number][] = [
      [dX,               dH + 0.10, dW + 0.26, 0.20],     // top bar
      [dX - dW / 2 - 0.10, dH / 2, 0.20, dH + 0.20],     // left side
      [dX + dW / 2 + 0.10, dH / 2, 0.20, dH + 0.20],     // right side
    ]
    frameParts.forEach(([fx, fy, fw, fh], i) => {
      const f = MeshBuilder.CreateBox('df' + i,
        { width: fw, height: fh, depth: 0.14 }, this.scene)
      f.position.set(fx, fy, dZ + 0.02); f.material = frameMat; f.isPickable = false
    })
  }

  // ── Interior (type-dependent layout) ───────────────────────────────────

  private _buildInterior(): void {
    this._buildZoneFloors()
    this._buildPartitions()

    if (this._houseType === '2bed') this._buildBedrooms(2)
    else if (this._houseType === '3bed') this._buildBedrooms(3)
    else if (this._houseType === 'upstairs') this._buildSecondFloor()
  }

  private _disposeInterior(): void {
    for (const m of this._interiorMeshes) m.dispose(false, true)
    this._interiorMeshes = []
  }

  private _iMesh(m: Mesh): Mesh {
    this._interiorMeshes.push(m)
    return m
  }

  // ── Zone floors & partitions ───────────────────────────────────────────

  private _buildZoneFloors(): void {
    const bathW = ZONE_BATHROOM.xMax - ZONE_BATHROOM.xMin
    const bathD = ZONE_BATHROOM.zMax - ZONE_BATHROOM.zMin
    const bathMat1 = this._flatMat('#E8E8E8')
    const bathMat2 = this._flatMat('#D0D0D0')
    const bTN = 4, btw = bathW / bTN, btd = bathD / bTN
    for (let r = 0; r < bTN; r++) {
      for (let c = 0; c < bTN; c++) {
        const t = this._iMesh(MeshBuilder.CreateBox(`btile_${r}_${c}`,
          { width: btw - 0.02, height: 0.07, depth: btd - 0.02 }, this.scene))
        t.position.set(ZONE_BATHROOM.xMin + btw * c + btw / 2, 0.04, ZONE_BATHROOM.zMin + btd * r + btd / 2)
        t.material = (r + c) % 2 === 0 ? bathMat1 : bathMat2; t.isPickable = false
      }
    }

    const kitW = ZONE_KITCHEN.xMax - ZONE_KITCHEN.xMin
    const kitD = ZONE_KITCHEN.zMax - ZONE_KITCHEN.zMin
    const kitMat1 = this._flatMat('#D4A574')
    const kitMat2 = this._flatMat('#C09060')
    const kTN = 4, ktw = kitW / kTN, ktd = kitD / kTN
    for (let r = 0; r < kTN; r++) {
      for (let c = 0; c < kTN; c++) {
        const t = this._iMesh(MeshBuilder.CreateBox(`ktile_${r}_${c}`,
          { width: ktw - 0.02, height: 0.07, depth: ktd - 0.02 }, this.scene))
        t.position.set(ZONE_KITCHEN.xMin + ktw * c + ktw / 2, 0.04, ZONE_KITCHEN.zMin + ktd * r + ktd / 2)
        t.material = (r + c) % 2 === 0 ? kitMat1 : kitMat2; t.isPickable = false
      }
    }
  }

  private _buildPartitions(): void {
    const partMat = this._flatMat('#D8D0C0')
    const PH = 2.8, PT = 0.12, DH = 2.2

    const p = (name: string, w: number, h: number, d: number, x: number, y: number, z: number) => {
      const m = this._iMesh(MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, this.scene))
      m.position.set(x, y, z); m.material = partMat; m.isPickable = false
    }
    const lintelH = PH - DH

    // Bathroom walls
    p('bpS', ZONE_BATHROOM.xMax - ZONE_BATHROOM.xMin, PH, PT,
      (ZONE_BATHROOM.xMin + ZONE_BATHROOM.xMax) / 2, PH / 2, ZONE_BATHROOM.zMin)
    p('bpW', PT, DH, ZONE_BATHROOM.zMax - ZONE_BATHROOM.zMin - 1.0,
      ZONE_BATHROOM.xMin, DH / 2, (ZONE_BATHROOM.zMin + ZONE_BATHROOM.zMax) / 2 + 0.5)
    p('bpLintel', PT, lintelH, 1.0,
      ZONE_BATHROOM.xMin, DH + lintelH / 2, ZONE_BATHROOM.zMin + 0.5)

    // Kitchen walls
    p('kpS', ZONE_KITCHEN.xMax - ZONE_KITCHEN.xMin, PH, PT,
      (ZONE_KITCHEN.xMin + ZONE_KITCHEN.xMax) / 2, PH / 2, ZONE_KITCHEN.zMin)
    p('kpE', PT, DH, ZONE_KITCHEN.zMax - ZONE_KITCHEN.zMin - 1.0,
      ZONE_KITCHEN.xMax, DH / 2, (ZONE_KITCHEN.zMin + ZONE_KITCHEN.zMax) / 2 + 0.5)
    p('kpLintel', PT, lintelH, 1.0,
      ZONE_KITCHEN.xMax, DH + lintelH / 2, ZONE_KITCHEN.zMin + 0.5)

    this._zoneLabel('BATHROOM', (ZONE_BATHROOM.xMin + ZONE_BATHROOM.xMax) / 2, ZONE_BATHROOM.zMin + 0.08, 0)
    this._zoneLabel('KITCHEN', (ZONE_KITCHEN.xMin + ZONE_KITCHEN.xMax) / 2, ZONE_KITCHEN.zMin + 0.08, 0)
  }

  private _zoneLabel(text: string, x: number, z: number, rotY: number): void {
    const tex = new DynamicTexture('zt_' + text, { width: 512, height: 128 }, this.scene, false)
    const ctx = tex.getContext() as unknown as CanvasRenderingContext2D
    ctx.clearRect(0, 0, 512, 128)
    ctx.fillStyle = '#6A6058'
    ctx.font = 'bold 52px Arial'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(text, 256, 64)
    tex.update()

    const mat = new StandardMaterial('zlm_' + text, this.scene)
    mat.disableLighting = true; mat.emissiveTexture = tex
    mat.emissiveColor = new Color3(1, 1, 1); mat.opacityTexture = tex
    mat.useAlphaFromDiffuseTexture = true

    const plane = this._iMesh(MeshBuilder.CreatePlane('zl_' + text, { width: 2.0, height: 0.5 }, this.scene))
    plane.position.set(x, 2.4, z); plane.rotation.y = rotY + Math.PI
    plane.material = mat; plane.isPickable = false
  }

  // ── Bedroom partitions ─────────────────────────────────────────────────

  private _buildBedrooms(count: 2 | 3): void {
    const PH = 2.8, PT = 0.12, DH = 2.2
    const lintelH = PH - DH
    const HALF = ROOM_W / 2

    const p = (name: string, w: number, h: number, d: number, x: number, y: number, z: number) => {
      const m = this._iMesh(MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, this.scene))
      m.position.set(x, y, z); m.material = this._wallMat; m.isPickable = false
    }

    const wallZ = -1.5
    const doorGap = 1.2
    p('brWallL', HALF - doorGap / 2, PH, PT, -(HALF + doorGap / 2) / 2, PH / 2, wallZ)
    p('brWallR', HALF - doorGap / 2, PH, PT, (HALF + doorGap / 2) / 2, PH / 2, wallZ)

    if (count === 2) {
      p('brDiv', PT, DH, HALF - 1.5 - 0.5, 0, DH / 2, -(HALF + wallZ) / 2 - 0.5)
      p('brDivLintel', PT, lintelH, 1.0, 0, DH + lintelH / 2, wallZ - 0.5)

      this._zoneLabel('BEDROOM 1', -HALF / 2, wallZ - 0.08, Math.PI)
      this._zoneLabel('BEDROOM 2', HALF / 2, wallZ - 0.08, Math.PI)
    } else {
      for (const dx of [-2, 2]) {
        p(`brDiv${dx}`, PT, DH, HALF - 1.5 - 0.5, dx, DH / 2, -(HALF + wallZ) / 2 - 0.5)
        p(`brDivL${dx}`, PT, lintelH, 1.0, dx, DH + lintelH / 2, wallZ - 0.5)
      }

      for (const { x, label } of [{ x: -4, label: 'BEDROOM 1' }, { x: 0, label: 'BEDROOM 2' }, { x: 4, label: 'BEDROOM 3' }]) {
        this._zoneLabel(label, x, wallZ - 0.08, Math.PI)
      }
    }
  }

  // ── Upstairs (second floor) ────────────────────────────────────────────

  private _buildSecondFloor(): void {
    const HALF = ROOM_W / 2
    const floorY = WALL_H + 0.05
    const PH = 2.6

    // Second-floor platform (covers back half of the house: z=0 to z=6)
    const platW = ROOM_W, platD = HALF
    const platMat = this._flatMat('#B8A88C')
    const plat = this._iMesh(MeshBuilder.CreateBox('upFloor',
      { width: platW, height: 0.12, depth: platD }, this.scene))
    plat.position.set(0, floorY, HALF / 2); plat.material = platMat; plat.isPickable = false

    // Railing along front edge (z=0) of second floor
    const railMat = this._flatMat('#9C7040')
    const rail = this._iMesh(MeshBuilder.CreateBox('upRail',
      { width: platW, height: 0.06, depth: 0.06 }, this.scene))
    rail.position.set(0, floorY + 0.9, 0); rail.material = railMat; rail.isPickable = false

    // Railing posts
    for (let i = -5; i <= 5; i += 2) {
      const post = this._iMesh(MeshBuilder.CreateBox(`upPost${i}`,
        { width: 0.06, height: 0.9, depth: 0.06 }, this.scene))
      post.position.set(i, floorY + 0.45, 0); post.material = railMat; post.isPickable = false
    }

    // Upstairs walls — same color as main walls
    const p = (name: string, w: number, h: number, d: number, x: number, y: number, z: number) => {
      const m = this._iMesh(MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, this.scene))
      m.position.set(x, y, z); m.material = this._wallMat; m.isPickable = false
    }
    p('upWN', ROOM_W + WALL_T * 2, PH, WALL_T, 0, floorY + PH / 2, HALF + WALL_T / 2)
    p('upWW', WALL_T, PH, platD, -HALF - WALL_T / 2, floorY + PH / 2, HALF / 2)

    // Staircase (right side, ascending from ground to second floor)
    const stairMat = this._flatMat('#A08060')
    const steps = 8
    const stairW = 1.2, stairD = 3.0
    const stepH = (floorY + 0.12) / steps
    const stepD = stairD / steps
    for (let i = 0; i < steps; i++) {
      const step = this._iMesh(MeshBuilder.CreateBox(`stair${i}`,
        { width: stairW, height: stepH, depth: stepD - 0.02 }, this.scene))
      step.position.set(HALF - stairW / 2 - 0.3, stepH * (i + 0.5), -1.5 + stepD * i + stepD / 2)
      step.material = stairMat; step.isPickable = false
    }

    this._zoneLabel('UPSTAIRS', 0, 0.08, Math.PI)
  }

  // ── Garage ────────────────────────────────────────────────────────────────

  private _buildGarage(): void {
    const GW = 5.0, GD = 3.2, GH = 2.5
    const GX = 0, GZ = -(ROOM_D / 2) - GD / 2 - 1.0  // south of house

    // Floor with "GARAGE" text
    const gTex = new DynamicTexture('garageTex', { width: 1024, height: 512 }, this.scene, false)
    const gc = gTex.getContext() as unknown as CanvasRenderingContext2D
    gc.fillStyle = '#6A6A6A'
    gc.fillRect(0, 0, 1024, 512)
    gc.strokeStyle = '#575757'
    gc.lineWidth = 3
    for (let i = 1; i <= 4; i++) {
      gc.beginPath(); gc.moveTo(i * 204, 0); gc.lineTo(i * 204, 512); gc.stroke()
    }
    for (let i = 1; i <= 2; i++) {
      gc.beginPath(); gc.moveTo(0, i * 170); gc.lineTo(1024, i * 170); gc.stroke()
    }
    gc.fillStyle = '#EAEAEA'
    gc.font = 'bold 108px Arial'
    gc.textAlign = 'center'; gc.textBaseline = 'middle'
    gc.fillText('GARAGE', 512, 268)
    gTex.update()

    const gFloorMat = new StandardMaterial('gFloorMat', this.scene)
    gFloorMat.disableLighting = true
    gFloorMat.emissiveColor   = new Color3(1, 1, 1)
    gFloorMat.emissiveTexture = gTex
    const gFloor = MeshBuilder.CreateGround('garageFloor',
      { width: GW, height: GD, subdivisions: 1 }, this.scene)
    gFloor.position.set(GX, 0.02, GZ)
    gFloor.material = gFloorMat; gFloor.isPickable = false

    // Walls
    const gWM = this._flatMat('#B2AEA6')

    const sw = MeshBuilder.CreateBox('gwS', { width: GW + 0.18, height: GH, depth: 0.18 }, this.scene)
    sw.position.set(GX, GH / 2, GZ - GD / 2); sw.material = gWM; sw.isPickable = false

    const ww = MeshBuilder.CreateBox('gwW', { width: 0.18, height: GH, depth: GD }, this.scene)
    ww.position.set(GX - GW / 2, GH / 2, GZ); ww.material = gWM; ww.isPickable = false

    const ewm = MeshBuilder.CreateBox('gwE', { width: 0.18, height: GH, depth: GD }, this.scene)
    ewm.position.set(GX + GW / 2, GH / 2, GZ); ewm.material = gWM; ewm.isPickable = false

    // North face: two side pillars + header above opening
    const dW = 4.0, dH = GH * 0.82
    const pW = (GW - dW) / 2  // = 0.5

    const nL = MeshBuilder.CreateBox('gwNL', { width: pW, height: GH, depth: 0.18 }, this.scene)
    nL.position.set(GX - dW / 2 - pW / 2, GH / 2, GZ + GD / 2)
    nL.material = gWM; nL.isPickable = false

    const nR = MeshBuilder.CreateBox('gwNR', { width: pW, height: GH, depth: 0.18 }, this.scene)
    nR.position.set(GX + dW / 2 + pW / 2, GH / 2, GZ + GD / 2)
    nR.material = gWM; nR.isPickable = false

    const nTop = MeshBuilder.CreateBox('gwNTop',
      { width: GW + 0.18, height: GH - dH, depth: 0.18 }, this.scene)
    nTop.position.set(GX, dH + (GH - dH) / 2, GZ + GD / 2)
    nTop.material = gWM; nTop.isPickable = false

    // Open carport — no roof, just a thin border trim on top of the pillars
    const trimMat = this._flatMat('#7E7468')
    const trimBack = MeshBuilder.CreateBox('gtrimB', { width: GW + 0.36, height: 0.10, depth: 0.14 }, this.scene)
    trimBack.position.set(GX, GH + 0.05, GZ - GD / 2); trimBack.material = trimMat; trimBack.isPickable = false
    const trimL = MeshBuilder.CreateBox('gtrimL', { width: 0.14, height: 0.10, depth: GD + 0.14 }, this.scene)
    trimL.position.set(GX - GW / 2, GH + 0.05, GZ); trimL.material = trimMat; trimL.isPickable = false
    const trimR = MeshBuilder.CreateBox('gtrimR', { width: 0.14, height: 0.10, depth: GD + 0.14 }, this.scene)
    trimR.position.set(GX + GW / 2, GH + 0.05, GZ); trimR.material = trimMat; trimR.isPickable = false
  }

  // ── Trees ─────────────────────────────────────────────────────────────────

  private _buildTrees(): void {
    const PLAT_R = (ROOM_W * 1.65) / 2
    const HOUSE_HALF = ROOM_W / 2 + 0.6
    const GARAGE_Z_MIN = -(ROOM_D / 2) - 4.2 - 1.0

    const trunkMat = this._mat('#8B6B3D')
    const frondMat = this._mat('#2E8B2E')
    const coconutMat = this._mat('#6B4226')

    const positions: [number, number][] = []
    const rng = (min: number, max: number) => min + Math.random() * (max - min)

    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 6) {
      const r = rng(PLAT_R * 0.72, PLAT_R * 0.92)
      const tx = Math.cos(angle) * r
      const tz = Math.sin(angle) * r

      if (Math.abs(tx) < HOUSE_HALF + 0.8 && tz > -HOUSE_HALF - 0.8 && tz < HOUSE_HALF + 0.8) continue
      if (tx > -3.5 && tx < 3.5 && tz < -ROOM_D / 2 && tz > GARAGE_Z_MIN - 1.0) continue

      positions.push([tx, tz])
    }

    for (let i = 0; i < positions.length; i++) {
      const [tx, tz] = positions[i]
      const scale = rng(0.55, 0.80)
      const trunkH = 1.8 * scale

      const trunk = MeshBuilder.CreateCylinder(`palm_trunk_${i}`, {
        height: trunkH, diameterTop: 0.06 * scale, diameterBottom: 0.14 * scale, tessellation: 6,
      }, this.scene)
      trunk.position.set(tx, trunkH / 2 - 0.08, tz)
      trunk.material = trunkMat; trunk.isPickable = false

      const topY = trunkH - 0.08
      const frondCount = 6
      for (let f = 0; f < frondCount; f++) {
        const angle = (f / frondCount) * Math.PI * 2 + i * 0.5
        const frond = MeshBuilder.CreateBox(`palm_frond_${i}_${f}`, {
          width: 0.08 * scale, height: 0.03 * scale, depth: 0.7 * scale,
        }, this.scene)
        frond.position.set(
          tx + Math.cos(angle) * 0.3 * scale,
          topY - 0.05,
          tz + Math.sin(angle) * 0.3 * scale,
        )
        frond.rotation.set(-0.5, angle, 0)
        frond.material = frondMat; frond.isPickable = false
      }

      const nutCount = 2 + (i % 2)
      for (let n = 0; n < nutCount; n++) {
        const na = (n / nutCount) * Math.PI * 2
        const nut = MeshBuilder.CreateSphere(`palm_nut_${i}_${n}`, { diameter: 0.07 * scale, segments: 4 }, this.scene)
        nut.position.set(tx + Math.cos(na) * 0.08, topY - 0.12, tz + Math.sin(na) * 0.08)
        nut.material = coconutMat; nut.isPickable = false
      }
    }
  }

  // ── Input ─────────────────────────────────────────────────────────────────

  private _isFloorHit(name: string): boolean {
    return name === 'hfloor' || name.startsWith('htile_')
  }

  private _initInput(): void {
    this._keyDown = (e: KeyboardEvent) => {
      this._keys.add(e.key.toLowerCase())
      if (e.key === 'Escape') { this.cancelPlacing(); this.cancelMoving() }
    }
    this._keyUp = (e: KeyboardEvent) => { this._keys.delete(e.key.toLowerCase()) }
    window.addEventListener('keydown', this._keyDown)
    window.addEventListener('keyup',   this._keyUp)

    this.scene.onPointerDown = (ev, pick) => {
      if (!pick?.hit || !pick.pickedPoint) return
      const hitName = pick.pickedMesh?.name ?? ''

      if (this._placingType) {
        if (this._isFloorHit(hitName)) {
          const px = pick.pickedPoint.x, pz = pick.pickedPoint.z
          const requiredZone = getZoneForType(this._placingType)
          const clickedZone  = getZoneAt(px, pz)
          if (requiredZone !== 'living' && clickedZone !== requiredZone) {
            this.onZoneReject?.(requiredZone)
            return
          }
          if (requiredZone === 'living' && clickedZone !== 'living') {
            this.onZoneReject?.('living')
            return
          }
          this._placeFurniture(this._placingType, px, pz)
          this._clearGhost(); this._placingType = null
          this.onPlacingDone?.(); this._saveState()
        }
        return
      }

      if (this._movingFurnId !== null) {
        if (this._isFloorHit(hitName)) {
          const f = this._furniture.find(p => p.id === this._movingFurnId)
          if (f) {
            const nx = pick.pickedPoint.x, nz = pick.pickedPoint.z
            const ny = (f.type === 'ac') ? 1.5 : 0
            f.root.position.set(nx, ny, nz)
            f.x = nx; f.z = nz
          }
          this._clearGhost(); this._movingFurnId = null
          this.scene.hoverCursor = 'default'
          this.onMovingDone?.(); this._saveState()
        }
        return
      }

      // Tap furniture → show context menu (Move / Remove)
      const furnId = (pick.pickedMesh as { metadata?: { furnId?: number } })?.metadata?.furnId
      if (typeof furnId === 'number') {
        this.onFurnSelected?.(furnId, ev.clientX, ev.clientY)
      }
    }

    this.scene.onPointerMove = (_ev, pick) => {
      if (!this._ghost || !pick?.hit || !pick.pickedPoint) return
      if (this._isFloorHit(pick.pickedMesh?.name ?? '')) {
        this._ghost.position.set(pick.pickedPoint.x, 0, pick.pickedPoint.z)
      }
    }
  }

  // ── Furniture ─────────────────────────────────────────────────────────────

  private _makeFurnitureMeshes(
    type: FurnitureType,
    root: TransformNode,
    ghost = false,
    furnId?: number,
  ): void {
    const a  = ghost ? 0.45 : 1
    const gm = (hex: string) => this._mat(hex, a)
    const tag = (m: Mesh) => {
      if (!ghost && furnId !== undefined) {
        m.isPickable = true
        ;(m as { metadata?: unknown }).metadata = { furnId }
      }
    }

    if (type === 'chair') {
      const seat = MeshBuilder.CreateBox('cseat', { width: 0.68, height: 0.08, depth: 0.68 }, this.scene)
      seat.position.set(0, 0.48, 0); seat.parent = root; seat.material = gm('#C06030'); tag(seat)
      const back = MeshBuilder.CreateBox('cback', { width: 0.68, height: 0.60, depth: 0.07 }, this.scene)
      back.position.set(0, 0.82, 0.30); back.parent = root; back.material = gm('#8B4513'); back.isPickable = false
      const cush = MeshBuilder.CreateBox('ccush', { width: 0.60, height: 0.06, depth: 0.60 }, this.scene)
      cush.position.set(0, 0.55, 0); cush.parent = root; cush.material = gm('#E8A070'); cush.isPickable = false
      for (const [lx, lz] of [[-0.28,-0.28],[0.28,-0.28],[-0.28,0.28],[0.28,0.28]]) {
        const leg = MeshBuilder.CreateCylinder(`cleg${lx}${lz}`,
          { height: 0.48, diameter: 0.07, tessellation: 5 }, this.scene)
        leg.position.set(lx, 0.24, lz); leg.parent = root; leg.material = gm('#5A2D0C'); leg.isPickable = false
      }

    } else if (type === 'table') {
      const top = MeshBuilder.CreateBox('ttop', { width: 1.5, height: 0.07, depth: 0.90 }, this.scene)
      top.position.set(0, 0.78, 0); top.parent = root; top.material = gm('#B8864E'); tag(top)
      for (const [lx, lz] of [[-0.65,-0.38],[0.65,-0.38],[-0.65,0.38],[0.65,0.38]]) {
        const leg = MeshBuilder.CreateCylinder(`tleg${lx}${lz}`,
          { height: 0.78, diameter: 0.08, tessellation: 5 }, this.scene)
        leg.position.set(lx, 0.39, lz); leg.parent = root; leg.material = gm('#7A4B20'); leg.isPickable = false
      }

    } else if (type === 'tv') {
      const scr = MeshBuilder.CreateBox('tvscr', { width: 1.30, height: 0.75, depth: 0.07 }, this.scene)
      scr.position.set(0, 0.92, 0); scr.parent = root; scr.material = gm('#1A1A1A'); tag(scr)
      const stand = MeshBuilder.CreateBox('tvstand', { width: 0.18, height: 0.50, depth: 0.18 }, this.scene)
      stand.position.set(0, 0.25, 0); stand.parent = root; stand.material = gm('#222'); stand.isPickable = false
      const base = MeshBuilder.CreateBox('tvbase', { width: 0.55, height: 0.05, depth: 0.28 }, this.scene)
      base.position.set(0, 0.025, 0); base.parent = root; base.material = gm('#111'); base.isPickable = false
      const sm = new StandardMaterial('sm' + Math.random(), this.scene)
      sm.emissiveColor = new Color3(0.04, 0.12, 0.45); sm.alpha = a
      const scr2 = MeshBuilder.CreateBox('tvscr2', { width: 1.20, height: 0.65, depth: 0.01 }, this.scene)
      scr2.position.set(0, 0.92, -0.04); scr2.parent = root; scr2.material = sm; scr2.isPickable = false

    } else if (type === 'ac') {
      const body = MeshBuilder.CreateBox('acbody', { width: 1.0, height: 0.26, depth: 0.22 }, this.scene)
      body.position.set(0, 0.13, 0); body.parent = root; body.material = gm('#F0F0EE'); tag(body)
      const grl = MeshBuilder.CreateBox('acgrl', { width: 0.88, height: 0.06, depth: 0.23 }, this.scene)
      grl.position.set(0, 0.04, 0); grl.parent = root; grl.material = gm('#D8D8D6'); grl.isPickable = false
      for (let i = -3; i <= 3; i++) {
        const s = MeshBuilder.CreateBox(`acsl${i}`,
          { width: 0.10, height: 0.05, depth: 0.24 }, this.scene)
        s.position.set(i * 0.13, 0.04, 0); s.parent = root; s.material = gm('#C8C8C6'); s.isPickable = false
      }
      const lm = new StandardMaterial('lm' + Math.random(), this.scene)
      lm.emissiveColor = new Color3(0, 1, 0.4); lm.alpha = a
      const led = MeshBuilder.CreateSphere('acled', { diameter: 0.04, segments: 4 }, this.scene)
      led.position.set(0.40, 0.20, -0.12); led.parent = root; led.material = lm; led.isPickable = false

    } else if (type === 'sofa') {
      const seat = MeshBuilder.CreateBox('sseat', { width: 1.85, height: 0.40, depth: 0.80 }, this.scene)
      seat.position.set(0, 0.40, 0); seat.parent = root; seat.material = gm('#3A5A8C'); tag(seat)
      const back = MeshBuilder.CreateBox('sback', { width: 1.85, height: 0.55, depth: 0.18 }, this.scene)
      back.position.set(0, 0.77, 0.31); back.parent = root; back.material = gm('#2E4A7A'); back.isPickable = false
      const armL = MeshBuilder.CreateBox('sarmL', { width: 0.18, height: 0.56, depth: 0.80 }, this.scene)
      armL.position.set(-0.93, 0.56, 0); armL.parent = root; armL.material = gm('#2E4A7A'); armL.isPickable = false
      const armR = MeshBuilder.CreateBox('sarmR', { width: 0.18, height: 0.56, depth: 0.80 }, this.scene)
      armR.position.set(0.93, 0.56, 0); armR.parent = root; armR.material = gm('#2E4A7A'); armR.isPickable = false
      for (let i = -1; i <= 1; i++) {
        const cush = MeshBuilder.CreateBox(`scush${i}`, { width: 0.57, height: 0.10, depth: 0.70 }, this.scene)
        cush.position.set(i * 0.60, 0.60, -0.02); cush.parent = root; cush.material = gm('#4A6A9E'); cush.isPickable = false
      }
      for (const [lx, lz] of [[-0.80, -0.34], [0.80, -0.34], [-0.80, 0.34], [0.80, 0.34]]) {
        const leg = MeshBuilder.CreateBox(`sleg${lx}${lz}`, { width: 0.10, height: 0.14, depth: 0.10 }, this.scene)
        leg.position.set(lx, 0.07, lz); leg.parent = root; leg.material = gm('#1A1A1A'); leg.isPickable = false
      }

    } else if (type === 'bed') {
      const frame = MeshBuilder.CreateBox('bframe', { width: 1.55, height: 0.22, depth: 2.15 }, this.scene)
      frame.position.set(0, 0.11, 0); frame.parent = root; frame.material = gm('#8B5E2A'); tag(frame)
      const matt = MeshBuilder.CreateBox('bmatt', { width: 1.40, height: 0.22, depth: 1.90 }, this.scene)
      matt.position.set(0, 0.33, 0.05); matt.parent = root; matt.material = gm('#F0EEE8'); matt.isPickable = false
      const hboard = MeshBuilder.CreateBox('bhead', { width: 1.55, height: 0.80, depth: 0.12 }, this.scene)
      hboard.position.set(0, 0.52, -1.03); hboard.parent = root; hboard.material = gm('#7A4E1C'); hboard.isPickable = false
      const fboard = MeshBuilder.CreateBox('bfoot', { width: 1.55, height: 0.34, depth: 0.10 }, this.scene)
      fboard.position.set(0, 0.28, 1.07); fboard.parent = root; fboard.material = gm('#7A4E1C'); fboard.isPickable = false
      for (const px of [-0.34, 0.34]) {
        const pill = MeshBuilder.CreateBox(`bpill${px}`, { width: 0.58, height: 0.10, depth: 0.40 }, this.scene)
        pill.position.set(px, 0.48, -0.65); pill.parent = root; pill.material = gm('#E8E4DC'); pill.isPickable = false
      }
      const blank = MeshBuilder.CreateBox('bblank', { width: 1.36, height: 0.09, depth: 1.20 }, this.scene)
      blank.position.set(0, 0.49, 0.40); blank.parent = root; blank.material = gm('#5A7A4E'); blank.isPickable = false

    } else if (type === 'sink') {
      const cab = MeshBuilder.CreateBox('scab', { width: 0.72, height: 0.88, depth: 0.50 }, this.scene)
      cab.position.set(0, 0.44, 0); cab.parent = root; cab.material = gm('#D8D0C8'); tag(cab)
      const ctr = MeshBuilder.CreateBox('sctr', { width: 0.72, height: 0.04, depth: 0.50 }, this.scene)
      ctr.position.set(0, 0.90, 0); ctr.parent = root; ctr.material = gm('#C4BCB4'); ctr.isPickable = false
      const basin = MeshBuilder.CreateBox('sbasin', { width: 0.44, height: 0.10, depth: 0.32 }, this.scene)
      basin.position.set(0, 0.86, 0); basin.parent = root; basin.material = gm('#FAFAFA'); basin.isPickable = false
      const neck = MeshBuilder.CreateCylinder('sneck', { height: 0.28, diameter: 0.04, tessellation: 6 }, this.scene)
      neck.position.set(0, 1.06, -0.08); neck.parent = root; neck.material = gm('#C0C0C0'); neck.isPickable = false
      const spoutM = new StandardMaterial('sspoutm' + Math.random(), this.scene)
      spoutM.diffuseColor = this._hex2col('#C0C0C0'); spoutM.emissiveColor = this._hex2col('#C0C0C0').scale(0.18)
      const spout = MeshBuilder.CreateCylinder('sspout', { height: 0.18, diameter: 0.03, tessellation: 6 }, this.scene)
      spout.rotation.x = Math.PI / 2
      spout.position.set(0, 1.19, 0.01); spout.parent = root; spout.material = spoutM; spout.isPickable = false
      const cdoor = MeshBuilder.CreateBox('scabdoor', { width: 0.64, height: 0.72, depth: 0.02 }, this.scene)
      cdoor.position.set(0, 0.46, 0.26); cdoor.parent = root; cdoor.material = gm('#C8C0B6'); cdoor.isPickable = false

    } else if (type === 'wardrobe') {
      const wbody = MeshBuilder.CreateBox('wbody', { width: 1.55, height: 2.10, depth: 0.58 }, this.scene)
      wbody.position.set(0, 1.05, 0); wbody.parent = root; wbody.material = gm('#9C7040'); tag(wbody)
      const wtop = MeshBuilder.CreateBox('wtop', { width: 1.60, height: 0.06, depth: 0.62 }, this.scene)
      wtop.position.set(0, 2.13, 0); wtop.parent = root; wtop.material = gm('#B08050'); wtop.isPickable = false
      for (const [dx, side] of [[-0.39, 'L'] as [number, string], [0.39, 'R'] as [number, string]]) {
        const wd = MeshBuilder.CreateBox(`wd${side}`, { width: 0.74, height: 1.92, depth: 0.04 }, this.scene)
        wd.position.set(dx, 1.05, 0.30); wd.parent = root; wd.material = gm('#B08050'); wd.isPickable = false
        const wh = MeshBuilder.CreateSphere(`wh${side}`, { diameter: 0.06, segments: 4 }, this.scene)
        wh.position.set(dx + (dx < 0 ? 0.26 : -0.26), 1.05, 0.34); wh.parent = root
        wh.material = gm('#C8A840'); wh.isPickable = false
      }
      const wdiv = MeshBuilder.CreateBox('wdiv', { width: 0.04, height: 1.92, depth: 0.04 }, this.scene)
      wdiv.position.set(0, 1.05, 0.30); wdiv.parent = root; wdiv.material = gm('#7A5030'); wdiv.isPickable = false

    } else if (type === 'lamp') {
      const lbase = MeshBuilder.CreateCylinder('lbase', { height: 0.06, diameter: 0.34, tessellation: 12 }, this.scene)
      lbase.position.set(0, 0.03, 0); lbase.parent = root; lbase.material = gm('#2A2A2A'); tag(lbase)
      const lpole = MeshBuilder.CreateCylinder('lpole', { height: 1.65, diameter: 0.05, tessellation: 8 }, this.scene)
      lpole.position.set(0, 0.88, 0); lpole.parent = root; lpole.material = gm('#B8922A'); lpole.isPickable = false
      const lshade = MeshBuilder.CreateCylinder('lshade',
        { height: 0.32, diameterTop: 0.18, diameterBottom: 0.52, tessellation: 12 }, this.scene)
      lshade.position.set(0, 1.79, 0); lshade.parent = root; lshade.material = gm('#E8D890'); lshade.isPickable = false
      const glowMat = new StandardMaterial('lglow' + Math.random(), this.scene)
      glowMat.emissiveColor = new Color3(1.0, 0.92, 0.55); glowMat.alpha = a * 0.85
      const lglow = MeshBuilder.CreateSphere('lglow', { diameter: 0.20, segments: 6 }, this.scene)
      lglow.position.set(0, 1.71, 0); lglow.parent = root; lglow.material = glowMat; lglow.isPickable = false

    } else if (type === 'toilet') {
      // Bowl
      const bowl = MeshBuilder.CreateCylinder('tbowl',
        { height: 0.42, diameterTop: 0.40, diameterBottom: 0.36, tessellation: 12 }, this.scene)
      bowl.position.set(0, 0.21, 0); bowl.parent = root; bowl.material = gm('#F5F5F0'); tag(bowl)
      // Seat
      const seat = MeshBuilder.CreateCylinder('tseat',
        { height: 0.04, diameter: 0.44, tessellation: 12 }, this.scene)
      seat.position.set(0, 0.44, 0); seat.parent = root; seat.material = gm('#EEEEE8'); seat.isPickable = false
      // Lid (tilted open)
      const lid = MeshBuilder.CreateCylinder('tlid',
        { height: 0.03, diameter: 0.42, tessellation: 12 }, this.scene)
      lid.position.set(0, 0.58, -0.16); lid.parent = root; lid.material = gm('#F0F0EA')
      lid.rotation.x = -0.7; lid.isPickable = false
      // Tank
      const tank = MeshBuilder.CreateBox('ttank', { width: 0.38, height: 0.45, depth: 0.18 }, this.scene)
      tank.position.set(0, 0.55, -0.28); tank.parent = root; tank.material = gm('#F0F0EA'); tank.isPickable = false
      // Flush handle
      const flush = MeshBuilder.CreateCylinder('tflush',
        { height: 0.12, diameter: 0.03, tessellation: 6 }, this.scene)
      flush.position.set(0.14, 0.82, -0.28); flush.rotation.z = Math.PI / 2
      flush.parent = root; flush.material = gm('#C0C0C0'); flush.isPickable = false

    } else if (type === 'bathtub') {
      // Outer tub
      const tub = MeshBuilder.CreateBox('bttub', { width: 0.80, height: 0.55, depth: 1.60 }, this.scene)
      tub.position.set(0, 0.275, 0); tub.parent = root; tub.material = gm('#F0F0EA'); tag(tub)
      // Inner basin (darker to show depth)
      const inner = MeshBuilder.CreateBox('btinner', { width: 0.64, height: 0.42, depth: 1.42 }, this.scene)
      inner.position.set(0, 0.34, 0); inner.parent = root; inner.material = gm('#D8E8F0'); inner.isPickable = false
      // Faucet
      const faucet = MeshBuilder.CreateCylinder('btfaucet',
        { height: 0.25, diameter: 0.04, tessellation: 6 }, this.scene)
      faucet.position.set(0, 0.68, -0.70); faucet.parent = root; faucet.material = gm('#C0C0C0'); faucet.isPickable = false
      const spout = MeshBuilder.CreateCylinder('btspout',
        { height: 0.14, diameter: 0.03, tessellation: 6 }, this.scene)
      spout.rotation.x = Math.PI / 2
      spout.position.set(0, 0.78, -0.63); spout.parent = root; spout.material = gm('#C0C0C0'); spout.isPickable = false
      // Feet
      for (const [fx, fz] of [[-0.30, -0.65], [0.30, -0.65], [-0.30, 0.65], [0.30, 0.65]]) {
        const foot = MeshBuilder.CreateSphere(`btft${fx}${fz}`, { diameter: 0.10, segments: 4 }, this.scene)
        foot.position.set(fx, 0.04, fz); foot.parent = root; foot.material = gm('#B8922A'); foot.isPickable = false
      }

    } else if (type === 'stove') {
      // Body
      const body = MeshBuilder.CreateBox('stbody', { width: 0.80, height: 0.90, depth: 0.60 }, this.scene)
      body.position.set(0, 0.45, 0); body.parent = root; body.material = gm('#E8E8E8'); tag(body)
      // Cooktop surface
      const top = MeshBuilder.CreateBox('sttop', { width: 0.80, height: 0.03, depth: 0.60 }, this.scene)
      top.position.set(0, 0.92, 0); top.parent = root; top.material = gm('#2A2A2A'); top.isPickable = false
      // 4 burners
      for (const [bx, bz] of [[-0.18, -0.12], [0.18, -0.12], [-0.18, 0.12], [0.18, 0.12]]) {
        const burner = MeshBuilder.CreateCylinder(`stb${bx}${bz}`,
          { height: 0.02, diameter: 0.16, tessellation: 12 }, this.scene)
        burner.position.set(bx, 0.94, bz); burner.parent = root; burner.material = gm('#444'); burner.isPickable = false
      }
      // Oven door
      const door = MeshBuilder.CreateBox('stdoor', { width: 0.68, height: 0.50, depth: 0.02 }, this.scene)
      door.position.set(0, 0.35, 0.31); door.parent = root; door.material = gm('#D0D0D0'); door.isPickable = false
      // Handle
      const handle = MeshBuilder.CreateBox('sthandle', { width: 0.40, height: 0.03, depth: 0.04 }, this.scene)
      handle.position.set(0, 0.62, 0.33); handle.parent = root; handle.material = gm('#C0C0C0'); handle.isPickable = false

    } else if (type === 'counter') {
      // Cabinet base
      const cab = MeshBuilder.CreateBox('ctcab', { width: 1.20, height: 0.85, depth: 0.55 }, this.scene)
      cab.position.set(0, 0.425, 0); cab.parent = root; cab.material = gm('#8B6840'); tag(cab)
      // Countertop
      const top = MeshBuilder.CreateBox('cttop', { width: 1.24, height: 0.05, depth: 0.58 }, this.scene)
      top.position.set(0, 0.90, 0); top.parent = root; top.material = gm('#D0D0D0'); top.isPickable = false
      // Cabinet doors
      for (const dx of [-0.30, 0.30]) {
        const door = MeshBuilder.CreateBox(`ctdoor${dx}`, { width: 0.52, height: 0.70, depth: 0.02 }, this.scene)
        door.position.set(dx, 0.42, 0.28); door.parent = root; door.material = gm('#A07A50'); door.isPickable = false
        const knob = MeshBuilder.CreateSphere(`ctknob${dx}`, { diameter: 0.04, segments: 4 }, this.scene)
        knob.position.set(dx + (dx < 0 ? 0.18 : -0.18), 0.42, 0.30); knob.parent = root
        knob.material = gm('#C0C0C0'); knob.isPickable = false
      }

    } else if (type === 'fridge') {
      // Main body
      const body = MeshBuilder.CreateBox('frbody', { width: 0.75, height: 1.80, depth: 0.65 }, this.scene)
      body.position.set(0, 0.90, 0); body.parent = root; body.material = gm('#E8E8E8'); tag(body)
      // Upper door (freezer)
      const upper = MeshBuilder.CreateBox('frupper', { width: 0.70, height: 0.50, depth: 0.02 }, this.scene)
      upper.position.set(0, 1.52, 0.34); upper.parent = root; upper.material = gm('#D8D8D8'); upper.isPickable = false
      // Lower door (fridge)
      const lower = MeshBuilder.CreateBox('frlower', { width: 0.70, height: 1.10, depth: 0.02 }, this.scene)
      lower.position.set(0, 0.68, 0.34); lower.parent = root; lower.material = gm('#D8D8D8'); lower.isPickable = false
      // Handles
      for (const hy of [1.52, 0.68]) {
        const h = MeshBuilder.CreateBox(`frh${hy}`, { width: 0.04, height: 0.20, depth: 0.05 }, this.scene)
        h.position.set(0.28, hy, 0.37); h.parent = root; h.material = gm('#B0B0B0'); h.isPickable = false
      }
      // Divider line
      const div = MeshBuilder.CreateBox('frdiv', { width: 0.70, height: 0.02, depth: 0.03 }, this.scene)
      div.position.set(0, 1.25, 0.34); div.parent = root; div.material = gm('#C0C0C0'); div.isPickable = false
    }
  }

  private _placeFurniture(type: FurnitureType, x: number, z: number, rotY?: number): void {
    const id   = this._furnIdCounter++
    const root = new TransformNode(`furn_${id}`, this.scene)
    root.position.set(x, 0, z)
    const r = rotY ?? ((type === 'chair' || type === 'table' || type === 'sofa') ? Math.PI / 2 : 0)
    root.rotation.y = r
    this._makeFurnitureMeshes(type, root, false, id)
    this._furniture.push({ id, type, root, x, z, rotY: r })
  }

  startPlacing(type: FurnitureType): void {
    this.cancelMoving(); this._clearGhost()

    if (type === 'tv') {
      this._placeTvOnWall(); this.onPlacingDone?.(); this._saveState(); return
    }
    if (type === 'ac') {
      this._placeAcOnWall(); this.onPlacingDone?.(); this._saveState(); return
    }

    this._placingType = type
    this._ghost = new TransformNode('ghost', this.scene)
    this._ghost.position.set(0, 0, 0)
    this._makeFurnitureMeshes(type, this._ghost, true)
    this.scene.hoverCursor = 'crosshair'
  }

  private _placeTvOnWall(): void {
    const existing = this._furniture.findIndex(f => f.type === 'tv')
    if (existing !== -1) this.removeFurniture(this._furniture[existing].id)
    // TV on the WEST (left) wall — screen faces east into the room
    const tvX = -ROOM_W / 2 + 0.5, tvZ = 0
    const id  = this._furnIdCounter++
    const root = new TransformNode(`furn_${id}`, this.scene)
    root.position.set(tvX, 0, tvZ)
    root.rotation.y = -Math.PI / 2   // screen (local -Z) faces east (+X) into room
    this._makeFurnitureMeshes('tv', root, false, id)
    this._furniture.push({ id, type: 'tv', root, x: tvX, z: tvZ, rotY: -Math.PI / 2 })
  }

  private _placeAcOnWall(): void {
    const existing = this._furniture.findIndex(f => f.type === 'ac')
    if (existing !== -1) this.removeFurniture(this._furniture[existing].id)
    // Mount on north wall to the right of the window (window frame ends ~x=3.4)
    const acX = 4.2, acZ = ROOM_D / 2 - 0.14
    const id  = this._furnIdCounter++
    const root = new TransformNode(`furn_${id}`, this.scene)
    root.position.set(acX, 1.5, acZ)
    root.rotation.y = 0   // grille faces south into room
    this._makeFurnitureMeshes('ac', root, false, id)
    this._furniture.push({ id, type: 'ac', root, x: acX, z: acZ, rotY: 0 })
  }

  getFurnitureInfo(furnId: number): { type: FurnitureType; x: number; z: number; rotY: number; color?: string } | null {
    const f = this._furniture.find(p => p.id === furnId)
    return f ? { type: f.type, x: f.x, z: f.z, rotY: f.rotY, color: f.color } : null
  }

  setFurnitureColor(furnId: number, hex: string): void {
    const f = this._furniture.find(p => p.id === furnId)
    if (!f) return
    f.color = hex
    const base = this._hex2col(hex)
    f.root.getChildMeshes(false).forEach((m, i) => {
      const mat = m.material as StandardMaterial
      if (!mat || mat.alpha < 1) return
      const v = 0.75 + (i % 3) * 0.12
      mat.diffuseColor = base.scale(v)
      mat.emissiveColor = base.scale(v * 0.18)
    })
    this._saveState()
  }

  rotateFurniture(furnId: number, delta = Math.PI / 2): void {
    const f = this._furniture.find(p => p.id === furnId)
    if (!f) return
    f.rotY += delta
    f.root.rotation.y = f.rotY
    this._saveState()
  }

  startMoving(furnId: number): void {
    this.cancelPlacing(); this._clearGhost()
    const f = this._furniture.find(p => p.id === furnId)
    if (!f) return
    this._movingFurnId = furnId
    this._ghost = new TransformNode('ghost', this.scene)
    this._ghost.position.set(f.x, 0, f.z)
    this._makeFurnitureMeshes(f.type, this._ghost, true)
    this.scene.hoverCursor = 'grab'
    this.onMovingStart?.(furnId)
  }

  removeFurniture(furnId: number): void {
    const idx = this._furniture.findIndex(p => p.id === furnId)
    if (idx === -1) return
    const f = this._furniture[idx]
    f.root.getChildMeshes(false).forEach(m => m.dispose()); f.root.dispose()
    this._furniture.splice(idx, 1)
    this._saveState()
  }

  cancelPlacing(): void {
    this._clearGhost(); this._placingType = null; this.scene.hoverCursor = 'default'
  }

  cancelMoving(): void {
    this._clearGhost(); this._movingFurnId = null; this.scene.hoverCursor = 'default'
  }

  private _clearGhost(): void {
    if (!this._ghost) return
    this._ghost.getChildMeshes(false).forEach(m => m.dispose())
    this._ghost.dispose(); this._ghost = null
  }

  clearFurniture(): void {
    for (const f of this._furniture) {
      f.root.getChildMeshes(false).forEach(m => m.dispose()); f.root.dispose()
    }
    this._furniture = []; this._saveState()
  }

  // ── Colours ───────────────────────────────────────────────────────────────

  setWallColor(hex: string): void {
    this._wallMat.emissiveColor = this._hex2col(hex); this._saveState()
  }

  setFloorColor(hex: string): void {
    this._floorColor = hex
    this._tileMat1.emissiveColor = this._hex2col(hex)
    this._tileMat2.emissiveColor = this._hex2col(this._darken(hex, 0.74))
    this._saveState()
  }

  getWallColor(): string  { return '#' + this._wallMat.emissiveColor.toHexString() }
  getFloorColor(): string { return this._floorColor }

  // ── House type ────────────────────────────────────────────────────────────

  getHouseType(): HouseType { return this._houseType }

  setHouseType(type: HouseType): void {
    if (type === this._houseType) return
    this._houseType = type
    this._disposeInterior()
    this._buildInterior()
    this.clearFurniture()
    this._defaultsPlaced = false
    this._placeDefaultAmenities()
    this._saveState()
  }

  // ── Default amenities ─────────────────────────────────────────────────────

  private _defaultsPlaced = false

  private _placeDefaultAmenities(): void {
    this._loading = true
    // Bathroom defaults: toilet against back wall, bathtub beside it
    this._placeFurniture('toilet',  4.8, 5.4)
    this._placeFurniture('bathtub', 3.5, 4.6)
    this._placeFurniture('sink',    4.8, 3.5)
    // Kitchen defaults: counter against back wall, stove beside it, fridge in corner
    this._placeFurniture('counter', -4.4, 5.2)
    this._placeFurniture('stove',   -3.4, 5.2)
    this._placeFurniture('fridge',  -5.5, 5.0)
    this._loading = false
    this._defaultsPlaced = true
  }

  // ── State ─────────────────────────────────────────────────────────────────

  private _saveState(): void {
    if (this._loading) return
    saveHouseState({
      wallColor:  this.getWallColor(),
      floorColor: this._floorColor,
      houseType:  this._houseType,
      furniture:  this._furniture.map(f => ({ type: f.type, x: f.x, z: f.z, rotY: f.rotY, color: f.color })),
    })
  }

  loadServerState(s: HouseStateData | null): void {
    if (!s) return
    this._loading = true
    // Clear default amenities so they don't duplicate saved state
    if (this._defaultsPlaced) {
      for (const f of this._furniture) {
        f.root.getChildMeshes(false).forEach(m => m.dispose()); f.root.dispose()
      }
      this._furniture = []
    }
    if (s.wallColor) this.setWallColor(s.wallColor)
    if (s.floorColor) this.setFloorColor(s.floorColor)
    if (s.houseType && s.houseType !== this._houseType) {
      this._houseType = s.houseType as HouseType
      this._disposeInterior()
      this._buildInterior()
    }
    for (const f of s.furniture ?? []) {
      const ft = f.type as FurnitureType
      let placedId: number
      if (ft === 'ac') {
        const id   = this._furnIdCounter++
        const rotY = f.rotY ?? 0
        const root = new TransformNode(`furn_${id}`, this.scene)
        root.position.set(f.x, 1.5, f.z); root.rotation.y = rotY
        this._makeFurnitureMeshes('ac', root, false, id)
        this._furniture.push({ id, type: 'ac', root, x: f.x, z: f.z, rotY })
        placedId = id
      } else if (ft === 'tv') {
        const id   = this._furnIdCounter++
        const rotY = f.rotY ?? -Math.PI / 2
        const root = new TransformNode(`furn_${id}`, this.scene)
        root.position.set(f.x, 0, f.z); root.rotation.y = rotY
        this._makeFurnitureMeshes('tv', root, false, id)
        this._furniture.push({ id, type: 'tv', root, x: f.x, z: f.z, rotY })
        placedId = id
      } else {
        this._placeFurniture(ft, f.x, f.z, f.rotY)
        placedId = this._furniture[this._furniture.length - 1].id
      }
      if (f.color) this.setFurnitureColor(placedId, f.color)
    }
    this._loading = false
  }

  // ── Callbacks ─────────────────────────────────────────────────────────────

  onPlacingDone?:  () => void
  onMovingStart?:  (furnId: number) => void
  onMovingDone?:   () => void
  onFurnSelected?: (furnId: number, screenX: number, screenY: number) => void
  onZoneReject?:   (zone: RoomZone) => void

  // ── Render loop ───────────────────────────────────────────────────────────

  start(): void {
    this.engine.runRenderLoop(() => { this.scene.render() })
  }


  dispose(): void {
    this._clearGhost()
    window.removeEventListener('keydown', this._keyDown)
    window.removeEventListener('keyup',   this._keyUp)
    this.engine.stopRenderLoop(); this.scene.dispose(); this.engine.dispose()
  }
}

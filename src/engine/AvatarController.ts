import {
  Scene, Vector3, PointerEventTypes, Observer, PointerInfo, MeshBuilder,
  AbstractMesh, Mesh,
} from '@babylonjs/core'
import { HumanAvatar } from './HumanAvatar'
import type { HumanAction } from './HumanAvatar'
import type { FurnitureType } from './HouseScene'
import { createNameLabel, disposeNameLabel } from './nameLabel'

const WALK_SPEED = 2.5
const ROOM_HW = 5.5
const ROOM_HD = 5.5
const AVATAR_RADIUS = 0.45

const FURN_ACTION: Partial<Record<FurnitureType, HumanAction>> = {
  chair: 'sit', sofa: 'sit', bed: 'sleep', sink: 'wash',
  tv: 'watch', table: 'sit', toilet: 'sit', bathtub: 'wash',
  stove: 'wash', counter: 'wash',
}

export class AvatarController {
  private _avatar: HumanAvatar | null = null
  private _target: Vector3 | null = null
  private _pendingAction: HumanAction | null = null
  private _obs: Observer<PointerInfo> | null = null
  private _onUpdate: (() => void) | null = null
  private _ground: AbstractMesh | null = null
  private _label: Mesh | null = null
  private _downX = 0; private _downY = 0; private _downTime = 0
  private _disposed = false
  paused = false

  constructor(private _scene: Scene) {}

  async load(gender: 'male' | 'female'): Promise<void> {
    this._avatar = await HumanAvatar.create(this._scene, gender)
    if (this._disposed) { this._avatar.dispose(); return }

    this._avatar.root.position.set(0, 0, -2)
    this._avatar.root.scaling.set(-1, 1, 1)

    this._ground = MeshBuilder.CreateGround('avatarGround', { width: 12, height: 12 }, this._scene)
    this._ground.position.y = 0.01
    this._ground.isVisible = false
    this._ground.isPickable = true

    this._obs = this._scene.onPointerObservable.add((info) => {
      if (this.paused) return
      if (info.type === PointerEventTypes.POINTERDOWN) {
        this._downX = this._scene.pointerX
        this._downY = this._scene.pointerY
        this._downTime = Date.now()
      }
      if (info.type === PointerEventTypes.POINTERUP) {
        const dx = this._scene.pointerX - this._downX
        const dy = this._scene.pointerY - this._downY
        if (dx * dx + dy * dy < 100 && Date.now() - this._downTime < 400) {
          const act = this._avatar?.action
          if (act === 'sit' || act === 'sleep' || act === 'wash' || act === 'watch') {
            this._avatar!.setAction('idle')
          }
          this._handleTap()
        }
      }
    })!

    this._onUpdate = () => {
      if (!this._avatar) return
      const dt = this._scene.getEngine().getDeltaTime() / 1000
      this._move(dt)
      this._avatar.update(dt)
    }
    this._scene.registerBeforeRender(this._onUpdate)
  }

  private _getFurnMeshes(): Mesh[] {
    return this._scene.meshes.filter(
      m => (m as Mesh).metadata?.furnId != null,
    ) as Mesh[]
  }

  private _hitsAnyFurniture(pos: Vector3): boolean {
    for (const m of this._getFurnMeshes()) {
      const bb = m.getBoundingInfo().boundingBox
      const min = bb.minimumWorld
      const max = bb.maximumWorld
      if (pos.x + AVATAR_RADIUS > min.x && pos.x - AVATAR_RADIUS < max.x &&
          pos.z + AVATAR_RADIUS > min.z && pos.z - AVATAR_RADIUS < max.z) {
        return true
      }
    }
    return false
  }

  private _pushOutOfFurniture(pos: Vector3, from: Vector3): Vector3 {
    for (const m of this._getFurnMeshes()) {
      const bb = m.getBoundingInfo().boundingBox
      const min = bb.minimumWorld
      const max = bb.maximumWorld
      if (pos.x + AVATAR_RADIUS > min.x && pos.x - AVATAR_RADIUS < max.x &&
          pos.z + AVATAR_RADIUS > min.z && pos.z - AVATAR_RADIUS < max.z) {
        const cx = (min.x + max.x) / 2
        const cz = (min.z + max.z) / 2
        const dir = new Vector3(from.x - cx, 0, from.z - cz)
        if (dir.length() < 0.01) dir.set(0, 0, -1)
        dir.normalize()
        const hw = (max.x - min.x) / 2 + AVATAR_RADIUS + 0.1
        const hd = (max.z - min.z) / 2 + AVATAR_RADIUS + 0.1
        return new Vector3(cx + dir.x * hw, 0, cz + dir.z * hd)
      }
    }
    return pos
  }

  private _handleTap(): void {
    const anyPick = this._scene.pick(this._scene.pointerX, this._scene.pointerY)
    if (anyPick?.hit && anyPick.pickedMesh?.metadata?.furnId != null) return

    const pick = this._scene.pick(
      this._scene.pointerX, this._scene.pointerY,
      m => m === this._ground,
    )
    if (!pick?.hit || !pick.pickedPoint) return
    let t = pick.pickedPoint.clone()
    t.y = 0
    t.x = Math.max(-ROOM_HW, Math.min(ROOM_HW, t.x))
    t.z = Math.max(-ROOM_HD, Math.min(ROOM_HD, t.z))
    if (this._avatar) t = this._pushOutOfFurniture(t, this._avatar.root.position)
    this._target = t
    this._pendingAction = null
    this._avatar?.setAction('walk')
  }

  private _move(dt: number): void {
    if (!this._avatar || !this._target || this._avatar.action !== 'walk') return
    const root = this._avatar.root
    const dir = this._target.subtract(root.position)
    dir.y = 0
    const dist = dir.length()
    if (dist < 0.15) {
      this._target = null
      const next = this._pendingAction ?? 'idle'
      this._pendingAction = null
      this._avatar.setAction(next)
      return
    }
    dir.normalize()
    const nextPos = root.position.add(dir.scale(Math.min(dist, WALK_SPEED * dt)))
    if (this._pendingAction == null && this._hitsAnyFurniture(nextPos) && !this._hitsAnyFurniture(root.position)) {
      this._target = null
      this._avatar.setAction('idle')
      return
    }
    root.position.copyFrom(nextPos)
    root.rotation.y = Math.atan2(dir.x, dir.z)
  }

  interactWith(type: FurnitureType, x: number, z: number): void {
    if (!this._avatar) return
    const action = FURN_ACTION[type]
    if (!action) return
    const offset = type === 'bed' ? 0.8 : 0.5
    const root = this._avatar.root
    const furnPos = new Vector3(x, 0, z)
    const dir = furnPos.subtract(root.position); dir.y = 0; dir.normalize()
    const stopPos = furnPos.subtract(dir.scale(offset))
    stopPos.x = Math.max(-ROOM_HW, Math.min(ROOM_HW, stopPos.x))
    stopPos.z = Math.max(-ROOM_HD, Math.min(ROOM_HD, stopPos.z))
    this._target = stopPos
    this._pendingAction = action
    this._avatar.setAction('walk')
  }

  sit(): void { this._avatar?.setAction('sit') }
  standUp(): void { this._avatar?.setAction('idle') }

  setSkinColor(hex: string): void { this._avatar?.setSkinColor(hex) }

  setLabel(name: string, rank: string): void {
    if (!this._avatar) return
    if (this._label) disposeNameLabel(this._scene, this._label)
    this._label = createNameLabel(this._scene, name, rank, this._avatar.root)
  }

  get position(): Vector3 { return this._avatar?.root.position ?? Vector3.Zero() }

  dispose(): void {
    if (this._disposed) return
    this._disposed = true
    if (this._obs) this._scene.onPointerObservable.remove(this._obs)
    if (this._onUpdate) this._scene.unregisterBeforeRender(this._onUpdate)
    this._ground?.dispose()
    if (this._label) disposeNameLabel(this._scene, this._label)
    this._avatar?.dispose()
  }
}

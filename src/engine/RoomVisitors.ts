import { Scene, Vector3, Mesh } from '@babylonjs/core'
import { HumanAvatar } from './HumanAvatar'
import { createNameLabel, disposeNameLabel } from './nameLabel'

interface ActiveVisitor {
  id: string
  name: string
  rank: string
  avatar: HumanAvatar
  label: Mesh
  target: Vector3 | null
  nextMoveAt: number
}

const WALK_SPEED = 1.6
const ROOM_HW = 5.0

const SHIRT_COLORS = ['#E91E63', '#4CAF50', '#9C27B0', '#FF9800', '#2196F3', '#00BCD4', '#F44336', '#3F51B5']
const PANTS_COLORS = ['#1A237E', '#37474F', '#263238', '#3E2723', '#1B5E20', '#4A148C']
const SKIN_COLORS = ['#8D5524', '#C68642', '#6B4226', '#F1C27D', '#FFDBAC', '#D2956A']

const DEMO_DATA = [
  { name: 'Sarah K.', rank: 'Veteran', gender: 'female' as const },
  { name: 'James O.', rank: 'Rookie', gender: 'male' as const },
  { name: 'Aisha M.', rank: 'Pro', gender: 'female' as const },
]

export class RoomVisitors {
  private _visitors: ActiveVisitor[] = []
  private _onUpdate: (() => void) | null = null
  private _disposed = false
  private _started = false

  onVisitorClicked?: (id: string, name: string, rank: string) => void

  constructor(private _scene: Scene) {}

  start(): void {
    if (this._started) return
    this._started = true

    this._onUpdate = () => {
      const dt = this._scene.getEngine().getDeltaTime() / 1000
      const now = Date.now()
      for (const v of this._visitors) {
        if (now >= v.nextMoveAt && !v.target) {
          v.target = new Vector3(
            (Math.random() - 0.5) * ROOM_HW * 1.6,
            0,
            (Math.random() - 0.5) * ROOM_HW * 1.6,
          )
          v.avatar.setAction('walk')
        }

        if (v.target) {
          const root = v.avatar.root
          const dir = v.target.subtract(root.position)
          dir.y = 0
          const dist = dir.length()
          if (dist < 0.2) {
            v.target = null
            v.avatar.setAction('idle')
            v.nextMoveAt = now + 3000 + Math.random() * 5000
          } else {
            dir.normalize()
            root.position.addInPlace(dir.scale(Math.min(dist, WALK_SPEED * dt)))
            root.rotation.y = Math.atan2(dir.x, dir.z)
          }
        }

        v.avatar.update(dt)
      }
    }
    this._scene.registerBeforeRender(this._onUpdate)
  }

  async spawn(): Promise<void> {
    for (const d of DEMO_DATA) {
      await this.addVisitor(`npc_${d.name}`, d.name, d.rank)
    }
  }

  async addVisitor(userId: string, name: string, rank = 'Rookie'): Promise<void> {
    if (this._disposed) return
    if (this._visitors.find(v => v.id === userId)) return

    if (!this._started) this.start()

    const gender: 'male' | 'female' = Math.random() > 0.5 ? 'male' : 'female'
    const avatar = await HumanAvatar.create(this._scene, gender)
    if (this._disposed) { avatar.dispose(); return }

    const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)]
    avatar.setSkinColor(pick(SKIN_COLORS))
    avatar.setClothingColor('shirt', pick(SHIRT_COLORS))
    avatar.setClothingColor('pants', pick(PANTS_COLORS))

    const startX = (Math.random() - 0.5) * ROOM_HW * 1.6
    const startZ = (Math.random() - 0.5) * ROOM_HW * 1.6
    avatar.root.position.set(startX, 0, startZ)
    avatar.root.scaling.set(-1, 1, 1)

    avatar.root.getChildMeshes(true).forEach(m => {
      m.isPickable = true
      ;(m as { metadata?: unknown }).metadata = { visitorId: userId }
    })

    const label = createNameLabel(this._scene, name, rank, avatar.root)

    this._visitors.push({
      id: userId, name, rank, avatar, label,
      target: null,
      nextMoveAt: Date.now() + 1000 + Math.random() * 3000,
    })
  }

  updateLabel(userId: string, name: string, rank: string): void {
    const v = this._visitors.find(vi => vi.id === userId)
    if (!v || this._disposed) return
    disposeNameLabel(this._scene, v.label)
    v.label = createNameLabel(this._scene, name, rank, v.avatar.root)
    v.name = name
    v.rank = rank
  }

  removeVisitor(userId: string): void {
    const idx = this._visitors.findIndex(v => v.id === userId)
    if (idx === -1) return
    const v = this._visitors[idx]
    disposeNameLabel(this._scene, v.label)
    v.avatar.dispose()
    this._visitors.splice(idx, 1)
  }

  getVisitorInfo(id: string): { name: string; rank: string } | null {
    const v = this._visitors.find(vi => vi.id === id)
    return v ? { name: v.name, rank: v.rank } : null
  }

  dispose(): void {
    this._disposed = true
    if (this._onUpdate) this._scene.unregisterBeforeRender(this._onUpdate)
    for (const v of this._visitors) {
      disposeNameLabel(this._scene, v.label)
      v.avatar.dispose()
    }
    this._visitors = []
  }
}

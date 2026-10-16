import { Scene } from '@babylonjs/core'
import { HumanAvatar } from './HumanAvatar'

interface Dancer {
  avatar: HumanAvatar
  phase: number
  speed: number
}

const DANCER_DEFS: { gender: 'male' | 'female'; skin: string; shirt: string; pants: string; x: number; z: number }[] = [
  { gender: 'female', skin: '#8D5524', shirt: '#FF00FF', pants: '#1A1A2E', x: -1.5, z: 0.5 },
  { gender: 'male',   skin: '#C68642', shirt: '#00CCFF', pants: '#111122', x: 0.8,  z: -0.8 },
  { gender: 'female', skin: '#6B4226', shirt: '#FFAA00', pants: '#0D0D1A', x: 1.8,  z: 1.2 },
  { gender: 'male',   skin: '#D4A574', shirt: '#44FF44', pants: '#1A1A2E', x: -0.5, z: -1.5 },
  { gender: 'female', skin: '#C68642', shirt: '#FF4488', pants: '#111122', x: 0,    z: 0 },
]

export class ClubDancers {
  private _dancers: Dancer[] = []
  private _onUpdate: (() => void) | null = null
  private _disposed = false

  constructor(private _scene: Scene) {}

  async spawn(): Promise<void> {
    for (const def of DANCER_DEFS) {
      if (this._disposed) return
      const avatar = await HumanAvatar.create(this._scene, def.gender)
      if (this._disposed) { avatar.dispose(); return }

      avatar.setSkinColor(def.skin)
      avatar.setClothingColor('shirt', def.shirt)
      avatar.setClothingColor('pants', def.pants)
      avatar.root.position.set(def.x, 0, def.z)
      avatar.root.scaling.set(-1, 1, 1)
      avatar.root.getChildMeshes(true).forEach(m => { m.isPickable = false })

      this._dancers.push({
        avatar,
        phase: Math.random() * Math.PI * 2,
        speed: 3.5 + Math.random() * 2,
      })
    }

    this._onUpdate = () => {
      const dt = this._scene.getEngine().getDeltaTime() / 1000
      for (const d of this._dancers) {
        d.phase += dt * d.speed
        d.avatar.update(dt)
      }
    }
    this._scene.registerBeforeRender(this._onUpdate)

    for (const d of this._dancers) {
      d.avatar.setAction('walk')
    }
  }

  dispose(): void {
    this._disposed = true
    if (this._onUpdate) this._scene.unregisterBeforeRender(this._onUpdate)
    for (const d of this._dancers) d.avatar.dispose()
    this._dancers = []
  }
}

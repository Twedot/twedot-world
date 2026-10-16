import {
  Scene, SceneLoader, TransformNode, Mesh, VertexData,
  StandardMaterial, Color3, FloatArray,
} from '@babylonjs/core'
import '@babylonjs/loaders/glTF'

interface PartDef {
  name: string
  start: number
  count: number
  pivot: [number, number, number]
  parent: string | null
}

export type HumanAction = 'idle' | 'walk' | 'sit' | 'sleep' | 'wash' | 'watch'

const CLOTHING: Record<string, 'skin' | 'shirt' | 'pants' | 'shoes'> = {
  head: 'skin', neck: 'skin', leftHand: 'skin', rightHand: 'skin',
  torso: 'shirt', leftUpperArm: 'shirt', rightUpperArm: 'shirt',
  leftForearm: 'shirt', rightForearm: 'shirt',
  leftThigh: 'pants', rightThigh: 'pants',
  leftCalf: 'pants', rightCalf: 'pants',
  leftFoot: 'shoes', rightFoot: 'shoes',
}

function _makeMat(name: string, hex: string, scene: Scene): StandardMaterial {
  const m = new StandardMaterial(name, scene)
  m.diffuseColor = Color3.FromHexString(hex)
  m.specularColor = new Color3(0.05, 0.05, 0.05)
  return m
}

export class HumanAvatar {
  readonly root: TransformNode
  private _bones = new Map<string, TransformNode>()
  private _parts = new Map<string, Mesh>()
  private _mats: { skin: StandardMaterial; shirt: StandardMaterial; pants: StandardMaterial; shoes: StandardMaterial }
  private _action: HumanAction = 'idle'
  private _phase = 0

  private constructor(scene: Scene) {
    this.root = new TransformNode('humanRoot', scene)
    this.root.scaling.set(-1, 1, 1)
    this._mats = {
      skin:  _makeMat('humanSkin',  '#C68642', scene),
      shirt: _makeMat('humanShirt', '#4A90D9', scene),
      pants: _makeMat('humanPants', '#2C3E50', scene),
      shoes: _makeMat('humanShoes', '#5D4037', scene),
    }
  }

  static async create(scene: Scene, gender: 'male' | 'female'): Promise<HumanAvatar> {
    const avatar = new HumanAvatar(scene)
    const file = gender === 'male' ? 'human-male.glb' : 'human-female.glb'

    const result = await SceneLoader.ImportMeshAsync('', '/models/', file, scene)

    let srcMesh: Mesh | null = null
    for (const m of result.meshes) {
      if ((m as Mesh).getTotalVertices?.() > 0) { srcMesh = m as Mesh; break }
    }
    if (!srcMesh) throw new Error('No mesh in GLB')

    let extras: any = null
    for (const n of [...result.meshes, ...result.transformNodes]) {
      const e = (n as any).metadata?.gltf?.extras
      if (e?.parts) { extras = e; break }
    }
    if (!extras) throw new Error('No rig metadata in GLB')

    const positions = srcMesh.getVerticesData('position') as FloatArray
    const normals = srcMesh.getVerticesData('normal') as FloatArray

    const partDefs: PartDef[] = (extras.parts as any[]).map(p => ({
      name: p.name,
      start: p.start,
      count: p.count,
      pivot: p.pivot,
      parent: p.parent,
    }))

    for (const pd of partDefs) {
      const bone = new TransformNode('bone_' + pd.name, scene)
      if (pd.parent) {
        const parentBone = avatar._bones.get(pd.parent)
        if (parentBone) {
          bone.parent = parentBone
          const pp = partDefs.find(p => p.name === pd.parent)!
          bone.position.set(
            pd.pivot[0] - pp.pivot[0],
            pd.pivot[1] - pp.pivot[1],
            pd.pivot[2] - pp.pivot[2],
          )
        }
      } else {
        bone.parent = avatar.root
        bone.position.set(pd.pivot[0], pd.pivot[1], pd.pivot[2])
      }
      avatar._bones.set(pd.name, bone)

      const vCount = pd.count
      const partPos = new Float32Array(vCount * 3)
      const partNor = new Float32Array(vCount * 3)
      for (let i = 0; i < vCount; i++) {
        const si = (pd.start + i) * 3
        partPos[i * 3] = (positions[si] as number) - pd.pivot[0]
        partPos[i * 3 + 1] = (positions[si + 1] as number) - pd.pivot[1]
        partPos[i * 3 + 2] = (positions[si + 2] as number) - pd.pivot[2]
        partNor[i * 3] = normals[si] as number
        partNor[i * 3 + 1] = normals[si + 1] as number
        partNor[i * 3 + 2] = normals[si + 2] as number
      }

      const vd = new VertexData()
      vd.positions = partPos
      vd.normals = partNor
      const indices = new Uint32Array(vCount)
      for (let i = 0; i < vCount; i++) indices[i] = i
      vd.indices = indices

      const mesh = new Mesh('part_' + pd.name, scene)
      vd.applyToMesh(mesh)
      mesh.parent = bone
      const slot = CLOTHING[pd.name] ?? 'skin'
      mesh.material = avatar._mats[slot]
      mesh.isPickable = false
      avatar._parts.set(pd.name, mesh)
    }

    for (const m of result.meshes) { m.setEnabled(false); m.dispose() }
    for (const tn of result.transformNodes) {
      if (!tn.name.startsWith('bone_') && !tn.name.startsWith('part_') && tn.name !== 'humanRoot')
        tn.dispose()
    }

    return avatar
  }

  update(dt: number): void {
    if (this._action === 'idle') this._animIdle(dt)
    else if (this._action === 'walk') this._animWalk(dt)
    else if (this._action === 'wash') this._animWash(dt)
    else if (this._action === 'sleep') this._animSleep(dt)
    else if (this._action === 'watch') this._animWatch(dt)
  }

  setAction(a: HumanAction): void {
    if (a === this._action) return
    this._action = a
    this._phase = 0
    if (a === 'sit') this._poseSit()
    else if (a === 'sleep') this._poseSleep()
    else if (a === 'idle') this._resetPose()
  }

  setSkinColor(hex: string): void {
    this._mats.skin.diffuseColor = Color3.FromHexString(hex)
  }

  setClothingColor(slot: 'shirt' | 'pants' | 'shoes', hex: string): void {
    this._mats[slot].diffuseColor = Color3.FromHexString(hex)
  }

  get action(): HumanAction { return this._action }

  private _animWalk(dt: number): void {
    this._phase += dt * 5.5
    const s = Math.sin(this._phase)
    const c = Math.cos(this._phase)

    this._rot('leftThigh', s * 0.45, 0, 0)
    this._rot('rightThigh', -s * 0.45, 0, 0)
    this._rot('leftCalf', Math.max(0, -s) * 0.6, 0, 0)
    this._rot('rightCalf', Math.max(0, s) * 0.6, 0, 0)

    this._rot('leftUpperArm', -s * 0.35, 0, 0)
    this._rot('rightUpperArm', s * 0.35, 0, 0)
    this._rot('leftForearm', -0.15, 0, 0)
    this._rot('rightForearm', -0.15, 0, 0)

    this._rot('torso', 0, c * 0.03, Math.sin(this._phase * 2) * 0.015)
    const bob = Math.abs(s) * 0.012
    const torso = this._bones.get('torso')
    if (torso) torso.position.y = 0.925 + bob
  }

  private _animIdle(dt: number): void {
    this._phase += dt * 1.2
    const breath = Math.sin(this._phase) * 0.01
    this._rot('torso', breath, 0, 0)
    this._rot('leftUpperArm', 0, 0, 0)
    this._rot('rightUpperArm', 0, 0, 0)
    this._rot('leftThigh', 0, 0, 0)
    this._rot('rightThigh', 0, 0, 0)
    this._rot('leftCalf', 0, 0, 0)
    this._rot('rightCalf', 0, 0, 0)
    this._rot('leftForearm', 0, 0, 0)
    this._rot('rightForearm', 0, 0, 0)
    const torso = this._bones.get('torso')
    if (torso) torso.position.y = 0.925
  }

  private _poseSit(): void {
    this._rot('leftThigh', -1.5, 0, 0)
    this._rot('rightThigh', -1.5, 0, 0)
    this._rot('leftCalf', 1.5, 0, 0)
    this._rot('rightCalf', 1.5, 0, 0)
    this._rot('leftUpperArm', -0.3, 0, 0)
    this._rot('rightUpperArm', -0.3, 0, 0)
    this._rot('leftForearm', -0.8, 0, 0)
    this._rot('rightForearm', -0.8, 0, 0)
    this._rot('torso', 0, 0, 0)
    const torso = this._bones.get('torso')
    if (torso) torso.position.y = 0.925 - 0.35
  }

  private _resetPose(): void {
    for (const [, bone] of this._bones) {
      bone.rotation.set(0, 0, 0)
    }
    const torso = this._bones.get('torso')
    if (torso) torso.position.y = 0.925
  }

  private _poseSleep(): void {
    this._rot('torso', -1.5, 0, 0)
    this._rot('leftThigh', 0.05, 0, 0)
    this._rot('rightThigh', 0.05, 0, 0)
    this._rot('leftCalf', 0.1, 0, 0)
    this._rot('rightCalf', 0.1, 0, 0)
    this._rot('leftUpperArm', -0.3, 0, -0.5)
    this._rot('rightUpperArm', -0.3, 0, 0.5)
    this._rot('leftForearm', -0.4, 0, 0)
    this._rot('rightForearm', -0.4, 0, 0)
    const torso = this._bones.get('torso')
    if (torso) torso.position.y = 0.45
  }

  private _animSleep(dt: number): void {
    this._phase += dt * 0.8
    const breath = Math.sin(this._phase) * 0.015
    const torso = this._bones.get('torso')
    if (torso) torso.position.y = 0.45 + breath
  }

  private _animWash(dt: number): void {
    this._phase += dt * 4
    const s = Math.sin(this._phase)
    this._rot('leftUpperArm', -1.2, 0, 0.2)
    this._rot('rightUpperArm', -1.2, 0, -0.2)
    this._rot('leftForearm', -0.8 + s * 0.3, 0, 0)
    this._rot('rightForearm', -0.8 - s * 0.3, 0, 0)
    this._rot('leftThigh', 0, 0, 0)
    this._rot('rightThigh', 0, 0, 0)
    this._rot('leftCalf', 0, 0, 0)
    this._rot('rightCalf', 0, 0, 0)
    this._rot('torso', -0.1, 0, 0)
    const torso = this._bones.get('torso')
    if (torso) torso.position.y = 0.925
  }

  private _animWatch(dt: number): void {
    this._phase += dt * 0.6
    const sway = Math.sin(this._phase) * 0.02
    this._rot('torso', 0, sway, 0)
    this._rot('leftUpperArm', 0, 0, 0)
    this._rot('rightUpperArm', 0, 0, 0)
    this._rot('leftForearm', 0, 0, 0)
    this._rot('rightForearm', 0, 0, 0)
    this._rot('leftThigh', 0, 0, 0)
    this._rot('rightThigh', 0, 0, 0)
    this._rot('leftCalf', 0, 0, 0)
    this._rot('rightCalf', 0, 0, 0)
    this._rot('head', 0.1, 0, 0)
    const torso = this._bones.get('torso')
    if (torso) torso.position.y = 0.925
  }

  private _rot(part: string, x: number, y: number, z: number): void {
    const bone = this._bones.get(part)
    if (bone) bone.rotation.set(x, y, z)
  }

  dispose(): void {
    for (const [, m] of this._parts) m.dispose()
    for (const [, b] of this._bones) b.dispose()
    for (const m of Object.values(this._mats)) m.dispose()
    this.root.dispose()
  }
}

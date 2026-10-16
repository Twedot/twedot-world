import { Scene, SceneLoader, TransformNode, Mesh } from '@babylonjs/core'
import '@babylonjs/loaders/glTF'

// ── Reusable building / prop models ──────────────────────────────────────────
// Template meshes stay invisible in the scene; every placement creates GPU-
// instanced copies so all buildings sharing the same GLB batch to one draw call.
//
// GLTF coordinate fix: BJS GLTF loader wraps every import in a __root__
// TransformNode with scaling.x = -1 to convert right-hand → left-hand.
// InstancedMesh doesn't inherit that parent, so we must replicate the X-flip
// on the instance itself: negate position.x, scaling.x — and copyFrom m.rotation
// so wheels / sub-meshes with their own rotations stay correct.

export interface ModelTemplate {
  meshes: Mesh[]
  nativeMax: number     // max(X-extent, Z-extent) in GLTF local space
  nativeHeight: number  // Y-extent in GLTF local space
}

const _cache = new Map<string, ModelTemplate>()
const _pending = new Map<string, Promise<ModelTemplate | null>>()

export async function loadModel(
  scene: Scene,
  basePath: string,
  filename: string
): Promise<ModelTemplate | null> {
  const key = basePath + filename
  if (_cache.has(key)) return _cache.get(key)!
  if (_pending.has(key)) return _pending.get(key)!

  const p = SceneLoader.ImportMeshAsync('', basePath, filename, scene)
    .then(result => {
      const meshes = result.meshes.filter(m => (m as Mesh).getTotalVertices?.() > 0) as Mesh[]
      meshes.forEach(m => { m.isVisible = false; m.isPickable = false })
      // nativeMax / nativeHeight are set by the caller via setDims() after load.
      // We intentionally do NOT call getBoundingInfo() here — the GLTF loader may
      // not have synced bounding data yet, causing a silent throw that returns null.
      const tmpl: ModelTemplate = { meshes, nativeMax: 2.0, nativeHeight: 2.5 }
      _cache.set(key, tmpl)
      return tmpl
    })
    .catch(err => {
      console.warn('[ModelLoader] failed to load', filename, err)
      return null
    })

  _pending.set(key, p)
  return p
}

export function placeModel(
  scene: Scene,
  tmpl: ModelTemplate,
  id: string,
  x: number,
  y: number,
  z: number,
  rotY: number,
  scale: number
): TransformNode {
  const root = new TransformNode(id + '_root', scene)
  root.position.set(x, y, z)
  root.rotation.y = rotY
  root.scaling.setAll(scale)

  tmpl.meshes.forEach((m, i) => {
    const inst = m.createInstance(id + '_' + i)
    inst.parent = root
    // GLTF __root__ applies scaling.x = -1 for right→left hand conversion.
    // Instances don't inherit that parent, so we replicate the flip here:
    //   - negate position.x so sub-mesh offsets (wheels etc.) land on the correct side
    //   - negate scaling.x so face winding stays correct (negative determinant → BJS
    //     flips sideOrientation to match the X-inverted geometry)
    inst.position.set(-m.position.x, m.position.y, m.position.z)
    inst.rotation.copyFrom(m.rotation)
    inst.scaling.set(-m.scaling.x, m.scaling.y, m.scaling.z)
    inst.isPickable = false
  })

  return root
}

// ── Scene-level landmark models ───────────────────────────────────────────────
// These are complex GLB scenes with deep node hierarchies (200-400 meshes).
// We preserve the full import hierarchy and just reposition the root — this
// avoids the flat-clone trap where local transforms lose their parent context.
// Each landmark is placed exactly once, so no instancing needed.

export interface LandmarkTemplate {
  root: TransformNode
}

const _landmarkCache = new Map<string, LandmarkTemplate>()

export async function loadLandmark(
  scene: Scene,
  basePath: string,
  filename: string
): Promise<LandmarkTemplate | null> {
  const key = basePath + filename
  if (_landmarkCache.has(key)) return _landmarkCache.get(key)!

  try {
    const result = await SceneLoader.ImportMeshAsync('', basePath, filename, scene)
    // Wrap everything from this import under a single controllable root so we
    // can reposition the entire scene in one transform operation
    const slug = filename.replace('.glb', '')
    const importRoot = new TransformNode(slug + '_land', scene)
    result.transformNodes.forEach(n => { if (!n.parent) n.parent = importRoot })
    result.meshes.forEach(m => { if (!m.parent) m.parent = importRoot; ;(m as Mesh).isPickable = false })
    importRoot.setEnabled(false)
    const tmpl: LandmarkTemplate = { root: importRoot }
    _landmarkCache.set(key, tmpl)
    return tmpl
  } catch (err) {
    console.warn('[ModelLoader] failed to load landmark', filename, err)
    return null
  }
}

export function placeLandmark(
  tmpl: LandmarkTemplate,
  x: number,
  y: number,
  z: number,
  rotY: number,
  scale: number
): void {
  const r = tmpl.root
  r.setEnabled(true)
  r.position.set(x, y, z)
  r.rotation.y = rotY
  r.scaling.setAll(scale)
}

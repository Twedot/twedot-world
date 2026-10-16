import {
  Scene, MeshBuilder, StandardMaterial, Color3,
  DynamicTexture, Mesh, TransformNode,
} from '@babylonjs/core'

export function createNameLabel(
  scene: Scene, name: string, rank: string, parent: TransformNode,
): Mesh {
  const W = 1024, H = 256
  const tex = new DynamicTexture('nlbl_' + name + Math.random(), { width: W, height: H }, scene, true)
  tex.hasAlpha = true

  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D
  ctx.clearRect(0, 0, W, H)

  // rounded pill with large radius
  const R = 48, PAD = 16
  ctx.fillStyle = 'rgba(10, 10, 18, 0.85)'
  ctx.beginPath()
  ctx.moveTo(PAD + R, PAD)
  ctx.lineTo(W - PAD - R, PAD)
  ctx.arcTo(W - PAD, PAD, W - PAD, PAD + R, R)
  ctx.lineTo(W - PAD, H - PAD - R)
  ctx.arcTo(W - PAD, H - PAD, W - PAD - R, H - PAD, R)
  ctx.lineTo(PAD + R, H - PAD)
  ctx.arcTo(PAD, H - PAD, PAD, H - PAD - R, R)
  ctx.lineTo(PAD, PAD + R)
  ctx.arcTo(PAD, PAD, PAD + R, PAD, R)
  ctx.closePath()
  ctx.fill()

  // @name (white, bold, large)
  ctx.fillStyle = '#FFFFFF'
  ctx.font = 'bold 72px Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('@' + name, W / 2, H * 0.38)

  // rank (gold, bold)
  ctx.fillStyle = '#FFD700'
  ctx.font = 'bold 48px Arial'
  ctx.fillText(rank, W / 2, H * 0.72)

  tex.update()

  const mat = new StandardMaterial('nlblm_' + Math.random(), scene)
  mat.disableLighting = true
  mat.diffuseTexture = tex
  mat.diffuseTexture.hasAlpha = true
  mat.emissiveTexture = tex
  mat.emissiveColor = new Color3(1, 1, 1)
  mat.useAlphaFromDiffuseTexture = true
  mat.backFaceCulling = false

  const plane = MeshBuilder.CreatePlane('nlbl_' + name, { width: 2.0, height: 0.5 }, scene)
  plane.position.y = 2.65
  plane.billboardMode = Mesh.BILLBOARDMODE_ALL
  plane.material = mat
  plane.isPickable = false
  plane.renderingGroupId = 1

  // sync position to parent every frame (avoids inheriting parent's -1 X scale which mirrors text)
  const update = () => {
    if (parent.isDisposed()) return
    const wp = parent.getAbsolutePosition()
    plane.position.x = wp.x
    plane.position.z = wp.z
    plane.position.y = wp.y + 2.65
  }
  scene.registerBeforeRender(update)
  ;(plane as any)._labelUpdate = update

  return plane
}

export function disposeNameLabel(scene: Scene, plane: Mesh): void {
  const update = (plane as any)._labelUpdate
  if (update) scene.unregisterBeforeRender(update)
  plane.dispose(false, true)
}

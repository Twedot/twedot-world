import {
  Engine, Scene, ArcRotateCamera, Vector3, Color3, Color4,
  HemisphericLight, DirectionalLight, StandardMaterial, MeshBuilder,
  DefaultRenderingPipeline,
} from '@babylonjs/core'
import { BUILDING_TYPES } from '../world/buildingTypes'
import type { BuildingDef } from '../world/types'

export class BuildingScene {
  readonly engine: Engine
  readonly scene: Scene

  constructor(canvas: HTMLCanvasElement, def: BuildingDef) {
    this.engine = new Engine(canvas, true)
    this.scene = new Scene(this.engine)
    this.scene.clearColor = new Color4(0.52, 0.80, 0.98, 1)

    const cam = new ArcRotateCamera('cam', -Math.PI*0.6, Math.PI/3.5, def.h*3.5+6, new Vector3(def.x||0, def.h*0.5, def.z||0), this.scene)
    cam.lowerBetaLimit = Math.PI/6; cam.upperBetaLimit = Math.PI/2.2
    cam.lowerRadiusLimit = def.h*1.5+2; cam.upperRadiusLimit = def.h*6+20
    cam.attachControl(canvas, true)

    const amb = new HemisphericLight('amb', new Vector3(0,1,0), this.scene)
    amb.intensity=0.7; amb.diffuse=new Color3(1,0.98,0.92); amb.groundColor=new Color3(0.3,0.5,0.3)
    const sun = new DirectionalLight('sun', new Vector3(-1,-2,0.5), this.scene)
    sun.intensity=0.9

    this._buildScene(def)

    this.scene.executeWhenReady(() => {
      try {
        const pp = new DefaultRenderingPipeline('pp', true, this.scene, [cam])
        pp.fxaaEnabled=true; pp.bloomEnabled=true; pp.bloomThreshold=0.72; pp.bloomWeight=0.12; pp.bloomScale=0.5
      } catch (_) {}
    })

    const onResize = () => this.engine.resize()
    window.addEventListener('resize', onResize)
    ;(this as any)._offResize = () => window.removeEventListener('resize', onResize)
  }

  private _mat(id: string, hex: string, sp = 0.05) {
    const m = new StandardMaterial(id, this.scene)
    m.diffuseColor = Color3.FromHexString(hex)
    m.specularColor = new Color3(sp, sp, sp)
    return m
  }

  private _buildScene(b: BuildingDef) {
    const ty = BUILDING_TYPES[b.type]
    const ox = b.x || 0, oz = b.z || 0

    // Ground
    const g = MeshBuilder.CreateGround('g', { width: b.w*6, height: b.d*6 }, this.scene)
    g.position.set(ox, 0, oz); g.material = this._mat('gm', '#5aab5a')

    // Road strip in front
    const rd = MeshBuilder.CreateBox('rd', { width: b.w*5, height: 0.07, depth: b.d*1.6 }, this.scene)
    rd.position.set(ox, 0.035, oz+b.d*2); rd.material = this._mat('rdm', '#4a4a5a')

    // Building body
    const body = MeshBuilder.CreateBox('body', { width: b.w, height: b.h, depth: b.d }, this.scene)
    body.position.set(ox, b.h*0.5, oz); body.material = this._mat('bm', ty.color, 0.06)

    // Accent band
    const bh = Math.min(0.5, b.h*0.12)
    const band = MeshBuilder.CreateBox('band', { width: b.w+0.08, height: bh, depth: b.d+0.08 }, this.scene)
    band.position.set(ox, b.h-bh*0.9, oz); band.material = this._mat('am', ty.accent, 0.04)

    // Roof parapet
    const rf = MeshBuilder.CreateBox('rf', { width: b.w+0.32, height: 0.22, depth: b.d+0.32 }, this.scene)
    rf.position.set(ox, b.h+0.11, oz); rf.material = this._mat('rfm', ty.accent, 0.02)

    // Window strips
    const wm = this._mat('wm', ty.win, 0.42); wm.specularPower=90
    const floors = Math.max(1, Math.floor((b.h-1.4)/1.9))
    for (let row=0; row<floors; row++) {
      const wy=1.1+row*1.9; if (wy>b.h-1.2) break
      const wf = MeshBuilder.CreateBox(`wf${row}`, { width: b.w*0.74, height: 0.52, depth: 0.07 }, this.scene)
      wf.position.set(ox, wy, oz+b.d*0.5+0.04); wf.material=wm
      const wb = MeshBuilder.CreateBox(`wb${row}`, { width: b.w*0.74, height: 0.52, depth: 0.07 }, this.scene)
      wb.position.set(ox, wy, oz-b.d*0.5-0.04); wb.material=wm
    }

    // Door
    const dr = MeshBuilder.CreateBox('dr', { width: b.w*0.22, height: 1.9, depth: 0.08 }, this.scene)
    dr.position.set(ox, 0.95, oz+b.d*0.5+0.04); dr.material=this._mat('drm','#2a1e14')
    const aw = MeshBuilder.CreateBox('aw', { width: b.w*0.48, height: 0.1, depth: 0.7 }, this.scene)
    aw.position.set(ox, 2.3, oz+b.d*0.5+0.35); aw.material=this._mat('awm', ty.accent, 0.04)

    // Stepped crown for tall buildings
    if (b.h>=7) {
      const uh=b.h*0.22
      const up=MeshBuilder.CreateBox('up', { width: b.w*0.68, height: uh, depth: b.d*0.68 }, this.scene)
      up.position.set(ox, b.h+uh*0.5, oz); up.material=this._mat('upm', ty.color, 0.06)
    }
  }

  start() {
    this.engine.runRenderLoop(() => this.scene.render())
  }

  dispose() {
    ;(this as any)._offResize?.()
    this.engine.dispose()
  }
}

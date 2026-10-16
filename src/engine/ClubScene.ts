import {
  Engine, Scene, ArcRotateCamera, HemisphericLight, PointLight,
  MeshBuilder, StandardMaterial, Color3, Color4, Vector3, DynamicTexture,
} from '@babylonjs/core'

export class ClubScene {
  readonly engine: Engine
  readonly scene: Scene
  private _time = 0

  constructor(canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true, { stencil: true })
    this.scene  = new Scene(this.engine)
    this.scene.clearColor = new Color4(0.02, 0.01, 0.06, 1)

    const cam = new ArcRotateCamera('cam', -Math.PI / 4, Math.PI / 3.6, 18, Vector3.Zero(), this.scene)
    cam.lowerAlphaLimit = -Math.PI / 2; cam.upperAlphaLimit = 0
    cam.lowerBetaLimit = Math.PI / 6; cam.upperBetaLimit = Math.PI / 2.5
    cam.lowerRadiusLimit = 10; cam.upperRadiusLimit = 26
    cam.panningSensibility = 0
    cam.attachControl(canvas, true)

    const amb = new HemisphericLight('hamb', new Vector3(0, 1, 0), this.scene)
    amb.intensity = 0.35; amb.diffuse = new Color3(0.6, 0.4, 0.8)
    amb.groundColor = new Color3(0.15, 0.05, 0.25)

    this._buildRoom()
    this._buildDjBooth()
    this._buildDanceFloor()
    this._buildBar()
    this._buildVipArea()
    this._buildLights()
    this._buildSpeakers()
    this._buildFence()
  }

  private _flatMat(hex: string): StandardMaterial {
    const m = new StandardMaterial('fm_' + hex, this.scene)
    m.disableLighting = true
    m.emissiveColor = Color3.FromHexString(hex)
    m.diffuseColor = Color3.Black()
    m.specularColor = Color3.Black()
    return m
  }

  private _mat(hex: string): StandardMaterial {
    const key = 'cl_' + hex
    let m = this.scene.getMaterialByName(key) as StandardMaterial
    if (m) return m
    m = new StandardMaterial(key, this.scene)
    m.diffuseColor = Color3.FromHexString(hex)
    return m
  }

  private _glowMat(hex: string): StandardMaterial {
    const m = new StandardMaterial('glow_' + hex + Math.random(), this.scene)
    m.emissiveColor = Color3.FromHexString(hex)
    m.disableLighting = true
    return m
  }

  private _buildRoom(): void {
    const RW = 14, RD = 12, wallH = 3.2

    const platMat = this._flatMat('#0A1A08')
    const plat = MeshBuilder.CreateCylinder('plat', { height: 0.40, diameter: RW * 1.65, tessellation: 72 }, this.scene)
    plat.position.y = -0.28; plat.material = platMat; plat.isPickable = false

    const floorMat = this._flatMat('#1A0A2A')
    const floor = MeshBuilder.CreateBox('floor', { width: RW, height: 0.10, depth: RD }, this.scene)
    floor.position.y = -0.05; floor.material = floorMat; floor.isPickable = false

    const wallM = this._flatMat('#0D0520')
    const back = MeshBuilder.CreateBox('wBack', { width: RW + 0.44, height: wallH, depth: 0.22 }, this.scene)
    back.position.set(0, wallH / 2, RD / 2 + 0.11); back.material = wallM; back.isPickable = false
    const left = MeshBuilder.CreateBox('wLeft', { width: 0.22, height: wallH, depth: RD }, this.scene)
    left.position.set(-RW / 2 - 0.11, wallH / 2, 0); left.material = wallM; left.isPickable = false

    const skirtM = this._flatMat('#2A0A4A')
    const skB = MeshBuilder.CreateBox('skB', { width: RW + 0.44, height: 0.22, depth: 0.22 }, this.scene)
    skB.position.set(0, 0.11, RD / 2 + 0.11); skB.material = skirtM; skB.isPickable = false
    const skL = MeshBuilder.CreateBox('skL', { width: 0.22, height: 0.22, depth: RD }, this.scene)
    skL.position.set(-RW / 2 - 0.11, 0.11, 0); skL.material = skirtM; skL.isPickable = false

    // Neon strips
    const neonColors = ['#FF00FF', '#00FFFF', '#FF00FF']
    neonColors.forEach((c, i) => {
      const nM = this._glowMat(c)
      if (i < 2) {
        const wall = i === 0 ? 'nB' : 'nL'
        const s = MeshBuilder.CreateBox(wall, i === 0
          ? { width: RW, height: 0.06, depth: 0.04 }
          : { width: 0.04, height: 0.06, depth: RD }, this.scene)
        s.position.set(
          i === 0 ? 0 : -RW / 2 - 0.04,
          wallH - 0.15,
          i === 0 ? RD / 2 + 0.04 : 0)
        s.material = nM
      } else {
        const s2 = MeshBuilder.CreateBox('nB2', { width: RW, height: 0.06, depth: 0.04 }, this.scene)
        s2.position.set(0, wallH * 0.5, RD / 2 + 0.04); s2.material = nM
      }
    })
  }

  private _buildDjBooth(): void {
    // DJ booth against back wall, center
    const boothM = this._mat('#1A0A2A')
    const booth = MeshBuilder.CreateBox('djbooth', { width: 3.5, height: 1.0, depth: 1.2 }, this.scene)
    booth.position.set(0, 0.5, 5.2); booth.material = boothM

    // DJ booth front panel glow
    const panelM = this._glowMat('#8800CC')
    const panel = MeshBuilder.CreateBox('djpanel', { width: 3.4, height: 0.8, depth: 0.04 }, this.scene)
    panel.position.set(0, 0.5, 4.58); panel.material = panelM

    // Turntables
    for (const dx of [-0.8, 0.8]) {
      const tt = MeshBuilder.CreateCylinder(`tt${dx}`, { height: 0.06, diameter: 0.7, tessellation: 20 }, this.scene)
      tt.position.set(dx, 1.06, 5.2); tt.material = this._mat('#111111')
      const disc = MeshBuilder.CreateCylinder(`disc${dx}`, { height: 0.02, diameter: 0.55, tessellation: 16 }, this.scene)
      disc.position.set(dx, 1.1, 5.2); disc.material = this._mat('#222222')
      const label = MeshBuilder.CreateCylinder(`lbl${dx}`, { height: 0.01, diameter: 0.15, tessellation: 10 }, this.scene)
      label.position.set(dx, 1.12, 5.2); label.material = this._glowMat('#FF00FF')
    }

    // Mixer in center
    const mixer = MeshBuilder.CreateBox('mixer', { width: 0.6, height: 0.08, depth: 0.5 }, this.scene)
    mixer.position.set(0, 1.07, 5.2); mixer.material = this._mat('#1A1A1A')
    for (let i = 0; i < 4; i++) {
      const slider = MeshBuilder.CreateBox(`slider${i}`, { width: 0.04, height: 0.02, depth: 0.3 }, this.scene)
      slider.position.set(-0.15 + i * 0.1, 1.12, 5.2); slider.material = this._glowMat('#00FFFF')
    }

    // DJ sign on back wall
    const signTex = new DynamicTexture('djsign', { width: 512, height: 128 }, this.scene, false)
    const ctx = signTex.getContext() as unknown as CanvasRenderingContext2D
    ctx.fillStyle = '#0D0520'; ctx.fillRect(0, 0, 512, 128)
    ctx.fillStyle = '#FF00FF'; ctx.font = 'bold 60px Arial'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('PABLO CUBANA', 256, 64)
    signTex.update()
    const signMat = new StandardMaterial('signm', this.scene)
    signMat.emissiveTexture = signTex; signMat.disableLighting = true; signMat.emissiveColor = Color3.White()
    const sign = MeshBuilder.CreateBox('djsignm', { width: 4.0, height: 1.0, depth: 0.04 }, this.scene)
    sign.position.set(0, 2.5, 5.9); sign.material = signMat
  }

  private _buildDanceFloor(): void {
    // Checkered LED dance floor
    const tileSize = 1.0
    const cols = 6, rows = 5
    const startX = -cols * tileSize / 2 + tileSize / 2
    const startZ = -rows * tileSize / 2 + tileSize / 2
    const danceColors = ['#FF00FF', '#00FFFF', '#FFFF00', '#FF4444', '#44FF44', '#4444FF']

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tile = MeshBuilder.CreateBox(`dt${r}${c}`, { width: tileSize - 0.05, height: 0.04, depth: tileSize - 0.05 }, this.scene)
        tile.position.set(startX + c * tileSize, 0.02, startZ + r * tileSize)
        const color = danceColors[(r + c) % danceColors.length]
        const m = new StandardMaterial(`dtm${r}${c}`, this.scene)
        m.emissiveColor = Color3.FromHexString(color).scale(0.5)
        m.disableLighting = true
        tile.material = m; tile.isPickable = false
      }
    }

    // Disco ball
    const ball = MeshBuilder.CreateSphere('disco', { diameter: 0.8, segments: 12 }, this.scene)
    ball.position.set(0, 3.0, 0)
    const ballM = new StandardMaterial('discoM', this.scene)
    ballM.emissiveColor = new Color3(0.8, 0.8, 0.8); ballM.disableLighting = true
    ball.material = ballM

    // Disco ball pole
    const pole = MeshBuilder.CreateCylinder('dpole', { height: 0.4, diameter: 0.04, tessellation: 6 }, this.scene)
    pole.position.set(0, 3.3, 0); pole.material = this._mat('#888888')
  }

  private _buildBar(): void {
    // Bar counter along left wall
    const barM = this._mat('#2A0A3A')
    const counter = MeshBuilder.CreateBox('bar', { width: 1.4, height: 1.0, depth: 5.0 }, this.scene)
    counter.position.set(-5.8, 0.5, 0); counter.material = barM

    // Bar top (lighter)
    const barTop = MeshBuilder.CreateBox('bartop', { width: 1.5, height: 0.06, depth: 5.1 }, this.scene)
    barTop.position.set(-5.8, 1.03, 0); barTop.material = this._mat('#3A1A4A')

    // Glow strip on front of bar
    const barGlow = MeshBuilder.CreateBox('barglow', { width: 0.04, height: 0.6, depth: 5.0 }, this.scene)
    barGlow.position.set(-5.08, 0.5, 0); barGlow.material = this._glowMat('#00FFFF')

    // Bottles on bar
    const bottleColors = ['#FF4444', '#44FF44', '#4444FF', '#FFAA00', '#FF00FF', '#00FFFF']
    for (let i = 0; i < 6; i++) {
      const bottle = MeshBuilder.CreateCylinder(`bot${i}`, { height: 0.45, diameter: 0.12, tessellation: 8 }, this.scene)
      bottle.position.set(-5.8, 1.28, -1.8 + i * 0.7)
      bottle.material = this._glowMat(bottleColors[i])
    }

    // Bar stools (3)
    for (let i = 0; i < 3; i++) {
      const stoolSeat = MeshBuilder.CreateCylinder(`stool${i}`, { height: 0.08, diameter: 0.45, tessellation: 10 }, this.scene)
      stoolSeat.position.set(-4.6, 0.7, -1.5 + i * 1.5); stoolSeat.material = this._mat('#2A0A3A')
      const stoolPole = MeshBuilder.CreateCylinder(`spole${i}`, { height: 0.66, diameter: 0.06, tessellation: 6 }, this.scene)
      stoolPole.position.set(-4.6, 0.35, -1.5 + i * 1.5); stoolPole.material = this._mat('#888888')
      const stoolBase = MeshBuilder.CreateCylinder(`sbase${i}`, { height: 0.04, diameter: 0.35, tessellation: 8 }, this.scene)
      stoolBase.position.set(-4.6, 0.02, -1.5 + i * 1.5); stoolBase.material = this._mat('#888888')
    }
  }

  private _buildVipArea(): void {
    // VIP seating — right side, raised platform
    const platM = this._flatMat('#1A0530')
    const vipPlat = MeshBuilder.CreateBox('vipplat', { width: 4.0, height: 0.18, depth: 4.0 }, this.scene)
    vipPlat.position.set(4.5, 0.09, 3.5); vipPlat.material = platM

    // VIP glow border
    const vipGlow = MeshBuilder.CreateBox('vipglow', { width: 4.1, height: 0.04, depth: 4.1 }, this.scene)
    vipGlow.position.set(4.5, 0.19, 3.5); vipGlow.material = this._glowMat('#FF00FF')

    // L-shaped sofa
    const sofaM = this._mat('#4A0A6A')
    const sofaBack = MeshBuilder.CreateBox('vsofa1', { width: 3.5, height: 0.5, depth: 0.8 }, this.scene)
    sofaBack.position.set(4.5, 0.45, 5.0); sofaBack.material = sofaM
    const sofaSide = MeshBuilder.CreateBox('vsofa2', { width: 0.8, height: 0.5, depth: 2.5 }, this.scene)
    sofaSide.position.set(6.1, 0.45, 3.8); sofaSide.material = sofaM

    // Sofa back rests
    const brM = this._mat('#3A0A5A')
    const br1 = MeshBuilder.CreateBox('vbr1', { width: 3.5, height: 0.4, depth: 0.15 }, this.scene)
    br1.position.set(4.5, 0.85, 5.35); br1.material = brM
    const br2 = MeshBuilder.CreateBox('vbr2', { width: 0.15, height: 0.4, depth: 2.5 }, this.scene)
    br2.position.set(6.45, 0.85, 3.8); br2.material = brM

    // VIP table
    const vtop = MeshBuilder.CreateCylinder('vtable', { height: 0.06, diameter: 1.2, tessellation: 12 }, this.scene)
    vtop.position.set(4.5, 0.65, 3.8); vtop.material = this._mat('#111111')
    const vpole = MeshBuilder.CreateCylinder('vtpole', { height: 0.47, diameter: 0.08, tessellation: 6 }, this.scene)
    vpole.position.set(4.5, 0.41, 3.8); vpole.material = this._mat('#888888')

    // VIP sign
    const vipSign = new DynamicTexture('vipsign', { width: 256, height: 64 }, this.scene, false)
    const vc = vipSign.getContext() as unknown as CanvasRenderingContext2D
    vc.fillStyle = '#0D0520'; vc.fillRect(0, 0, 256, 64)
    vc.fillStyle = '#FFD700'; vc.font = 'bold 42px Arial'
    vc.textAlign = 'center'; vc.textBaseline = 'middle'
    vc.fillText('VIP', 128, 34)
    vipSign.update()
    const vsMat = new StandardMaterial('vsm', this.scene)
    vsMat.emissiveTexture = vipSign; vsMat.disableLighting = true; vsMat.emissiveColor = Color3.White()
    const vsm = MeshBuilder.CreateBox('vsignm', { width: 1.2, height: 0.3, depth: 0.04 }, this.scene)
    vsm.position.set(4.5, 1.3, 5.9); vsm.material = vsMat
  }

  private _buildLights(): void {
    // Colored point lights for club atmosphere
    const colors: [number, number, number, number, number][] = [
      [-2, 2.8, 2, 0.6, 0xFF00FF],
      [2, 2.8, -2, 0.6, 0x00FFFF],
      [0, 2.8, 0, 0.4, 0xFFFF00],
      [-5, 2.5, 3, 0.3, 0xFF0088],
      [4, 2.5, 4, 0.3, 0x8800FF],
    ]
    colors.forEach(([x, y, z, intensity, color], i) => {
      const pt = new PointLight(`cpl${i}`, new Vector3(x, y, z), this.scene)
      pt.intensity = intensity
      pt.diffuse = Color3.FromHexString('#' + color.toString(16).padStart(6, '0'))
    })

    // Spot light housings on ceiling
    for (const [x, z] of [[-3, 3], [3, 3], [-3, -3], [3, -3]]) {
      const housing = MeshBuilder.CreateCylinder(`sph${x}${z}`, {
        height: 0.2, diameterTop: 0.15, diameterBottom: 0.35, tessellation: 8,
      }, this.scene)
      housing.position.set(x, 3.1, z); housing.material = this._mat('#222222')
    }
  }

  private _buildSpeakers(): void {
    // Large speakers flanking DJ booth
    for (const dx of [-2.5, 2.5]) {
      const spBody = MeshBuilder.CreateBox(`sp${dx}`, { width: 0.8, height: 1.4, depth: 0.6 }, this.scene)
      spBody.position.set(dx, 0.7, 5.4); spBody.material = this._mat('#111111')

      // Woofer
      const woof = MeshBuilder.CreateCylinder(`wf${dx}`, { height: 0.08, diameter: 0.5, tessellation: 12 }, this.scene)
      woof.position.set(dx, 0.5, 5.08); woof.rotation.x = Math.PI / 2; woof.material = this._mat('#333333')

      // Tweeter
      const tweet = MeshBuilder.CreateCylinder(`tw${dx}`, { height: 0.06, diameter: 0.2, tessellation: 10 }, this.scene)
      tweet.position.set(dx, 1.0, 5.08); tweet.rotation.x = Math.PI / 2; tweet.material = this._mat('#444444')

      // Speaker glow ring
      const ring = MeshBuilder.CreateTorus(`sring${dx}`, { diameter: 0.55, thickness: 0.03, tessellation: 16 }, this.scene)
      ring.position.set(dx, 0.5, 5.09); ring.rotation.x = Math.PI / 2; ring.material = this._glowMat('#FF00FF')
    }
  }

  private _buildFence(): void {
    const RW = 14, RD = 12
    const fenceH = 1.2, postD = 0.12, railD = 0.06
    const fenceM = this._mat('#1A0A2A')
    const railM = this._glowMat('#8800CC')

    const sides: [number, number, number, number, boolean][] = [
      // x, z, length, rotY, isX
      [0, -RD / 2 - 0.3, RW + 0.6, 0, true],           // front
      [RW / 2 + 0.3, 0, RD + 0.6, 0, false],            // right
      [0, RD / 2 + 0.3, RW + 0.6, 0, true],              // back (behind walls)
    ]

    for (const [cx, cz, len, , isX] of sides) {
      // top rail
      const rail = MeshBuilder.CreateBox(`fr_${cx}_${cz}`, isX
        ? { width: len, height: railD, depth: railD }
        : { width: railD, height: railD, depth: len }, this.scene)
      rail.position.set(cx, fenceH, cz)
      rail.material = railM; rail.isPickable = false

      // mid rail
      const mid = MeshBuilder.CreateBox(`fm_${cx}_${cz}`, isX
        ? { width: len, height: railD, depth: railD }
        : { width: railD, height: railD, depth: len }, this.scene)
      mid.position.set(cx, fenceH * 0.5, cz)
      mid.material = railM; mid.isPickable = false

      // posts
      const count = Math.floor(len / 1.8)
      const start = isX ? cx - len / 2 : cz - len / 2
      const step = len / count
      for (let i = 0; i <= count; i++) {
        const post = MeshBuilder.CreateBox(`fp_${cx}_${cz}_${i}`, { width: postD, height: fenceH, depth: postD }, this.scene)
        const pos = start + i * step
        post.position.set(isX ? pos : cx, fenceH / 2, isX ? cz : pos)
        post.material = fenceM; post.isPickable = false
      }
    }

    // Street lights at corners
    const lampM = this._mat('#333333')
    const bulbM = this._glowMat('#FFDD88')
    const lampPositions: [number, number][] = [
      [-RW / 2 - 0.3, -RD / 2 - 0.3],
      [RW / 2 + 0.3, -RD / 2 - 0.3],
      [RW / 2 + 0.3, RD / 2 + 0.3],
      [-RW / 2 - 0.3, RD / 2 + 0.3],
    ]
    for (let i = 0; i < lampPositions.length; i++) {
      const [lx, lz] = lampPositions[i]
      const pole = MeshBuilder.CreateCylinder(`lp${i}`, { height: 3.5, diameter: 0.1, tessellation: 8 }, this.scene)
      pole.position.set(lx, 1.75, lz); pole.material = lampM; pole.isPickable = false
      const arm = MeshBuilder.CreateBox(`la${i}`, { width: 0.6, height: 0.06, depth: 0.06 }, this.scene)
      const armDx = lx > 0 ? -0.3 : 0.3
      arm.position.set(lx + armDx, 3.45, lz); arm.material = lampM; arm.isPickable = false
      const bulb = MeshBuilder.CreateSphere(`lb${i}`, { diameter: 0.25, segments: 8 }, this.scene)
      bulb.position.set(lx + armDx * 2, 3.35, lz); bulb.material = bulbM; bulb.isPickable = false
      const pl = new PointLight(`sll${i}`, new Vector3(lx + armDx * 2, 3.2, lz), this.scene)
      pl.intensity = 0.6; pl.diffuse = Color3.FromHexString('#FFDD88'); pl.range = 8
    }
  }

  start(): void {
    this.engine.runRenderLoop(() => {
      this._time += 0.02
      // Animate dance floor tiles
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 6; c++) {
          const m = this.scene.getMaterialByName(`dtm${r}${c}`) as StandardMaterial
          if (m) {
            const phase = (r + c) * 0.5 + this._time
            const pulse = 0.3 + Math.abs(Math.sin(phase)) * 0.7
            m.emissiveColor.r *= 0.95; m.emissiveColor.g *= 0.95; m.emissiveColor.b *= 0.95
            const colors = ['#FF00FF', '#00FFFF', '#FFFF00', '#FF4444', '#44FF44', '#4444FF']
            const base = Color3.FromHexString(colors[(r + c + Math.floor(this._time)) % colors.length])
            m.emissiveColor = base.scale(pulse)
          }
        }
      }

      // Rotate disco ball
      const disco = this.scene.getMeshByName('disco')
      if (disco) disco.rotation.y += 0.015

      this.scene.render()
    })
  }

  dispose(): void {
    this.engine.stopRenderLoop()
    this.scene.dispose()
    this.engine.dispose()
  }
}

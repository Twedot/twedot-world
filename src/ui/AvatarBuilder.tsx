import { useEffect, useRef, useState, useCallback } from 'react'
import { Engine, Scene, ArcRotateCamera, HemisphericLight, Color3, Color4, Vector3 } from '@babylonjs/core'
import { createAvatarMesh, type AvatarParts } from '../engine/AvatarMesh'
import {
  type AvatarConfig, DEFAULT_AVATAR, saveAvatarConfig,
  SKIN_COLORS, HAIR_COLORS, SHIRT_COLORS, PANTS_COLORS, SHOE_COLORS,
  HAIR_STYLES, SHIRT_STYLES, PANTS_STYLES,
} from '../world/avatarTypes'
import './AvatarBuilder.css'

interface Props {
  initial: AvatarConfig
  onSave: (c: AvatarConfig) => void
  onExit: () => void
}

const STYLE_LABELS: Record<string, string> = {
  bald: 'Bald', short: 'Short', long: 'Long', afro: 'Afro', braids: 'Braids', mohawk: 'Mohawk',
  tshirt: 'T-Shirt', polo: 'Polo', hoodie: 'Hoodie', tank: 'Tank Top',
  pants: 'Pants', shorts: 'Shorts', skirt: 'Skirt',
}

export default function AvatarBuilder({ initial, onSave, onExit }: Props) {
  const cvRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<Engine | null>(null)
  const sceneRef = useRef<Scene | null>(null)
  const partsRef = useRef<AvatarParts | null>(null)

  const [cfg, setCfg] = useState<AvatarConfig>({ ...initial })

  // Create preview scene once
  useEffect(() => {
    const cv = cvRef.current!
    cv.width = cv.clientWidth || 320
    cv.height = cv.clientHeight || 400
    const engine = new Engine(cv, true, { antialias: true, adaptToDeviceRatio: true })
    const scene = new Scene(engine)
    scene.clearColor = new Color4(0.15, 0.15, 0.20, 1)

    const cam = new ArcRotateCamera('prevCam', -Math.PI / 4, Math.PI / 3, 3.2,
      new Vector3(0, 0.55, 0), scene)
    cam.lowerRadiusLimit = 2; cam.upperRadiusLimit = 5
    cam.panningSensibility = 0
    cam.attachControl(cv, true)

    const amb = new HemisphericLight('prevAmb', new Vector3(0, 1, 0), scene)
    amb.intensity = 1.0; amb.diffuse = new Color3(1, 0.98, 0.96)
    amb.groundColor = new Color3(0.45, 0.45, 0.50)

    // Auto-rotate
    scene.registerBeforeRender(() => { cam.alpha += 0.004 })

    engineRef.current = engine; sceneRef.current = scene
    engine.runRenderLoop(() => scene.render())
    const resize = () => engine.resize()
    window.addEventListener('resize', resize)
    return () => { window.removeEventListener('resize', resize); engine.dispose() }
  }, [])

  // Rebuild avatar when config changes
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    if (partsRef.current) partsRef.current.root.dispose(false, true)
    partsRef.current = createAvatarMesh(scene, cfg)
  }, [cfg])

  const update = useCallback(<K extends keyof AvatarConfig>(key: K, val: AvatarConfig[K]) => {
    setCfg(prev => ({ ...prev, [key]: val }))
  }, [])

  const handleSave = useCallback(() => {
    saveAvatarConfig(cfg)
    onSave(cfg)
  }, [cfg, onSave])

  const handleReset = useCallback(() => {
    setCfg({ ...DEFAULT_AVATAR })
  }, [])

  return (
    <div className="ab-root">
      <div className="ab-topbar">
        <button className="ab-exit" onClick={onExit}>EXIT</button>
        <span className="ab-title">Build Your Avatar</span>
        <button className="ab-reset" onClick={handleReset}>RESET</button>
        <button className="ab-save" onClick={handleSave}>SAVE</button>
      </div>

      <div className="ab-layout">
        <div className="ab-preview">
          <canvas ref={cvRef} className="ab-canvas" />
        </div>

        <div className="ab-options">
          <Section label="Skin Color">
            <ColorRow colors={SKIN_COLORS} selected={cfg.skinColor}
              onPick={c => update('skinColor', c)} />
          </Section>

          <Section label="Hair Style">
            <StyleRow options={HAIR_STYLES} selected={cfg.hairStyle}
              onPick={s => update('hairStyle', s as AvatarConfig['hairStyle'])} />
          </Section>

          <Section label="Hair Color">
            <ColorRow colors={HAIR_COLORS} selected={cfg.hairColor}
              onPick={c => update('hairColor', c)} />
          </Section>

          <Section label="Shirt Style">
            <StyleRow options={SHIRT_STYLES} selected={cfg.shirtStyle}
              onPick={s => update('shirtStyle', s as AvatarConfig['shirtStyle'])} />
          </Section>

          <Section label="Shirt Color">
            <ColorRow colors={SHIRT_COLORS} selected={cfg.shirtColor}
              onPick={c => update('shirtColor', c)} />
          </Section>

          <Section label="Pants Style">
            <StyleRow options={PANTS_STYLES} selected={cfg.pantsStyle}
              onPick={s => update('pantsStyle', s as AvatarConfig['pantsStyle'])} />
          </Section>

          <Section label="Pants Color">
            <ColorRow colors={PANTS_COLORS} selected={cfg.pantsColor}
              onPick={c => update('pantsColor', c)} />
          </Section>

          <Section label="Shoe Color">
            <ColorRow colors={SHOE_COLORS} selected={cfg.shoeColor}
              onPick={c => update('shoeColor', c)} />
          </Section>
        </div>
      </div>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="ab-section">
      <div className="ab-section-label">{label}</div>
      {children}
    </div>
  )
}

function ColorRow({ colors, selected, onPick }: { colors: string[]; selected: string; onPick: (c: string) => void }) {
  return (
    <div className="ab-color-row">
      {colors.map(c => (
        <button key={c} className={`ab-swatch ${c === selected ? 'active' : ''}`}
          style={{ background: c }} onClick={() => onPick(c)} />
      ))}
    </div>
  )
}

function StyleRow({ options, selected, onPick }: { options: string[]; selected: string; onPick: (s: string) => void }) {
  return (
    <div className="ab-style-row">
      {options.map(s => (
        <button key={s} className={`ab-style-btn ${s === selected ? 'active' : ''}`}
          onClick={() => onPick(s)}>
          {STYLE_LABELS[s] ?? s}
        </button>
      ))}
    </div>
  )
}

import {
  Scene, MeshBuilder, StandardMaterial, Color3, Vector3, TransformNode, Mesh,
} from '@babylonjs/core'
import type { AvatarConfig } from '../world/avatarTypes'

export interface AvatarParts {
  root: TransformNode
  leftArm: Mesh
  rightArm: Mesh
  leftLeg: Mesh
  rightLeg: Mesh
}

const HEAD_S  = 0.30
const BODY_W  = 0.36, BODY_H = 0.42, BODY_D = 0.20
const ARM_W   = 0.11, ARM_H  = 0.38, ARM_D  = 0.11
const LEG_W   = 0.13, LEG_H  = 0.38, LEG_D  = 0.13
const SHOE_W  = 0.14, SHOE_H = 0.07, SHOE_D = 0.18
const NECK_GAP = 0.02

const SHOE_BOT = 0
const SHOE_TOP = SHOE_BOT + SHOE_H
const LEG_TOP  = SHOE_TOP + LEG_H
const BODY_BOT = LEG_TOP
const BODY_TOP = BODY_BOT + BODY_H
const HEAD_BOT = BODY_TOP + NECK_GAP
const HEAD_TOP = HEAD_BOT + HEAD_S

function flat(hex: string, scene: Scene): StandardMaterial {
  const m = new StandardMaterial('av_' + Math.random(), scene)
  m.disableLighting = true
  m.emissiveColor = Color3.FromHexString(hex)
  m.diffuseColor = Color3.Black(); m.specularColor = Color3.Black()
  return m
}

function lit(hex: string, scene: Scene): StandardMaterial {
  const m = new StandardMaterial('av_' + Math.random(), scene)
  m.diffuseColor = Color3.FromHexString(hex)
  m.emissiveColor = Color3.FromHexString(hex).scale(0.18)
  m.specularColor = new Color3(0.04, 0.04, 0.04)
  return m
}

export function createAvatarMesh(scene: Scene, cfg: AvatarConfig): AvatarParts {
  const root = new TransformNode('avatarRoot', scene)

  const skinMat  = flat(cfg.skinColor, scene)
  const shirtMat = lit(cfg.shirtColor, scene)
  const pantsMat = lit(cfg.pantsColor, scene)
  const shoeMat  = lit(cfg.shoeColor, scene)
  const hairMat  = flat(cfg.hairColor, scene)

  // ── Head ──────────────────────────────────────────────────────
  const head = MeshBuilder.CreateBox('avHead', { width: HEAD_S, height: HEAD_S, depth: HEAD_S * 0.9 }, scene)
  head.position.set(0, HEAD_BOT + HEAD_S / 2, 0); head.material = skinMat; head.parent = root

  // Eyes
  const eyeMat = flat('#1A1A1A', scene)
  for (const ex of [-0.07, 0.07]) {
    const eye = MeshBuilder.CreateBox('avEye', { width: 0.04, height: 0.04, depth: 0.02 }, scene)
    eye.position.set(ex, HEAD_BOT + HEAD_S * 0.58, -HEAD_S * 0.45); eye.material = eyeMat; eye.parent = root
  }
  // Mouth
  const mouth = MeshBuilder.CreateBox('avMouth', { width: 0.08, height: 0.02, depth: 0.02 }, scene)
  mouth.position.set(0, HEAD_BOT + HEAD_S * 0.3, -HEAD_S * 0.45)
  mouth.material = flat('#8B3A3A', scene); mouth.parent = root

  // ── Hair ──────────────────────────────────────────────────────
  buildHair(scene, root, cfg.hairStyle, hairMat)

  // ── Torso ─────────────────────────────────────────────────────
  const torsoW = cfg.shirtStyle === 'hoodie' ? BODY_W + 0.04 : BODY_W
  const torso = MeshBuilder.CreateBox('avBody', { width: torsoW, height: BODY_H, depth: BODY_D }, scene)
  torso.position.set(0, BODY_BOT + BODY_H / 2, 0); torso.material = shirtMat; torso.parent = root

  // Collar detail for polo
  if (cfg.shirtStyle === 'polo') {
    const collar = MeshBuilder.CreateBox('avCollar', { width: 0.18, height: 0.04, depth: BODY_D + 0.04 }, scene)
    collar.position.set(0, BODY_TOP - 0.02, 0); collar.material = skinMat; collar.parent = root
  }
  // Hood for hoodie
  if (cfg.shirtStyle === 'hoodie') {
    const hood = MeshBuilder.CreateBox('avHood', { width: HEAD_S + 0.06, height: 0.12, depth: HEAD_S * 0.5 }, scene)
    hood.position.set(0, HEAD_BOT + HEAD_S + 0.02, HEAD_S * 0.2); hood.material = shirtMat; hood.parent = root
  }
  // Tank top straps
  if (cfg.shirtStyle === 'tank') {
    for (const sx of [-0.10, 0.10]) {
      const strap = MeshBuilder.CreateBox('avStrap', { width: 0.05, height: 0.08, depth: BODY_D + 0.02 }, scene)
      strap.position.set(sx, BODY_TOP + 0.02, 0); strap.material = shirtMat; strap.parent = root
    }
  }

  // ── Arms ──────────────────────────────────────────────────────
  const shoulderY = BODY_TOP - 0.04
  const armMat = cfg.shirtStyle === 'tank' ? skinMat : shirtMat

  const leftArm = MeshBuilder.CreateBox('avLArm', { width: ARM_W, height: ARM_H, depth: ARM_D }, scene)
  leftArm.setPivotPoint(new Vector3(0, ARM_H / 2, 0))
  leftArm.position.set(-BODY_W / 2 - ARM_W / 2, shoulderY, 0)
  leftArm.material = armMat; leftArm.parent = root

  const rightArm = MeshBuilder.CreateBox('avRArm', { width: ARM_W, height: ARM_H, depth: ARM_D }, scene)
  rightArm.setPivotPoint(new Vector3(0, ARM_H / 2, 0))
  rightArm.position.set(BODY_W / 2 + ARM_W / 2, shoulderY, 0)
  rightArm.material = armMat; rightArm.parent = root

  // Hands (skin)
  for (const [, arm] of [[-BODY_W / 2 - ARM_W / 2, leftArm], [BODY_W / 2 + ARM_W / 2, rightArm]] as [number, Mesh][]) {
    const hand = MeshBuilder.CreateBox('avHand', { width: ARM_W + 0.02, height: 0.06, depth: ARM_D + 0.02 }, scene)
    hand.position.set(0, -ARM_H / 2 + 0.03, 0); hand.material = skinMat; hand.parent = arm
  }

  // ── Legs ──────────────────────────────────────────────────────
  const legTopY = LEG_TOP
  const legSpacing = 0.08

  const leftLeg = MeshBuilder.CreateBox('avLLeg', { width: LEG_W, height: LEG_H, depth: LEG_D }, scene)
  leftLeg.setPivotPoint(new Vector3(0, LEG_H / 2, 0))
  leftLeg.position.set(-legSpacing, legTopY, 0)
  leftLeg.material = pantsMat; leftLeg.parent = root

  const rightLeg = MeshBuilder.CreateBox('avRLeg', { width: LEG_W, height: LEG_H, depth: LEG_D }, scene)
  rightLeg.setPivotPoint(new Vector3(0, LEG_H / 2, 0))
  rightLeg.position.set(legSpacing, legTopY, 0)
  rightLeg.material = pantsMat; rightLeg.parent = root

  // Shorts: show skin below knee
  if (cfg.pantsStyle === 'shorts') {
    const skinLeg = flat(cfg.skinColor, scene)
    for (const leg of [leftLeg, rightLeg]) {
      const shin = MeshBuilder.CreateBox('avShin', { width: LEG_W + 0.01, height: LEG_H * 0.45, depth: LEG_D + 0.01 }, scene)
      shin.position.set(0, -LEG_H * 0.28, 0); shin.material = skinLeg; shin.parent = leg
    }
  }
  // Skirt overlay
  if (cfg.pantsStyle === 'skirt') {
    const skirt = MeshBuilder.CreateCylinder('avSkirt',
      { height: 0.22, diameterTop: BODY_W - 0.02, diameterBottom: BODY_W + 0.14, tessellation: 12 }, scene)
    skirt.position.set(0, BODY_BOT + 0.08, 0); skirt.material = pantsMat; skirt.parent = root
  }

  // ── Shoes ─────────────────────────────────────────────────────
  for (const sx of [-legSpacing, legSpacing]) {
    const shoe = MeshBuilder.CreateBox('avShoe', { width: SHOE_W, height: SHOE_H, depth: SHOE_D }, scene)
    shoe.position.set(sx, SHOE_BOT + SHOE_H / 2, -0.02); shoe.material = shoeMat; shoe.parent = root
  }

  return { root, leftArm, rightArm, leftLeg, rightLeg }
}

function buildHair(scene: Scene, root: TransformNode, style: AvatarConfig['hairStyle'], mat: StandardMaterial): void {
  const topY = HEAD_TOP
  switch (style) {
    case 'bald': break
    case 'short': {
      const h = MeshBuilder.CreateBox('avHair', { width: HEAD_S + 0.02, height: 0.08, depth: HEAD_S * 0.9 + 0.02 }, scene)
      h.position.set(0, topY - 0.01, 0.01); h.material = mat; h.parent = root
      break
    }
    case 'long': {
      const top = MeshBuilder.CreateBox('avHairT', { width: HEAD_S + 0.02, height: 0.06, depth: HEAD_S * 0.9 + 0.02 }, scene)
      top.position.set(0, topY - 0.01, 0.01); top.material = mat; top.parent = root
      const back = MeshBuilder.CreateBox('avHairB', { width: HEAD_S - 0.02, height: 0.25, depth: 0.06 }, scene)
      back.position.set(0, HEAD_BOT + HEAD_S * 0.4, HEAD_S * 0.45 + 0.02); back.material = mat; back.parent = root
      break
    }
    case 'afro': {
      const afro = MeshBuilder.CreateSphere('avAfro', { diameter: HEAD_S + 0.16, segments: 10 }, scene)
      afro.position.set(0, HEAD_BOT + HEAD_S * 0.55, 0); afro.material = mat; afro.parent = root
      afro.scaling.y = 0.85
      break
    }
    case 'braids': {
      const cap = MeshBuilder.CreateBox('avCap', { width: HEAD_S + 0.02, height: 0.05, depth: HEAD_S * 0.9 + 0.02 }, scene)
      cap.position.set(0, topY - 0.01, 0.01); cap.material = mat; cap.parent = root
      for (let b = 0; b < 5; b++) {
        const braid = MeshBuilder.CreateCylinder('avBraid' + b,
          { height: 0.28, diameter: 0.04, tessellation: 6 }, scene)
        braid.position.set(-0.10 + b * 0.05, HEAD_BOT + HEAD_S * 0.25, HEAD_S * 0.45 + 0.02)
        braid.material = mat; braid.parent = root
      }
      break
    }
    case 'mohawk': {
      const mohawk = MeshBuilder.CreateBox('avMohawk', { width: 0.06, height: 0.18, depth: HEAD_S * 0.7 }, scene)
      mohawk.position.set(0, topY + 0.06, 0); mohawk.material = mat; mohawk.parent = root
      break
    }
  }
}

import './HUD.css'

interface Props {
  district: string
}

export default function HUD({ district }: Props) {
  return (
    <>
      <div className="district-tag">{district}</div>
      <div className="controls-hint">
        <span>Left drag <b>pan</b></span>
        <span>Right drag <b>orbit</b></span>
        <span>Scroll <b>zoom</b></span>
        <span>WASD <b>walk</b></span>
        <span>Click building <b>info</b></span>
      </div>
    </>
  )
}

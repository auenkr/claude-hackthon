import * as THREE from 'three'
import { usePartState, useExhibit } from '../exhibit-context'

/**
 * Painted metal.
 *
 * The museum's `Mat` is the material everything else uses, and it carries the
 * selection, dimming and x-ray behaviour every exhibit shares. Skinned
 * surfaces need one thing it does not offer — a map — so this repeats that
 * behaviour rather than replacing it: same highlight, same x-ray, same
 * double-sided lofts, with the livery laid over the top.
 */
export function Skin({
  map,
  color = '#ffffff',
  metalness = 0.72,
  roughness = 0.38,
  opacity = 1,
}: {
  map: THREE.Texture
  color?: string
  metalness?: number
  roughness?: number
  opacity?: number
}) {
  const state = usePartState()
  const { accent, xray } = useExhibit()

  const highlight = state === 'selected' || state === 'hover'
  const dimmed = state === 'dimmed'

  let alpha = opacity
  if (xray) alpha = Math.min(alpha, 0.28)
  if (dimmed) alpha = Math.min(alpha, xray ? 0.1 : 0.16)

  return (
    <meshStandardMaterial
      map={map}
      color={color}
      metalness={metalness}
      roughness={roughness}
      emissive={highlight ? accent : '#000000'}
      emissiveIntensity={state === 'selected' ? 0.55 : state === 'hover' ? 0.28 : 0}
      transparent={alpha < 1}
      opacity={alpha}
      depthWrite={alpha > 0.7}
      side={THREE.DoubleSide}
    />
  )
}

import * as THREE from 'three'
import { usePartState, useExhibit } from '../exhibit-context'

/**
 * `Part`'s material, with the paint on.
 *
 * The museum's shared `Mat` takes a single colour, which is right for a
 * bronze casting and wrong for a vehicle that spent a winter being shot at.
 * This is the same highlight, dim and x-ray behaviour, reading the vertex
 * colours `paint()` baked into the geometry instead.
 */
export function Skin({
  colour = '#ffffff',
  metalness = 0.55,
  roughness = 0.7,
  opacity = 1,
  flat = false,
  vertexColors = true,
  side,
}: {
  colour?: string
  metalness?: number
  roughness?: number
  opacity?: number
  flat?: boolean
  vertexColors?: boolean
  side?: THREE.Side
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
      color={colour}
      vertexColors={vertexColors}
      metalness={metalness}
      roughness={roughness}
      emissive={highlight ? accent : '#000000'}
      emissiveIntensity={state === 'selected' ? 0.55 : state === 'hover' ? 0.28 : 0}
      transparent={alpha < 1}
      opacity={alpha}
      depthWrite={alpha > 0.7}
      flatShading={flat}
      side={side ?? THREE.DoubleSide}
    />
  )
}

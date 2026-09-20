import { useMemo, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import {
  ExhibitCtx,
  PartCtx,
  useExhibit,
  usePartState,
  type ExhibitState,
  type PartState,
} from './exhibit-context'

export function ExhibitProvider({
  value,
  children,
}: {
  value: ExhibitState
  children: ReactNode
}) {
  return <ExhibitCtx.Provider value={value}>{children}</ExhibitCtx.Provider>
}

/**
 * Wraps the meshes of one catalogued component. Handles picking, the
 * highlight state its materials read, and the explode offset.
 */
export function Part({
  id,
  children,
  position = [0, 0, 0],
  mirror = false,
}: {
  id: string
  children: ReactNode
  position?: [number, number, number]
  /**
   * For the port-side copy of a paired component. Paired parts share one
   * catalogue entry, so the left one explodes outward by negating the
   * spec's sideways travel rather than duplicating the data.
   */
  mirror?: boolean
}) {
  const exhibit = useExhibit()
  const group = useRef<THREE.Group>(null)
  const spec = exhibit.parts[id]

  const state: PartState =
    exhibit.selected === id
      ? 'selected'
      : exhibit.hovered === id
        ? 'hover'
        : exhibit.selected
          ? 'dimmed'
          : 'idle'

  const base = useMemo(() => new THREE.Vector3(...position), [position])
  const dir = useMemo(() => {
    const [x, y, z] = spec?.explode ?? [0, 0, 0]
    return new THREE.Vector3(mirror ? -x : x, y, z)
  }, [spec, mirror])
  const goal = useRef(new THREE.Vector3())

  useFrame((_, dt) => {
    if (!group.current) return
    goal.current.copy(dir).multiplyScalar(exhibit.explode).add(base)
    // Critically damped-ish ease so parts glide apart rather than snap.
    group.current.position.lerp(goal.current, 1 - Math.exp(-6 * dt))
  })

  return (
    <group
      ref={group}
      position={position}
      onPointerOver={(e) => {
        e.stopPropagation()
        exhibit.hover(id)
      }}
      onPointerOut={(e) => {
        e.stopPropagation()
        exhibit.hover(null)
      }}
      onClick={(e) => {
        e.stopPropagation()
        exhibit.select(exhibit.selected === id ? null : id)
      }}
    >
      <PartCtx.Provider value={state}>{children}</PartCtx.Provider>
    </group>
  )
}

export interface MatProps {
  color?: string
  metalness?: number
  roughness?: number
  /** Opt out of x-ray fade, e.g. for glazing that is already transparent. */
  opacity?: number
  flat?: boolean
  side?: THREE.Side
}

/**
 * The only material used in the museum. It reads its part's highlight state
 * so selection reads consistently across every exhibit.
 */
export function Mat({
  color = '#8a8f98',
  metalness = 0.65,
  roughness = 0.45,
  opacity = 1,
  flat = false,
  side,
}: MatProps) {
  const state = usePartState()
  const { accent, xray } = useExhibit()

  const highlight = state === 'selected' || state === 'hover'
  const dimmed = state === 'dimmed'

  let alpha = opacity
  if (xray) alpha = Math.min(alpha, 0.28)
  if (dimmed) alpha = Math.min(alpha, xray ? 0.1 : 0.16)

  return (
    <meshStandardMaterial
      color={color}
      metalness={metalness}
      roughness={roughness}
      emissive={highlight ? accent : '#000000'}
      emissiveIntensity={state === 'selected' ? 0.55 : state === 'hover' ? 0.28 : 0}
      transparent={alpha < 1}
      opacity={alpha}
      depthWrite={alpha > 0.7}
      flatShading={flat}
      // Lofted surfaces are skinned from cross-sections and can end up wound
      // either way; double-siding keeps every exhibit shading correctly.
      side={side ?? THREE.DoubleSide}
    />
  )
}

import { Suspense, useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, TrackballControls } from '@react-three/drei'
import * as THREE from 'three'
import { Gallery } from './Gallery'
import { ExhibitProvider } from './Part'
import { Machine } from './Machine'
import type { Controls, MachineSpec } from '../types'

/**
 * A machine on its plinth, wired to the page's interaction state.
 * The canvas owns nothing: selection and control values live in the page
 * so the placards beside it stay in step.
 */
export function Exhibit({
  machine,
  controls,
  selected,
  onSelect,
  explode,
  xray,
  autoRotate,
  focusedView,
}: {
  machine: MachineSpec
  controls: Controls
  selected: string | null
  onSelect: (id: string | null) => void
  explode: number
  xray: boolean
  autoRotate: boolean
  focusedView: boolean
}) {
  const [hovered, setHovered] = useState<string | null>(null)

  const parts = useMemo(
    () => Object.fromEntries(machine.parts.map((p) => [p.id, p])),
    [machine],
  )

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: machine.camera, fov: 38, near: 0.1, far: 400 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      onPointerMissed={() => onSelect(null)}
      style={{ cursor: hovered ? 'pointer' : 'grab' }}
    >
      <Suspense fallback={null}>
        <Gallery
          accent={machine.accent}
          radius={machine.radius}
          floor={!focusedView && explode === 0}
        >
          <ExhibitProvider
            value={{
              selected,
              hovered,
              explode,
              xray,
              accent: machine.accent,
              parts,
              select: onSelect,
              hover: setHovered,
            }}
          >
            <Machine machine={machine} controls={controls} />
          </ExhibitProvider>
        </Gallery>
      </Suspense>

      {focusedView ? (
        <TrackballControls
          makeDefault
          target={new THREE.Vector3(...machine.target)}
          minDistance={machine.radius * 0.45}
          maxDistance={machine.radius * 5}
          dynamicDampingFactor={0.06}
        />
      ) : (
        <OrbitControls
          makeDefault
          target={new THREE.Vector3(...machine.target)}
          enablePan
          minDistance={machine.radius * 0.45}
          maxDistance={machine.radius * 5}
          maxPolarAngle={Math.PI}
          autoRotate={autoRotate}
          autoRotateSpeed={0.5}
          enableDamping
          dampingFactor={0.06}
        />
      )}
    </Canvas>
  )
}

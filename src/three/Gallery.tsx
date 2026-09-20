import { Environment, Lightformer } from '@react-three/drei'
import type { ReactNode } from 'react'
import * as THREE from 'three'

/**
 * The room every exhibit stands in: one hard spotlight from above, cool
 * fill from the sides, and a dark floor that takes a shadow. Deliberately
 * theatrical — a machine behind glass in a bright room reads as an object,
 * not as a mechanism.
 */
export function Gallery({
  accent,
  children,
  floor = true,
  radius = 7,
}: {
  accent: string
  children: ReactNode
  floor?: boolean
  radius?: number
}) {
  return (
    <>
      <color attach="background" args={['#07070a']} />
      <fog attach="fog" args={['#07070a', radius * 2.2, radius * 6]} />

      <ambientLight intensity={0.35} />
      <hemisphereLight args={['#5b6472', '#0b0b0f', 0.7]} />

      {/* The museum spotlight. */}
      <spotLight
        position={[radius * 0.5, radius * 2.1, radius * 0.7]}
        angle={0.52}
        penumbra={0.75}
        intensity={radius * radius * 1.5}
        distance={radius * 8}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0006}
      />
      {/* Cool rim from behind, so silhouettes separate from the dark. */}
      <directionalLight position={[-radius, radius * 0.8, -radius]} intensity={1.1} color="#8ea6c8" />
      <directionalLight position={[radius * 0.6, 0.6, -radius]} intensity={0.55} color={accent} />
      <pointLight position={[0, 0.4, radius]} intensity={radius * 1.6} color="#ffffff" distance={radius * 3} />

      {/* Procedural environment: gives the metalwork something to reflect
          without fetching an HDRI. */}
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={2.4} position={[0, 6, 2]} scale={[10, 6, 1]} rotation={[-Math.PI / 2, 0, 0]} color="#d8e2f0" />
        <Lightformer form="rect" intensity={0.8} position={[-6, 1, -4]} scale={[8, 5, 1]} rotation={[0, Math.PI / 3, 0]} color="#7d8ba0" />
        <Lightformer form="rect" intensity={0.6} position={[6, 1, -3]} scale={[8, 5, 1]} rotation={[0, -Math.PI / 3, 0]} color={accent} />
        <Lightformer form="ring" intensity={0.5} position={[0, -4, 0]} scale={12} rotation={[Math.PI / 2, 0, 0]} color="#1a1c22" />
      </Environment>

      {floor && <Plinth radius={radius} accent={accent} />}

      {children}
    </>
  )
}

/** The floor: matte, with a faint lit ellipse under the machine. */
function Plinth({ radius, accent }: { radius: number; accent: string }) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]} receiveShadow>
        <circleGeometry args={[radius * 3.2, 64]} />
        <meshStandardMaterial color="#0b0b0f" metalness={0.15} roughness={0.9} />
      </mesh>
      {/* Pool of light, faked so it survives any lighting budget. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <circleGeometry args={[radius * 1.25, 64]} />
        <meshBasicMaterial
          color={accent}
          transparent
          opacity={0.05}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      {/* Datum ring: a one-metre grid the visitor can measure against. */}
      {[1, 2, 3, 4, 5, 6, 7].map((r) =>
        r * 1 < radius * 1.5 ? (
          <mesh key={r} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
            <ringGeometry args={[r - 0.008, r, 96]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={r % 5 === 0 ? 0.07 : 0.028} depthWrite={false} />
          </mesh>
        ) : null,
      )}
    </group>
  )
}

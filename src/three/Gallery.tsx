import { Environment, Lightformer } from '@react-three/drei'
import type { ReactNode } from 'react'

/**
 * The room every exhibit stands in: a daylit hall with one directed light
 * from above, plaster walls, and a pale floor that takes a shadow. The
 * shadow is the point — it tells you the machine is really standing there.
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
      <color attach="background" args={['#eceae5']} />
      <fog attach="fog" args={['#eceae5', radius * 2.6, radius * 8]} />

      <ambientLight intensity={0.85} />
      <hemisphereLight args={['#ffffff', '#cfcabf', 1.05]} />

      {/* The museum spotlight — still the only light that casts. */}
      <spotLight
        position={[radius * 0.5, radius * 2.1, radius * 0.7]}
        angle={0.52}
        penumbra={0.75}
        intensity={radius * radius * 1.1}
        distance={radius * 8}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0006}
      />
      {/* Window light from the far wall, and a faint accent wash. */}
      <directionalLight position={[-radius, radius * 0.8, -radius]} intensity={1.35} color="#e8efff" />
      <directionalLight position={[radius * 0.6, 0.6, -radius]} intensity={0.4} color={accent} />
      <pointLight position={[0, 0.4, radius]} intensity={radius * 1.1} color="#ffffff" distance={radius * 3} />

      {/* Procedural environment: gives the metalwork something to reflect
          without fetching an HDRI. */}
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={3} position={[0, 6, 2]} scale={[10, 6, 1]} rotation={[-Math.PI / 2, 0, 0]} color="#ffffff" />
        <Lightformer form="rect" intensity={1.6} position={[-6, 1, -4]} scale={[8, 5, 1]} rotation={[0, Math.PI / 3, 0]} color="#e6ebf4" />
        <Lightformer form="rect" intensity={1} position={[6, 1, -3]} scale={[8, 5, 1]} rotation={[0, -Math.PI / 3, 0]} color={accent} />
        <Lightformer form="ring" intensity={1.2} position={[0, -4, 0]} scale={12} rotation={[Math.PI / 2, 0, 0]} color="#d8d3c8" />
      </Environment>

      {floor && <Plinth radius={radius} accent={accent} />}

      {children}
    </>
  )
}

/** The floor: pale poured concrete, with a faint accent wash under the machine. */
function Plinth({ radius, accent }: { radius: number; accent: string }) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]} receiveShadow>
        <circleGeometry args={[radius * 3.2, 64]} />
        <meshStandardMaterial color="#e4e0d8" metalness={0.05} roughness={0.92} />
      </mesh>
      {/* Pool of colour, faked so it survives any lighting budget. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <circleGeometry args={[radius * 1.25, 64]} />
        <meshBasicMaterial color={accent} transparent opacity={0.09} depthWrite={false} />
      </mesh>
      {/* Datum ring: a one-metre grid the visitor can measure against. */}
      {[1, 2, 3, 4, 5, 6, 7].map((r) =>
        r * 1 < radius * 1.5 ? (
          <mesh key={r} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
            <ringGeometry args={[r - 0.008, r, 96]} />
            <meshBasicMaterial color="#5c5850" transparent opacity={r % 5 === 0 ? 0.22 : 0.1} depthWrite={false} />
          </mesh>
        ) : null,
      )}
    </group>
  )
}

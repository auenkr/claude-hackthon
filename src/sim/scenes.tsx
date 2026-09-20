import { Ground, Scatter, Sun } from './Scenery'
import { killDevil, airfield, RUNWAY, range } from './terrain'
import type { FlyerSim } from './flyer'
import type { P51Sim } from './p51'
import type { T34Sim } from './t34'

/**
 * The three exercise grounds, one per exhibit. Each pairs a `Field` from
 * `terrain.ts` with the furniture from `Scenery.tsx` and whatever else the
 * place needs — a launch rail, a runway edge, a scatter of hulks — and keeps
 * the sun tracking the machine so its shadow never drifts off into a corner
 * of shadow-camera frustum that was sized for the ground, not for it.
 */

const RAIL: [number, number, number][] = [
  [-0.35, 0.15, 0],
  [0.35, 0.15, 0],
  [-0.35, 0.15, 18],
  [0.35, 0.15, 18],
]

export function Dunes({ sim, accent }: { sim: FlyerSim; accent: string }) {
  return (
    <>
      <color attach="background" args={[killDevil.sky]} />
      <fog attach="fog" args={[killDevil.haze, ...killDevil.fog]} />
      <Sun follow={sim.position} />
      <Ground field={killDevil} size={2400} segments={200} />
      <Scatter
        field={killDevil}
        count={140}
        spread={900}
        height={[0.6, 2.2]}
        radius={0.35}
        colour="#8b8f5e"
        keepOut={(x, z) => Math.abs(x) < 30 && z > -20 && z < 40}
      />
      {/* The launch rail the Flyer starts on. */}
      {RAIL.map((p, i) => (
        <mesh key={i} position={p}>
          <boxGeometry args={[0.06, 0.1, 0.5]} />
          <meshStandardMaterial color="#4a4436" roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[0, 0.02, 9]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.5, 18]} />
        <meshStandardMaterial color="#5c5544" roughness={0.95} />
      </mesh>
      <pointLight position={[0, 3, -10]} intensity={0} />
      <mesh position={[0, 0, -10]} visible={false}>
        <meshBasicMaterial color={accent} />
      </mesh>
    </>
  )
}

export function Airfield({ sim, accent }: { sim: P51Sim; accent: string }) {
  return (
    <>
      <color attach="background" args={[airfield.sky]} />
      <fog attach="fog" args={[airfield.haze, ...airfield.fog]} />
      <Sun follow={sim.position} extent={90} />
      <Ground field={airfield} size={4800} segments={220} />
      <Scatter
        field={airfield}
        count={220}
        spread={1600}
        height={[3, 9]}
        radius={0.9}
        colour="#5c6b3c"
        keepOut={(x, z) =>
          Math.abs(x) < RUNWAY.halfWidth + 40 && Math.abs(z) < RUNWAY.length / 2 + 40
        }
      />
      {/* Runway edge lighting, sparse enough not to be a wall of dots. */}
      {Array.from({ length: 24 }, (_, i) => {
        const z = -RUNWAY.length / 2 + (i * RUNWAY.length) / 23
        return [1, -1].map((side) => (
          <mesh key={`${i}-${side}`} position={[side * (RUNWAY.halfWidth + 1.5), 0.15, z]}>
            <boxGeometry args={[0.2, 0.3, 0.2]} />
            <meshStandardMaterial
              color={accent}
              emissive={accent}
              emissiveIntensity={0.5}
            />
          </mesh>
        ))
      })}
    </>
  )
}

export function Range({ sim }: { sim: T34Sim }) {
  return (
    <>
      <color attach="background" args={[range.sky]} />
      <fog attach="fog" args={[range.haze, ...range.fog]} />
      <Sun follow={sim.position} colour="#e7e3d6" extent={110} />
      <Ground field={range} size={3600} segments={200} />
      <Scatter
        field={range}
        count={90}
        spread={1500}
        height={[1.5, 4]}
        radius={0.5}
        colour="#6b6f4a"
      />
      {/* Hulks and the crossing lorry, as static or moving low-poly marks. */}
      {sim.targets.map((t, i) => (
        <mesh
          key={i}
          position={[t.x, range.height(t.x, t.z) + 0.5, t.z]}
          visible={!t.dead}
        >
          <boxGeometry args={[t.span > 0 ? 2.2 : 2.8, 1, t.span > 0 ? 1.6 : 1.9]} />
          <meshStandardMaterial
            color={t.dead ? '#2b2b28' : '#4c4a3e'}
            roughness={0.85}
            metalness={0.15}
          />
        </mesh>
      ))}
    </>
  )
}

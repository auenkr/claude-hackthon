import { useMemo } from 'react'
import { Ground, Scatter, Sun } from '../Scenery'
import {
  circuit,
  circuitGeometry,
  nearestOnTrack,
  START_INDEX,
  TRACK,
  TRACK_LINE,
} from '../fields/circuit'
import type { Lotus49Sim } from '../lotus49'

/**
 * The circuit in the dunes: the ribbon of tarmac read off the same centreline
 * the physics uses, a start gantry, a pit wall, and marker boards so every
 * corner has an apex to aim at.
 */

/** Nothing grows on the circuit or its run-off. Module-level so Scatter's memo holds. */
const offCircuit = (x: number, z: number) => nearestOnTrack(x, z).dist < 28

export function Circuit({ sim, accent }: { sim: Lotus49Sim; accent: string }) {
  const ribbon = useMemo(() => circuitGeometry(), [])
  const start = TRACK_LINE[START_INDEX]
  // Perpendicular to the straight, for the gantry and the pit wall.
  const nx = start.tz
  const nz = -start.tx
  const gantryW = TRACK.halfWidth + TRACK.kerb + 1.2

  return (
    <>
      <color attach="background" args={[circuit.sky]} />
      <fog attach="fog" args={[circuit.haze, ...circuit.fog]} />
      <Sun follow={sim.position} extent={45} />
      <Ground field={circuit} size={1900} segments={150} />
      <mesh geometry={ribbon} receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.92} metalness={0} />
      </mesh>
      <Scatter
        field={circuit}
        count={320}
        spread={820}
        height={[3, 8]}
        radius={1}
        colour="#526b3c"
        keepOut={offCircuit}
      />

      {/* Start gantry: two posts and a beam across the line. */}
      {[1, -1].map((side) => (
        <mesh
          key={side}
          position={[start.x + nx * gantryW * side, 3, start.z + nz * gantryW * side]}
          castShadow
        >
          <boxGeometry args={[0.25, 6, 0.25]} />
          <meshStandardMaterial color="#d9d7cf" roughness={0.7} />
        </mesh>
      ))}
      <mesh
        position={[start.x, 6, start.z]}
        rotation={[0, Math.atan2(nx, nz), 0]}
        castShadow
      >
        <boxGeometry args={[0.3, 0.6, gantryW * 2 + 0.25]} />
        <meshStandardMaterial color={accent} roughness={0.6} />
      </mesh>

      {/* Pit wall and a low grandstand along the left of the straight. */}
      <mesh
        position={[start.x - nx * (gantryW + 1.5), 0.55, start.z]}
        rotation={[0, Math.atan2(start.tx, start.tz), 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[0.4, 1.1, 90]} />
        <meshStandardMaterial color="#c9c5bb" roughness={0.9} />
      </mesh>
      <mesh
        position={[start.x - nx * (gantryW + 14), 3.2, start.z]}
        rotation={[0, Math.atan2(start.tx, start.tz), 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[12, 6.4, 70]} />
        <meshStandardMaterial color="#8b857a" roughness={0.95} />
      </mesh>

      {/* Marker boards on the outside of every corner, so the apex has a place. */}
      {TRACK_LINE.filter((_, i) => i % 40 === 0).map((p, i) => (
        <mesh
          key={i}
          position={[p.x + p.tz * (TRACK.halfWidth + 4), 0.6, p.z - p.tx * (TRACK.halfWidth + 4)]}
          castShadow
        >
          <boxGeometry args={[0.9, 1.2, 0.08]} />
          <meshStandardMaterial color={i % 2 ? '#e9e7df' : accent} roughness={0.8} />
        </mesh>
      ))}
    </>
  )
}

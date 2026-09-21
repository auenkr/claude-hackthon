import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Ground, Scatter, Sun } from '../Scenery'
// Explicit extension: on a case-insensitive filesystem '../Fx' resolves to
// the particle buffer in 'fx.ts' rather than the component in 'Fx.tsx'.
import { Fx } from '../Fx.tsx'
import { circuit, circuitGeometry, START_INDEX, TRACK, TRACK_LINE } from '../fields/circuit'
import { offCircuit } from '../lotus49/furniture'
import { armcoBody, boardBody, pitWallBody, postBody, standBody, tyreStackBody } from '../lotus49/props'
import type { Obstacle } from '../obstacles'
import type { Lotus49Sim } from '../lotus49'

/**
 * The circuit in the dunes: the ribbon of tarmac read off the same
 * centreline the physics uses, and everything beside it read off the
 * simulation's obstacle list — so if a barrier is drawn, it is solid, and a
 * marker board that has been hit lies down because its own clock says so.
 */
export function Circuit({ sim, accent }: { sim: Lotus49Sim; accent: string }) {
  const ribbon = useMemo(() => circuitGeometry(), [])
  const by = useMemo(() => {
    const map: Record<string, Obstacle[]> = {}
    for (const o of sim.obstacles.list) (map[o.kind] ??= []).push(o)
    return map
  }, [sim])

  const geo = useMemo(
    () => ({
      armco: armcoBody(),
      tyres: tyreStackBody(),
      board: boardBody(),
      post: postBody(),
      pitwall: pitWallBody(),
      stand: standBody(),
    }),
    [],
  )
  const accentColour = useMemo(() => new THREE.Color(accent), [accent])

  const start = TRACK_LINE[START_INDEX]
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

      <Props items={by.armco} geometry={geo.armco} pose={poseUpright} metalness={0.6} roughness={0.5} />
      <Props items={by.tyres} geometry={geo.tyres} pose={poseUpright} roughness={0.95} />
      <Props items={by.board} geometry={geo.board} pose={poseBoard(accentColour)} />
      <Props items={by.post} geometry={geo.post} pose={poseUpright} />
      <Props items={by.pitwall} geometry={geo.pitwall} pose={poseUpright} />
      <Props items={by.stand} geometry={geo.stand} pose={poseUpright} />

      {/* The gantry beam, which nothing can reach: cosmetic. */}
      <mesh position={[start.x, 6, start.z]} rotation={[0, Math.atan2(nx, nz), 0]} castShadow>
        <boxGeometry args={[0.3, 0.6, gantryW * 2 + 0.25]} />
        <meshStandardMaterial color={accent} roughness={0.6} />
      </mesh>

      <Fx effects={sim.fx} haze={circuit.haze} />
    </>
  )
}

// --- Drawing the obstacle list ----------------------------------------------

type Pose = (o: Obstacle, d: THREE.Object3D, tint: THREE.Color) => void

/**
 * One instanced mesh per kind of thing. The per-instance colour multiplies
 * over the geometry's own paint, which is how a board turns accent-coloured
 * and a wreck goes dark.
 */
function Props({
  items,
  geometry,
  pose,
  roughness = 0.9,
  metalness = 0.1,
}: {
  items: Obstacle[] | undefined
  geometry: THREE.BufferGeometry
  pose: Pose
  roughness?: number
  metalness?: number
}) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const tint = useMemo(() => new THREE.Color(), [])
  const list = items ?? EMPTY

  useFrame(() => {
    const m = mesh.current
    if (!m) return
    for (let i = 0; i < list.length; i++) {
      tint.setRGB(1, 1, 1)
      dummy.scale.setScalar(1)
      dummy.rotation.set(0, 0, 0)
      pose(list[i], dummy, tint)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
      m.setColorAt(i, tint)
    }
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  })

  if (!list.length) return null
  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, undefined, list.length]}
      castShadow
      receiveShadow
      frustumCulled={false}
    >
      <meshStandardMaterial vertexColors roughness={roughness} metalness={metalness} />
    </instancedMesh>
  )
}

const EMPTY: Obstacle[] = []
const ease = (t: number) => 1 - Math.exp(-t)

/** Ground under an obstacle, since the volumes are declared at y = height/2. */
const groundOf = (o: Obstacle) => circuit.height(o.pos.x, o.pos.z)

function poseUpright(o: Obstacle, d: THREE.Object3D) {
  d.position.set(o.pos.x, groundOf(o), o.pos.z)
  d.rotation.set(0, o.yaw, 0)
}

/** A board stands until it is hit, then goes over the way the car was going. */
function poseBoard(accent: THREE.Color): Pose {
  return (o, d, tint) => {
    d.position.set(o.pos.x, groundOf(o), o.pos.z)
    d.rotation.set(0, o.yaw, 0)
    if (o.data.accent) tint.copy(accent)
    if (o.dead) {
      const t = ease(o.deadFor * 3)
      const fall = o.data.fall ?? o.yaw
      // Tip about the base, along the direction of the blow.
      d.rotation.set(Math.cos(fall - o.yaw) * t * 1.5, o.yaw, -Math.sin(fall - o.yaw) * t * 1.5)
      d.position.y += 0.02 * t
      tint.multiplyScalar(0.85)
    }
  }
}

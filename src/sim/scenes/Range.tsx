import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Ground, Scatter, Sun } from '../Scenery'
// Explicit extension: on a case-insensitive filesystem '../Fx' resolves to
// the particle buffer in 'fx.ts' rather than the component in 'Fx.tsx'.
import { Fx } from '../Fx.tsx'
import { range } from '../fields/range'
import {
  bridgeBody,
  drumBody,
  fenceBody,
  groundOf,
  hayBody,
  hulkBody,
  hulkTurret,
  hutRoof,
  hutWalls,
  lorryBody,
  saplingBody,
  treeBody,
  wallBody,
} from '../t34/props'
import type { Obstacle } from '../obstacles'
import type { T34Sim } from '../t34'

/**
 * The gunnery range: open steppe, a ridge behind, and a great deal to shoot
 * at. Everything drawn here is read straight off the simulation's obstacle
 * list, so the scene cannot drift out of step with what is solid — and a
 * thing that has been destroyed falls over because its own `deadFor` clock
 * says so, not because anything told the scene to play an animation.
 */

/** Keep the background timber off the range itself: a range needs sight lines. */
const CLEAR = (x: number, z: number) => z > -40 && z < 1450 && Math.abs(x) < 430

export function Range({ sim }: { sim: T34Sim }) {
  const by = useMemo(() => {
    const map: Record<string, Obstacle[]> = {}
    for (const o of sim.obstacles.list) (map[o.kind] ??= []).push(o)
    return map
  }, [sim])

  const geo = useMemo(
    () => ({
      hulk: hulkBody(),
      turret: hulkTurret(),
      lorry: lorryBody(),
      hutWalls: hutWalls(2.45, 3.05),
      hutRoof: hutRoof(2.45, 3.05),
      drum: drumBody(),
      hay: hayBody(2.15, 3.2),
      bridge: bridgeBody(2.6, 7.5),
      wall: wallBody(2.05, 1.15, 0.4),
      tree: treeBody(10),
      fence: fenceBody(),
      sapling: saplingBody(),
    }),
    [],
  )

  return (
    <>
      <color attach="background" args={[range.sky]} />
      <fog attach="fog" args={[range.haze, range.fog[0], range.fog[1]]} />
      <Sun follow={sim.position} colour="#f4f0e2" extent={42} />

      <Ground field={range} size={4200} segments={260} />
      <Scatter
        field={range}
        count={520}
        spread={1700}
        height={[5, 13]}
        radius={2.4}
        colour="#41573a"
        keepOut={CLEAR}
      />

      <Props items={by.hulk} geometry={geo.hulk} pose={poseHulk} metalness={0.5} />
      <Props items={by.hulk} geometry={geo.turret} pose={poseTurret} metalness={0.5} />
      <Props items={by.lorry} geometry={geo.lorry} pose={poseLorry} metalness={0.3} />
      <Props items={by.hut} geometry={geo.hutWalls} pose={poseHutWalls} />
      <Props items={by.hut} geometry={geo.hutRoof} pose={poseHutRoof} />
      <Props items={by.hay} geometry={geo.hay} pose={poseHay} />
      <Props items={by.bridge} geometry={geo.bridge} pose={poseBridge} />
      <Props items={by.drum} geometry={geo.drum} pose={poseDrum} metalness={0.45} />
      <Props items={by.wall} geometry={geo.wall} pose={poseWall} />
      <Props items={by.tree} geometry={geo.tree} pose={poseTree} />
      <Props items={by.fence} geometry={geo.fence} pose={poseFlatten} />
      <Props items={by.sapling} geometry={geo.sapling} pose={poseFlatten} />

      <Tracers sim={sim} />
      <Fx effects={sim.fx} haze={range.haze} />
    </>
  )
}

// --- Drawing the obstacle list ----------------------------------------------

type Pose = (o: Obstacle, d: THREE.Object3D, tint: THREE.Color) => void

/**
 * One instanced mesh per kind of thing. The per-instance colour is what
 * chars a wreck: the geometry's own vertex colours carry the paintwork and
 * the instance colour multiplies over them.
 */
function Props({
  items,
  geometry,
  pose,
  roughness = 0.92,
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
      <meshStandardMaterial vertexColors roughness={roughness} metalness={metalness} flatShading />
    </instancedMesh>
  )
}

const EMPTY: Obstacle[] = []

const ease = (t: number) => 1 - Math.exp(-t)
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t)

/** How black something has gone, a few seconds after it caught. */
function char(o: Obstacle, tint: THREE.Color, rate = 0.5, floor = 0.22) {
  if (!o.dead) return
  const k = 1 - (1 - floor) * clamp01(o.deadFor * rate)
  tint.setRGB(k, k * 0.96, k * 0.92)
}

function poseHulk(o: Obstacle, d: THREE.Object3D, tint: THREE.Color) {
  d.position.set(o.pos.x, groundOf(o), o.pos.z)
  d.rotation.set(0, o.yaw, 0)
  if (o.dead) {
    // It settles on its springs and leans, and goes black.
    const t = ease(o.deadFor * 1.1)
    d.position.y -= 0.12 * t
    d.rotation.z = 0.1 * t * Math.sign(Math.sin(o.data.seed * 30))
    char(o, tint, 0.35)
  }
}

function poseTurret(o: Obstacle, d: THREE.Object3D, tint: THREE.Color) {
  const base = groundOf(o)
  if (!o.dead) {
    d.position.set(o.pos.x, base + 1.5, o.pos.z)
    d.rotation.set(0, o.yaw + 0.3, 0)
    return
  }
  // Ammunition going up throws the turret off. A short, ugly parabola.
  const flight = 2.3
  const t = Math.min(o.deadFor, flight)
  const y = 1.5 + 11 * t - 4.9 * t * t
  const run = t * 3.4
  const a = o.data.fall ?? 0
  d.position.set(o.pos.x + Math.cos(a) * run, base + Math.max(0.36, y), o.pos.z + Math.sin(a) * run)
  d.rotation.set(t * 2.6 * (o.data.spin ?? 1), o.yaw + t * 1.4, t * 1.8 * (o.data.spin ?? 1))
  char(o, tint, 0.35)
}

function poseLorry(o: Obstacle, d: THREE.Object3D, tint: THREE.Color) {
  d.position.set(o.pos.x, groundOf(o), o.pos.z)
  d.rotation.set(0, o.yaw, 0)
  if (o.dead) {
    const t = ease(o.deadFor * 1.4)
    d.position.y -= 0.3 * t
    d.rotation.z = 0.26 * t
    char(o, tint, 0.5)
  }
}

function hutScale(o: Obstacle, d: THREE.Object3D) {
  const v = o.volume
  if (v.kind === 'box') d.scale.set(v.hx / 2.45, 1, v.hz / 3.05)
}

function poseHutWalls(o: Obstacle, d: THREE.Object3D, tint: THREE.Color) {
  d.position.set(o.pos.x, groundOf(o), o.pos.z)
  d.rotation.set(0, o.yaw, 0)
  hutScale(o, d)
  if (o.dead) {
    // Timber walls do not topple: they fold up into a heap.
    const t = ease(o.deadFor * 2.2)
    d.scale.y = 1 - 0.68 * t
    d.rotation.z = 0.1 * t
    char(o, tint, 0.45, 0.3)
  }
}

function poseHutRoof(o: Obstacle, d: THREE.Object3D, tint: THREE.Color) {
  d.position.set(o.pos.x, groundOf(o) + 2.0, o.pos.z)
  d.rotation.set(0, o.yaw, 0)
  hutScale(o, d)
  if (o.dead) {
    const t = ease(o.deadFor * 2.2)
    d.position.y -= 1.5 * t
    d.rotation.z = o.yaw + 0.5 * t
    d.rotation.x = 0.3 * t
    char(o, tint, 0.45, 0.28)
  }
}

function poseHay(o: Obstacle, d: THREE.Object3D, tint: THREE.Color) {
  d.position.set(o.pos.x, groundOf(o), o.pos.z)
  const v = o.volume
  if (v.kind === 'cylinder') d.scale.set(v.r / 2.15, v.h / 3.4, v.r / 2.15)
  if (o.dead) {
    // It burns down rather than falls over.
    const t = clamp01(o.deadFor / 30)
    d.scale.multiplyScalar(1 - 0.6 * t)
    char(o, tint, 0.14, 0.3)
  }
}

function poseBridge(o: Obstacle, d: THREE.Object3D, tint: THREE.Color) {
  d.position.set(o.pos.x, groundOf(o), o.pos.z)
  d.rotation.set(0, o.yaw, 0)
  if (o.dead) {
    const t = ease(o.deadFor * 1.6)
    d.position.y -= 1.9 * t
    d.rotation.x = 0.22 * t
    d.rotation.z = 0.12 * t
    char(o, tint, 0.4, 0.35)
  }
}

function poseDrum(o: Obstacle, d: THREE.Object3D, tint: THREE.Color) {
  d.position.set(o.pos.x, groundOf(o), o.pos.z)
  if (o.dead) {
    // Nothing recognisable is left of a drum that has gone up.
    const t = clamp01(o.deadFor * 3)
    d.scale.set(1 + t * 0.4, 0.12, 1 + t * 0.4)
    char(o, tint, 3, 0.18)
  }
}

function poseWall(o: Obstacle, d: THREE.Object3D, tint: THREE.Color) {
  d.position.set(o.pos.x, groundOf(o), o.pos.z)
  d.rotation.set(0, o.yaw, 0)
  if (o.dead) {
    const t = ease(o.deadFor * 2.6)
    d.scale.set(1 + 0.15 * t, 1 - 0.72 * t, 1 + 0.5 * t)
    d.rotation.z = 0.05 * t
    char(o, tint, 1.5, 0.72)
  }
}

function poseTree(o: Obstacle, d: THREE.Object3D, tint: THREE.Color) {
  d.position.set(o.pos.x, groundOf(o), o.pos.z)
  d.scale.setScalar(1)
  const h = (o.data.height ?? 9) / 10
  d.scale.set(0.85 + o.data.seed * 0.3, h, 0.85 + o.data.seed * 0.3)
  d.rotation.set(0, o.data.seed * 6, 0)
  if (o.dead) {
    // A felled tree goes over slowly and then all at once.
    const t = clamp01(o.deadFor / 2.4) ** 2
    const a = o.data.fall ?? 0
    d.rotation.x = Math.cos(a) * t * 1.52
    d.rotation.z = -Math.sin(a) * t * 1.52
    char(o, tint, 0.2, 0.7)
  }
}

/** Fences and saplings: driven over, and it shows. */
function poseFlatten(o: Obstacle, d: THREE.Object3D, tint: THREE.Color) {
  d.position.set(o.pos.x, groundOf(o), o.pos.z)
  d.rotation.set(0, o.yaw, 0)
  if (o.dead) {
    const t = clamp01(o.deadFor * 2.4)
    const a = (o.data.fall ?? 0) - o.yaw
    d.rotation.x = Math.cos(a) * t * 1.48
    d.rotation.z = -Math.sin(a) * t * 1.48
    d.position.y -= 0.1 * t
    char(o, tint, 0.6, 0.78)
  }
}

// --- Rounds in flight --------------------------------------------------------

const TRACERS = 64
const AP = new THREE.Color('#ffeaba')
const HE = new THREE.Color('#ffd28a')
const DT = new THREE.Color('#ff7a3a')
const FORWARD = new THREE.Vector3(0, 0, 1)

/** Everything that is currently in the air, as a streak along its own axis. */
function Tracers({ sim }: { sim: T34Sim }) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const dir = useMemo(() => new THREE.Vector3(), [])
  const geo = useMemo(() => new THREE.SphereGeometry(0.5, 7, 5), [])

  useFrame(() => {
    const m = mesh.current
    if (!m) return
    let n = 0
    for (const shell of sim.shells) {
      if (n >= TRACERS) break
      if (!shell.tracer) continue
      dir.copy(shell.vel).normalize()
      dummy.position.copy(shell.pos)
      dummy.quaternion.setFromUnitVectors(FORWARD, dir)
      // A round at 800 m/s reads as a streak, not a dot.
      const big = shell.kind === 'mg' ? 0.16 : 0.42
      dummy.scale.set(big, big, big * (shell.kind === 'mg' ? 26 : 12))
      dummy.updateMatrix()
      m.setMatrixAt(n, dummy.matrix)
      m.setColorAt(n, shell.kind === 'ap' ? AP : shell.kind === 'he' ? HE : DT)
      n++
    }
    m.count = n
    m.visible = n > 0
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh ref={mesh} args={[geo, undefined, TRACERS]} frustumCulled={false}>
      <meshBasicMaterial
        transparent
        opacity={0.95}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </instancedMesh>
  )
}

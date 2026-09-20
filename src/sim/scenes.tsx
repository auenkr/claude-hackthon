import { useMemo, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Ground, Sun, Scatter } from './Scenery'
import {
  AVENUE,
  boulevard,
  killDevil,
  airfield as airfieldField,
  range as rangeField,
  RUNWAY,
} from './terrain'
import type { FlyerSim } from './flyer'
import type { P51Sim } from './p51'
import type { T34Sim } from './t34'
import { FINISH, type VelocipedeSim } from './velocipede'

/**
 * The three places: the sand at Kill Devil Hills, a grass airfield, and a
 * gunnery range at Kubinka. Each pairs a `Field` from terrain.ts with the
 * furniture from Scenery.tsx and whatever that exercise needs to look at.
 */

const SIZE = 3600
const SEGMENTS = 140

export function Dunes({ sim }: { sim: FlyerSim; accent?: string }) {
  return (
    <>
      <color attach="background" args={[killDevil.sky]} />
      <fog attach="fog" args={[killDevil.haze, ...killDevil.fog]} />
      <Sun follow={sim.position} />
      <Ground field={killDevil} size={SIZE} segments={SEGMENTS} />
      <Scatter
        field={killDevil}
        count={140}
        spread={520}
        height={[0.4, 1.1]}
        radius={0.25}
        colour="#9aa075"
        keepOut={(x, z) => Math.abs(x) < 14 && z > -6 && z < 40}
      />
    </>
  )
}

export function Airfield({ sim }: { sim: P51Sim; accent?: string }) {
  const keepOut = useMemo(
    () => (x: number, z: number) =>
      Math.abs(x) < RUNWAY.halfWidth + 25 && Math.abs(z) < RUNWAY.length / 2 + 25,
    [],
  )
  return (
    <>
      <color attach="background" args={[airfieldField.sky]} />
      <fog attach="fog" args={[airfieldField.haze, ...airfieldField.fog]} />
      <Sun follow={sim.position} />
      <Ground field={airfieldField} size={SIZE} segments={SEGMENTS} />
      <Scatter
        field={airfieldField}
        count={220}
        spread={900}
        height={[3, 9]}
        radius={1.1}
        colour="#4c5a34"
        keepOut={keepOut}
      />
    </>
  )
}

export function Range({ sim }: { sim: T34Sim }) {
  return (
    <>
      <color attach="background" args={[rangeField.sky]} />
      <fog attach="fog" args={[rangeField.haze, ...rangeField.fog]} />
      <Sun follow={sim.position} />
      <Ground field={rangeField} size={SIZE} segments={SEGMENTS} />
      <Scatter
        field={rangeField}
        count={90}
        spread={1400}
        height={[0.5, 1.6]}
        radius={0.4}
        colour="#6d6a48"
      />
      <Hulks sim={sim} />
      <Tracers sim={sim} />
      <Impacts sim={sim} />
    </>
  )
}

export function Boulevard({ sim }: { sim: VelocipedeSim }) {
  return (
    <>
      <color attach="background" args={[boulevard.sky]} />
      <fog attach="fog" args={[boulevard.haze, ...boulevard.fog]} />
      <Sun follow={sim.position} colour="#fff3dd" extent={40} />
      <Ground field={boulevard} size={2400} segments={200} />
      <Carriageway />
      <Avenue />
      <Stone />
    </>
  )
}

/**
 * The setts, as a strip fine enough to follow the grade. The big ground
 * grid is too coarse to draw an eighteen-metre road on.
 */
function Carriageway() {
  const geo = useMemo(() => {
    const from = -80
    const to = AVENUE.length + 200
    const step = 2
    const w = AVENUE.halfWidth + 1
    const rows = Math.floor((to - from) / step) + 1
    const pos: number[] = []
    for (let i = 0; i < rows; i++) {
      const z = from + i * step
      for (const x of [-w, w]) pos.push(x, boulevard.height(x, z) + 0.012, z)
    }
    const idx: number[] = []
    for (let i = 0; i < rows - 1; i++) {
      const a = i * 2
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setIndex(idx)
    g.computeVertexNormals()
    return g
  }, [])
  return (
    <mesh geometry={geo} receiveShadow>
      <meshStandardMaterial color="#5a5753" roughness={0.95} metalness={0.02} />
    </mesh>
  )
}

/** Two ranks of plane trees and the gas lamps between them. */
function Avenue() {
  const { trunks, crowns, lamps } = useMemo(() => {
    const dummy = new THREE.Object3D()
    const trunks: THREE.Matrix4[] = []
    const crowns: THREE.Matrix4[] = []
    const lamps: THREE.Matrix4[] = []
    for (let z = -60; z <= AVENUE.length + 160; z += 11) {
      for (const side of [-1, 1]) {
        for (const rank of [13.5, 19]) {
          const x = side * rank
          const jitter = Math.sin(z * 0.37 + rank) * 0.6
          const h = 9 + 3 * ((Math.sin(z * 0.91 + x) + 1) / 2)
          const y = boulevard.height(x, z)
          dummy.position.set(x + jitter, y + h * 0.28, z)
          dummy.scale.set(1, h * 0.56, 1)
          dummy.rotation.set(0, 0, 0)
          dummy.updateMatrix()
          trunks.push(dummy.matrix.clone())
          dummy.position.set(x + jitter, y + h * 0.56 + 2.4, z)
          dummy.scale.set(1 + h * 0.04, 1 + h * 0.05, 1 + h * 0.04)
          dummy.rotation.set(0, z, 0)
          dummy.updateMatrix()
          crowns.push(dummy.matrix.clone())
        }
      }
    }
    for (let z = -40; z <= AVENUE.length + 140; z += 44) {
      for (const side of [-1, 1]) {
        const x = side * (AVENUE.halfWidth + 1.6)
        dummy.position.set(x, boulevard.height(x, z) + 2.1, z)
        dummy.scale.set(1, 1, 1)
        dummy.rotation.set(0, 0, 0)
        dummy.updateMatrix()
        lamps.push(dummy.matrix.clone())
      }
    }
    return { trunks, crowns, lamps }
  }, [])

  return (
    <>
      <Instanced matrices={trunks} castShadow>
        <cylinderGeometry args={[0.22, 0.34, 1, 7]} />
        <meshStandardMaterial color="#8c8674" roughness={0.9} />
      </Instanced>
      <Instanced matrices={crowns} castShadow>
        <icosahedronGeometry args={[2.6, 1]} />
        <meshStandardMaterial color="#5f7440" roughness={0.9} flatShading />
      </Instanced>
      <Instanced matrices={lamps} castShadow>
        <cylinderGeometry args={[0.05, 0.08, 4.2, 8]} />
        <meshStandardMaterial color="#2c2e2a" metalness={0.6} roughness={0.5} />
      </Instanced>
    </>
  )
}

/** The 600-metre stone, and a chalk line across the setts beside it. */
function Stone() {
  const y = boulevard.height(0, FINISH)
  return (
    <>
      <mesh position={[0, y + 0.02, FINISH]}>
        <boxGeometry args={[AVENUE.halfWidth * 2, 0.01, 0.35]} />
        <meshStandardMaterial color="#e6e2d8" roughness={0.9} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[side * (AVENUE.halfWidth + 1.3), boulevard.height(side * 10.3, FINISH) + 0.5, FINISH]}
          castShadow
        >
          <boxGeometry args={[0.45, 1.0, 0.3]} />
          <meshStandardMaterial color="#b9b4a8" roughness={0.85} />
        </mesh>
      ))}
    </>
  )
}

function Instanced({
  matrices,
  castShadow,
  children,
}: {
  matrices: THREE.Matrix4[]
  castShadow?: boolean
  children: ReactNode
}) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  useFrame(() => {
    const m = mesh.current
    if (!m || m.userData.laid) return
    matrices.forEach((mat, i) => m.setMatrixAt(i, mat))
    m.instanceMatrix.needsUpdate = true
    m.userData.laid = true
  })
  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, Math.max(1, matrices.length)]}
      castShadow={castShadow}
      receiveShadow
    >
      {children}
    </instancedMesh>
  )
}

/** The five hulks (and the crossing lorry), sunk a little once they're dead. */
function Hulks({ sim }: { sim: T34Sim }) {
  const count = sim.targets.length
  const groups = useRef<(THREE.Group | null)[]>([])

  useFrame(() => {
    for (let i = 0; i < count; i++) {
      const g = groups.current[i]
      const t = sim.targets[i]
      if (!g || !t) continue
      const y = rangeField.height(t.x, t.z)
      g.position.set(t.x, y + (t.dead ? 0.3 : 1), t.z)
      const mesh = g.children[0] as THREE.Mesh | undefined
      const mat = mesh?.material as THREE.MeshStandardMaterial | undefined
      if (mat) mat.opacity = t.dead ? 0.3 : 1
    }
  })

  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <group key={i} ref={(el) => (groups.current[i] = el)}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[3.6, 1.9, 6.5]} />
            <meshStandardMaterial color="#4b4f3f" roughness={0.85} transparent />
          </mesh>
        </group>
      ))}
    </>
  )
}

const TRACER_POOL = 16

/** Shells in flight — a small pool, since only a few are ever airborne. */
function Tracers({ sim }: { sim: T34Sim }) {
  const meshes = useRef<(THREE.Mesh | null)[]>([])

  useFrame(() => {
    for (let i = 0; i < TRACER_POOL; i++) {
      const m = meshes.current[i]
      const shell = sim.shells[i]
      if (!m) continue
      m.visible = !!shell
      if (shell) m.position.copy(shell.pos)
    }
  })

  return (
    <>
      {Array.from({ length: TRACER_POOL }, (_, i) => (
        <mesh key={i} ref={(el) => (meshes.current[i] = el)} visible={false}>
          <sphereGeometry args={[0.12, 6, 6]} />
          <meshBasicMaterial color="#ffcf6b" />
        </mesh>
      ))}
    </>
  )
}

const IMPACT_POOL = 8

/** Where the last few rounds landed, fading out over a few seconds. */
function Impacts({ sim }: { sim: T34Sim }) {
  const meshes = useRef<(THREE.Mesh | null)[]>([])

  useFrame(() => {
    for (let i = 0; i < IMPACT_POOL; i++) {
      const m = meshes.current[i]
      const hit = sim.impacts[i]
      if (!m) continue
      m.visible = !!hit
      if (hit) {
        m.position.copy(hit.pos)
        m.scale.setScalar(hit.kill ? 1.6 : 0.9)
        const mat = m.material as THREE.MeshBasicMaterial
        mat.opacity = Math.max(0, 1 - hit.age / 3)
      }
    }
  })

  return (
    <>
      {Array.from({ length: IMPACT_POOL }, (_, i) => (
        <mesh key={i} ref={(el) => (meshes.current[i] = el)} visible={false}>
          <sphereGeometry args={[0.4, 8, 8]} />
          <meshBasicMaterial color="#e8e2c8" transparent />
        </mesh>
      ))}
    </>
  )
}

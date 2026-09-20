import { useMemo, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Ground, Sun } from './Scenery'
import { AVENUE, boulevard } from './fields/boulevard'
import { FINISH, type VelocipedeSim } from './velocipede'

/** The Champs-Élysées scene used by the velocipede. */
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
  return <mesh geometry={geo} receiveShadow><meshStandardMaterial color="#5a5753" roughness={0.95} metalness={0.02} /></mesh>
}

function Avenue() {
  const { trunks, crowns, lamps } = useMemo(() => {
    const dummy = new THREE.Object3D()
    const trunks: THREE.Matrix4[] = [], crowns: THREE.Matrix4[] = [], lamps: THREE.Matrix4[] = []
    for (let z = -60; z <= AVENUE.length + 160; z += 11) for (const side of [-1, 1]) for (const rank of [13.5, 19]) {
      const x = side * rank, jitter = Math.sin(z * 0.37 + rank) * 0.6, h = 9 + 3 * ((Math.sin(z * 0.91 + x) + 1) / 2), y = boulevard.height(x, z)
      dummy.position.set(x + jitter, y + h * 0.28, z); dummy.scale.set(1, h * 0.56, 1); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); trunks.push(dummy.matrix.clone())
      dummy.position.set(x + jitter, y + h * 0.56 + 2.4, z); dummy.scale.set(1 + h * 0.04, 1 + h * 0.05, 1 + h * 0.04); dummy.rotation.set(0, z, 0); dummy.updateMatrix(); crowns.push(dummy.matrix.clone())
    }
    for (let z = -40; z <= AVENUE.length + 140; z += 44) for (const side of [-1, 1]) {
      const x = side * (AVENUE.halfWidth + 1.6)
      dummy.position.set(x, boulevard.height(x, z) + 2.1, z); dummy.scale.set(1, 1, 1); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); lamps.push(dummy.matrix.clone())
    }
    return { trunks, crowns, lamps }
  }, [])
  return <><Instanced matrices={trunks} castShadow><cylinderGeometry args={[0.22, 0.34, 1, 7]} /><meshStandardMaterial color="#8c8674" roughness={0.9} /></Instanced><Instanced matrices={crowns} castShadow><icosahedronGeometry args={[2.6, 1]} /><meshStandardMaterial color="#5f7440" roughness={0.9} flatShading /></Instanced><Instanced matrices={lamps} castShadow><cylinderGeometry args={[0.05, 0.08, 4.2, 8]} /><meshStandardMaterial color="#2c2e2a" metalness={0.6} roughness={0.5} /></Instanced></>
}

function Stone() {
  const y = boulevard.height(0, FINISH)
  return <><mesh position={[0, y + 0.02, FINISH]}><boxGeometry args={[AVENUE.halfWidth * 2, 0.01, 0.35]} /><meshStandardMaterial color="#e6e2d8" roughness={0.9} /></mesh>{[-1, 1].map((side) => <mesh key={side} position={[side * (AVENUE.halfWidth + 1.3), boulevard.height(side * 10.3, FINISH) + 0.5, FINISH]} castShadow><boxGeometry args={[0.45, 1.0, 0.3]} /><meshStandardMaterial color="#b9b4a8" roughness={0.85} /></mesh>)}</>
}

function Instanced({ matrices, castShadow, children }: { matrices: THREE.Matrix4[]; castShadow?: boolean; children: ReactNode }) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  useFrame(() => { const m = mesh.current; if (!m || m.userData.laid) return; matrices.forEach((mat, i) => m.setMatrixAt(i, mat)); m.instanceMatrix.needsUpdate = true; m.userData.laid = true })
  return <instancedMesh ref={mesh} args={[undefined, undefined, Math.max(1, matrices.length)]} castShadow={castShadow} receiveShadow>{children}</instancedMesh>
}

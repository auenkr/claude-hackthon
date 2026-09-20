import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { terrainGeometry, type Field } from './terrain'

/**
 * Shared furniture for the simulations: ground built from the same height
 * function the physics uses, a sun whose shadow follows the machine, and
 * enough scenery to judge height and speed by. Without something of known
 * size on the ground, nobody can tell fifty feet from five hundred.
 */

export function Ground({
  field,
  size,
  segments,
}: {
  field: Field
  size: number
  segments: number
}) {
  const geo = useMemo(() => terrainGeometry(field, size, segments), [field, size, segments])
  return (
    <mesh geometry={geo} receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.95} metalness={0} />
    </mesh>
  )
}

/** Daylight. The shadow camera is small, so it rides along with the machine. */
export function Sun({
  follow,
  colour = '#fff6e2',
  extent = 55,
}: {
  follow: THREE.Vector3
  colour?: string
  extent?: number
}) {
  const light = useRef<THREE.DirectionalLight>(null)
  const target = useMemo(() => new THREE.Object3D(), [])

  useFrame(() => {
    if (!light.current) return
    light.current.position.set(follow.x + 70, follow.y + 110, follow.z + 45)
    target.position.copy(follow)
    target.updateMatrixWorld()
  })

  return (
    <>
      <primitive object={target} />
      <directionalLight
        ref={light}
        target={target}
        color={colour}
        intensity={2.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-camera-left={-extent}
        shadow-camera-right={extent}
        shadow-camera-top={extent}
        shadow-camera-bottom={-extent}
        shadow-camera-near={1}
        shadow-camera-far={400}
      />
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#dceaff', '#8b8577', 0.7]} />
    </>
  )
}

/**
 * Scattered vegetation, instanced. Placed by the same hash the terrain uses,
 * so it is the same clump of trees every visit.
 */
export function Scatter({
  field,
  count,
  spread,
  height,
  radius,
  colour,
  keepOut,
}: {
  field: Field
  count: number
  spread: number
  height: [number, number]
  radius: number
  colour: string
  /** Return true where nothing should grow — a runway, say. */
  keepOut?: (x: number, z: number) => boolean
}) {
  const { geometry, matrices } = useMemo(() => {
    const dummy = new THREE.Object3D()
    const out: THREE.Matrix4[] = []
    // A deterministic spiral, so the scatter is stable and evenly spread.
    for (let i = 0; i < count; i++) {
      const a = i * 2.399963
      const r = spread * Math.sqrt((i + 0.5) / count)
      const jitter = Math.sin(i * 12.9898) * 40
      const x = Math.cos(a) * r + jitter
      const z = Math.sin(a) * r + jitter * 0.7
      if (keepOut?.(x, z)) continue
      const h = height[0] + (height[1] - height[0]) * ((Math.sin(i * 78.233) + 1) / 2)
      dummy.position.set(x, field.height(x, z) + h * 0.45, z)
      dummy.scale.set(1, h / height[1], 1)
      dummy.rotation.y = i
      dummy.updateMatrix()
      out.push(dummy.matrix.clone())
    }
    return { geometry: new THREE.ConeGeometry(radius, height[1], 7), matrices: out }
  }, [field, count, spread, height, radius, keepOut])

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
      args={[geometry, undefined, Math.max(1, matrices.length)]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial color={colour} roughness={0.9} flatShading />
    </instancedMesh>
  )
}

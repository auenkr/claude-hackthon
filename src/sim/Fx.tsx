import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Effects } from './fx'

/**
 * Draws whatever the simulation has set alight.
 *
 * Three instanced meshes and no React state: flame and sparks blended
 * additively so they read as light rather than paint, smoke and dust soft
 * and fading into the day's haze, and wreckage as solid tumbling boxes that
 * take the sun. The buffer is the simulation's; this only reads it.
 */
export function Fx({
  effects,
  haze = '#d8dbdd',
  /** Draw the particles but leave the physics to the sim's own step. */
  step = false,
}: {
  effects: Effects
  haze?: string
  step?: boolean
}) {
  const glow = useRef<THREE.InstancedMesh>(null)
  const soft = useRef<THREE.InstancedMesh>(null)
  const chunks = useRef<THREE.InstancedMesh>(null)

  const cap = effects.particles.length
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const tint = useMemo(() => new THREE.Color(), [])
  const sky = useMemo(() => new THREE.Color(haze), [haze])
  const dir = useMemo(() => new THREE.Vector3(), [])
  const Z = useMemo(() => new THREE.Vector3(0, 0, 1), [])

  const puff = useMemo(() => new THREE.SphereGeometry(0.5, 10, 8), [])
  const box = useMemo(() => new THREE.BoxGeometry(1, 0.7, 1.4), [])

  useFrame((_, delta) => {
    if (step) effects.step(Math.min(0.04, delta))

    let g = 0
    let s = 0
    let c = 0

    for (const p of effects.particles) {
      if (!p.live) continue
      const t = p.age / p.life
      const size = p.size * (1 + (p.grow - 1) * t)

      if (p.kind === 'fire' || p.kind === 'spark') {
        if (g >= cap) continue
        dummy.position.copy(p.pos)
        if (p.kind === 'spark' && p.vel.lengthSq() > 0.01) {
          dir.copy(p.vel).normalize()
          dummy.quaternion.setFromUnitVectors(Z, dir)
          dummy.scale.set(size, size, size * (3 + p.vel.length() * 0.08))
        } else {
          dummy.quaternion.copy(p.quat)
          dummy.scale.setScalar(size)
        }
        dummy.updateMatrix()
        glow.current?.setMatrixAt(g, dummy.matrix)
        // Additive, so dimming the colour is the fade.
        tint.copy(p.colour).lerp(p.fade, t).multiplyScalar(Math.max(0, 1 - t * t))
        glow.current?.setColorAt(g, tint)
        g++
        continue
      }

      if (p.kind === 'smoke' || p.kind === 'dust') {
        if (s >= cap) continue
        dummy.position.copy(p.pos)
        dummy.quaternion.copy(p.quat)
        dummy.scale.setScalar(size)
        dummy.updateMatrix()
        soft.current?.setMatrixAt(s, dummy.matrix)
        // Soft particles cannot fade their alpha per instance, so they
        // dissolve into the haze instead — which is what smoke does.
        tint.copy(p.colour).lerp(p.fade, t).lerp(sky, t * t * 0.9)
        soft.current?.setColorAt(s, tint)
        s++
        continue
      }

      if (c >= cap) continue
      dummy.position.copy(p.pos)
      dummy.quaternion.copy(p.quat)
      dummy.scale.setScalar(size)
      dummy.updateMatrix()
      chunks.current?.setMatrixAt(c, dummy.matrix)
      tint.copy(p.colour).lerp(p.fade, t)
      chunks.current?.setColorAt(c, tint)
      c++
    }

    for (const [mesh, n] of [
      [glow.current, g],
      [soft.current, s],
      [chunks.current, c],
    ] as const) {
      if (!mesh) continue
      mesh.count = n
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      mesh.visible = n > 0
    }
  })

  return (
    <>
      <instancedMesh ref={glow} args={[puff, undefined, cap]} frustumCulled={false}>
        <meshBasicMaterial
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </instancedMesh>

      <instancedMesh ref={soft} args={[puff, undefined, cap]} frustumCulled={false}>
        <meshBasicMaterial transparent opacity={0.46} depthWrite={false} />
      </instancedMesh>

      <instancedMesh ref={chunks} args={[box, undefined, cap]} frustumCulled={false} castShadow>
        <meshStandardMaterial roughness={0.9} metalness={0.05} flatShading />
      </instancedMesh>
    </>
  )
}

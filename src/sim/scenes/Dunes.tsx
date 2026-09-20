import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Ground, Sun } from '../Scenery'
// Explicit extension: on a case-insensitive filesystem '../Fx' resolves to
// the particle buffer in fx.ts rather than to the component beside it.
import { Fx } from '../Fx.tsx'
import { killDevil, SEA_LEVEL } from '../fields/killDevil'
import { merge, strut } from '../../three/geometry'
import { RECORD, type FlyerSim } from '../flyer'
import {
  ANEMOMETER,
  CAMP,
  DERRICK,
  DRIFTWOOD,
  MARKER_X,
  MARKER_Z0,
  RAIL,
  RAIL_END,
  RAIL_TOP,
  TREES,
  TRUCK,
  TUFTS,
} from '../flyer/world'

/**
 * Kill Devil Hills, 17 December 1903.
 *
 * There was no runway and there were no trees. What there was: four fifteen
 * foot two-by-fours shimmed level on the sand, two tar-paper sheds a hundred
 * yards off, a derrick, an anemometer on a post, a great deal of sea oats,
 * the Atlantic a few hundred metres east and the scrub pine a mile west. That
 * is what is here, at the sizes in `flyer/world.ts` — the same numbers the
 * simulation builds its collision volumes from, so everything standing on the
 * sand that you can see is something you can hit.
 *
 * Nearly all of it moves. In a ten-metre wind nothing on this beach is still,
 * and since the machine only makes four or five metres a second over the
 * ground, the wind is where the sense of speed has to come from.
 */
export function Dunes({ sim, accent }: { sim: FlyerSim; accent: string }) {
  return (
    <>
      <color attach="background" args={[killDevil.sky]} />
      <fog attach="fog" args={[killDevil.haze, killDevil.fog[0], killDevil.fog[1]]} />
      <Sun follow={sim.position} colour="#fff3dc" extent={34} />

      <Ground field={killDevil} size={1500} segments={300} />
      <Ripples />
      <SeaOats sim={sim} />
      <Pines />
      <Driftwood />
      <Atlantic />

      <Camp />
      <Derrick />
      <Anemometer />
      <Markers accent={accent} />

      <LaunchRail />
      <Truck sim={sim} />
      <GroundRush sim={sim} />
      <Wreckage sim={sim} />

      <Fx effects={sim.fx} haze={killDevil.haze} />
    </>
  )
}

// --- Helpers ----------------------------------------------------------------

/** A positioned box as raw triangles, ready to be merged into one buffer. */
function box(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  yaw = 0,
  pitch = 0,
) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed()
  if (pitch) g.rotateX(pitch)
  if (yaw) g.rotateY(yaw)
  g.translate(x, y, z)
  return g
}

const ground = (x: number, z: number) => killDevil.height(x, z)

/** Lay a list of matrices into an instanced mesh, once. */
function useLaid(matrices: THREE.Matrix4[]) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  useFrame(() => {
    const m = mesh.current
    if (!m || m.userData.laid) return
    matrices.forEach((mat, i) => m.setMatrixAt(i, mat))
    m.instanceMatrix.needsUpdate = true
    m.userData.laid = true
  })
  return mesh
}

// --- Sand -------------------------------------------------------------------

/**
 * Wind ripples. The terrain mesh is five metres to a quad and cannot show
 * them, so the washboard the machine actually rides over is drawn as low
 * instanced ridges laid square across the wind, down the corridor the run
 * uses. They are what makes the ground move under you at a walking pace.
 */
function Ripples() {
  const matrices = useMemo(() => {
    const out: THREE.Matrix4[] = []
    const d = new THREE.Object3D()
    for (let i = 0; i < 1400; i++) {
      const u = (i * 0.618034) % 1
      const x = (u - 0.5) * 170
      const z = -90 + ((i * 2.9) % 470)
      const len = 2.4 + ((i * 7.13) % 1) * 6
      d.position.set(x, ground(x, z) + 0.012, z)
      d.rotation.set(0, (((i * 3.7) % 1) - 0.5) * 0.24, 0)
      d.scale.set(len, 1, 0.55 + ((i * 1.7) % 1) * 0.5)
      d.updateMatrix()
      out.push(d.matrix.clone())
    }
    return out
  }, [])
  const geo = useMemo(() => new THREE.BoxGeometry(1, 0.05, 1), [])
  const mesh = useLaid(matrices)

  return (
    <instancedMesh ref={mesh} args={[geo, undefined, matrices.length]} receiveShadow>
      <meshStandardMaterial color="#cdbe9c" roughness={1} flatShading />
    </instancedMesh>
  )
}

/**
 * Sea oats. Every tuft bends downwind and shivers, and harder where the
 * propellers are blowing: the lean is done in the vertex shader off the
 * instance's own world position, so two and a half thousand of them cost one
 * draw call and nothing on the CPU.
 */
interface Uniforms {
  uTime: { value: number }
  uMachine: { value: THREE.Vector3 }
  uWash: { value: number }
}

function SeaOats({ sim }: { sim: FlyerSim }) {
  const geo = useMemo(() => {
    const pos: number[] = []
    const segs = 3
    const halfW = 0.055
    for (const rot of [0, Math.PI / 2]) {
      const c = Math.cos(rot)
      const s = Math.sin(rot)
      const push = (u: number, y: number) => pos.push(u * c, y, u * s)
      for (let i = 0; i < segs; i++) {
        const y0 = i / segs
        const y1 = (i + 1) / segs
        const w0 = halfW * (1 - y0 * 0.8)
        const w1 = halfW * (1 - y1 * 0.8)
        push(-w0, y0)
        push(w0, y0)
        push(w1, y1)
        push(-w0, y0)
        push(w1, y1)
        push(-w1, y1)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.computeVertexNormals()
    return g
  }, [])

  const matrices = useMemo(() => {
    const out: THREE.Matrix4[] = []
    const d = new THREE.Object3D()
    for (const t of TUFTS) {
      d.position.set(t.x, ground(t.x, t.z) - 0.03, t.z)
      // No yaw: the bend happens in object space, so a rotated tuft would
      // lean in the wrong direction. A crossed pair reads from any angle.
      d.rotation.set(0, 0, 0)
      d.scale.set(t.scale, t.height, t.scale)
      d.updateMatrix()
      out.push(d.matrix.clone())
    }
    return out
  }, [])

  // The uniforms live in a ref, because they are written to sixty times a
  // second and anything a hook has seen must be left alone after render.
  const uniforms = useRef<Uniforms>(null)
  uniforms.current ??= {
    uTime: { value: 0 },
    uMachine: { value: new THREE.Vector3(0, 0, 0) },
    uWash: { value: 0 },
  }

  const material = useMemo(() => {
    const u = uniforms.current!
    const m = new THREE.MeshStandardMaterial({
      color: '#a9a878',
      roughness: 0.95,
      side: THREE.DoubleSide,
      flatShading: true,
    })
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = u.uTime
      shader.uniforms.uMachine = u.uMachine
      shader.uniforms.uWash = u.uWash
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform float uTime;
           uniform vec3 uMachine;
           uniform float uWash;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           #ifdef USE_INSTANCING
             vec3 iPos = instanceMatrix[3].xyz;
           #else
             vec3 iPos = vec3(0.0);
           #endif
           float bh = clamp(transformed.y, 0.0, 1.0);
           float shiver = sin(uTime * 4.7 + iPos.x * 1.9 + iPos.z * 1.3);
           float gust = 0.6 + 0.4 * sin(uTime * 0.7 + iPos.z * 0.014 + iPos.x * 0.008);
           float lean = (0.40 * gust + 0.09 * shiver) * bh * bh;
           vec2 away = iPos.xz - uMachine.xz;
           float r2 = dot(away, away);
           float wash = uWash * exp(-r2 / 70.0);
           vec2 dir = r2 > 0.05 ? normalize(away) : vec2(0.0, -1.0);
           transformed.z -= lean;
           transformed.xz += dir * wash * bh * bh * 1.2;
           transformed.y *= 1.0 - 0.3 * min(1.0, lean + wash);`,
        )
    }
    return m
  }, [])

  const mesh = useLaid(matrices)

  useFrame((state) => {
    const u = uniforms.current!
    u.uTime.value = state.clock.elapsedTime
    u.uMachine.value.copy(sim.position)
    u.uWash.value = sim.propwash * 0.85
  })

  return (
    <instancedMesh ref={mesh} args={[geo, material, matrices.length]} frustumCulled={false} />
  )
}

// --- The treeline -----------------------------------------------------------

/**
 * Scrub pine, a mile west. Trunk and a layered canopy, two instanced meshes
 * for the lot of them — they are solid, and the simulation has a cylinder
 * round every one.
 */
function Pines() {
  const trunkGeo = useMemo(() => new THREE.CylinderGeometry(0.55, 1, 1, 6, 1), [])
  const canopyGeo = useMemo(() => {
    // Three flattened cones, wider at the bottom: a loblolly's head.
    const parts: THREE.BufferGeometry[] = []
    const tiers: [number, number, number][] = [
      [1, 0, 0.42],
      [0.78, 0.3, 0.38],
      [0.5, 0.62, 0.38],
    ]
    for (const [r, y, h] of tiers) {
      const c = new THREE.ConeGeometry(r, h, 7, 1).toNonIndexed()
      c.translate(0, y + h / 2, 0)
      parts.push(c)
    }
    return merge(parts)
  }, [])

  const { trunks, canopies } = useMemo(() => {
    const d = new THREE.Object3D()
    const a: THREE.Matrix4[] = []
    const b: THREE.Matrix4[] = []
    for (const t of TREES) {
      const g = ground(t.x, t.z)
      const bare = t.height * 0.52
      d.position.set(t.x, g + bare / 2, t.z)
      d.rotation.set(t.lean * 0.4, t.x, 0)
      d.scale.set(t.radius, bare, t.radius)
      d.updateMatrix()
      a.push(d.matrix.clone())

      const head = t.height * 0.62
      d.position.set(t.x + t.lean * bare, g + bare * 0.9, t.z)
      d.rotation.set(t.lean * 0.4, t.z, 0)
      d.scale.set(t.height * 0.3, head, t.height * 0.3)
      d.updateMatrix()
      b.push(d.matrix.clone())
    }
    return { trunks: a, canopies: b }
  }, [])

  const trunkMesh = useLaid(trunks)
  const canopyMesh = useLaid(canopies)

  return (
    <>
      <instancedMesh ref={trunkMesh} args={[trunkGeo, undefined, trunks.length]} castShadow>
        <meshStandardMaterial color="#6b5744" roughness={0.95} flatShading />
      </instancedMesh>
      <instancedMesh ref={canopyMesh} args={[canopyGeo, undefined, canopies.length]} castShadow>
        <meshStandardMaterial color="#55603f" roughness={0.92} flatShading />
      </instancedMesh>
    </>
  )
}

/** Driftwood, half-buried. Solid, and low enough to catch a skid. */
function Driftwood() {
  const geo = useMemo(() => new THREE.CylinderGeometry(1, 0.85, 1, 7, 1), [])
  const matrices = useMemo(() => {
    const d = new THREE.Object3D()
    return DRIFTWOOD.map((log) => {
      d.position.set(log.x, ground(log.x, log.z) + log.radius * 0.45, log.z)
      d.rotation.set(0, log.yaw, Math.PI / 2)
      d.scale.set(log.radius, log.length, log.radius)
      d.updateMatrix()
      return d.matrix.clone()
    })
  }, [])
  const mesh = useLaid(matrices)

  return (
    <instancedMesh ref={mesh} args={[geo, undefined, matrices.length]} castShadow receiveShadow>
      <meshStandardMaterial color="#9d9382" roughness={0.98} flatShading />
    </instancedMesh>
  )
}

// --- The sea ----------------------------------------------------------------

const SURF_LINES = 16

/** The Atlantic, with a surf line that actually comes in. */
function Atlantic() {
  const surf = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const tint = useMemo(() => new THREE.Color(), [])
  const foam = useMemo(() => new THREE.Color('#f2f0ea'), [])
  const sea = useMemo(() => new THREE.Color('#8298a4'), [])
  const bar = useMemo(() => new THREE.BoxGeometry(1, 0.12, 1), [])

  useFrame((state) => {
    const mesh = surf.current
    if (!mesh) return
    const t = state.clock.elapsedTime
    for (let i = 0; i < SURF_LINES; i++) {
      const lane = i % 4
      // Each wave walks shoreward, breaks, and runs out again.
      const phase = (t * 0.07 + i * 0.13) % 1
      const x = 392 - phase * 62
      const z = -900 + Math.floor(i / 4) * 620
      dummy.position.set(x, SEA_LEVEL + 0.12 + lane * 0.01, z)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(4 + phase * 14, 1, 620)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      // White where it breaks, dissolving into the sea as it runs up.
      const bright = Math.sin(Math.min(1, phase * 1.35) * Math.PI) ** 0.6
      tint.copy(sea).lerp(foam, bright)
      mesh.setColorAt(i, tint)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[1400, SEA_LEVEL, 0]}>
        <planeGeometry args={[2200, 3000]} />
        <meshStandardMaterial color="#7f96a2" roughness={0.3} metalness={0.15} />
      </mesh>
      <instancedMesh ref={surf} args={[bar, undefined, SURF_LINES]} frustumCulled={false}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </>
  )
}

// --- The camp ---------------------------------------------------------------

/**
 * The 1901 shed and the longer 1902 building, boarded with tar paper and
 * battened. The long wall panels are hinged at the top and propped open with
 * poles, which is how they got the machine in and out.
 */
function Camp() {
  const { walls, roofs, props: poles } = useMemo(() => {
    const w: THREE.BufferGeometry[] = []
    const r: THREE.BufferGeometry[] = []
    const p: THREE.BufferGeometry[] = []
    const yaw = CAMP.yaw

    for (const b of [CAMP.shed, CAMP.hangar]) {
      const g = ground(b.x, b.z)
      const c = Math.cos(yaw)
      const s = Math.sin(yaw)
      // Put a local (along, across) offset into world coordinates.
      const at = (along: number, across: number): [number, number] => [
        b.x + along * c + across * s,
        b.z - along * s + across * c,
      ]

      const [wx, wz] = at(0, 0)
      w.push(box(b.length, b.eaves, b.width, wx, g + b.eaves / 2, wz, yaw))

      // Vertical battens over the joints in the boarding.
      const battens = Math.round(b.length / 0.62)
      for (let i = 0; i <= battens; i++) {
        const along = -b.length / 2 + (b.length * i) / battens
        for (const side of [-1, 1]) {
          const [bx, bz] = at(along, (side * b.width) / 2)
          w.push(box(0.07, b.eaves, 0.03, bx, g + b.eaves / 2, bz, yaw))
        }
      }

      // Gable roof: two slabs meeting at the ridge.
      const rise = b.ridge - b.eaves
      const slope = Math.atan2(rise, b.width / 2)
      const slab = Math.hypot(rise, b.width / 2)
      for (const side of [-1, 1]) {
        const [rx, rz] = at(0, (side * b.width) / 4)
        r.push(
          box(
            b.length + 0.22,
            0.055,
            slab,
            rx,
            g + b.eaves + rise / 2,
            rz,
            yaw,
            side * slope,
          ),
        )
      }

      // Hinged panels along the seaward wall, propped up on poles.
      const panels = Math.max(2, Math.round(b.length / 2.4))
      const pw = (b.length / panels) * 0.9
      for (let i = 0; i < panels; i++) {
        const along = -b.length / 2 + (b.length * (i + 0.5)) / panels
        const open = 0.52 + (i % 2) * 0.12
        const [px, pz] = at(along, b.width / 2 + (b.eaves * 0.42 * Math.sin(open)) / 2)
        p.push(
          box(
            pw,
            0.05,
            b.eaves * 0.46,
            px,
            g + b.eaves - (b.eaves * 0.46 * Math.cos(open)) / 2,
            pz,
            yaw,
            -(Math.PI / 2 - open),
          ),
        )
        // The prop itself: a length of two-by-two under the open edge.
        const [sx, sz] = at(along, b.width / 2 + b.eaves * 0.46 * Math.sin(open))
        p.push(
          strut(
            [sx, g, sz],
            [sx, g + b.eaves - b.eaves * 0.46 * Math.cos(open), sz],
            0.035,
            5,
          ),
        )
      }
    }
    return { walls: merge(w), roofs: merge(r), props: merge(p) }
  }, [])

  return (
    <group>
      <mesh geometry={walls} castShadow receiveShadow>
        <meshStandardMaterial color="#6e6252" roughness={0.95} flatShading />
      </mesh>
      <mesh geometry={roofs} castShadow receiveShadow>
        <meshStandardMaterial color="#4a443c" roughness={0.98} flatShading />
      </mesh>
      <mesh geometry={poles} castShadow>
        <meshStandardMaterial color="#7d705c" roughness={0.95} flatShading />
      </mesh>
    </group>
  )
}

/** The derrick, for lifting an engine out of a machine that is on its nose. */
function Derrick() {
  const geo = useMemo(() => {
    const g = ground(DERRICK.x, DERRICK.z)
    const h = DERRICK.height
    const s = DERRICK.spread
    const apex: [number, number, number] = [DERRICK.x, g + h, DERRICK.z]
    const parts: THREE.BufferGeometry[] = []
    const feet: [number, number, number][] = [
      [DERRICK.x - s, g, DERRICK.z - s],
      [DERRICK.x + s, g, DERRICK.z - s],
      [DERRICK.x - s, g, DERRICK.z + s],
      [DERRICK.x + s, g, DERRICK.z + s],
    ]
    for (const f of feet) parts.push(strut(f, apex, 0.075, 6))
    // Two rounds of horizontal bracing.
    for (const f of [0.35, 0.68]) {
      const ring = feet.map(
        (p) =>
          [
            p[0] + (apex[0] - p[0]) * f,
            p[1] + (apex[1] - p[1]) * f,
            p[2] + (apex[2] - p[2]) * f,
          ] as [number, number, number],
      )
      parts.push(
        strut(ring[0], ring[1], 0.045, 5),
        strut(ring[1], ring[3], 0.045, 5),
        strut(ring[3], ring[2], 0.045, 5),
        strut(ring[2], ring[0], 0.045, 5),
      )
    }
    // The block and its fall, hanging free.
    parts.push(
      strut(apex, [DERRICK.x, g + h - 2.2, DERRICK.z], 0.012, 4),
      box(0.16, 0.3, 0.12, DERRICK.x, g + h - 2.35, DERRICK.z),
    )
    return merge(parts)
  }, [])

  return (
    <mesh geometry={geo} castShadow receiveShadow>
      <meshStandardMaterial color="#7a6c57" roughness={0.95} flatShading />
    </mesh>
  )
}

/**
 * The anemometer. A Richard hand instrument on a post beside the rail: it is
 * the reason we know the wind was twenty-seven miles an hour, and its cups
 * are the only honest windsock on the beach.
 */
function Anemometer() {
  const cups = useRef<THREE.Group>(null)
  const g = useMemo(() => ground(ANEMOMETER.x, ANEMOMETER.z), [])

  useFrame((_, dt) => {
    // Cup anemometers turn at roughly a third of the wind speed at the rim.
    if (cups.current) cups.current.rotation.y += dt * 5.2
  })

  return (
    <group position={[ANEMOMETER.x, g, ANEMOMETER.z]}>
      <mesh position={[0, ANEMOMETER.height / 2, 0]} castShadow>
        <cylinderGeometry args={[0.045, 0.06, ANEMOMETER.height, 6]} />
        <meshStandardMaterial color="#6d6252" roughness={0.95} />
      </mesh>
      <group ref={cups} position={[0, ANEMOMETER.height + 0.1, 0]}>
        {[0, 1, 2].map((i) => {
          const a = (i / 3) * Math.PI * 2
          return (
            <group key={i}>
              <mesh position={[(Math.cos(a) * 0.17) / 2, 0, (Math.sin(a) * 0.17) / 2]} rotation={[0, -a, 0]}>
                <boxGeometry args={[0.17, 0.008, 0.012]} />
                <meshStandardMaterial color="#4b4b50" metalness={0.8} roughness={0.4} />
              </mesh>
              <mesh position={[Math.cos(a) * 0.17, 0, Math.sin(a) * 0.17]} rotation={[0, -a, Math.PI / 2]}>
                <sphereGeometry args={[0.045, 8, 6, 0, Math.PI]} />
                <meshStandardMaterial color="#8a7442" metalness={0.7} roughness={0.45} side={THREE.DoubleSide} />
              </mesh>
            </group>
          )
        })}
      </group>
    </group>
  )
}

/** Where the day's four flights ended, staked out down the flats. */
function Markers({ accent }: { accent: string }) {
  return (
    <>
      {RECORD.map((r) => {
        const z = MARKER_Z0 + r.m
        const h = ground(MARKER_X, z)
        return (
          <group key={r.m} position={[MARKER_X, h, z]}>
            <mesh position={[0, 0.9, 0]} castShadow>
              <cylinderGeometry args={[0.05, 0.06, 1.8, 6]} />
              <meshStandardMaterial color="#6d6252" roughness={0.9} />
            </mesh>
            <mesh position={[-0.32, 1.6, 0]}>
              <planeGeometry args={[0.6, 0.34]} />
              <meshBasicMaterial color={accent} side={THREE.DoubleSide} />
            </mesh>
          </group>
        )
      })}
    </>
  )
}

// --- The rail ---------------------------------------------------------------

/**
 * 'The Grand Junction Railroad'. Four fifteen-foot two-by-fours laid end to
 * end, shimmed level over sixty feet of sand that is not, and faced with a
 * strip of iron for the truck's hubs to run on.
 */
function LaunchRail() {
  const { boards, strip, shims } = useMemo(() => {
    const b: THREE.BufferGeometry[] = []
    const s: THREE.BufferGeometry[] = []
    const top = RAIL_TOP
    for (let i = 0; i < RAIL.boards; i++) {
      const z = RAIL.start + RAIL.board * (i + 0.5)
      // A hair of slop at each joint, so the four boards read as four.
      b.push(box(RAIL.width, RAIL.height, RAIL.board - 0.03, 0, top - RAIL.height / 2, z))
      for (let k = 0; k < 5; k++) {
        const sz = RAIL.start + RAIL.board * (i + k / 5 + 0.1)
        const sand = ground(0, sz)
        const gap = top - RAIL.height - sand
        if (gap < 0.005) continue
        s.push(box(RAIL.width * 1.6, gap, 0.16, 0, sand + gap / 2, sz))
      }
    }
    return {
      boards: merge(b),
      shims: merge(s),
      strip: box(RAIL.width * 0.55, 0.008, RAIL.boards * RAIL.board, 0, top + 0.004, RAIL.start + (RAIL.boards * RAIL.board) / 2),
    }
  }, [])

  return (
    <group>
      <mesh geometry={boards} castShadow receiveShadow>
        <meshStandardMaterial color="#8a7a5e" roughness={0.92} flatShading />
      </mesh>
      <mesh geometry={shims} receiveShadow>
        <meshStandardMaterial color="#7b6c52" roughness={0.95} flatShading />
      </mesh>
      <mesh geometry={strip}>
        <meshStandardMaterial color="#5c5b57" metalness={0.75} roughness={0.5} />
      </mesh>
    </group>
  )
}

/**
 * The truck. Two modified bicycle hubs on a yoke: the machine rides out on
 * it, leaves it behind at flying speed, and it runs on down the rail under
 * its own way until it falls off the end.
 */
function Truck({ sim }: { sim: FlyerSim }) {
  const group = useRef<THREE.Group>(null)
  const wheels = useRef<THREE.Group>(null)

  useFrame((_, dt) => {
    const g = group.current
    if (!g) return
    g.visible = sim.truck.on
    g.position.set(0, RAIL_TOP + TRUCK.wheel, Math.min(sim.truck.z, RAIL_END))
    if (wheels.current) wheels.current.rotation.x -= (sim.truck.speed / TRUCK.wheel) * dt
  })

  return (
    <group ref={group}>
      <mesh position={[0, TRUCK.wheel + 0.03, 0]} castShadow>
        <boxGeometry args={[TRUCK.width, 0.05, TRUCK.length]} />
        <meshStandardMaterial color="#7d6c50" roughness={0.9} />
      </mesh>
      <group ref={wheels}>
        {[TRUCK.length / 2 - 0.08, -TRUCK.length / 2 + 0.08].map((z) => (
          <mesh key={z} position={[0, 0, z]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[TRUCK.wheel, TRUCK.wheel, 0.05, 12]} />
            <meshStandardMaterial color="#4b4b50" metalness={0.7} roughness={0.5} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

// --- Speed ------------------------------------------------------------------

const MOTES = 260

/**
 * Blown sand near the machine.
 *
 * The Flyer makes four metres a second over the ground — a brisk walk — but
 * fourteen through the air, and the difference is the wind. So the motes are
 * driven by the *air*, not by the ground: they stream past the pilot at
 * flying speed even while the sand below crawls. That is honest, and it is
 * the only thing here that reads as thirty miles an hour.
 */
function GroundRush({ sim }: { sim: FlyerSim }) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const tint = useMemo(() => new THREE.Color(), [])
  const pale = useMemo(() => new THREE.Color('#e0d3b6'), [])
  const haze = useMemo(() => new THREE.Color(killDevil.haze), [])
  const geo = useMemo(() => new THREE.BoxGeometry(0.03, 0.03, 1), [])

  // Held in a ref, not a memo: these are written to sixty times a second.
  const motes = useRef<{ x: number; y: number; z: number; s: number }[]>(null)
  motes.current ??= Array.from({ length: MOTES }, (_, i) => ({
    x: (Math.sin(i * 12.9898) * 0.5 + 0.5) * 44 - 22,
    y: (Math.sin(i * 78.233) * 0.5 + 0.5) * 3.4,
    z: (Math.sin(i * 39.425) * 0.5 + 0.5) * 60 - 30,
    s: 0.4 + (Math.sin(i * 4.117) * 0.5 + 0.5) * 1.1,
  }))

  useFrame((_, dt) => {
    const m = mesh.current
    if (!m) return
    // Sand only lifts off the beach where the air is moving over it; up high
    // there is nothing to blow.
    const speed = Math.max(0, sim.airspeed)
    const px = sim.position.x
    const pz = sim.position.z

    for (let i = 0; i < MOTES; i++) {
      const mote = motes.current![i]
      mote.z -= speed * dt
      // Recycle upwind of the machine once it has streamed past.
      if (mote.z < pz - 34) mote.z += 64
      if (mote.z > pz + 34) mote.z -= 64
      if (mote.x < px - 24) mote.x += 46
      if (mote.x > px + 24) mote.x -= 46

      const floor = ground(mote.x, mote.z)
      const y = floor + mote.y
      const streak = 0.25 + speed * 0.055 * mote.s
      dummy.position.set(mote.x, y, mote.z)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(mote.s, mote.s, streak)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
      // They fade out with height and with distance from the machine.
      const near = 1 - Math.min(1, Math.hypot(mote.x - px, mote.z - pz) / 30)
      const low = 1 - Math.min(1, mote.y / 3.2)
      tint.copy(haze).lerp(pale, near * low * Math.min(1, speed / 12))
      m.setColorAt(i, tint)
    }
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh ref={mesh} args={[geo, undefined, MOTES]} frustumCulled={false}>
      <meshBasicMaterial transparent opacity={0.5} depthWrite={false} toneMapped={false} />
    </instancedMesh>
  )
}

// --- What is left of it -----------------------------------------------------

/**
 * The wreck. Once the machine has broken up the reconstruction is taken off
 * the scene — what is lying there is no longer a reconstruction of anything —
 * and this heap of spars and muslin is left in its place.
 */
function Wreckage({ sim }: { sim: FlyerSim }) {
  const group = useRef<THREE.Group>(null)

  const spars = useMemo(() => {
    const parts: THREE.BufferGeometry[] = []
    for (let i = 0; i < 16; i++) {
      const a = i * 2.399963
      const r = 0.4 + ((i * 0.37) % 1) * 2.6
      const len = 0.9 + ((i * 0.71) % 1) * 3.2
      parts.push(
        box(
          0.06,
          0.05,
          len,
          Math.cos(a) * r,
          0.05 + ((i * 0.23) % 1) * 0.5,
          Math.sin(a) * r,
          a * 1.7,
          ((i * 0.53) % 1) * 0.6 - 0.3,
        ),
      )
    }
    return merge(parts)
  }, [])

  const cloth = useMemo(() => {
    const parts: THREE.BufferGeometry[] = []
    for (let i = 0; i < 7; i++) {
      const a = i * 1.7
      const r = 0.5 + ((i * 0.61) % 1) * 2.2
      parts.push(
        box(
          1.2 + ((i * 0.31) % 1) * 1.8,
          0.03,
          0.9 + ((i * 0.19) % 1) * 1.1,
          Math.cos(a) * r,
          0.07 + ((i * 0.41) % 1) * 0.3,
          Math.sin(a) * r,
          a,
          ((i * 0.29) % 1) * 0.5 - 0.25,
        ),
      )
    }
    return merge(parts)
  }, [])

  useFrame(() => {
    const g = group.current
    if (!g) return
    g.visible = sim.wreck.active
    if (!g.visible) return
    g.position.copy(sim.wreck.pos)
    g.rotation.y = sim.wreck.yaw
  })

  return (
    <group ref={group} visible={false}>
      <mesh geometry={spars} castShadow receiveShadow>
        <meshStandardMaterial color="#8a6d47" roughness={0.9} flatShading />
      </mesh>
      <mesh geometry={cloth} castShadow receiveShadow>
        <meshStandardMaterial color="#b6ab92" roughness={0.97} flatShading side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

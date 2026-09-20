import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Ground, Sun } from '../Scenery'
// Explicit extension: on a case-insensitive filesystem '../Fx' resolves to
// the particle buffer in '../fx.ts' instead of the component beside it.
import { Fx } from '../Fx.tsx'
import {
  APRON,
  DISPERSALS,
  LINKS,
  ROAD,
  RUNWAY,
  TAXIWAY,
  airfield,
} from '../fields/airfield'
import { GATES, WIND, type P51Sim } from '../p51'
import type { Obstacle } from '../obstacles'

/**
 * A wartime fighter station, drawn from the same numbers the physics uses.
 *
 * Everything solid on this field comes out of `sim.obstacles`: the scene
 * walks that list and draws whatever each entry says it is. Nothing is
 * placed here by eye, which is the only way to be sure that the hangar you
 * can see is the hangar you will hit.
 */

const Z = new THREE.Vector3(0, 0, 1)

/**
 * Concatenate shaded geometry. The kit's own `merge` keeps positions only,
 * which is right for lofted skins and wrong for a hundred fence posts that
 * need their normals, so this does the same job keeping both.
 */
function mergeSolid(parts: THREE.BufferGeometry[]) {
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g))
  let verts = 0
  for (const g of flat) verts += g.getAttribute('position').count
  const position = new Float32Array(verts * 3)
  const normal = new Float32Array(verts * 3)
  let n = 0
  for (const g of flat) {
    position.set(g.getAttribute('position').array as ArrayLike<number>, n * 3)
    normal.set(g.getAttribute('normal').array as ArrayLike<number>, n * 3)
    n += g.getAttribute('position').count
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(position, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(normal, 3))
  return out
}

const CONCRETE = { color: '#6f6f6b', roughness: 0.96, metalness: 0 }
const BRICK = { color: '#8c7f6e', roughness: 0.95 }
const CORRUGATE = { color: '#767a6d', roughness: 0.78, metalness: 0.35 }
const TIMBER = { color: '#6b5c44', roughness: 0.95 }
const KHAKI = { color: '#5f6448', roughness: 0.88 }
const CHARRED = new THREE.Color('#2b2724')

export function Airfield({ sim, accent }: { sim: P51Sim; accent: string }) {
  return (
    <>
      <color attach="background" args={[airfield.sky]} />
      <fog attach="fog" args={[airfield.haze, airfield.fog[0], airfield.fog[1]]} />
      <Sun follow={sim.position} extent={60} />

      <Ground field={airfield} size={9000} segments={220} />
      <Paving />
      <Road />
      <Markings />
      <Trees sim={sim} />
      <Structures sim={sim} />
      <Kit sim={sim} />
      <Windsock />
      <Tracers sim={sim} />
      <Pylons sim={sim} accent={accent} />
      <Fx effects={sim.fx} haze={airfield.haze} />
    </>
  )
}

// --- The paving -------------------------------------------------------------

/** A slab that follows the graded ground under it. */
function plate(cx: number, cz: number, hx: number, hz: number) {
  const nx = Math.max(1, Math.round(hx / 12))
  const nz = Math.max(1, Math.round(hz / 12))
  const geo = new THREE.PlaneGeometry(hx * 2, hz * 2, nx, nz)
  geo.rotateX(-Math.PI / 2)
  geo.translate(cx, 0, cz)
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, airfield.height(pos.getX(i), pos.getZ(i)) + 0.05)
  }
  geo.computeVertexNormals()
  return geo
}

function loop(cx: number, cz: number, r: number) {
  const geo = new THREE.CircleGeometry(r, 26)
  geo.rotateX(-Math.PI / 2)
  geo.translate(cx, 0, cz)
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, airfield.height(pos.getX(i), pos.getZ(i)) + 0.05)
  }
  return geo
}

/** The farm road across the north of the field, where the convoy runs. */
function Road() {
  const geo = useMemo(() => plate(0, ROAD.z, 900, ROAD.halfWidth), [])
  return (
    <mesh geometry={geo} receiveShadow>
      <meshStandardMaterial color="#7d6f52" roughness={1} />
    </mesh>
  )
}

function Paving() {
  const plates = useMemo(() => {
    const out: THREE.BufferGeometry[] = [
      plate(0, 0, RUNWAY.halfWidth, RUNWAY.length / 2),
      plate(TAXIWAY.x, (TAXIWAY.from + TAXIWAY.to) / 2, TAXIWAY.halfWidth, (TAXIWAY.to - TAXIWAY.from) / 2),
      plate(-104, -225, 5, 90),
      plate(-63, -300, 42, 5),
      plate(APRON.x, APRON.z, APRON.hx, APRON.hz),
    ]
    for (const z of LINKS) out.push(plate(TAXIWAY.x / 2, z, TAXIWAY.x / 2, TAXIWAY.halfWidth))
    for (const d of DISPERSALS) out.push(loop(d.x, d.z, d.r))
    return out
  }, [])

  return (
    <>
      {plates.map((geo, i) => (
        <mesh key={i} geometry={geo} receiveShadow>
          <meshStandardMaterial {...CONCRETE} />
        </mesh>
      ))}
    </>
  )
}

/** Runway designators, painted the way they are painted: enormous. */
function numberTexture(text: string) {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 256
  const g = c.getContext('2d')
  if (!g) throw new Error('no 2d context')
  g.clearRect(0, 0, 256, 256)
  g.fillStyle = '#d9dbd4'
  g.font = '700 190px "Helvetica Neue", Arial, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(text, 128, 136)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function Markings() {
  const { thresholds, touchdown, centre, numbers, taxiLine } = useMemo(() => {
    const dummy = new THREE.Object3D()
    const bars: THREE.Matrix4[] = []
    const tdz: THREE.Matrix4[] = []
    const dashes: THREE.Matrix4[] = []
    const taxi: THREE.Matrix4[] = []
    const half = RUNWAY.length / 2

    for (const end of [-1, 1]) {
      // Threshold piano keys: eight bars a side of the centreline.
      for (let i = -4; i < 4; i++) {
        dummy.position.set(i * 3.6 + 1.8, 0.07, end * (half - 24))
        dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()
        bars.push(dummy.matrix.clone())
      }
      // Touchdown zone: three pairs, at 150 metre intervals in from it.
      for (let i = 1; i <= 3; i++) {
        for (const side of [-1, 1]) {
          dummy.position.set(side * 10, 0.07, end * (half - 60 - i * 150))
          dummy.scale.set(1, 1, 1)
          dummy.updateMatrix()
          tdz.push(dummy.matrix.clone())
        }
      }
    }

    for (let z = -half + 60; z < half - 50; z += 60) {
      dummy.position.set(0, 0.07, z)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      dashes.push(dummy.matrix.clone())
    }

    for (let z = TAXIWAY.from; z < TAXIWAY.to; z += 24) {
      dummy.position.set(TAXIWAY.x, 0.07, z + 6)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      taxi.push(dummy.matrix.clone())
    }

    return {
      thresholds: bars,
      touchdown: tdz,
      centre: dashes,
      taxiLine: taxi,
      numbers: [numberTexture('36'), numberTexture('18')],
    }
  }, [])

  return (
    <>
      <Laid matrices={thresholds} size={[1.8, 30]} colour="#d7d9d2" />
      <Laid matrices={touchdown} size={[3.2, 22]} colour="#d7d9d2" />
      <Laid matrices={centre} size={[1.2, 26]} colour="#c9ccc6" />
      <Laid matrices={taxiLine} size={[0.5, 12]} colour="#c2a83f" />

      {/* The designators: 36 at the southern threshold, 18 at the northern. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.08, -RUNWAY.length / 2 + 62]}>
        <planeGeometry args={[16, 16]} />
        <meshBasicMaterial map={numbers[0]} transparent />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, Math.PI]} position={[0, 0.08, RUNWAY.length / 2 - 62]}>
        <planeGeometry args={[16, 16]} />
        <meshBasicMaterial map={numbers[1]} transparent />
      </mesh>

      {/* Edge lines, inset from the paving the way they always are. */}
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[side * (RUNWAY.halfWidth - 1.4), 0.07, 0]}
        >
          <planeGeometry args={[0.6, RUNWAY.length - 40]} />
          <meshBasicMaterial color="#c9ccc6" />
        </mesh>
      ))}

      {/* Holding position bars where the perimeter track meets the strip. */}
      {LINKS.map((z) => (
        <mesh key={z} rotation={[-Math.PI / 2, 0, 0]} position={[RUNWAY.halfWidth + 14, 0.07, z]}>
          <planeGeometry args={[1.2, 15]} />
          <meshBasicMaterial color="#c2a83f" />
        </mesh>
      ))}
    </>
  )
}

/** One instanced mesh of flat markings, laid once. */
function Laid({
  matrices,
  size,
  colour,
}: {
  matrices: THREE.Matrix4[]
  size: [number, number]
  colour: string
}) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const geo = useMemo(
    () => new THREE.PlaneGeometry(size[0], size[1]).rotateX(-Math.PI / 2),
    [size],
  )
  useFrame(() => {
    const m = mesh.current
    if (!m || m.userData.laid) return
    matrices.forEach((mat, i) => m.setMatrixAt(i, mat))
    m.instanceMatrix.needsUpdate = true
    m.userData.laid = true
  })
  return (
    <instancedMesh ref={mesh} args={[geo, undefined, Math.max(1, matrices.length)]}>
      <meshBasicMaterial color={colour} />
    </instancedMesh>
  )
}

// --- Trees ------------------------------------------------------------------

/**
 * Three species and a hedge, each built once with its origin at the ground
 * so an instance can be scaled to its own height and leaned over by the
 * wind about its own roots. Instanced, because there are a couple of
 * hundred of them and every one is solid.
 */
function treeGeometry(species: number) {
  const parts: THREE.BufferGeometry[] = []
  const trunk = (r: number, h: number) => {
    const g = new THREE.CylinderGeometry(r * 0.7, r, h, 6)
    g.translate(0, h / 2, 0)
    return g
  }
  const blob = (r: number, y: number, squash: number) => {
    const g = new THREE.IcosahedronGeometry(r, 1)
    g.scale(1, squash, 1)
    g.translate(0, y, 0)
    return g
  }
  if (species === 0) {
    // Oak: a short trunk under a broad, lumpy crown.
    parts.push(trunk(0.05, 0.45))
    parts.push(blob(0.34, 0.62, 0.82))
    parts.push(blob(0.24, 0.84, 0.8))
    parts.push(blob(0.2, 0.52, 0.9))
  } else if (species === 1) {
    // Pine: a bare stem and three stacked skirts.
    parts.push(trunk(0.035, 1))
    for (let i = 0; i < 3; i++) {
      const g = new THREE.ConeGeometry(0.26 - i * 0.07, 0.42, 7)
      g.translate(0, 0.42 + i * 0.26, 0)
      parts.push(g)
    }
  } else if (species === 2) {
    // Poplar: tall, narrow, and planted in lines by somebody's grandfather.
    parts.push(trunk(0.03, 0.5))
    parts.push(blob(0.17, 0.62, 2.4))
  } else {
    // Hedge: no trunk to speak of.
    parts.push(blob(0.45, 0.42, 0.7))
  }

  return mergeSolid(parts)
}

const FOLIAGE = [
  new THREE.Color('#4e6b3c'),
  new THREE.Color('#3d5738'),
  new THREE.Color('#5c7a41'),
  new THREE.Color('#47603a'),
]

function Trees({ sim }: { sim: P51Sim }) {
  const species = useMemo(() => [0, 1, 2, 3].map(treeGeometry), [])
  const groups = useMemo(() => {
    const out: Obstacle[][] = [[], [], [], []]
    for (const o of sim.obstacles.list) {
      if (o.kind !== 'tree') continue
      out[(o.data.species ?? 0) as number].push(o)
    }
    return out
  }, [sim])

  const meshes = useRef<THREE.InstancedMesh[]>([])
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const tint = useMemo(() => new THREE.Color(), [])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    for (let s = 0; s < 4; s++) {
      const mesh = meshes.current[s]
      if (!mesh) continue
      const list = groups[s]
      for (let i = 0; i < list.length; i++) {
        const o = list[i]
        const h = o.data.h ?? 10
        const phase = o.pos.x * 0.11 + o.pos.z * 0.07
        // Nine metres a second through a wood: the canopies never stop.
        const sway = 0.035 * Math.sin(t * 1.35 + phase) + 0.018 * Math.sin(t * 2.7 + phase * 1.7)
        dummy.position.set(o.pos.x, o.pos.y - h / 2, o.pos.z)
        dummy.rotation.set(sway * 0.5, o.yaw, -sway)
        dummy.scale.setScalar(h)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
        if (!mesh.userData.tinted) {
          tint.copy(FOLIAGE[s]).offsetHSL(0, 0, ((o.data.tint ?? 0.5) - 0.5) * 0.12)
          mesh.setColorAt(i, tint)
        }
      }
      mesh.instanceMatrix.needsUpdate = true
      if (!mesh.userData.tinted && mesh.instanceColor) {
        mesh.instanceColor.needsUpdate = true
        mesh.userData.tinted = true
      }
    }
  })

  return (
    <>
      {species.map((geo, s) => (
        <instancedMesh
          key={s}
          ref={(el) => {
            if (el) meshes.current[s] = el
          }}
          args={[geo, undefined, Math.max(1, groups[s].length)]}
          castShadow
          receiveShadow
          frustumCulled={false}
        >
          <meshStandardMaterial roughness={0.92} metalness={0} flatShading />
        </instancedMesh>
      ))}
    </>
  )
}

// --- Buildings --------------------------------------------------------------

function Structures({ sim }: { sim: P51Sim }) {
  const list = useMemo(
    () =>
      sim.obstacles.list.filter((o) =>
        ['tower', 'hangar', 'nissen', 'flak', 'wreck-target'].includes(o.kind),
      ),
    [sim],
  )

  return (
    <>
      {list.map((o) => (
        <group key={o.id} position={[o.pos.x, o.pos.y, o.pos.z]} rotation={[0, o.yaw, 0]}>
          {o.kind === 'tower' && <Tower />}
          {o.kind === 'hangar' && <Hangar />}
          {o.kind === 'nissen' && <Nissen />}
          {o.kind === 'flak' && <FlakTower obstacle={o} sim={sim} />}
          {o.kind === 'wreck-target' && <Derelict obstacle={o} />}
        </group>
      ))}
      <Wires sim={sim} />
      <FenceLine sim={sim} />
    </>
  )
}

/** Watch Office: two floors, glazed above, with the balcony round it. */
function Tower() {
  return (
    <>
      <mesh position={[0, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[12.4, 10.4, 10]} />
        <meshStandardMaterial {...BRICK} />
      </mesh>
      {/* Glazing, all the way round the upper storey. */}
      <mesh position={[0, 3.1, 0]}>
        <boxGeometry args={[12.6, 2.6, 10.2]} />
        <meshStandardMaterial
          color="#6e8a94"
          roughness={0.12}
          metalness={0.5}
          transparent
          opacity={0.6}
        />
      </mesh>
      {/* Balcony deck and railing. */}
      <mesh position={[0, 1.6, 0]} castShadow>
        <boxGeometry args={[15.4, 0.3, 13]} />
        <meshStandardMaterial color="#8d8677" roughness={0.9} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={`x${s}`} position={[s * 7.5, 2.3, 0]}>
          <boxGeometry args={[0.12, 1, 13]} />
          <meshStandardMaterial color="#4c4f48" roughness={0.8} metalness={0.4} />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={`z${s}`} position={[0, 2.3, s * 6.4]}>
          <boxGeometry args={[15.4, 1, 0.12]} />
          <meshStandardMaterial color="#4c4f48" roughness={0.8} metalness={0.4} />
        </mesh>
      ))}
      {/* Roof, and the signal mast on top of it. */}
      <mesh position={[0, 5.4, 0]} castShadow>
        <boxGeometry args={[13, 0.5, 10.6]} />
        <meshStandardMaterial color="#5b5c56" roughness={0.9} />
      </mesh>
      <mesh position={[4.6, 8, -3.4]}>
        <cylinderGeometry args={[0.1, 0.14, 5, 6]} />
        <meshStandardMaterial color="#3f4239" roughness={0.9} />
      </mesh>
    </>
  )
}

/** Blister hangar: a curved roof on two low walls, open at both ends. */
function Hangar() {
  return (
    <>
      <mesh position={[0, -3.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[26, 6.4, 38]} />
        <meshStandardMaterial {...KHAKI} />
      </mesh>
      <mesh position={[0, -0.1, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[13, 13, 38, 20, 1, true, 0, Math.PI]} />
        <meshStandardMaterial {...CORRUGATE} side={THREE.DoubleSide} />
      </mesh>
      {/* The dark of the inside, seen through the open ends. */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, -1.4, s * 18.9]}>
          <planeGeometry args={[21, 9.6]} />
          <meshStandardMaterial color="#22241f" roughness={1} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </>
  )
}

/** Nissen hut: corrugated iron over a hoop, brick at both ends. */
function Nissen() {
  return (
    <>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[4, 4, 16, 14, 1, true, 0, Math.PI]} />
        <meshStandardMaterial {...CORRUGATE} side={THREE.DoubleSide} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, -0.4, s * 8]} castShadow>
          <boxGeometry args={[7.6, 4, 0.3]} />
          <meshStandardMaterial {...BRICK} />
        </mesh>
      ))}
      <mesh position={[1.4, 2.6, -7.9]}>
        <cylinderGeometry args={[0.14, 0.16, 1.6, 6]} />
        <meshStandardMaterial color="#454840" roughness={0.9} />
      </mesh>
    </>
  )
}

/** Flak position: a timber tower with a gun on it that follows you round. */
function FlakTower({ obstacle, sim }: { obstacle: Obstacle; sim: P51Sim }) {
  const barrel = useRef<THREE.Group>(null)
  const aim = useMemo(() => new THREE.Vector3(), [])

  useFrame(() => {
    const g = barrel.current
    if (!g) return
    if (obstacle.dead) {
      g.rotation.x += (0.9 - g.rotation.x) * 0.04
      return
    }
    aim.copy(sim.position).sub(obstacle.pos)
    g.rotation.y = Math.atan2(aim.x, aim.z)
    g.rotation.x = -Math.atan2(aim.y, Math.hypot(aim.x, aim.z))
  })

  return (
    <>
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[sx * 2.4, -0.4, sz * 2.4]} rotation={[sz * 0.1, 0, -sx * 0.1]} castShadow>
            <boxGeometry args={[0.45, 9.4, 0.45]} />
            <meshStandardMaterial {...TIMBER} />
          </mesh>
        )),
      )}
      <mesh position={[0, 4.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[7, 0.4, 7]} />
        <meshStandardMaterial {...TIMBER} />
      </mesh>
      {/* Sandbagged parapet. */}
      <mesh position={[0, 5.2, 0]} castShadow>
        <boxGeometry args={[7.2, 1.2, 7.2]} />
        <meshStandardMaterial color="#7a7156" roughness={1} />
      </mesh>
      <mesh position={[0, 5.3, 0]}>
        <boxGeometry args={[5.6, 1.3, 5.6]} />
        <meshStandardMaterial color="#3a382e" roughness={1} />
      </mesh>
      <group ref={barrel} position={[0, 5.8, 0]}>
        <mesh position={[0, 0, 0.5]} castShadow>
          <boxGeometry args={[0.6, 0.6, 1.4]} />
          <meshStandardMaterial color="#4a4d42" roughness={0.8} metalness={0.4} />
        </mesh>
        <mesh position={[0, 0.12, 2.1]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.08, 0.1, 2.6, 8]} />
          <meshStandardMaterial color="#35382f" roughness={0.6} metalness={0.6} />
        </mesh>
      </group>
    </>
  )
}

/** A derelict airframe on the range: a target, and once a fighter. */
function Derelict({ obstacle }: { obstacle: Obstacle }) {
  const group = useRef<THREE.Group>(null)
  useFrame(() => {
    const g = group.current
    if (!g || !obstacle.dead) return
    g.rotation.z += (0.3 - g.rotation.z) * 0.03
    g.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const mat = mesh.material as THREE.MeshStandardMaterial
      mat.color.lerp(CHARRED, 0.04)
    })
  })
  return (
    <group ref={group}>
      <mesh position={[0, 0, 0]} castShadow>
        <boxGeometry args={[1.1, 1.3, 8]} />
        <meshStandardMaterial color="#7d8079" roughness={0.9} metalness={0.3} />
      </mesh>
      <mesh position={[0, -0.4, 0.6]} castShadow>
        <boxGeometry args={[9.4, 0.3, 2.2]} />
        <meshStandardMaterial color="#7d8079" roughness={0.9} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0.9, -3.3]} castShadow>
        <boxGeometry args={[0.2, 1.7, 1.4]} />
        <meshStandardMaterial color="#7d8079" roughness={0.9} metalness={0.3} />
      </mesh>
      <mesh position={[0, -1.1, 0]}>
        <boxGeometry args={[2.4, 0.5, 1.6]} />
        <meshStandardMaterial color="#4a463f" roughness={1} />
      </mesh>
    </group>
  )
}

/** Telegraph wires, strung once between the poles the physics knows about. */
function Wires({ sim }: { sim: P51Sim }) {
  const geo = useMemo(() => {
    const poles = sim.obstacles.list
      .filter((o) => o.kind === 'pole')
      .sort((a, b) => a.pos.x - b.pos.x)
    const pts: number[] = []
    for (let i = 0; i < poles.length - 1; i++) {
      const a = poles[i]
      const b = poles[i + 1]
      for (const dy of [3.9, 3.3]) {
        // A wire sags. Six segments is enough to see that it does.
        for (let s = 0; s < 6; s++) {
          const t0 = s / 6
          const t1 = (s + 1) / 6
          const sag = (t: number) => -1.6 * Math.sin(t * Math.PI)
          pts.push(
            a.pos.x + (b.pos.x - a.pos.x) * t0,
            a.pos.y + dy + sag(t0),
            a.pos.z + (b.pos.z - a.pos.z) * t0,
            a.pos.x + (b.pos.x - a.pos.x) * t1,
            a.pos.y + dy + sag(t1),
            a.pos.z + (b.pos.z - a.pos.z) * t1,
          )
        }
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [sim])

  const poles = useMemo(() => sim.obstacles.list.filter((o) => o.kind === 'pole'), [sim])

  return (
    <>
      <lineSegments geometry={geo}>
        <lineBasicMaterial color="#3c3c3a" />
      </lineSegments>
      {poles.map((o) => (
        <group key={o.id} position={[o.pos.x, o.pos.y, o.pos.z]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.16, 0.24, 10, 6]} />
            <meshStandardMaterial {...TIMBER} />
          </mesh>
          <mesh position={[0, 3.6, 0]}>
            <boxGeometry args={[0.1, 0.12, 1.8]} />
            <meshStandardMaterial {...TIMBER} />
          </mesh>
        </group>
      ))}
    </>
  )
}

/** The compound fence: posts and two rails, all in one geometry. */
function FenceLine({ sim }: { sim: P51Sim }) {
  const geo = useMemo(() => {
    const parts: THREE.BufferGeometry[] = []
    for (const o of sim.obstacles.list) {
      if (o.kind !== 'fence') continue
      const len = (o.data.len ?? 60) as number
      for (let i = 0; i <= len; i += 5) {
        const g = new THREE.BoxGeometry(0.12, 1.8, 0.12)
        g.translate(o.pos.x - len / 2 + i, o.pos.y, o.pos.z)
        parts.push(g)
      }
      for (const y of [0.5, -0.2]) {
        const g = new THREE.BoxGeometry(len, 0.07, 0.07)
        g.translate(o.pos.x, o.pos.y + y, o.pos.z)
        parts.push(g)
      }
    }
    return mergeSolid(parts)
  }, [sim])

  return (
    <mesh geometry={geo} castShadow>
      <meshStandardMaterial color="#5d5241" roughness={0.95} />
    </mesh>
  )
}

// --- Vehicles, drums, parked aircraft ---------------------------------------

/**
 * Everything small and repeated. The destructible ones are re-read every
 * frame, because a lorry that has been hit has stopped and is on fire.
 */
function Kit({ sim }: { sim: P51Sim }) {
  const kinds = useMemo(() => {
    const pick = (k: string) => sim.obstacles.list.filter((o) => o.kind === k)
    return {
      truck: pick('truck'),
      drum: pick('drum'),
      parked: pick('parked'),
      bowser: pick('bowser'),
    }
  }, [sim])

  const trucks = useRef<THREE.Group[]>([])
  const drums = useRef<THREE.Group[]>([])

  useFrame(() => {
    kinds.truck.forEach((o, i) => {
      const g = trucks.current[i]
      if (!g) return
      g.position.set(o.pos.x, o.pos.y, o.pos.z)
      g.visible = !o.dead || o.deadFor < 0.2
      if (o.dead) {
        g.rotation.z = Math.min(0.35, o.deadFor * 0.4)
        g.visible = true
        g.traverse((c) => {
          const mesh = c as THREE.Mesh
          if (!mesh.isMesh) return
          ;(mesh.material as THREE.MeshStandardMaterial).color.lerp(CHARRED, 0.05)
        })
      }
    })
    kinds.drum.forEach((o, i) => {
      const g = drums.current[i]
      if (!g) return
      g.visible = !o.dead
    })
  })

  return (
    <>
      {kinds.truck.map((o, i) => (
        <group
          key={o.id}
          ref={(el) => {
            if (el) trucks.current[i] = el
          }}
          position={[o.pos.x, o.pos.y, o.pos.z]}
          rotation={[0, o.yaw, 0]}
        >
          <Lorry />
        </group>
      ))}
      {kinds.drum.map((o, i) => (
        <group
          key={o.id}
          ref={(el) => {
            if (el) drums.current[i] = el
          }}
          position={[o.pos.x, o.pos.y, o.pos.z]}
        >
          <mesh castShadow>
            <cylinderGeometry args={[0.6, 0.6, 1.8, 14]} />
            <meshStandardMaterial color="#6d5a3c" roughness={0.85} metalness={0.4} />
          </mesh>
          {[-0.5, 0.5].map((y) => (
            <mesh key={y} position={[0, y, 0]}>
              <torusGeometry args={[0.6, 0.05, 6, 14]} />
              <meshStandardMaterial color="#584a33" roughness={0.9} metalness={0.4} />
            </mesh>
          ))}
        </group>
      ))}
      {kinds.parked.map((o) => (
        <group key={o.id} position={[o.pos.x, o.pos.y, o.pos.z]} rotation={[0, o.yaw, 0]}>
          <ParkedFighter />
        </group>
      ))}
      {kinds.bowser.map((o) => (
        <group key={o.id} position={[o.pos.x, o.pos.y, o.pos.z]} rotation={[0, o.yaw, 0]}>
          <mesh position={[0, 0.1, -0.4]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[1.25, 1.25, 4.4, 14]} />
            <meshStandardMaterial color="#59604a" roughness={0.9} metalness={0.3} />
          </mesh>
          <mesh position={[0, -0.1, 2.6]} castShadow>
            <boxGeometry args={[2.1, 1.8, 1.8]} />
            <meshStandardMaterial color="#4e5441" roughness={0.9} />
          </mesh>
          {[-1, 1].map((s) =>
            [-1.4, 1.9].map((z) => (
              <mesh key={`${s}${z}`} position={[s * 1.05, -1.1, z]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.5, 0.5, 0.3, 10]} />
                <meshStandardMaterial color="#1e1f1d" roughness={0.95} />
              </mesh>
            )),
          )}
        </group>
      ))}
    </>
  )
}

function Lorry() {
  return (
    <>
      <mesh position={[0, 0.25, -0.6]} castShadow>
        <boxGeometry args={[2.3, 2.1, 4]} />
        <meshStandardMaterial color="#5b5f45" roughness={0.92} />
      </mesh>
      <mesh position={[0, -0.2, 2.1]} castShadow>
        <boxGeometry args={[2.1, 1.7, 1.9]} />
        <meshStandardMaterial color="#4c5039" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.5, 2.0]}>
        <boxGeometry args={[1.8, 0.7, 0.1]} />
        <meshStandardMaterial color="#2b2f27" roughness={0.6} metalness={0.3} />
      </mesh>
      {[-1, 1].map((s) =>
        [-1.6, 1.9].map((z) => (
          <mesh key={`${s}${z}`} position={[s * 1.15, -1.1, z]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.5, 0.5, 0.28, 10]} />
            <meshStandardMaterial color="#1e1f1d" roughness={0.95} />
          </mesh>
        )),
      )}
    </>
  )
}

/** Somebody else's Mustang, picketed on its dispersal. */
function ParkedFighter() {
  return (
    <>
      <mesh position={[0, 0.2, 0]} castShadow>
        <boxGeometry args={[1, 1.2, 8.6]} />
        <meshStandardMaterial color="#9aa1ab" roughness={0.4} metalness={0.8} />
      </mesh>
      <mesh position={[0, -0.3, 0.7]} castShadow>
        <boxGeometry args={[11, 0.34, 2.2]} />
        <meshStandardMaterial color="#9aa1ab" roughness={0.45} metalness={0.7} />
      </mesh>
      <mesh position={[0, 0.1, -3.5]} castShadow>
        <boxGeometry args={[3.9, 0.22, 1.2]} />
        <meshStandardMaterial color="#9aa1ab" roughness={0.45} metalness={0.7} />
      </mesh>
      <mesh position={[0, 0.95, -3.6]} castShadow>
        <boxGeometry args={[0.16, 1.4, 1.5]} />
        <meshStandardMaterial color="#9aa1ab" roughness={0.45} metalness={0.7} />
      </mesh>
      <mesh position={[0, 0.9, 0.9]}>
        <boxGeometry args={[0.8, 0.5, 1.9]} />
        <meshStandardMaterial color="#9fd4de" roughness={0.1} metalness={0.2} transparent opacity={0.5} />
      </mesh>
      <mesh position={[0, 0.2, 4.4]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.28, 0.1, 0.7, 12]} />
        <meshStandardMaterial color="#b23a32" roughness={0.4} metalness={0.5} />
      </mesh>
    </>
  )
}

// --- The windsock -----------------------------------------------------------

/** The only instrument on the field that is always right. */
function Windsock() {
  const sock = useRef<THREE.Group>(null)
  const base = useMemo(() => {
    const x = -70
    const z = -640
    return new THREE.Vector3(x, airfield.height(x, z), z)
  }, [])
  const quat = useMemo(() => {
    // The sock points downwind, so it lies along the wind vector.
    const dir = WIND.clone().normalize()
    return new THREE.Quaternion().setFromUnitVectors(Z, dir)
  }, [])
  const speed = useMemo(() => WIND.length(), [])

  useFrame((state) => {
    const g = sock.current
    if (!g) return
    // A full sock lifts to the horizontal at fifteen knots and wags.
    const t = state.clock.elapsedTime
    g.rotation.y = 0.09 * Math.sin(t * 1.1) + 0.05 * Math.sin(t * 2.3)
    g.rotation.x = 0.06 * Math.sin(t * 1.7 + 1) - (1 - Math.min(1, speed / 8)) * 0.5
  })

  return (
    <group position={base}>
      <mesh position={[0, 5, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.16, 10, 8]} />
        <meshStandardMaterial color="#6e7264" roughness={0.9} metalness={0.4} />
      </mesh>
      <mesh position={[0, 9.4, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.5, 0.05, 6, 16]} />
        <meshStandardMaterial color="#54584c" roughness={0.8} metalness={0.5} />
      </mesh>
      <group position={[0, 9.4, 0]} quaternion={quat}>
        <group ref={sock}>
          {[0, 1, 2, 3, 4].map((i) => (
            <mesh key={i} position={[0, 0, 0.5 + i * 0.75]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry
                args={[0.5 - i * 0.06, 0.5 - (i + 1) * 0.06, 0.75, 12, 1, true]}
              />
              <meshStandardMaterial
                color={i % 2 === 0 ? '#d8542a' : '#e6e3d8'}
                roughness={0.9}
                side={THREE.DoubleSide}
              />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  )
}

// --- Rounds in the air ------------------------------------------------------

const TRACER_CAP = 40
const SHELL_CAP = 60

function Tracers({ sim }: { sim: P51Sim }) {
  const ours = useRef<THREE.InstancedMesh>(null)
  const theirs = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const dir = useMemo(() => new THREE.Vector3(), [])
  const geo = useMemo(() => new THREE.CylinderGeometry(0.06, 0.06, 1, 5).rotateX(Math.PI / 2), [])

  useFrame(() => {
    let n = 0
    for (const r of sim.rounds) {
      if (!r.live || !r.tracer || n >= TRACER_CAP) continue
      dir.copy(r.vel).normalize()
      dummy.position.copy(r.pos)
      dummy.quaternion.setFromUnitVectors(Z, dir)
      // A tracer is a streak, not a dot: it is drawn as the length of air
      // it crosses in a frame.
      dummy.scale.set(1, 1, 9 + r.age * 10)
      dummy.updateMatrix()
      ours.current?.setMatrixAt(n, dummy.matrix)
      n++
    }
    if (ours.current) {
      ours.current.count = n
      ours.current.instanceMatrix.needsUpdate = true
      ours.current.visible = n > 0
    }

    let m = 0
    for (const s of sim.shells) {
      if (!s.live || m >= SHELL_CAP) continue
      dir.copy(s.vel).normalize()
      dummy.position.copy(s.pos)
      dummy.quaternion.setFromUnitVectors(Z, dir)
      dummy.scale.set(1.4, 1.4, 14)
      dummy.updateMatrix()
      theirs.current?.setMatrixAt(m, dummy.matrix)
      m++
    }
    if (theirs.current) {
      theirs.current.count = m
      theirs.current.instanceMatrix.needsUpdate = true
      theirs.current.visible = m > 0
    }
  })

  return (
    <>
      <instancedMesh ref={ours} args={[geo, undefined, TRACER_CAP]} frustumCulled={false}>
        <meshBasicMaterial color="#ffd08a" toneMapped={false} transparent opacity={0.9} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={theirs} args={[geo, undefined, SHELL_CAP]} frustumCulled={false}>
        <meshBasicMaterial color="#9fe0a8" toneMapped={false} transparent opacity={0.85} depthWrite={false} />
      </instancedMesh>
    </>
  )
}

// --- The course -------------------------------------------------------------

/** The course. The gate you are flying for is lit; the rest are ghosts. */
function Pylons({ sim, accent }: { sim: P51Sim; accent: string }) {
  const rings = useRef<THREE.Mesh[]>([])

  const orientations = useMemo(
    () =>
      GATES.map((g, i) => {
        const from =
          i === 0
            ? new THREE.Vector3(0, 0, -RUNWAY.length / 2)
            : new THREE.Vector3(GATES[i - 1].x, GATES[i - 1].y, GATES[i - 1].z)
        const dir = new THREE.Vector3(g.x, g.y, g.z).sub(from).normalize()
        return new THREE.Quaternion().setFromUnitVectors(Z, dir)
      }),
    [],
  )

  useFrame(() => {
    rings.current.forEach((mesh, i) => {
      if (!mesh) return
      const done = i < sim.gatesFlown
      const next = i === sim.gatesFlown
      const mat = mesh.material as THREE.MeshBasicMaterial
      mat.opacity = done ? 0.1 : next ? 0.85 : 0.25
      mesh.rotation.z += next ? 0.004 : 0
    })
  })

  return (
    <>
      {GATES.map((g, i) => (
        <mesh
          key={i}
          ref={(el) => {
            if (el) rings.current[i] = el
          }}
          position={[g.x, g.y, g.z]}
          quaternion={orientations[i]}
        >
          <torusGeometry args={[g.r, 1.6, 8, 48]} />
          <meshBasicMaterial color={accent} transparent opacity={0.3} />
        </mesh>
      ))}
    </>
  )
}

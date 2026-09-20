import * as THREE from 'three'
import { weld, type Finish } from '../../three/t34/paint'
import type { Obstacle } from '../obstacles'

/**
 * What is standing on the range.
 *
 * Each of these is built to the dimensions of the collision volume declared
 * in `targets.ts`, standing on y = 0, so that what is drawn and what can be
 * hit are the same object seen two ways. They are instanced, and the per-
 * instance colour is what chars them when they burn.
 */

const box = (w: number, h: number, d: number) =>
  new THREE.BoxGeometry(w, h, d).toNonIndexed()

const cyl = (rt: number, rb: number, h: number, seg = 10) =>
  new THREE.CylinderGeometry(rt, rb, h, seg).toNonIndexed()

interface Place {
  x?: number
  y?: number
  z?: number
  rx?: number
  ry?: number
  rz?: number
}

function put(g: THREE.BufferGeometry, p: Place) {
  if (p.rx) g.rotateX(p.rx)
  if (p.ry) g.rotateY(p.ry)
  if (p.rz) g.rotateZ(p.rz)
  g.translate(p.x ?? 0, p.y ?? 0, p.z ?? 0)
  return g
}

const BURNT: Finish = { base: '#5d5647', grime: 0.5, whitewash: 0, scuff: 0.6, scale: 0.5 }
const RUST: Finish = { base: '#6a5540', grime: 0.4, whitewash: 0, scuff: 0.7, scale: 0.3 }
const TIMBER: Finish = { base: '#6d5b41', grime: 0.15, whitewash: 0, scuff: 0.45, scale: 0.3 }
const THATCH: Finish = { base: '#8a7b52', grime: 0.1, whitewash: 0, scuff: 0.3, scale: 0.25 }
const BRICK: Finish = { base: '#8a7b6c', grime: 0.2, whitewash: 0.2, wear: 0.6, scuff: 0.4, scale: 0.35 }
const BARK: Finish = { base: '#5a4a38', grime: 0.2, whitewash: 0, scuff: 0.35, scale: 0.25 }
const LEAF: Finish = { base: '#3f5433', grime: 0.05, whitewash: 0, scuff: 0.15, scale: 1.2 }
const CANVAS: Finish = { base: '#57604a', grime: 0.25, whitewash: 0, scuff: 0.4, scale: 0.35 }
const DRUM: Finish = { base: '#5f5b3e', grime: 0.3, whitewash: 0, scuff: 0.6, scale: 0.2 }
const HAY: Finish = { base: '#9a8a52', grime: 0.08, whitewash: 0, scuff: 0.25, scale: 0.5 }

/** The wreck of a medium tank. Built to a 3.1 × 2.6 × 6.4 m volume. */
export function hulkBody() {
  const pieces: { geo: THREE.BufferGeometry; finish: Finish }[] = []
  const add = (geo: THREE.BufferGeometry, finish: Finish = BURNT) => pieces.push({ geo, finish })
  // Lower hull, sponson and a sloped nose.
  add(put(box(1.9, 0.5, 5.8), { y: 0.55 }))
  add(put(box(2.9, 0.62, 5.2), { y: 1.14 }))
  add(put(box(2.6, 0.08, 1.5), { rx: 0.52, y: 1.06, z: 2.7 }))
  // Running gear: five wheels a side and the track it threw.
  for (const s of [1, -1]) {
    for (let i = 0; i < 5; i++) {
      add(put(cyl(0.42, 0.42, 0.24, 12), { rz: Math.PI / 2, x: s * 1.2, y: 0.44, z: 1.9 - i * 0.95 }), RUST)
    }
    add(put(box(0.5, 0.06, 5.6), { x: s * 1.2, y: 0.03 }), RUST)
    add(put(box(0.5, 0.06, 4.4), { x: s * 1.2, y: 0.88 }), RUST)
    add(put(box(0.6, 0.03, 5.2), { x: s * 1.3, y: 1.48 }), RUST)
  }
  return weld(pieces)
}

/** Its turret, which the exploding ammunition throws clear. */
export function hulkTurret() {
  return weld([
    { geo: put(cyl(0.95, 1.2, 0.8, 16), { y: 0.4 }), finish: BURNT },
    { geo: put(cyl(0.18, 0.2, 0.1, 10), { y: 0.82, x: -0.35 }), finish: BURNT },
    { geo: put(cyl(0.09, 0.11, 3.6, 10), { rx: Math.PI / 2, y: 0.3, z: 1.9 }), finish: RUST },
  ])
}

/** A three-tonne lorry with a canvas tilt. */
export function lorryBody() {
  return weld([
    { geo: put(box(2.3, 1.3, 4.2), { y: 1.45, z: -0.6 }), finish: CANVAS },
    { geo: put(box(2.2, 1.1, 1.7), { y: 1.35, z: 2.0 }), finish: BURNT },
    { geo: put(box(2.0, 0.5, 1.4), { y: 2.1, z: 1.7 }), finish: BURNT },
    { geo: put(box(2.4, 0.35, 5.4), { y: 0.8 }), finish: RUST },
    ...[1, -1].flatMap((s) =>
      [2.0, -0.6, -1.5].map((z) => ({
        geo: put(cyl(0.48, 0.48, 0.28, 10), { rz: Math.PI / 2, x: s * 1.05, y: 0.5, z }),
        finish: RUST,
      })),
    ),
  ])
}

/** Timber walls, a plank door and a low thatched roof. */
export function hutWalls(hx: number, hz: number) {
  const pieces: { geo: THREE.BufferGeometry; finish: Finish }[] = []
  for (const s of [1, -1]) {
    pieces.push({ geo: put(box(0.14, 2.0, hz * 2), { x: s * hx, y: 1.0 }), finish: TIMBER })
    pieces.push({ geo: put(box(hx * 2, 2.0, 0.14), { y: 1.0, z: s * hz }), finish: TIMBER })
  }
  // Log courses, which is what makes it read as a hut and not a shed.
  for (let i = 0; i < 7; i++) {
    for (const s of [1, -1]) {
      pieces.push({
        geo: put(cyl(0.11, 0.11, hz * 2, 6), { rx: Math.PI / 2, x: s * hx, y: 0.16 + i * 0.28 }),
        finish: TIMBER,
      })
    }
  }
  pieces.push({ geo: put(box(0.8, 1.5, 0.08), { y: 0.75, z: hz + 0.04 }), finish: BARK })
  return weld(pieces)
}

export function hutRoof(hx: number, hz: number) {
  return weld([
    {
      geo: put(box(Math.hypot(hx * 1.1, 0.9) * 2, 0.16, hz * 2.2), { rz: 0.68 }),
      finish: THATCH,
    },
    { geo: put(cyl(0.16, 0.2, 1.1, 8), { x: hx * 0.4, y: 0.9 }), finish: BRICK },
  ])
}

/** A 200-litre fuel drum on its end. */
export function drumBody() {
  return weld([
    { geo: put(cyl(0.33, 0.33, 0.9, 14), { y: 0.45 }), finish: DRUM },
    { geo: put(cyl(0.35, 0.35, 0.06, 14), { y: 0.26 }), finish: DRUM },
    { geo: put(cyl(0.35, 0.35, 0.06, 14), { y: 0.64 }), finish: DRUM },
  ])
}

export function hayBody(r: number, h: number) {
  return weld([
    { geo: put(cyl(r * 0.55, r, h * 0.7, 12), { y: h * 0.35 }), finish: HAY },
    { geo: put(cyl(0.02, r * 0.6, h * 0.42, 12), { y: h * 0.85 }), finish: HAY },
  ])
}

/** A plank bridge on log trestles. */
export function bridgeBody(hx: number, hz: number) {
  const pieces: { geo: THREE.BufferGeometry; finish: Finish }[] = []
  for (let i = 0; i < 14; i++) {
    pieces.push({
      geo: put(box(hx * 2, 0.1, (hz * 2) / 15), { y: 1.35, z: -hz + 0.2 + (i * hz * 2) / 14 }),
      finish: TIMBER,
    })
  }
  for (const s of [1, -1]) {
    pieces.push({ geo: put(box(0.14, 0.5, hz * 2), { x: s * hx, y: 1.6 }), finish: TIMBER })
    for (const z of [-hz * 0.7, 0, hz * 0.7]) {
      pieces.push({ geo: put(cyl(0.16, 0.18, 2.6, 7), { x: s * (hx - 0.3), y: 0.1, z }), finish: BARK })
    }
  }
  return weld(pieces)
}

export function wallBody(hx: number, hy: number, hz: number) {
  const pieces: { geo: THREE.BufferGeometry; finish: Finish }[] = []
  // Courses, so a broken wall has something to break into.
  const courses = 7
  for (let i = 0; i < courses; i++) {
    const w = hx * 2 - (i > courses - 3 ? 0.3 : 0)
    pieces.push({
      geo: put(box(w, (hy * 2) / courses - 0.02, hz * 2), { y: ((i + 0.5) * hy * 2) / courses }),
      finish: BRICK,
    })
  }
  return weld(pieces)
}

export function treeBody(height: number) {
  return weld([
    { geo: put(cyl(0.26, 0.55, height, 8), { y: height / 2 }), finish: BARK },
    { geo: put(cyl(0.1, 2.4, height * 0.62, 9), { y: height * 0.72 }), finish: LEAF },
    { geo: put(cyl(0.6, 2.9, height * 0.34, 9), { y: height * 0.5 }), finish: LEAF },
  ])
}

export function fenceBody() {
  return weld([
    { geo: put(box(0.14, 1.5, 0.14), { x: -1.0, y: 0.75 }), finish: BARK },
    { geo: put(box(0.14, 1.5, 0.14), { x: 1.0, y: 0.75 }), finish: BARK },
    { geo: put(box(2.1, 0.1, 0.06), { y: 1.2 }), finish: TIMBER },
    { geo: put(box(2.1, 0.1, 0.06), { y: 0.7 }), finish: TIMBER },
  ])
}

export function saplingBody() {
  return weld([
    { geo: put(cyl(0.05, 0.12, 3.4, 6), { y: 1.7 }), finish: BARK },
    { geo: put(cyl(0.05, 0.75, 2.0, 7), { y: 2.5 }), finish: LEAF },
  ])
}

/** Where the bottom of an obstacle's volume sits, so props stand on the ground. */
export function groundOf(o: Obstacle) {
  const v = o.volume
  if (v.kind === 'box') return o.pos.y - v.hy
  if (v.kind === 'cylinder') return o.pos.y - v.h / 2
  return o.pos.y - v.r
}

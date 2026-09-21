import * as THREE from 'three'
import { weld, type Finish } from '../../three/t34/paint'
import { ARMCO, BOARD, TYRE_STACK } from './furniture'

/**
 * What stands beside the circuit, as geometry.
 *
 * Each of these is built to the collision volume declared in `furniture.ts`,
 * standing on y = 0 about its own centre, so that what is drawn and what
 * can be hit are one object seen two ways. They are instanced, and the
 * per-instance colour is what dirties a barrier that has been hit.
 */

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d).toNonIndexed()

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

const GALV: Finish = { base: '#a3a7aa', grime: 0.25, scuff: 0.5, scale: 0.3 }
const POST: Finish = { base: '#6b6e72', grime: 0.3, scuff: 0.4, scale: 0.2 }
const TYRE: Finish = { base: '#232326', grime: 0.35, scuff: 0.1, scale: 0.15 }
const WHITE: Finish = { base: '#e9e7df', grime: 0.15, scuff: 0.2, scale: 0.3 }
const BOARD_FACE: Finish = { base: '#f0eee6', grime: 0.08, scuff: 0.1, scale: 0.3 }
const TIMBER: Finish = { base: '#7a6a4f', grime: 0.2, scuff: 0.4, scale: 0.3 }
const CONCRETE: Finish = { base: '#c9c5bb', grime: 0.2, scuff: 0.3, scale: 0.5 }
const STAND: Finish = { base: '#8b857a', grime: 0.25, scuff: 0.3, scale: 0.6 }
const SEATS: Finish = { base: '#5c6b7a', grime: 0.1, scuff: 0.2, scale: 0.3 }

/** One length of Armco: the corrugated rail on two posts. */
export function armcoBody() {
  const h = ARMCO.height
  const L = ARMCO.length
  return weld([
    // Two-wave rail: a slab with a ridge, which reads as corrugation at speed.
    { geo: put(box(0.06, 0.3, L), { y: h - 0.16 }), finish: GALV },
    { geo: put(box(0.1, 0.06, L), { y: h - 0.16 }), finish: GALV },
    { geo: put(box(0.06, 0.02, L), { y: h - 0.02 }), finish: GALV },
    { geo: put(box(0.06, 0.02, L), { y: h - 0.3 }), finish: GALV },
    { geo: put(box(0.1, h - 0.1, 0.1), { x: -0.06, y: (h - 0.1) / 2, z: -L / 2 + 0.3 }), finish: POST },
    { geo: put(box(0.1, h - 0.1, 0.1), { x: -0.06, y: (h - 0.1) / 2, z: L / 2 - 0.3 }), finish: POST },
  ])
}

/** A stack of five tyres, bolted, with a white band on the top one. */
export function tyreStackBody() {
  const pieces: { geo: THREE.BufferGeometry; finish: Finish }[] = []
  const each = TYRE_STACK.h / 5
  for (let i = 0; i < 5; i++) {
    pieces.push({
      geo: put(new THREE.TorusGeometry(TYRE_STACK.r - 0.12, 0.12, 8, 20).toNonIndexed(), {
        rx: Math.PI / 2,
        y: each * (i + 0.5),
      }),
      finish: i === 4 ? WHITE : TYRE,
    })
  }
  return weld(pieces)
}

/** A marker board on a single post, about its base. */
export function boardBody() {
  return weld([
    { geo: put(box(BOARD.w, BOARD.h * 0.6, 0.04), { y: BOARD.h * 0.7 }), finish: BOARD_FACE },
    { geo: put(box(0.06, BOARD.h * 0.45, 0.06), { y: BOARD.h * 0.22 }), finish: TIMBER },
  ])
}

/** A gantry post, about its base. */
export function postBody() {
  return weld([{ geo: put(box(0.25, 6, 0.25), { y: 3 }), finish: WHITE }])
}

/** The pit wall: low concrete with a timber signalling ledge. */
export function pitWallBody() {
  return weld([
    { geo: put(box(0.4, 1.1, 90), { y: 0.55 }), finish: CONCRETE },
    { geo: put(box(0.6, 0.05, 90), { y: 1.12 }), finish: TIMBER },
  ])
}

/** The grandstand: a raked block with rows of seats and a roof on posts. */
export function standBody() {
  const pieces: { geo: THREE.BufferGeometry; finish: Finish }[] = [
    { geo: put(box(12, 1.2, 70), { y: 0.6 }), finish: STAND },
  ]
  for (let i = 0; i < 6; i++) {
    pieces.push({ geo: put(box(1.6, 0.5, 70), { x: -5 + i * 1.8, y: 1.45 + i * 0.75 }), finish: SEATS })
    pieces.push({ geo: put(box(1.8, 0.75, 70), { x: -5 + i * 1.8, y: 1.2 + i * 0.75 - 0.375 + 0.75 }), finish: STAND })
  }
  pieces.push({ geo: put(box(13, 0.15, 72), { y: 7.4 }), finish: CONCRETE })
  for (const z of [-33, -11, 11, 33]) {
    pieces.push({ geo: put(box(0.25, 6.3, 0.25), { x: 6, y: 4.25, z }), finish: POST })
  }
  return weld(pieces)
}

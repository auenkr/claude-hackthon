import { nearestOnTrack, START_INDEX, TRACK, TRACK_LINE } from '../fields/circuit'
import type { Obstacles } from '../obstacles'

/**
 * What stands beside the circuit, and what it does to a car that hits it.
 *
 * Declared once here and read twice: the simulation tests against these
 * volumes, and the scene draws them. Armco lines the outside of every
 * corner, tyre walls stand where the fast ones run out of road, marker
 * boards count down to the braking points, and the pit wall, gantry and
 * grandstand hold the start.
 */

export interface Kind {
  label: string
  /** How much of the car's speed it takes, 0–1. Boards fall over; Armco does not. */
  solidity: number
  hp: number
  blocksWhenDead: boolean
}

export const KINDS: Record<string, Kind> = {
  armco: { label: 'barrier', solidity: 0.85, hp: Infinity, blocksWhenDead: true },
  tyres: { label: 'tyre wall', solidity: 0.5, hp: Infinity, blocksWhenDead: true },
  board: { label: 'marker board', solidity: 0.08, hp: 1, blocksWhenDead: false },
  post: { label: 'gantry', solidity: 0.95, hp: Infinity, blocksWhenDead: true },
  pitwall: { label: 'pit wall', solidity: 0.95, hp: Infinity, blocksWhenDead: true },
  stand: { label: 'grandstand', solidity: 1, hp: Infinity, blocksWhenDead: true },
}

/** Armco segment length and the offset of every barrier from the centreline. */
export const ARMCO = { length: 3.6, height: 0.72, offset: TRACK.halfWidth + TRACK.kerb + 3.2 }
export const TYRE_STACK = { r: 0.55, h: 1.05 }
export const BOARD = { w: 0.9, h: 1.2, offset: TRACK.halfWidth + 3.6 }

const N = TRACK_LINE.length
const wrapIndex = (i: number) => ((i % N) + N) % N

/** Signed curvature at a sample: negative is a right-hand bend. */
function turn(i: number) {
  const a = TRACK_LINE[wrapIndex(i - 4)]
  const b = TRACK_LINE[wrapIndex(i + 4)]
  return a.tx * b.tz - a.tz * b.tx
}

/** Local radius, from the heading change across the neighbours. */
function radius(i: number) {
  const a = TRACK_LINE[wrapIndex(i - 4)]
  const b = TRACK_LINE[wrapIndex(i + 4)]
  let bend = Math.atan2(b.tx, b.tz) - Math.atan2(a.tx, a.tz)
  while (bend > Math.PI) bend -= Math.PI * 2
  while (bend < -Math.PI) bend += Math.PI * 2
  const arc = Math.hypot(b.x - a.x, b.z - a.z)
  return Math.abs(bend) > 1e-5 ? arc / Math.abs(bend) : Infinity
}

export function furnish(obstacles: Obstacles) {
  obstacles.reset()
  const start = TRACK_LINE[START_INDEX]
  const heading = (i: number) => Math.atan2(TRACK_LINE[i].tx, TRACK_LINE[i].tz)

  // --- Armco on the outside of every bend tighter than 260 m -------------
  // Placed every segment length along the outside, and carried on for a
  // few segments past the corner so the exit is caught too.
  let carry = 0
  let lastOutside = 0
  for (let i = 0; i < N; i += 1) {
    const r = radius(i)
    const t = turn(i)
    if (r < 260 && Math.abs(t) > 0.004) {
      carry = 6
      lastOutside = t < 0 ? -1 : 1
    } else {
      carry--
    }
    if (carry <= 0) continue
    const p = TRACK_LINE[i]
    const step = Math.hypot(TRACK_LINE[wrapIndex(i + 1)].x - p.x, TRACK_LINE[wrapIndex(i + 1)].z - p.z)
    // One segment covers about one sample; skip to keep the run even.
    if (i % Math.max(1, Math.round(ARCMO_SPACING / step)) !== 0) continue
    const off = lastOutside * ARMCO.offset
    obstacles.add(
      'armco',
      [p.x + p.tz * off, ARMCO.height / 2, p.z - p.tx * off],
      { kind: 'box', hx: 0.08, hy: ARMCO.height / 2, hz: ARMCO.length / 2 },
      { yaw: heading(i), solidity: KINDS.armco.solidity, data: { side: lastOutside } },
    )
  }

  // --- Tyre walls where the tight corners run out ------------------------
  for (let i = 0; i < N; i += 1) {
    const r = radius(i)
    if (r > 95) continue
    // Only at the apex of each tight corner: where the radius is locally least.
    if (radius(wrapIndex(i - 6)) < r || radius(wrapIndex(i + 6)) < r) continue
    const outside = turn(i) < 0 ? -1 : 1
    const p = TRACK_LINE[wrapIndex(i + 10)] // just past the apex, on the exit
    for (let k = -2; k <= 2; k++) {
      const q = TRACK_LINE[wrapIndex(i + 10 + k * 2)]
      const off = outside * (ARMCO.offset - 1.4)
      obstacles.add(
        'tyres',
        [q.x + q.tz * off, TYRE_STACK.h / 2, q.z - q.tx * off],
        { kind: 'cylinder', r: TYRE_STACK.r, h: TYRE_STACK.h },
        { solidity: KINDS.tyres.solidity, data: { seed: i + k } },
      )
    }
    void p
  }

  // --- Marker boards, on the outside every forty samples -----------------
  for (let i = 0; i < N; i += 40) {
    const p = TRACK_LINE[i]
    const off = BOARD.offset
    obstacles.add(
      'board',
      [p.x + p.tz * off, BOARD.h / 2, p.z - p.tx * off],
      { kind: 'box', hx: BOARD.w / 2, hy: BOARD.h / 2, hz: 0.05 },
      { yaw: heading(i), hp: 1, solidity: KINDS.board.solidity, data: { accent: i % 80 === 0 ? 1 : 0 } },
    )
  }

  // --- The start: gantry, pit wall, grandstand ---------------------------
  const nx = start.tz
  const nz = -start.tx
  const gantryW = TRACK.halfWidth + TRACK.kerb + 1.2
  for (const side of [1, -1]) {
    obstacles.add(
      'post',
      [start.x + nx * gantryW * side, 3, start.z + nz * gantryW * side],
      { kind: 'box', hx: 0.14, hy: 3, hz: 0.14 },
      { solidity: KINDS.post.solidity },
    )
  }
  obstacles.add(
    'pitwall',
    [start.x - nx * (gantryW + 1.5), 0.55, start.z],
    { kind: 'box', hx: 0.2, hy: 0.55, hz: 45 },
    { yaw: heading(START_INDEX), solidity: KINDS.pitwall.solidity },
  )
  obstacles.add(
    'stand',
    [start.x - nx * (gantryW + 14), 3.2, start.z],
    { kind: 'box', hx: 6, hy: 3.2, hz: 35 },
    { yaw: heading(START_INDEX), solidity: KINDS.stand.solidity },
  )
}

/** Keep the Armco runs at a steady pitch whatever the sample spacing. */
const ARCMO_SPACING = ARMCO.length

/** Is a point on the far side of a barrier line? Used by nothing yet but the scene's keep-out. */
export const offCircuit = (x: number, z: number) => nearestOnTrack(x, z).dist < 30

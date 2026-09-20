import { killDevil } from '../fields/killDevil'
import { hash } from '../terrain'
import type { Obstacles } from '../obstacles'

/**
 * The camp at Kill Devil Hills, as one set of numbers.
 *
 * Everything standing on the sand is declared here and nowhere else: the
 * simulation turns this into collision volumes and the scene draws from the
 * same list, so a thing that is drawn is a thing you can hit. Positions are
 * in the simulation's frame — the rail runs north along +Z from the origin,
 * the sea is east at +X, and the big hill is behind you at −Z.
 */

/**
 * The launch rail. 'The Grand Junction Railroad', in the brothers' joke:
 * four fifteen-foot two-by-fours laid end to end and shimmed level, faced
 * with a thin strip of iron for the truck to run on.
 */
export const RAIL = {
  boards: 4,
  /** 15 ft, the stock length they bought. */
  board: 4.572,
  width: 0.14,
  height: 0.06,
  /** South end of the first board. The machine's datum starts at z = 0. */
  start: -3.2,
}
export const RAIL_LENGTH = RAIL.boards * RAIL.board
export const RAIL_END = RAIL.start + RAIL_LENGTH

/** The truck: a bicycle-hub axle on a yoke, which carries the machine out. */
export const TRUCK = { length: 0.62, width: 0.34, wheel: 0.075 }

/** Where the day's four flights are marked out on the flats. */
export const MARKER_X = 14
export const MARKER_Z0 = 10

/**
 * The camp, south-west of the rail: the 1901 shed and the longer 1902
 * building, which by 1903 held the machine itself and the two of them.
 * Sizes are the boards they bought, converted from feet.
 */
export const CAMP = {
  yaw: 0.22,
  shed: { x: -33, z: -29, length: 7.62, width: 4.88, eaves: 2.13, ridge: 3.05 },
  hangar: { x: -47, z: -18, length: 13.41, width: 4.88, eaves: 2.13, ridge: 3.2 },
}

/** The derrick they used for hoisting, and the anemometer post beside it. */
export const DERRICK = { x: -21, z: -21, height: 6.1, spread: 2.4 }
export const ANEMOMETER = { x: 9.4, z: 13.5, height: 2.1 }

/** Deterministic scatter: same driftwood on the same sand every visit. */
function rng(i: number, salt: number) {
  return hash(i * 17 + salt * 131, i * 7 + salt * 37)
}

export interface Log {
  x: number
  z: number
  yaw: number
  length: number
  radius: number
}

/**
 * Driftwood, thrown up by the Atlantic and half-buried. Kept mostly off the
 * corridor the machine flies down, but not entirely: a log in the sand is
 * exactly the sort of thing that ends a flight at a yard's altitude.
 */
export const DRIFTWOOD: Log[] = (() => {
  const out: Log[] = []
  for (let i = 0; i < 34; i++) {
    const side = i % 2 ? 1 : -1
    const near = i % 5 === 0
    const x = side * (near ? 7 + rng(i, 1) * 9 : 18 + rng(i, 1) * 90)
    const z = -70 + rng(i, 2) * 430
    out.push({
      x,
      z,
      yaw: rng(i, 3) * Math.PI,
      length: 1.6 + rng(i, 4) * 3.4,
      radius: 0.16 + rng(i, 5) * 0.14,
    })
  }
  return out
})()

export interface Tree {
  x: number
  z: number
  height: number
  radius: number
  lean: number
}

/**
 * The scrub pine to the west. There were no trees on the flats themselves —
 * the sand had killed everything for a mile — but the maritime forest stood
 * back from the dunes, and it is the only thing on the horizon that gives
 * the flats their size.
 */
export const TREES: Tree[] = (() => {
  const out: Tree[] = []
  for (let i = 0; i < 168; i++) {
    const x = -155 - rng(i, 11) * 250
    const z = -420 + rng(i, 12) * 960
    // Thinner and lower at the seaward edge, where the salt gets them.
    const shelter = Math.min(1, (-x - 155) / 190)
    const height = 3.4 + shelter * 7 + rng(i, 13) * 3.2
    out.push({
      x,
      z,
      height,
      radius: 0.12 + height * 0.022,
      lean: (rng(i, 14) - 0.5) * 0.14,
    })
  }
  return out
})()

/** Sea oats, bent by the wind. Not solid: grass does not stop an aeroplane. */
export interface Tuft {
  x: number
  z: number
  height: number
  scale: number
}

export const TUFTS: Tuft[] = (() => {
  const out: Tuft[] = []
  const n = 2600
  for (let i = 0; i < n; i++) {
    // Golden-angle spiral, biased toward the flight path so the grass is
    // dense where it can be seen going past.
    const a = i * 2.399963
    const r = 260 * ((i + 0.5) / n) ** 0.72
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r + 110
    // Nothing grows on the rail, and little on the bare wind-scoured flat.
    if (Math.abs(x) < 3.4 && z > RAIL.start - 6 && z < RAIL_END + 6) continue
    const h = 0.45 + rng(i, 21) * 0.75
    out.push({ x, z, height: h, scale: 0.7 + rng(i, 22) * 0.6 })
  }
  return out
})()

/**
 * Declare everything solid. Each volume is the thing the scene draws, at the
 * size the scene draws it; `solidity` is how badly the machine comes off.
 * A 338 kg airframe of spruce and muslin comes off badly against all of it.
 */
export function populate(obstacles: Obstacles, records: { m: number }[]) {
  const ground = (x: number, z: number) => killDevil.height(x, z)

  for (const b of [CAMP.shed, CAMP.hangar]) {
    const h = ground(b.x, b.z)
    obstacles.add(
      'building',
      [b.x, h + b.eaves / 2, b.z],
      { kind: 'box', hx: b.length / 2, hy: b.eaves / 2, hz: b.width / 2 },
      { yaw: CAMP.yaw, data: { ridge: b.ridge, length: b.length, width: b.width } },
    )
  }

  obstacles.add(
    'derrick',
    [DERRICK.x, ground(DERRICK.x, DERRICK.z) + DERRICK.height / 2, DERRICK.z],
    { kind: 'cylinder', r: DERRICK.spread * 0.6, h: DERRICK.height },
  )

  obstacles.add(
    'anemometer',
    [ANEMOMETER.x, ground(ANEMOMETER.x, ANEMOMETER.z) + ANEMOMETER.height / 2, ANEMOMETER.z],
    { kind: 'cylinder', r: 0.22, h: ANEMOMETER.height },
    { solidity: 0.6 },
  )

  records.forEach((r, i) => {
    const z = MARKER_Z0 + r.m
    obstacles.add(
      'marker',
      [MARKER_X, ground(MARKER_X, z) + 0.9, z],
      { kind: 'cylinder', r: 0.14, h: 1.8 },
      { solidity: 0.7, data: { index: i, metres: r.m } },
    )
  })

  for (const log of DRIFTWOOD) {
    const h = ground(log.x, log.z)
    obstacles.add(
      'driftwood',
      [log.x, h + log.radius * 0.6, log.z],
      { kind: 'box', hx: log.length / 2, hy: log.radius, hz: log.radius },
      { yaw: log.yaw, solidity: 0.55, data: { length: log.length, radius: log.radius } },
    )
  }

  for (const t of TREES) {
    obstacles.add(
      'pine',
      [t.x, ground(t.x, t.z) + t.height / 2, t.z],
      { kind: 'cylinder', r: t.radius + t.height * 0.13, h: t.height },
      { data: { height: t.height, radius: t.radius, lean: t.lean } },
    )
  }
}

/** Board `i` of the rail: its centre, and the height of its top face. */
export function railBoard(i: number) {
  const z = RAIL.start + RAIL.board * (i + 0.5)
  return { z, ground: killDevil.height(0, z) }
}

/**
 * Top of the rail at a point along it. The boards were shimmed to one level,
 * so the running surface is flat even where the sand is not.
 */
export const RAIL_TOP = (() => {
  let highest = -Infinity
  for (let i = 0; i <= 24; i++) {
    const z = RAIL.start + (RAIL_LENGTH * i) / 24
    highest = Math.max(highest, killDevil.height(0, z))
  }
  return highest + RAIL.height
})()

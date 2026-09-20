import type { Obstacle, Obstacles } from '../obstacles'
import { APRON, DISPERSALS, ROAD, RUNWAY, airfield, paving } from '../fields/airfield'

/**
 * What stands on the airfield.
 *
 * One list, built once, used twice: the simulation tests the aeroplane and
 * its bullets against it, and the scene draws it by walking the same array.
 * Nothing is placed by hand in the scene file, so a hangar cannot be drawn
 * somewhere the physics does not know about — and a tree you can see is a
 * tree you can fly into.
 *
 * Hit points are in rounds of .50 Browning. A forty-gallon drum goes up on
 * the third strike; a three-ton lorry takes a dozen; a flak tower has to be
 * worked over properly, and shoots back while you do it.
 */

/** The gunnery range, at the far end of the field. */
export const RANGE = { x: 70, z: 1180 }

export interface World {
  /** Everything that scores in the strafing exercise. */
  targets: Obstacle[]
  /** The lorries, which drive down the road until somebody hits one. */
  convoy: Obstacle[]
  /** The flak, which is the reason the strafing run is one pass and away. */
  flak: Obstacle[]
}

/** A small deterministic generator, so every visitor gets the same trees. */
function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const ground = (x: number, z: number) => airfield.height(x, z)

/** Is this a sensible place for a tree? Not on the paving, not on approach. */
function plantable(x: number, z: number) {
  if (paving(x, z) > 0.02) return false
  if (Math.abs(x) < 150 && Math.abs(z) < RUNWAY.length / 2 + 900) return false
  if (Math.abs(z - ROAD.z) < 22) return false
  if (Math.abs(x - APRON.x) < APRON.hx + 40 && Math.abs(z - APRON.z) < APRON.hz + 40) return false
  if (Math.hypot(x - RANGE.x, z - RANGE.z) < 320) return false
  for (const d of DISPERSALS) if (Math.hypot(x - d.x, z - d.z) < d.r + 30) return false
  return true
}

export function buildWorld(obs: Obstacles): World {
  const targets: Obstacle[] = []
  const convoy: Obstacle[] = []
  const flak: Obstacle[] = []
  const rand = seeded(20240606)

  // --- Woods ---------------------------------------------------------------
  // Trees grow in copses, not in an even scatter, and an aerodrome is a hole
  // cut in the landscape rather than a lawn with shrubs on it.
  const copses: [number, number][] = [
    [-520, -1250], [-680, -600], [-620, 260], [-540, 980], [-460, 1620],
    [560, -1420], [700, -760], [760, 120], [660, 900], [520, 1560],
    [-180, -1900], [260, -1980], [-260, 2050], [300, 2120], [980, -300], [-900, 460],
  ]
  for (let c = 0; c < copses.length; c++) {
    const [cx, cz] = copses[c]
    const n = 12 + Math.floor(rand() * 7)
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2
      const r = 70 * Math.sqrt(rand())
      const x = cx + Math.cos(a) * r
      const z = cz + Math.sin(a) * r * 1.4
      if (!plantable(x, z)) continue
      const species = Math.floor(rand() * 3)
      const h = (species === 1 ? 15 : 11) * (0.7 + rand() * 0.6)
      const spread = species === 2 ? 0.28 : species === 1 ? 0.22 : 0.4
      obs.add('tree', [x, ground(x, z) + h / 2, z], { kind: 'cylinder', r: h * spread, h }, {
        yaw: rand() * Math.PI,
        solidity: 0.5,
        data: { h, species, tint: rand() },
      })
    }
  }

  // Hedgerow along the road: the boundary of somebody's field, which the
  // aerodrome was carved out of two years ago.
  for (let x = -760; x <= 760; x += 46) {
    const z = ROAD.z + 26
    const h = 5 + rand() * 2
    obs.add('tree', [x, ground(x, z) + h / 2, z], { kind: 'cylinder', r: 2.6, h }, {
      solidity: 0.35,
      data: { h, species: 3, tint: rand() },
    })
  }

  // --- Technical site ------------------------------------------------------
  // Control tower: a Watch Office, two floors, glazed and with a balcony.
  const tower = { x: APRON.x - 40, z: APRON.z + 60 }
  obs.add('tower', [tower.x, ground(tower.x, tower.z) + 5.2, tower.z], {
    kind: 'box', hx: 6.2, hy: 5.2, hz: 5.0,
  }, { solidity: 1, data: {} })

  // Two blister hangars, curved roof, open at both ends.
  for (const z of [APRON.z - 74, APRON.z + 6]) {
    const x = APRON.x + 34
    obs.add('hangar', [x, ground(x, z) + 6.5, z], { kind: 'box', hx: 13, hy: 6.5, hz: 19 }, {
      solidity: 1,
      data: {},
    })
  }

  // Nissen huts: corrugated half-cylinders, the accommodation for everybody
  // who is not flying.
  for (let i = 0; i < 5; i++) {
    const x = APRON.x + 56
    const z = APRON.z + 56 + i * 22
    obs.add('nissen', [x, ground(x, z) + 2.4, z], { kind: 'box', hx: 4, hy: 2.4, hz: 8 }, {
      solidity: 0.9,
      data: { i },
    })
  }

  // A compound fence around the site, and telegraph poles down the road.
  const fx0 = APRON.x - APRON.hx
  const fx1 = APRON.x + APRON.hx
  const fz0 = APRON.z - APRON.hz
  const fz1 = APRON.z + APRON.hz
  for (let x = fx0; x < fx1; x += 60) {
    for (const z of [fz0, fz1]) {
      const len = Math.min(60, fx1 - x)
      obs.add('fence', [x + len / 2, ground(x, z) + 0.9, z], { kind: 'box', hx: len / 2, hy: 0.9, hz: 0.12 }, {
        solidity: 0.25,
        data: { len },
      })
    }
  }
  for (let i = 0; i < 16; i++) {
    const x = -720 + i * 96
    const z = ROAD.z - 12
    obs.add('pole', [x, ground(x, z) + 5, z], { kind: 'cylinder', r: 0.5, h: 10 }, {
      solidity: 0.7,
      data: {},
    })
  }

  // Fuel bowsers, parked where they always are: near the dispersals.
  for (const [x, z] of [[APRON.x - 10, APRON.z - 100], [-120, -235]] as [number, number][]) {
    obs.add('bowser', [x, ground(x, z) + 1.6, z], { kind: 'box', hx: 1.4, hy: 1.6, hz: 3.6 }, {
      yaw: 0.4,
      hp: 4,
      solidity: 0.8,
      data: {},
    })
  }

  // Serviceable aircraft on the dispersal loops. Solid, and not targets:
  // they belong to the squadron next door.
  for (const d of DISPERSALS) {
    obs.add('parked', [d.x, ground(d.x, d.z) + 1.6, d.z], { kind: 'box', hx: 5.6, hy: 1.7, hz: 4.6 }, {
      yaw: (d.z % 2 === 0 ? 0.6 : -0.9) + d.x * 0.001,
      solidity: 0.95,
      data: {},
    })
  }

  // The windsock, which is the only instrument on the field that is always
  // right. Solid pole, and the sock itself streams with the wind.
  obs.add('windsock', [-70, ground(-70, -640) + 5, -640], { kind: 'cylinder', r: 0.4, h: 10 }, {
    solidity: 0.4,
    data: {},
  })

  // --- The gunnery range ---------------------------------------------------
  // Everything here scores. The convoy runs along the road; the drums and
  // the derelict airframes are laid out in the field beyond it.
  for (let i = 0; i < 6; i++) {
    const z = ROAD.z
    const x = RANGE.x - 150 + i * 34
    const o = obs.add('truck', [x, ground(x, z) + 1.5, z], { kind: 'box', hx: 1.4, hy: 1.5, hz: 3.4 }, {
      yaw: Math.PI / 2,
      hp: 12,
      solidity: 0.85,
      data: { score: 2, home: x },
    })
    convoy.push(o)
    targets.push(o)
  }

  for (let g = 0; g < 2; g++) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2
      const x = RANGE.x + (g ? 150 : -60) + Math.cos(a) * 6
      const z = RANGE.z + (g ? 90 : -70) + Math.sin(a) * 6
      const o = obs.add('drum', [x, ground(x, z) + 0.9, z], { kind: 'cylinder', r: 0.6, h: 1.8 }, {
        hp: 3,
        solidity: 0.3,
        data: { score: 1 },
      })
      targets.push(o)
    }
  }

  for (const [x, z, yaw] of [
    [RANGE.x + 40, RANGE.z + 210, 0.7],
    [RANGE.x - 120, RANGE.z + 150, -1.2],
  ] as [number, number, number][]) {
    const o = obs.add('wreck-target', [x, ground(x, z) + 1.5, z], { kind: 'box', hx: 5.2, hy: 1.5, hz: 4.2 }, {
      yaw,
      hp: 18,
      solidity: 0.9,
      data: { score: 3 },
    })
    targets.push(o)
  }

  // The flak tower. It is a target, it is solid, and while it lives it is
  // shooting at whatever is making a run on the range.
  for (const [x, z] of [[RANGE.x + 250, RANGE.z - 40], [RANGE.x - 240, RANGE.z + 300]] as [number, number][]) {
    const o = obs.add('flak', [x, ground(x, z) + 5, z], { kind: 'box', hx: 3, hy: 5, hz: 3 }, {
      hp: 26,
      solidity: 1,
      blocksWhenDead: true,
      data: { score: 5, cool: 0 },
    })
    flak.push(o)
    targets.push(o)
  }

  return { targets, convoy, flak }
}

/** Total score available on the range, for the verdict. */
export function rangeScore(world: World) {
  return world.targets.reduce((n, t) => n + (t.data.score ?? 1), 0)
}

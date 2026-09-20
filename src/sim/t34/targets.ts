import type { Field } from '../terrain'
import type { Obstacle, Obstacles } from '../obstacles'

/**
 * The range, laid out once.
 *
 * Kubinka's practice range was not a row of paper figures: it was a stretch
 * of steppe with the wreckage of the last exercise still on it, a burnt
 * hamlet, a bridge over the stream and a line of fence posts nobody had
 * bothered to pull up. Everything drawn on it here is an `Obstacle`, so
 * everything drawn on it can be hit, and nothing can be hit that is not
 * drawn.
 */

export type Ammo = 'ap' | 'he' | 'mg'

export interface Kind {
  label: string
  /** Blows it takes. */
  hp: number
  /** What each nature of round does to it per hit. */
  ap: number
  he: number
  mg: number
  /** How much running into it hurts, 0–1. */
  solidity: number
  blocksWhenDead: boolean
  /** Fireball radius on destruction, metres; 0 for something that just falls. */
  blast: number
  /** Seconds the wreck goes on burning. */
  burn: number
  /** Counts towards the exercise. */
  scored?: boolean
}

/**
 * The damage table is the argument the exercise is making. An 85 mm AP shot
 * is a 9.2 kg steel bolt: it will open a tank and go straight through a hut
 * leaving two holes. An HE round is 9.5 kg with 741 g of TNT in it: it will
 * flatten the hut and barely mark the tank. And a rifle-calibre machine gun
 * will do neither, but it will take a lorry apart.
 */
export const KINDS: Record<string, Kind> = {
  hulk: {
    label: 'hulk',
    hp: 3,
    ap: 3,
    he: 1,
    mg: 0,
    solidity: 1,
    blocksWhenDead: true,
    blast: 4.5,
    burn: 70,
    scored: true,
  },
  lorry: {
    label: 'lorry',
    hp: 2,
    ap: 2,
    he: 2,
    mg: 0.06,
    solidity: 0.55,
    blocksWhenDead: false,
    blast: 3,
    burn: 35,
    scored: true,
  },
  hut: {
    label: 'hut',
    hp: 4,
    ap: 1,
    he: 5,
    mg: 0.03,
    solidity: 0.65,
    blocksWhenDead: false,
    blast: 1.6,
    burn: 26,
  },
  drum: {
    label: 'fuel drum',
    hp: 1,
    ap: 1,
    he: 1,
    mg: 0.5,
    solidity: 0.2,
    blocksWhenDead: false,
    blast: 3.4,
    burn: 22,
  },
  hay: {
    label: 'haystack',
    hp: 2,
    ap: 0.5,
    he: 3,
    mg: 0.05,
    solidity: 0.25,
    blocksWhenDead: false,
    blast: 1.4,
    burn: 45,
  },
  bridge: {
    label: 'bridge',
    hp: 6,
    ap: 1.5,
    he: 5,
    mg: 0.02,
    solidity: 0.8,
    blocksWhenDead: false,
    blast: 1.8,
    burn: 14,
  },
  wall: {
    label: 'wall',
    hp: 3,
    ap: 2,
    he: 4,
    mg: 0.02,
    solidity: 0.95,
    blocksWhenDead: false,
    blast: 0,
    burn: 0,
  },
  tree: {
    label: 'tree',
    hp: 3,
    ap: 2,
    he: 3,
    mg: 0.02,
    solidity: 0.7,
    blocksWhenDead: false,
    blast: 0,
    burn: 0,
  },
  fence: {
    label: 'fence',
    hp: 0.25,
    ap: 1,
    he: 1,
    mg: 0.3,
    solidity: 0.05,
    blocksWhenDead: false,
    blast: 0,
    burn: 0,
  },
  sapling: {
    label: 'sapling',
    hp: 0.25,
    ap: 1,
    he: 1,
    mg: 0.3,
    solidity: 0.05,
    blocksWhenDead: false,
    blast: 0,
    burn: 0,
  },
}

/** Deterministic 0–1, so the range is the same range every visit. */
function rnd(i: number) {
  const n = Math.sin(i * 91.3458 + 17.1) * 43758.5453
  return n - Math.floor(n)
}

/**
 * Put the range on the ground. Returns the obstacles in the order the scene
 * will draw them; the exercise is scored on the five marked `scored`.
 */
export function layout(o: Obstacles, field: Field) {
  const put = (
    kind: string,
    x: number,
    z: number,
    volume: Obstacle['volume'],
    rise: number,
    extra: Record<string, number> = {},
    yaw = 0,
  ) => {
    const k = KINDS[kind]
    const ob = o.add(kind, [x, field.height(x, z) + rise, z], volume, {
      yaw,
      hp: k.hp,
      solidity: k.solidity,
      blocksWhenDead: k.blocksWhenDead,
      data: { hp0: k.hp, seed: rnd(o.list.length * 3.7 + 1), ...extra },
    })
    return ob
  }

  // --- The near ground, for the driver ------------------------------------
  // A fence across the axis of advance. It is the one thing on the range
  // whose purpose is to be driven through.
  for (let i = 0; i < 16; i++) {
    const x = -34 + i * 4.6
    put('fence', x, 62 + Math.sin(i * 0.7) * 2, { kind: 'box', hx: 0.1, hy: 0.75, hz: 2.2 }, 0.75, {}, 0.12)
  }
  for (let i = 0; i < 9; i++) {
    const a = rnd(i * 5 + 2) * Math.PI * 2
    const r = 40 + rnd(i * 7 + 3) * 110
    put('sapling', Math.cos(a) * r, 40 + Math.abs(Math.sin(a)) * r, { kind: 'cylinder', r: 0.5, h: 3.4 }, 1.7, {
      lean: rnd(i * 11 + 5),
    })
  }

  // A brick wall, in sections, so it comes down a piece at a time.
  for (let i = 0; i < 6; i++) {
    put('wall', -10.5 + i * 4.2, 176, { kind: 'box', hx: 2.05, hy: 1.15, hz: 0.4 }, 1.15)
  }

  // --- Things that burn ----------------------------------------------------
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    put('drum', 58 + Math.cos(a) * 1.5, 214 + Math.sin(a) * 1.5, { kind: 'cylinder', r: 0.33, h: 0.9 }, 0.45)
  }
  put('hay', -72, 238, { kind: 'cylinder', r: 2.3, h: 3.4 }, 1.7)
  put('hay', -84, 252, { kind: 'cylinder', r: 2.0, h: 3.0 }, 1.5)

  // A hamlet of three timber huts: the HE targets.
  put('hut', -124, 298, { kind: 'box', hx: 2.6, hy: 1.6, hz: 3.4 }, 1.6, {}, 0.3)
  put('hut', -101, 331, { kind: 'box', hx: 2.3, hy: 1.5, hz: 3.0 }, 1.5, {}, -0.5)
  put('hut', -142, 343, { kind: 'box', hx: 2.4, hy: 1.5, hz: 2.8 }, 1.5, {}, 1.1)
  for (let i = 0; i < 4; i++) {
    put('drum', -112 + i * 1.1, 315, { kind: 'cylinder', r: 0.33, h: 0.9 }, 0.45)
  }

  // Standing timber, close enough to fell across the line of advance.
  for (let i = 0; i < 5; i++) {
    const x = 78 + rnd(i * 13 + 9) * 34
    const z = 286 + rnd(i * 17 + 4) * 46
    put('tree', x, z, { kind: 'cylinder', r: 0.55, h: 10 }, 5, {
      height: 8.5 + rnd(i * 19 + 6) * 3.5,
      fall: rnd(i * 23 + 8) * Math.PI * 2,
    })
  }

  // The bridge over the stream bed.
  put('bridge', 4, 524, { kind: 'box', hx: 2.6, hy: 0.7, hz: 7.5 }, 1.1)

  // --- The gunnery proper --------------------------------------------------
  put('hulk', -150, 380, { kind: 'box', hx: 1.55, hy: 1.3, hz: 3.2 }, 1.2, {}, 0.5)
  put('hulk', 262, 618, { kind: 'box', hx: 1.55, hy: 1.3, hz: 3.2 }, 1.2, {}, -1.9)
  put('hulk', -58, 1048, { kind: 'box', hx: 1.55, hy: 1.3, hz: 3.2 }, 1.2, {}, 2.6)
  // The one in the hollow, which the gun cannot be depressed far enough to
  // reach from the high ground behind it.
  put('hulk', 210, 900, { kind: 'box', hx: 1.55, hy: 1.3, hz: 3.2 }, 1.2, {}, 0.2)
  // The lorry, which will not stand still.
  const lorry = put('lorry', 0, 1248, { kind: 'box', hx: 1.2, hy: 1.15, hz: 3.4 }, 1.1, {
    span: 380,
    speed: 9,
    t: 0,
  }, Math.PI / 2)

  // A few drums scattered among the hulks, to reward a wide shot.
  for (let i = 0; i < 5; i++) {
    put('drum', -142 + i * 1.2, 372, { kind: 'cylinder', r: 0.33, h: 0.9 }, 0.45)
  }
  for (let i = 0; i < 4; i++) {
    put('drum', 254 + i * 1.2, 610, { kind: 'cylinder', r: 0.33, h: 0.9 }, 0.45)
  }

  return { lorry }
}

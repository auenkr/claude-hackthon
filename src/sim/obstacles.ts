import * as THREE from 'three'

/**
 * Things you can hit.
 *
 * The scenery is generated, so the collision volumes have to be generated
 * from the same numbers rather than placed by hand: a scene declares its
 * obstacles here, the simulation tests against them, and both are looking at
 * one list. If a tree is drawn, it is solid; if it is solid, it is drawn.
 */

export type Volume =
  | { kind: 'box'; hx: number; hy: number; hz: number }
  | { kind: 'cylinder'; r: number; h: number }
  | { kind: 'sphere'; r: number }

export interface Obstacle {
  id: number
  /** What it is, so the scene knows what to draw and the log what to say. */
  kind: string
  /** Centre of the volume, world space. */
  pos: THREE.Vector3
  yaw: number
  volume: Volume
  /** Hits it takes before it goes. `Infinity` for something you only break yourself on. */
  hp: number
  dead: boolean
  /** Seconds since it died, for the scene to animate the collapse. */
  deadFor: number
  /**
   * How much running into it hurts, 0–1. A sapling is 0.15 and will bend;
   * a hangar is 1 and is the end of the flight.
   */
  solidity: number
  /** Does the wreck still block the way? A felled tree does not. */
  blocksWhenDead: boolean
  /** Free slots for whatever the scene needs to draw it. */
  data: Record<string, number>
}

export interface ObstacleHit {
  obstacle: Obstacle
  /** Metres from the query origin, for a ray; penetration depth for a sphere. */
  distance: number
  point: THREE.Vector3
}

const local = new THREE.Vector3()
const closest = new THREE.Vector3()
const step = new THREE.Vector3()

export class Obstacles {
  readonly list: Obstacle[] = []
  private next = 1

  add(
    kind: string,
    pos: THREE.Vector3 | [number, number, number],
    volume: Volume,
    options: Partial<Pick<Obstacle, 'yaw' | 'hp' | 'solidity' | 'blocksWhenDead' | 'data'>> = {},
  ) {
    const o: Obstacle = {
      id: this.next++,
      kind,
      pos: Array.isArray(pos) ? new THREE.Vector3(...pos) : pos.clone(),
      yaw: options.yaw ?? 0,
      volume,
      hp: options.hp ?? Infinity,
      dead: false,
      deadFor: 0,
      solidity: options.solidity ?? 1,
      blocksWhenDead: options.blocksWhenDead ?? false,
      data: options.data ?? {},
    }
    this.list.push(o)
    return o
  }

  /** Put a world point into an obstacle's own axes. */
  private toLocal(o: Obstacle, p: THREE.Vector3, out: THREE.Vector3) {
    const dx = p.x - o.pos.x
    const dz = p.z - o.pos.z
    const c = Math.cos(-o.yaw)
    const s = Math.sin(-o.yaw)
    return out.set(dx * c - dz * s, p.y - o.pos.y, dx * s + dz * c)
  }

  /** Nearest point of the volume to a local-space point. */
  private nearest(o: Obstacle, p: THREE.Vector3, out: THREE.Vector3) {
    const v = o.volume
    if (v.kind === 'box') {
      return out.set(
        Math.max(-v.hx, Math.min(v.hx, p.x)),
        Math.max(-v.hy, Math.min(v.hy, p.y)),
        Math.max(-v.hz, Math.min(v.hz, p.z)),
      )
    }
    if (v.kind === 'cylinder') {
      const r = Math.hypot(p.x, p.z)
      const k = r > v.r ? v.r / r : 1
      return out.set(p.x * k, Math.max(-v.h / 2, Math.min(v.h / 2, p.y)), p.z * k)
    }
    const d = p.length()
    return out.copy(p).multiplyScalar(d > v.r ? v.r / d : 1)
  }

  /** Cheap reject: radius of the sphere that contains the volume. */
  private bound(o: Obstacle) {
    const v = o.volume
    if (v.kind === 'box') return Math.hypot(v.hx, v.hy, v.hz)
    if (v.kind === 'cylinder') return Math.hypot(v.r, v.h / 2)
    return v.r
  }

  /**
   * Is a ball of `radius` at `p` inside anything? Returns the deepest
   * intersection, because if you are through two things at once the one you
   * are furthest into is the one you hit.
   */
  hit(p: THREE.Vector3, radius: number): ObstacleHit | null {
    let worst: ObstacleHit | null = null
    for (const o of this.list) {
      if (o.dead && !o.blocksWhenDead) continue
      const reach = this.bound(o) + radius
      if (p.distanceToSquared(o.pos) > reach * reach) continue
      this.toLocal(o, p, local)
      this.nearest(o, local, closest)
      const gap = local.distanceTo(closest)
      const depth = radius - gap
      if (depth <= 0) continue
      if (!worst || depth > worst.distance) {
        const c = Math.cos(o.yaw)
        const s = Math.sin(o.yaw)
        worst = {
          obstacle: o,
          distance: depth,
          point: new THREE.Vector3(
            o.pos.x + closest.x * c - closest.z * s,
            o.pos.y + closest.y,
            o.pos.z + closest.x * s + closest.z * c,
          ),
        }
      }
    }
    return worst
  }

  /**
   * March a segment against the list. Marching rather than solving: the
   * volumes are mixed, the distances are short, and a shell that travels
   * eight hundred metres a second is substepped by the caller anyway.
   */
  ray(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, radius = 0.1): ObstacleHit | null {
    const steps = Math.max(2, Math.min(96, Math.ceil(maxDist / Math.max(0.5, radius * 4))))
    const dl = maxDist / steps
    for (let i = 1; i <= steps; i++) {
      step.copy(origin).addScaledVector(dir, dl * i)
      const h = this.hit(step, radius)
      if (h) return { obstacle: h.obstacle, distance: dl * i, point: h.point }
    }
    return null
  }

  /** Returns true if this was the blow that finished it. */
  damage(o: Obstacle, amount = 1) {
    if (o.dead) return false
    o.hp -= amount
    if (o.hp > 0) return false
    o.dead = true
    o.deadFor = 0
    return true
  }

  step(dt: number) {
    for (const o of this.list) if (o.dead) o.deadFor += dt
  }

  reset() {
    this.list.length = 0
    this.next = 1
  }
}

import * as THREE from 'three'
import type { Effects } from '../fx.ts'
import type { Obstacle, Obstacles } from '../obstacles'

/**
 * Six .50-inch Brownings, and the people shooting back.
 *
 * The rounds are real objects: they leave the muzzle at 856 m/s on top of
 * whatever the aeroplane was already doing, they slow down, they drop, and
 * they are tested against the same obstacle list the airframe is. Nothing is
 * hitscan, which is why a deflection shot at four hundred yards needs lead
 * and a shot straight down the range does not.
 *
 * Figures: 856 m/s muzzle velocity, about 800 rounds a minute a gun, 1,880
 * rounds between the six of them, harmonised to converge at 250 yards.
 */

const MUZZLE_V = 856
const RATE = 800 / 60 // rounds per second, per gun
const HARMONISED = 228.6 // metres: 250 yards
const ROUND_MASS = 0.046 // kg, M2 ball
const DRAG_K = 7e-4 // v² retardation, fitted to the published time of flight
const LIFE = 1.15 // seconds, which is about 800 m
const POOL = 120

/**
 * Muzzle positions in body axes, read off the wing planform: three guns a
 * side, staggered so the inboard barrel stands furthest out of the leading
 * edge. The inboard pair carry 400 rounds each and the others 270.
 */
export const MUZZLES = [
  { x: 1.25, y: -0.081, z: 1.815, rounds: 400 },
  { x: 1.72, y: -0.039, z: 1.648, rounds: 270 },
  { x: 2.19, y: 0.002, z: 1.481, rounds: 270 },
  { x: -1.25, y: -0.081, z: 1.815, rounds: 400 },
  { x: -1.72, y: -0.039, z: 1.648, rounds: 270 },
  { x: -2.19, y: 0.002, z: 1.481, rounds: 270 },
]

export interface Round {
  live: boolean
  pos: THREE.Vector3
  vel: THREE.Vector3
  age: number
  tracer: boolean
}

const step = new THREE.Vector3()
const dir = new THREE.Vector3()
const muzzle = new THREE.Vector3()
const aim = new THREE.Vector3()
const scratch = new THREE.Vector3()

export class Battery {
  readonly rounds: Round[] = []
  /** Rounds left, counted down from the published 1,880. */
  ammo = 1880
  /** 0 is cold, 1 is a jam waiting to happen. */
  heat = 0
  jammed = false
  firing = false
  /** Rounds fired since the last step, for recoil and the muzzle flash. */
  fired = 0
  /** Rounds that struck something, for the log. */
  hits = 0

  private due = 0
  private gun = 0
  private sequence = 0
  private cursor = 0
  private smokeDue = 0

  private obstacles: Obstacles
  private ground: (x: number, z: number) => number
  private fx: Effects
  private onKill: (o: Obstacle, at: THREE.Vector3) => void

  constructor(
    obstacles: Obstacles,
    ground: (x: number, z: number) => number,
    fx: Effects,
    onKill: (o: Obstacle, at: THREE.Vector3) => void,
  ) {
    this.obstacles = obstacles
    this.ground = ground
    this.fx = fx
    this.onKill = onKill
    for (let i = 0; i < POOL; i++) {
      this.rounds.push({
        live: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        age: 0,
        tracer: false,
      })
    }
  }

  reset() {
    for (const r of this.rounds) r.live = false
    this.ammo = 1880
    this.heat = 0
    this.jammed = false
    this.firing = false
    this.fired = 0
    this.hits = 0
    this.due = 0
    this.gun = 0
    this.sequence = 0
    this.cursor = 0
  }

  private take() {
    for (let i = 0; i < POOL; i++) {
      const r = this.rounds[this.cursor]
      this.cursor = (this.cursor + 1) % POOL
      if (!r.live) return r
    }
    return this.rounds[this.cursor]
  }

  /**
   * Pull the trigger and let the guns run. `right`, `up` and `forward` are
   * the aircraft's body axes; `velocity` is its own, which the rounds inherit.
   * Returns the deceleration the recoil is worth, in m/s².
   */
  step(
    dt: number,
    trigger: boolean,
    origin: THREE.Vector3,
    right: THREE.Vector3,
    up: THREE.Vector3,
    forward: THREE.Vector3,
    velocity: THREE.Vector3,
    mass: number,
  ) {
    this.fired = 0
    this.hits = 0

    // Barrels heat while they fire and cool slowly. A jam clears when the
    // guns have had time to cool, which on the range is about ten seconds.
    if (this.jammed && this.heat < 0.45) this.jammed = false
    const live = trigger && this.ammo > 0 && !this.jammed
    this.firing = live
    if (live) {
      this.heat = Math.min(1.2, this.heat + dt * 0.1)
      if (this.heat >= 1) this.jammed = true
    } else {
      this.heat = Math.max(0, this.heat - dt * 0.055)
    }

    if (live) {
      this.due += dt * RATE * MUZZLES.length
      while (this.due >= 1 && this.ammo > 0) {
        this.due -= 1
        this.spawn(origin, right, up, forward, velocity)
      }
      this.smokeDue -= dt
      if (this.smokeDue <= 0) {
        this.smokeDue = 0.06
        for (const m of MUZZLES) {
          if (Math.random() > 0.34) continue
          muzzle
            .copy(origin)
            .addScaledVector(right, m.x)
            .addScaledVector(up, m.y)
            .addScaledVector(forward, m.z)
          this.fx.emit('smoke', muzzle, {
            vel: scratch.copy(velocity).multiplyScalar(0.55),
            life: 0.45 + Math.random() * 0.3,
            size: 0.22,
            grow: 3.4,
            colour: '#8f8a80',
            fade: '#b9b5ac',
            drag: 3.2,
          })
        }
      }
    } else {
      this.due = 0
    }

    this.advance(dt)

    // Six guns at 800 rounds a minute throw 46 grammes at 856 m/s eighty
    // times a second. That is a real force, and you feel it in the seat.
    return (this.fired * ROUND_MASS * MUZZLE_V) / (mass * Math.max(dt, 1e-4))
  }

  private spawn(
    origin: THREE.Vector3,
    right: THREE.Vector3,
    up: THREE.Vector3,
    forward: THREE.Vector3,
    velocity: THREE.Vector3,
  ) {
    const m = MUZZLES[this.gun]
    this.gun = (this.gun + 1) % MUZZLES.length
    this.ammo--
    this.fired++

    muzzle
      .copy(origin)
      .addScaledVector(right, m.x)
      .addScaledVector(up, m.y)
      .addScaledVector(forward, m.z)

    // Every barrel is laid on the same point 250 yards ahead, which is what
    // harmonisation means: inside it the pattern is two groups, at it the
    // pattern is one, and beyond it the groups cross and open out again.
    aim
      .copy(origin)
      .addScaledVector(up, -0.04)
      .addScaledVector(forward, HARMONISED)
    dir.subVectors(aim, muzzle).normalize()

    // Dispersion: a worn Browning shoots into about four milliradians.
    const spread = 0.0022 * (1 + this.heat)
    dir
      .addScaledVector(right, (Math.random() - 0.5) * spread * 2)
      .addScaledVector(up, (Math.random() - 0.5) * spread * 2)
      .normalize()

    const r = this.take()
    r.live = true
    r.age = 0
    r.pos.copy(muzzle)
    r.vel.copy(dir).multiplyScalar(MUZZLE_V).add(velocity)
    r.tracer = this.sequence % 5 === 0
    this.sequence++

    // Muzzle flash, and a case over the side every so often.
    this.fx.emit('fire', muzzle, {
      vel: scratch.copy(velocity),
      life: 0.05,
      size: 0.3,
      grow: 0.5,
      colour: '#ffe2a6',
      fade: '#d07a1a',
      drag: 6,
    })
    if (this.sequence % 7 === 0) {
      this.fx.emit('debris', muzzle, {
        vel: scratch
          .copy(velocity)
          .multiplyScalar(0.3)
          .addScaledVector(up, -3 - Math.random() * 2)
          .addScaledVector(right, (Math.random() - 0.5) * 3),
        life: 1.6,
        size: 0.05,
        grow: 1,
        colour: '#c9a24a',
        fade: '#8a6d2e',
        drag: 0.4,
        gravity: -9.81,
        spin: 22,
      })
    }
  }

  /** Move every live round, and see what it went through on the way. */
  private advance(dt: number) {
    for (const r of this.rounds) {
      if (!r.live) continue
      r.age += dt
      if (r.age > LIFE) {
        r.live = false
        continue
      }
      const v = r.vel.length()
      r.vel.addScaledVector(r.vel, -DRAG_K * v * dt)
      r.vel.y -= 9.80665 * dt

      const travel = v * dt
      dir.copy(r.vel).multiplyScalar(1 / Math.max(v, 1e-3))

      // A wide query radius costs accuracy and saves a great deal of work:
      // the marching ray takes a step every four radii, so a generous ball
      // is the difference between six steps and forty.
      const hit = this.obstacles.ray(r.pos, dir, travel, 0.3)
      if (hit) {
        this.strike(hit.obstacle, hit.point)
        r.live = false
        continue
      }

      step.copy(r.pos).addScaledVector(dir, travel)
      const floor = this.ground(step.x, step.z)
      if (step.y <= floor) {
        step.y = floor
        this.fx.impact(step, 0.5, '#9d9276')
        r.live = false
        continue
      }
      r.pos.copy(step)
    }
  }

  private strike(o: Obstacle, at: THREE.Vector3) {
    this.hits++
    const killed = this.obstacles.damage(o, 1)
    if (!killed) {
      this.fx.emit('spark', at, {
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 9,
          2 + Math.random() * 5,
          (Math.random() - 0.5) * 9,
        ),
        life: 0.22,
        size: 0.12,
        grow: 0.4,
        colour: '#ffe3a0',
        fade: '#b3450d',
        drag: 2,
        gravity: -9,
      })
      this.fx.emit('smoke', at, {
        life: 0.5,
        size: 0.35,
        grow: 2.6,
        colour: '#77706a',
        fade: '#a9a49c',
        drag: 2.4,
        gravity: 1,
      })
      return
    }
    this.onKill(o, at)
  }
}

// --- The other side ---------------------------------------------------------

export interface Shell {
  live: boolean
  pos: THREE.Vector3
  vel: THREE.Vector3
  age: number
  /** Closest it has come to the aeroplane so far, so a near miss can burst. */
  closest: number
}

const FLAK_V = 840
const FLAK_POOL = 60

/**
 * Light flak. Two 20 mm positions on the range, firing four-round bursts at
 * whatever is making a pass. They aim where you are going to be rather than
 * where you are, and they are better at it the closer and slower you get —
 * which is the entire argument for one fast pass and away.
 */
export class Flak {
  readonly shells: Shell[] = []
  private cursor = 0

  private fx: Effects
  private onHit: (at: THREE.Vector3) => void

  constructor(fx: Effects, onHit: (at: THREE.Vector3) => void) {
    this.fx = fx
    this.onHit = onHit
    for (let i = 0; i < FLAK_POOL; i++) {
      this.shells.push({
        live: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        age: 0,
        closest: 1e9,
      })
    }
  }

  reset() {
    for (const s of this.shells) s.live = false
    this.cursor = 0
  }

  /** Let every live gun have a go, then move what is already in the air. */
  step(
    dt: number,
    guns: Obstacle[],
    target: THREE.Vector3,
    targetVel: THREE.Vector3,
    skill: number,
  ) {
    for (const g of guns) {
      if (g.dead) continue
      const range = g.pos.distanceTo(target)
      g.data.cool = (g.data.cool ?? 0) - dt
      if (range > 1400 || range < 40 || target.y - g.pos.y > 900) continue
      if ((g.data.cool ?? 0) > 0) continue
      g.data.cool = 0.14 + Math.random() * 0.1
      if (Math.random() > 0.55) g.data.cool = 1.6 + Math.random()

      // Lead the target by the shell's time of flight, and miss by an amount
      // that grows with range.
      const tof = range / FLAK_V
      aim.copy(target).addScaledVector(targetVel, tof)
      const error = (range / 1400) * 46 * (1.25 - skill)
      aim.x += (Math.random() - 0.5) * error
      aim.y += (Math.random() - 0.5) * error * 0.7
      aim.z += (Math.random() - 0.5) * error

      const s = this.shells[this.cursor]
      this.cursor = (this.cursor + 1) % FLAK_POOL
      s.live = true
      s.age = 0
      s.closest = 1e9
      s.pos.copy(g.pos).setY(g.pos.y + 4)
      s.vel.subVectors(aim, s.pos).normalize().multiplyScalar(FLAK_V)
      this.fx.emit('fire', s.pos, {
        life: 0.09,
        size: 0.8,
        grow: 1.4,
        colour: '#ffdc9a',
        fade: '#c4550f',
        drag: 5,
      })
    }

    for (const s of this.shells) {
      if (!s.live) continue
      s.age += dt
      s.vel.y -= 9.80665 * dt
      s.pos.addScaledVector(s.vel, dt)
      const d = s.pos.distanceTo(target)
      // Past the closest point of approach: burst, and see who was near it.
      if (d > s.closest && s.closest < 55) {
        s.live = false
        this.burst(s.pos, s.closest)
        continue
      }
      s.closest = Math.min(s.closest, d)
      if (s.age > 2.6 || s.pos.y < -5) s.live = false
    }
  }

  private burst(at: THREE.Vector3, miss: number) {
    this.fx.emit('smoke', at, {
      life: 2.4,
      size: 1.6,
      grow: 2.4,
      colour: '#2f2b28',
      fade: '#5d574f',
      drag: 1.4,
      gravity: 0.3,
    })
    this.fx.emit('fire', at, {
      life: 0.2,
      size: 1.5,
      grow: 1.6,
      colour: '#ffd48a',
      fade: '#a83c0c',
      drag: 3,
    })
    if (miss < 7) this.onHit(at)
  }
}

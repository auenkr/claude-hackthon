import * as THREE from 'three'
import type { Controls, Dimension, Source } from '../types'
import type { Keyboard } from './keyboard'
import type { Readout, Sim, SimDef, ViewName } from './types'
import { G } from './flight'
import { range as field } from './terrain'

/**
 * Gunnery, Kubinka.
 *
 * Two facts about a T-34 do most of the work here. It steers by braking one
 * track against the other, so it cannot turn on the spot and must be rolling
 * to turn at all. And the gun depresses only five degrees, which is a real
 * tactical cost the moment a target is below you.
 */

const MANUAL: Source = {
  kind: 'text',
  citation: 'Танк Т-34-85: Руководство по материальной части (Moscow, 1945)',
  note: 'The factory handbook: masses, speeds, gun limits, transmission ratios.',
}
const TM: Source = {
  kind: 'text',
  citation: 'TM 30-430, Handbook on USSR Military Forces, US War Department (1945)',
}
const ZALOGA: Source = {
  kind: 'text',
  citation: 'Zaloga, S., T-34-85 Medium Tank 1944–94 (Osprey New Vanguard 20)',
}
const INFER: Source = {
  kind: 'inference',
  citation: 'Derived for this simulation from the cited mass, power and gun data',
}

// --- Vehicle ----------------------------------------------------------------
const MASS = 32_000 // kg
const POWER = 373_000 // W — 500 hp V-2-34 diesel
const TRACTION = 150_000 // N, limited by the tracks rather than the engine
const V_MAX = 16.1 // m/s, 58 km/h on a road
const V_REVERSE = -2.2
const GAUGE = 2.5 // m between track centres
const WHEELBASE = 5.2 // m, first to last road wheel

/** Clutch-brake steering: the inner track is slowed, never stopped dead. */
const STEER_RATIO = 0.55 // fraction of speed given up by the inner track
/** How hard the tracks can push sideways before they simply slide. */
const LATERAL_GRIP = 0.7

// Turret and gun, off the reconstruction's own geometry.
const RING_Y = 1.6
const RING_Z = 0.1
const TRUNNION = new THREE.Vector3(0, 0.45, 0.6)
const BARREL = 3.92 // trunnion to muzzle
const TRAVERSE_RATE = 30 * (Math.PI / 180) // 12 s for a full circle, electric
const ELEVATE_RATE = 6 * (Math.PI / 180) // handwheel
const ELEV_MAX = 25 * (Math.PI / 180)
const ELEV_MIN = -5 * (Math.PI / 180)

const MUZZLE_VELOCITY = 792 // m/s, BR-365 armour-piercing
const RELOAD = 8 // s
const ROUNDS = 12
/** Dispersion on the move: no stabiliser, so a short halt is the doctrine. */
const SPREAD_STATIC = 0.0004 // radians
const SPREAD_MOVING = 0.0022 // radians per m/s

interface Target {
  name: string
  x: number
  z: number
  /** Cross-range speed, for the one that will not stand still. */
  speed: number
  span: number
  radius: number
  dead: boolean
  t: number
}

interface Shell {
  pos: THREE.Vector3
  vel: THREE.Vector3
  life: number
}

export interface Impact {
  pos: THREE.Vector3
  age: number
  kill: boolean
}

const DEG = Math.PI / 180

export class T34Sim implements Sim {
  readonly position = new THREE.Vector3()
  readonly quaternion = new THREE.Quaternion()

  /** Hull heading, pitch and roll: the ground decides two of the three. */
  private heading = 0
  private pitch = 0
  private bank = 0
  private speed = 0
  private throttle = 0
  private steer = 0
  private brakes = 0

  private traverse = 0
  private elevation = 0
  private hatches = 0

  private reload = 0
  private rounds = ROUNDS
  private fired = 0
  private clock = 0

  readonly targets: Target[] = []
  readonly shells: Shell[] = []
  readonly impacts: Impact[] = []

  private muzzle = new THREE.Vector3()
  private gunDir = new THREE.Vector3()
  private forward = new THREE.Vector3()
  private rangeToReticle = 0
  private log: string[] = []
  private verdict: Readout['verdict']
  private ctl: Controls = {}

  finished = false

  constructor() {
    this.reset()
  }

  reset() {
    this.heading = 0
    this.pitch = 0
    this.bank = 0
    this.speed = 0
    this.throttle = 0
    this.steer = 0
    this.traverse = 0
    this.elevation = 0
    this.hatches = 0
    this.reload = 0
    this.rounds = ROUNDS
    this.fired = 0
    this.clock = 0
    this.position.set(0, field.height(0, 0), 0)
    this.quaternion.identity()
    this.shells.length = 0
    this.impacts.length = 0

    this.targets.length = 0
    this.targets.push(
      { name: 'Hulk, left of the track', x: -150, z: 380, speed: 0, span: 0, radius: 2.4, dead: false, t: 0 },
      { name: 'Hulk on the rise', x: 260, z: 620, speed: 0, span: 0, radius: 2.4, dead: false, t: 0 },
      { name: 'Hulk at long range', x: -60, z: 1050, speed: 0, span: 0, radius: 2.4, dead: false, t: 0 },
      { name: 'Hulk in the hollow', x: 210, z: 900, speed: 0, span: 0, radius: 2.4, dead: false, t: 0 },
      { name: 'Lorry, crossing', x: 0, z: 1250, speed: 9, span: 380, radius: 1.8, dead: false, t: 0 },
    )
    this.verdict = undefined
    this.finished = false
    this.log = [
      'Five hulks on the range. Twelve rounds of BR-365 in the racks.',
      'No stabiliser: halt to shoot, or accept the dispersion.',
    ]
  }

  private say(line: string) {
    this.log.push(line)
    if (this.log.length > 6) this.log.shift()
  }

  step(dt: number, keys: Keyboard) {
    this.clock += dt

    // --- Driver ------------------------------------------------------------
    const drive = keys.axis(['KeyS'], ['KeyW'])
    this.brakes = keys.down('KeyB') ? 1 : 0
    this.steer = spring(this.steer, keys.axis(['ArrowLeft'], ['ArrowRight']), dt, 3, 4)
    if (keys.tapped('KeyH')) {
      this.hatches = this.hatches > 0.5 ? 0 : 1
      this.say(this.hatches > 0.5 ? 'Hatches open.' : 'Buttoned up.')
    }

    this.throttle = THREE.MathUtils.clamp(
      this.throttle + (drive > 0 ? dt * 1.4 : -dt * 2),
      0,
      1,
    )
    const reversing = drive < 0 && this.speed < 0.4

    // Tractive effort falls away with speed, the way a gearbox makes it.
    const tractive = Math.min(POWER * this.throttle / Math.max(Math.abs(this.speed), 1.6), TRACTION)
    const surface = field.drag(this.position.x, this.position.z)
    const rolling = MASS * G * (surface + 0.0018 * Math.abs(this.speed))
    const slope = MASS * G * Math.sin(this.pitch)

    let force = reversing ? -TRACTION * 0.35 : tractive * (drive > 0 ? 1 : 0)
    force -= slope
    if (Math.abs(this.speed) > 0.05) {
      force -= Math.sign(this.speed) * rolling
      // Braking the inner track costs speed, and so does the brake pedal.
      force -= Math.sign(this.speed) * Math.abs(this.steer) * 0.18 * MASS * G
      force -= Math.sign(this.speed) * this.brakes * 0.5 * MASS * G
      if (drive < 0 && !reversing) force -= Math.sign(this.speed) * 0.45 * MASS * G
    }

    this.speed = THREE.MathUtils.clamp(this.speed + (force / MASS) * dt, V_REVERSE, V_MAX)
    if (drive === 0 && this.brakes === 0 && Math.abs(this.speed) < 0.06) this.speed = 0

    // Clutch-brake steering. There is no pivot turn in this transmission:
    // the yaw rate is proportional to road speed, so standing still, the
    // tank cannot turn at all. At the other end it is the tracks' grip
    // sideways that limits the turn, not the brakes — 32 tonnes will not go
    // round a five-metre corner at 58 km/h.
    const clutchBrake = (STEER_RATIO * Math.abs(this.speed)) / GAUGE
    const gripLimit = (LATERAL_GRIP * G) / Math.max(Math.abs(this.speed), 0.5)
    const yawRate = Math.sign(this.speed) * this.steer * Math.min(clutchBrake, gripLimit)
    this.heading += yawRate * dt

    // --- Ground ------------------------------------------------------------
    this.forward.set(Math.sin(this.heading), 0, Math.cos(this.heading))
    this.position.addScaledVector(this.forward, this.speed * dt)
    this.conform(dt)

    // --- Gunner ------------------------------------------------------------
    this.traverse += keys.axis(['KeyD'], ['KeyA']) * TRAVERSE_RATE * dt
    if (this.traverse > Math.PI) this.traverse -= Math.PI * 2
    if (this.traverse < -Math.PI) this.traverse += Math.PI * 2
    this.elevation = THREE.MathUtils.clamp(
      this.elevation + keys.axis(['ArrowDown'], ['ArrowUp']) * ELEVATE_RATE * dt,
      ELEV_MIN,
      ELEV_MAX,
    )

    this.gunGeometry()
    this.rangeToReticle = this.castRange()

    this.reload = Math.max(0, this.reload - dt)
    if (keys.tapped('Space')) this.fire()

    this.advanceTargets(dt)
    this.advanceShells(dt)
    for (const i of this.impacts) i.age += dt
    while (this.impacts.length && this.impacts[0].age > 3) this.impacts.shift()

    if (!this.finished) {
      const left = this.targets.filter((t) => !t.dead).length
      if (left === 0) {
        this.end(true, 'Range complete', [
          `Five hulks with ${this.fired} rounds in ${this.clock.toFixed(0)} seconds.`,
          this.fired <= 7
            ? 'That is better shooting than the exercise expects.'
            : 'A pass. The gunner’s handwheel is slower than the target.',
        ])
      } else if (this.rounds === 0 && this.shells.length === 0) {
        this.end(false, 'Ammunition expended', [
          `${5 - left} of five, with twelve rounds.`,
          'The racks hold 55 more, but not on this exercise.',
        ])
      }
    }
  }

  /** Sit the hull on the ground: four contact points, with the springs lagging. */
  private conform(dt: number) {
    const s = Math.sin(this.heading)
    const c = Math.cos(this.heading)
    const sample = (dz: number, dx: number) =>
      field.height(
        this.position.x + dz * s + dx * c,
        this.position.z + dz * c - dx * s,
      )
    const fl = sample(WHEELBASE / 2, -GAUGE / 2)
    const fr = sample(WHEELBASE / 2, GAUGE / 2)
    const rl = sample(-WHEELBASE / 2, -GAUGE / 2)
    const rr = sample(-WHEELBASE / 2, GAUGE / 2)

    const height = (fl + fr + rl + rr) / 4
    const pitch = Math.atan2((fl + fr) / 2 - (rl + rr) / 2, WHEELBASE)
    const bank = Math.atan2((fl + rl) / 2 - (fr + rr) / 2, GAUGE)

    // The Christie springs are soft and there are five of them a side, so the
    // hull follows the ground with a lag rather than snapping to it.
    const k = 1 - Math.exp(-6 * dt)
    this.position.y += (height - this.position.y) * k
    this.pitch += (pitch - this.pitch) * k
    this.bank += (bank - this.bank) * k

    euler.set(-this.pitch, this.heading, -this.bank, 'YXZ')
    this.quaternion.setFromEuler(euler)
  }

  /** Muzzle position and gun axis, in world space. */
  private gunGeometry() {
    const ce = Math.cos(this.elevation)
    const se = Math.sin(this.elevation)
    const ct = Math.cos(this.traverse)
    const st = Math.sin(this.traverse)

    const gy = TRUNNION.y + BARREL * se
    const gz = TRUNNION.z + BARREL * ce
    this.muzzle.set(gz * st, RING_Y + gy, RING_Z + gz * ct)
    this.muzzle.applyQuaternion(this.quaternion).add(this.position)

    this.gunDir.set(st * ce, se, ct * ce).applyQuaternion(this.quaternion).normalize()
  }

  /** Step along the gun axis until it meets the ground: the gunner's range. */
  private castRange() {
    const step = 8
    for (let d = 20; d < 3000; d += step) {
      const x = this.muzzle.x + this.gunDir.x * d
      const y = this.muzzle.y + this.gunDir.y * d
      const z = this.muzzle.z + this.gunDir.z * d
      if (y <= field.height(x, z)) return d
    }
    return 0
  }

  private fire() {
    if (this.reload > 0 || this.rounds === 0 || this.finished) return
    this.rounds--
    this.fired++
    this.reload = RELOAD

    const spread = SPREAD_STATIC + SPREAD_MOVING * Math.abs(this.speed)
    const dir = this.gunDir.clone()
    dir.x += (Math.random() - 0.5) * 2 * spread
    dir.y += (Math.random() - 0.5) * 2 * spread
    dir.z += (Math.random() - 0.5) * 2 * spread
    dir.normalize()

    this.shells.push({
      pos: this.muzzle.clone(),
      vel: dir.multiplyScalar(MUZZLE_VELOCITY),
      life: 0,
    })
    if (Math.abs(this.speed) > 1.5) {
      this.say(`Fired on the move at ${(Math.abs(this.speed) * 3.6).toFixed(0)} km/h — expect to miss.`)
    }
  }

  private advanceTargets(dt: number) {
    for (const t of this.targets) {
      if (t.dead || t.speed === 0) continue
      t.t += dt
      // There and back along a fixed line, which is what a range lorry does.
      const cycle = (t.span * 2) / t.speed
      const phase = t.t % cycle
      const offset = phase < cycle / 2 ? phase * t.speed : t.span * 2 - phase * t.speed
      t.x = -t.span / 2 + offset
    }
  }

  private advanceShells(dt: number) {
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const shell = this.shells[i]
      // Substep: at 792 m/s a whole frame is sixteen metres of flight.
      const steps = 6
      const h = dt / steps
      let done = false
      for (let s = 0; s < steps && !done; s++) {
        shell.vel.y -= G * h
        shell.pos.addScaledVector(shell.vel, h)
        shell.life += h

        for (const t of this.targets) {
          if (t.dead) continue
          const ty = field.height(t.x, t.z) + 1.3
          const dx = shell.pos.x - t.x
          const dy = shell.pos.y - ty
          const dz = shell.pos.z - t.z
          if (dx * dx + dy * dy + dz * dz < t.radius * t.radius) {
            t.dead = true
            done = true
            this.impacts.push({ pos: shell.pos.clone(), age: 0, kill: true })
            this.say(`Hit — ${t.name.toLowerCase()} at ${Math.hypot(t.x - this.position.x, t.z - this.position.z).toFixed(0)} m.`)
            break
          }
        }
        if (done) break

        if (shell.pos.y <= field.height(shell.pos.x, shell.pos.z)) {
          done = true
          this.impacts.push({ pos: shell.pos.clone(), age: 0, kill: false })
          const miss = this.nearestMiss(shell.pos)
          if (miss) this.say(`Short — ${miss.toFixed(0)} m from the nearest hulk.`)
        }
        if (shell.life > 8) done = true
      }
      if (done) this.shells.splice(i, 1)
    }
  }

  private nearestMiss(at: THREE.Vector3) {
    let best = Infinity
    for (const t of this.targets) {
      if (t.dead) continue
      best = Math.min(best, Math.hypot(at.x - t.x, at.z - t.z))
    }
    return best === Infinity ? null : best
  }

  private end(good: boolean, title: string, lines: string[]) {
    this.verdict = { good, title, lines }
    this.finished = true
  }

  controls() {
    this.ctl.speed = Math.abs(this.speed) * 3.6
    this.ctl.traverse = this.traverse / DEG
    this.ctl.elevation = this.elevation / DEG
    // The suspension has work to do in proportion to how fast it is going.
    this.ctl.terrain = Math.min(100, Math.abs(this.speed) * 6)
    this.ctl.hatches = this.hatches
    return this.ctl
  }

  camera(view: ViewName, eye: THREE.Vector3, aim: THREE.Vector3) {
    if (view === 'inside') {
      // Down the TSh-16 sight, which is mounted alongside the gun.
      eye.copy(this.muzzle).addScaledVector(this.gunDir, -3.2)
      aim.copy(eye).addScaledVector(this.gunDir, 900)
      return 9.5 // four-power optics
    }
    if (view === 'tower') {
      eye.set(-38, field.height(-38, -30) + 12, -30)
      aim.copy(this.position)
      return 26
    }
    eye.copy(this.position)
      .addScaledVector(this.forward, -13)
      .add(UP_13)
    aim.copy(this.position).addScaledVector(this.forward, 8)
    aim.y += 1.5
    return 45
  }

  readout(): Readout {
    const left = this.targets.filter((t) => !t.dead).length
    const kmh = Math.abs(this.speed) * 3.6
    return {
      gauges: [
        { label: 'Road speed', value: kmh.toFixed(0), unit: 'km/h', bar: kmh / 58 },
        { label: 'Engine', value: (600 + this.throttle * 1200).toFixed(0), unit: 'rpm' },
        { label: 'Traverse', value: (this.traverse / DEG).toFixed(0), unit: '°' },
        {
          label: 'Elevation',
          value: (this.elevation / DEG).toFixed(1),
          unit: '°',
          warn: this.elevation <= ELEV_MIN + 0.001,
        },
        {
          label: 'Range',
          value: this.rangeToReticle ? this.rangeToReticle.toFixed(0) : '—',
          unit: 'm',
        },
        { label: 'Rounds', value: `${this.rounds}`, warn: this.rounds <= 2 },
        {
          label: 'Breech',
          value: this.reload > 0 ? `${this.reload.toFixed(1)} s` : 'Loaded',
          warn: this.reload > 0,
          bar: 1 - this.reload / RELOAD,
        },
        { label: 'Hulks left', value: `${left}` },
        { label: 'Hull', value: `${(this.pitch / DEG).toFixed(0)}° / ${(this.bank / DEG).toFixed(0)}°` },
      ],
      status:
        this.finished
          ? 'Exercise over.'
          : Math.abs(this.speed) < 0.1 && Math.abs(this.steer) > 0.2
            ? 'Standing still, steering does nothing — clutch-brake needs road speed.'
            : this.elevation <= ELEV_MIN + 0.001
              ? 'Gun on the depression stop at five degrees. Reposition, or you cannot reach it.'
              : Math.abs(this.speed) > 1.5
                ? 'Moving. The gun has no stabiliser — halt before you shoot.'
                : 'Halted. Lay the gun and fire.',
      task: `Knock out five hulks — ${5 - left} down, ${this.rounds} rounds left`,
      progress: (5 - left) / 5,
      log: this.log,
      verdict: this.verdict,
    }
  }
}

const euler = new THREE.Euler(0, 0, 0, 'YXZ')
const UP_13 = new THREE.Vector3(0, 6.5, 0)

function spring(value: number, input: number, dt: number, rate: number, centre: number) {
  if (input === 0) {
    const back = centre * dt
    return Math.abs(value) <= back ? 0 : value - Math.sign(value) * back
  }
  return THREE.MathUtils.clamp(value + input * rate * dt, -1, 1)
}

const envelope: Dimension[] = [
  { label: 'Combat weight', value: '32.0 tonnes', source: MANUAL },
  { label: 'Engine', value: 'V-2-34 diesel, 500 hp', source: MANUAL },
  { label: 'Road speed', value: '55 km/h', source: MANUAL },
  { label: 'Gun', value: 'ZiS-S-53, 85 mm L/54.6', source: MANUAL },
  { label: 'Muzzle velocity', value: '792 m/s, BR-365 AP', source: ZALOGA },
  { label: 'Elevation', value: '+25° to −5°', source: MANUAL },
  { label: 'Turret traverse', value: '≈12 s for 360°, electric', source: TM },
  { label: 'Steering', value: 'Clutch and brake: no neutral turn', source: INFER },
  { label: 'Dispersion on the move', value: 'Unstabilised — modelled at 2.2 mrad per m/s', source: INFER },
]

export const t34Sim: SimDef = {
  slug: 't34-85',
  title: 'Gunnery',
  place: 'Range at Kubinka, outside Moscow',
  briefing: [
    'You are the commander, and on this tank that finally means you are not also the gunner — the 1,600 mm turret ring is the whole reason the crew is five.',
    'Two of the machine’s habits will shape the exercise. The transmission steers by braking one track against the other, so the tank must be rolling before it will turn, and the tighter you turn the more speed you give up. And the gun depresses only five degrees: the hulk sitting in the hollow cannot be reached from the high ground, however well you lay the sight.',
    'There is no stabiliser. Firing on the move throws the round wide in proportion to your speed, which is why the doctrine is the short halt.',
  ],
  task: 'Knock out five hulks with twelve rounds',
  views: [
    { name: 'chase', label: 'From behind' },
    { name: 'inside', label: 'Gunner’s sight' },
    { name: 'tower', label: 'From the stand' },
  ],
  bindings: [
    { keys: 'W / S', action: 'Throttle · brake and reverse' },
    { keys: '← / →', action: 'Steer — only works while rolling' },
    { keys: 'A / D', action: 'Turret traverse' },
    { keys: '↑ / ↓', action: 'Gun elevation' },
    { keys: 'Space', action: 'Fire' },
    { keys: 'B · H', action: 'Brakes · hatches' },
    { keys: 'V · P · R', action: 'View · pause · start again' },
  ],
  envelope,
  create: () => new T34Sim(),
}

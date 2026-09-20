import * as THREE from 'three'
import type { Controls, Dimension, Source } from '../types'
import type { Keyboard } from './keyboard'
import type { Readout, Sim, SimDef, ViewName } from './types'
import { G } from './flight'
import { range as field } from './fields/range'
import { Effects } from './fx'
import { Obstacles, type Obstacle } from './obstacles'
import { KINDS, layout, type Ammo } from './t34/targets'
import { MIL, MUZZLE, SIGHT_FOV, sight } from './t34/sight'
import {
  BARREL,
  CONTACT,
  DEG,
  ELEV_MAX,
  ELEV_MIN,
  GAUGE,
  RING_Y,
  RING_Z,
  TRUNNION,
} from '../three/t34/dims'

/**
 * Gunnery, Kubinka.
 *
 * Three facts about a T-34 do most of the work here. It steers by braking
 * one track against the other, so it cannot turn on the spot and must be
 * rolling to turn at all. The gun depresses only five degrees, which is a
 * real tactical cost the moment a target is below you. And there is no
 * stabiliser, so the doctrine is the short halt.
 *
 * Everything the gun can hit is an `Obstacle`, and the scene draws the same
 * list: what you can see is exactly what is there.
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
const V_MAX = 15.3 // m/s, 55 km/h on a road
const V_REVERSE = -2.2

/** Clutch-brake steering: the inner track is slowed, never stopped dead. */
const STEER_RATIO = 0.55
/** How hard the tracks can push sideways before they simply slide. */
const LATERAL_GRIP = 0.7

const TRAVERSE_RATE = 30 * DEG // 12 s for a full circle, electric
const ELEVATE_RATE = 6 * DEG // handwheel

// --- Armament ---------------------------------------------------------------
/** Muzzle velocities. BR-365 AP and O-365K HE come from the sight's own
 * table, since the graticule is drawn from the same figures; the DT's is
 * the standard 7.62 × 54R light-ball figure. */
const MV = { ...MUZZLE, mg: 840 }
/** What the exercise issues. The racks hold 55, but not for practice. */
const ISSUE = { ap: 8, he: 12 }
/** Five DT magazines of 63. */
const BELT = 315
const RELOAD = 8 // s, a trained loader with the rack to hand
const MG_RATE = 10 // rounds a second, 600 rpm
/** Dispersion: no stabiliser, so a short halt is the doctrine. */
const SPREAD_STATIC = 0.0004 // radians
const SPREAD_MOVING = 0.0022 // radians per m/s
/** HE lethal radius against soft targets. */
const HE_RADIUS = 9

interface Shell {
  pos: THREE.Vector3
  prev: THREE.Vector3
  vel: THREE.Vector3
  kind: Ammo
  life: number
  /** Every third DT round is a tracer; every main-gun round reads as one. */
  tracer: boolean
}

const euler = new THREE.Euler(0, 0, 0, 'YXZ')
const scratch = new THREE.Vector3()
const push = new THREE.Vector3()
const probe = new THREE.Vector3()
const normal = new THREE.Vector3()

/** Radius of the sphere that contains an obstacle, for the coarse sight cast. */
function bound(o: Obstacle) {
  const v = o.volume
  if (v.kind === 'box') return Math.hypot(v.hx, v.hy, v.hz)
  if (v.kind === 'cylinder') return Math.hypot(v.r, v.h / 2)
  return v.r
}

export class T34Sim implements Sim {
  readonly position = new THREE.Vector3()
  readonly quaternion = new THREE.Quaternion()
  readonly fx = new Effects(900)
  readonly obstacles = new Obstacles()

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

  /** The hull rocking on its springs after a round goes off. */
  private rock = 0
  private rockRate = 0
  private roll = 0
  private rollRate = 0
  private shake = 0

  private reload = 0
  private round: Exclude<Ammo, 'mg'> = 'ap'
  private ammo = { ap: ISSUE.ap, he: ISSUE.he }
  private belt = BELT
  private fired = 0
  private shots = 0
  private mgDue = 0
  private mgFiring = false
  private mgRound = 0
  private caseDue = 0
  private dustDue = 0
  private exhaustDue = 0
  private bumpCool = 0
  private clock = 0

  readonly shells: Shell[] = []
  private lorry: Obstacle

  private muzzle = new THREE.Vector3()
  private gunDir = new THREE.Vector3()
  private bowMg = new THREE.Vector3()
  private bowDir = new THREE.Vector3()
  private forward = new THREE.Vector3()
  private rangeToGround = 0
  private laidRange = 0
  private laidOn = ''
  private log: string[] = []
  private verdict: Readout['verdict']
  private ctl: Controls = {}

  finished = false

  constructor() {
    this.fx.ground = (x, z) => field.height(x, z)
    this.lorry = layout(this.obstacles, field).lorry
    this.reset()
  }

  /** The five that are scored. Everything else on the range is a bonus. */
  private get scored() {
    return this.obstacles.list.filter((o) => KINDS[o.kind].scored)
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
    this.rock = 0
    this.rockRate = 0
    this.roll = 0
    this.rollRate = 0
    this.shake = 0
    this.reload = 0
    this.round = 'ap'
    this.ammo = { ap: ISSUE.ap, he: ISSUE.he }
    this.belt = BELT
    this.fired = 0
    this.shots = 0
    this.mgFiring = false
    this.clock = 0
    this.position.set(0, field.height(0, 0), 0)
    this.quaternion.identity()
    this.shells.length = 0
    this.fx.reset()

    // The range is built once and revived, so the scene's meshes keep their
    // places across a restart.
    for (const o of this.obstacles.list) {
      o.dead = false
      o.deadFor = 0
      o.hp = o.data.hp0
      o.data.t = 0
      if (o.kind === 'lorry') o.pos.x = -o.data.span / 2
    }

    this.verdict = undefined
    this.finished = false
    this.log = [
      'Four hulks and a lorry on the range. Eight AP, twelve HE, five DT magazines.',
      'AP for armour, HE for anything that burns. No stabiliser: halt to shoot.',
    ]
  }

  private say(line: string) {
    this.log.push(line)
    if (this.log.length > 6) this.log.shift()
  }

  // --- Frame ----------------------------------------------------------------

  step(dt: number, keys: Keyboard) {
    this.clock += dt
    this.bumpCool = Math.max(0, this.bumpCool - dt)
    this.shake = Math.max(0, this.shake - dt * 2.4)

    this.drive(dt, keys)
    const before = { pitch: this.pitch, bank: this.bank }
    this.conform(dt)
    this.collide()

    // Rough ground shakes the picture in proportion to how fast the hull is
    // being worked, not simply to how fast you are going.
    const worked = Math.abs(this.pitch - before.pitch) + Math.abs(this.bank - before.bank)
    this.shake = Math.min(1, this.shake + worked * 26)

    this.lay(dt, keys)
    this.gunGeometry()
    this.castSight()

    this.reload = Math.max(0, this.reload - dt)
    if (keys.tapped('Digit1')) this.select('ap')
    if (keys.tapped('Digit2')) this.select('he')
    if (keys.tapped('KeyC')) this.select(this.round === 'ap' ? 'he' : 'ap')
    if (keys.tapped('Space')) this.fire()
    this.machineGuns(dt, keys)

    if (this.caseDue > 0) {
      this.caseDue -= dt
      if (this.caseDue <= 0) this.ejectCase()
    }

    this.advanceLorry(dt)
    this.advanceShells(dt)
    this.trackDust(dt)
    this.exhaust(dt)

    this.obstacles.step(dt)
    this.fx.step(dt)
    this.score()
    this.publish()
  }

  // --- Driver ---------------------------------------------------------------

  private drive(dt: number, keys: Keyboard) {
    const demand = keys.axis(['KeyS'], ['KeyW'])
    this.brakes = keys.down('KeyB') ? 1 : 0
    // Arrow right must put the nose to starboard, and starboard is −X.
    this.steer = spring(this.steer, -keys.axis(['ArrowLeft'], ['ArrowRight']), dt, 3, 4)
    if (keys.tapped('KeyH')) {
      this.hatches = this.hatches > 0.5 ? 0 : 1
      this.say(this.hatches > 0.5 ? 'Hatches open.' : 'Buttoned up.')
    }

    this.throttle = THREE.MathUtils.clamp(
      this.throttle + (demand > 0 ? dt * 1.4 : -dt * 2),
      0,
      1,
    )
    const reversing = demand < 0 && this.speed < 0.4

    // Tractive effort falls away with speed, the way a gearbox makes it.
    const tractive = Math.min(
      (POWER * this.throttle) / Math.max(Math.abs(this.speed), 1.6),
      TRACTION,
    )
    const surface = field.drag(this.position.x, this.position.z)
    const rolling = MASS * G * (surface + 0.0018 * Math.abs(this.speed))
    const slope = MASS * G * Math.sin(this.pitch)

    let force = reversing ? -TRACTION * 0.35 : tractive * (demand > 0 ? 1 : 0)
    force -= slope
    if (Math.abs(this.speed) > 0.05) {
      force -= Math.sign(this.speed) * rolling
      // Braking the inner track costs speed, and so does the brake pedal.
      force -= Math.sign(this.speed) * Math.abs(this.steer) * 0.18 * MASS * G
      force -= Math.sign(this.speed) * this.brakes * 0.5 * MASS * G
      if (demand < 0 && !reversing) force -= Math.sign(this.speed) * 0.45 * MASS * G
    }

    this.speed = THREE.MathUtils.clamp(this.speed + (force / MASS) * dt, V_REVERSE, V_MAX)
    if (demand === 0 && this.brakes === 0 && Math.abs(this.speed) < 0.06) this.speed = 0

    // Clutch-brake steering. There is no pivot turn in this transmission: the
    // yaw rate is proportional to road speed, so standing still the tank
    // cannot turn at all. At the other end it is the tracks' grip sideways
    // that limits the turn, not the brakes — 32 tonnes will not go round a
    // five-metre corner at 55 km/h.
    const clutchBrake = (STEER_RATIO * Math.abs(this.speed)) / GAUGE
    const gripLimit = (LATERAL_GRIP * G) / Math.max(Math.abs(this.speed), 0.5)
    const yawRate = Math.sign(this.speed) * this.steer * Math.min(clutchBrake, gripLimit)
    this.heading += yawRate * dt

    this.forward.set(Math.sin(this.heading), 0, Math.cos(this.heading))
    this.position.addScaledVector(this.forward, this.speed * dt)

    // Weight transfer: the hull squats under power and dives under the brake,
    // and leans out of a turn on those long Christie springs.
    const surge = (force / MASS) * 0.02
    this.rockRate -= surge * 8 * dt
    this.rollRate += yawRate * Math.abs(this.speed) * 0.09 * dt * 8
  }

  /** Sit the hull on the ground: four contact points, with the springs lagging. */
  private conform(dt: number) {
    const s = Math.sin(this.heading)
    const c = Math.cos(this.heading)
    const sample = (dz: number, dx: number) =>
      field.height(this.position.x + dz * s + dx * c, this.position.z + dz * c - dx * s)
    const fl = sample(CONTACT / 2, -GAUGE / 2)
    const fr = sample(CONTACT / 2, GAUGE / 2)
    const rl = sample(-CONTACT / 2, -GAUGE / 2)
    const rr = sample(-CONTACT / 2, GAUGE / 2)

    const height = (fl + fr + rl + rr) / 4
    const pitch = Math.atan2((fl + fr) / 2 - (rl + rr) / 2, CONTACT)
    const bank = Math.atan2((fl + rl) / 2 - (fr + rr) / 2, GAUGE)

    // The Christie springs are soft and there are five of them a side, so the
    // hull follows the ground with a lag rather than snapping to it.
    const k = 1 - Math.exp(-6 * dt)
    this.position.y += (height - this.position.y) * k
    this.pitch += (pitch - this.pitch) * k
    this.bank += (bank - this.bank) * k

    // The rocking that recoil and weight transfer add is a damped spring on
    // top of the ground's own attitude: about 1.2 Hz, lightly damped.
    const w = 7.5
    this.rockRate += (-w * w * this.rock - 2 * 0.35 * w * this.rockRate) * dt
    this.rock += this.rockRate * dt
    this.rollRate += (-w * w * this.roll - 2 * 0.4 * w * this.rollRate) * dt
    this.roll += this.rollRate * dt

    euler.set(-(this.pitch + this.rock), this.heading, -(this.bank + this.roll), 'YXZ')
    this.quaternion.setFromEuler(euler)
  }

  /**
   * Thirty-two tonnes against the scenery. A fence post is flattened and the
   * driver never notices; a hulk stops the tank dead and shakes the crew.
   */
  private collide() {
    for (const dz of [2.3, 0, -2.3]) {
      probe.copy(this.position).addScaledVector(this.forward, dz)
      probe.y = field.height(probe.x, probe.z) + 1.1
      const h = this.obstacles.hit(probe, 1.5)
      if (!h) continue
      const o = h.obstacle
      const k = KINDS[o.kind]

      if (k.solidity < 0.2) {
        if (!o.dead) {
          this.obstacles.damage(o, 99)
          o.data.fall = Math.atan2(this.forward.x, this.forward.z)
          this.fx.impact(h.point, 0.55, field.colour(o.pos.x, o.pos.z, o.pos.y))
          if (this.bumpCool <= 0) {
            this.bumpCool = 1.5
            this.say(`Flattened a ${k.label}.`)
          }
        }
        this.speed *= 0.99
        continue
      }

      // Push clear along the shortest way out, in the horizontal plane.
      push.subVectors(probe, h.point)
      push.y = 0
      const out = push.length()
      if (out > 1e-4) this.position.addScaledVector(push, h.distance / out)

      scratch.subVectors(o.pos, this.position).setY(0)
      if (scratch.lengthSq() < 1e-6) continue
      scratch.normalize()
      const closing = this.forward.dot(scratch) * Math.sign(this.speed || 1)
      if (closing <= 0) continue

      const impact = Math.abs(this.speed)
      this.speed = -Math.sign(this.speed) * Math.min(1.1, impact * 0.12)
      if (impact < 1.2) continue

      this.shake = Math.min(1, this.shake + impact * 0.14)
      this.rockRate += impact * 0.06
      this.fx.impact(h.point, 0.7 + impact * 0.12, field.colour(o.pos.x, o.pos.z, o.pos.y))
      // A tank can knock a hut down. It cannot knock a hulk down.
      const ram = impact * (1 - k.solidity) * 0.9
      if (ram > 0.4 && this.obstacles.damage(o, ram)) this.destroy(o, o.pos)
      else if (this.bumpCool <= 0) {
        this.bumpCool = 1.8
        this.say(`Into the ${k.label} at ${(impact * 3.6).toFixed(0)} km/h. Nobody thanks the driver.`)
      }
    }
  }

  // --- Gunner ---------------------------------------------------------------

  private lay(dt: number, keys: Keyboard) {
    this.traverse += keys.axis(['KeyD'], ['KeyA']) * TRAVERSE_RATE * dt
    if (this.traverse > Math.PI) this.traverse -= Math.PI * 2
    if (this.traverse < -Math.PI) this.traverse += Math.PI * 2
    this.elevation = THREE.MathUtils.clamp(
      this.elevation + keys.axis(['ArrowDown'], ['ArrowUp']) * ELEVATE_RATE * dt,
      ELEV_MIN,
      ELEV_MAX,
    )
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

    // The bow gun is fixed in the hull and points where the driver does.
    this.bowMg.set(-0.46, 1.16, 3.0).applyQuaternion(this.quaternion).add(this.position)
    this.bowDir.set(0, -0.02, 1).applyQuaternion(this.quaternion).normalize()
  }

  /**
   * What the sight line is resting on: the ground, or the first solid in the
   * way. Marched for the ground and tested analytically against the
   * obstacles, which is cheap enough to do every frame for sixty of them.
   */
  private castSight() {
    let ground = 0
    for (let d = 20; d < 3000; d += 8) {
      const x = this.muzzle.x + this.gunDir.x * d
      const y = this.muzzle.y + this.gunDir.y * d
      const z = this.muzzle.z + this.gunDir.z * d
      if (y <= field.height(x, z)) {
        ground = d
        break
      }
    }
    this.rangeToGround = ground

    let best = ground || Infinity
    let label = ground ? 'ground' : ''
    for (const o of this.obstacles.list) {
      if (o.dead && !o.blocksWhenDead) continue
      scratch.subVectors(o.pos, this.muzzle)
      const along = scratch.dot(this.gunDir)
      if (along < 6 || along > best) continue
      const r = bound(o)
      if (scratch.lengthSq() - along * along < r * r) {
        best = along
        label = KINDS[o.kind].label
      }
    }
    this.laidRange = Number.isFinite(best) ? best : 0
    this.laidOn = label
  }

  private select(round: Exclude<Ammo, 'mg'>) {
    if (this.round === round) return
    this.round = round
    if (this.reload > 0) {
      this.reload = Math.max(this.reload, 2.5)
      this.say(round === 'ap' ? 'Changing to armour-piercing.' : 'Changing to high explosive.')
    }
  }

  private fire() {
    if (this.reload > 0 || this.finished) return
    if (this.ammo[this.round] === 0) {
      this.say(`No ${this.round === 'ap' ? 'AP' : 'HE'} left in the racks.`)
      return
    }
    this.ammo[this.round]--
    this.fired++
    this.shots++
    this.reload = RELOAD
    this.caseDue = 0.6

    const spread = SPREAD_STATIC + SPREAD_MOVING * Math.abs(this.speed)
    const dir = this.gunDir.clone()
    dir.x += (Math.random() - 0.5) * 2 * spread
    dir.y += (Math.random() - 0.5) * 2 * spread
    dir.z += (Math.random() - 0.5) * 2 * spread
    dir.normalize()

    this.shells.push({
      pos: this.muzzle.clone(),
      prev: this.muzzle.clone(),
      vel: dir.clone().multiplyScalar(MV[this.round]),
      kind: this.round,
      life: 0,
      tracer: true,
    })

    this.muzzleBlast(dir)

    // Recoil. A 9.2 kg shot leaving at 792 m/s is 7.3 tonne-metres a second
    // of momentum into 32 tonnes: a fifth of a metre per second back, and a
    // pitch impulse about a bore axis two metres above the ground.
    const impulse = (9.2 * MV[this.round]) / MASS
    this.speed -= impulse * Math.cos(this.elevation) * 0.6
    this.rockRate += impulse * 0.34 * Math.cos(this.traverse)
    this.rollRate += impulse * 0.34 * Math.sin(this.traverse)
    this.shake = 1

    if (Math.abs(this.speed) > 1.5) {
      this.say(
        `Fired on the move at ${(Math.abs(this.speed) * 3.6).toFixed(0)} km/h — expect to miss.`,
      )
    }
  }

  /** Flame, smoke, and the dust the blast tears off the ground by the bow. */
  private muzzleBlast(dir: THREE.Vector3) {
    this.fx.emit('fire', this.muzzle, {
      vel: scratch.copy(dir).multiplyScalar(26),
      life: 0.13,
      size: 1.5,
      grow: 2.6,
      colour: '#fff4d2',
      fade: '#ffb552',
      drag: 5,
    })
    for (let i = 0; i < 9; i++) {
      scratch
        .copy(dir)
        .multiplyScalar(6 + Math.random() * 16)
        .addScaledVector(
          new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5),
          7,
        )
      this.fx.emit('smoke', this.muzzle, {
        vel: scratch,
        life: 1.4 + Math.random() * 1.6,
        size: 0.8 + Math.random(),
        grow: 3.4,
        colour: '#8d8779',
        fade: '#b3ae9f',
        drag: 2.2,
        gravity: 0.4,
      })
    }
    // The over-pressure lifts a ring of dust off the ground around the bow.
    const bow = new THREE.Vector3().copy(this.position).addScaledVector(this.forward, 3.4)
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      const r = 2.5 + Math.random() * 4
      const x = bow.x + Math.cos(a) * r
      const z = bow.z + Math.sin(a) * r
      probe.set(x, field.height(x, z) + 0.1, z)
      this.fx.emit('dust', probe, {
        vel: scratch.set(Math.cos(a) * 3, 1.6 + Math.random() * 2.4, Math.sin(a) * 3),
        life: 1.2 + Math.random() * 1.4,
        size: 0.7 + Math.random() * 0.8,
        grow: 3,
        colour: field.colour(x, z, 0),
        fade: '#cdc7b6',
        drag: 1.6,
        gravity: -1,
      })
    }
  }

  /** The semi-automatic breech throws the case out as it runs back up. */
  private ejectCase() {
    scratch
      .set(0.25, 0.4, -0.9)
      .applyQuaternion(this.quaternion)
      .add(this.position)
      .setY(this.position.y + 2.2)
    this.fx.emit('debris', scratch, {
      vel: new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        2.4 + Math.random(),
        -3 - Math.random() * 2,
      ).applyQuaternion(this.quaternion),
      life: 5,
      size: 0.16,
      grow: 1,
      colour: '#b08a3c',
      fade: '#8a6a2c',
      drag: 0.2,
      gravity: -9.81,
      spin: 16,
      bounce: true,
    })
  }

  /** Coaxial and bow DTs, both off the same belt count. */
  private machineGuns(dt: number, keys: Keyboard) {
    const want = keys.down('KeyF') && this.belt > 0 && !this.finished
    if (want && !this.mgFiring) this.mgDue = 0
    this.mgFiring = want
    if (!want) return

    this.mgDue -= dt
    while (this.mgDue <= 0 && this.belt > 0) {
      this.mgDue += 1 / MG_RATE
      this.belt -= 2 // both guns
      this.mgRound++
      const tracer = this.mgRound % 3 === 0
      for (const [from, along] of [
        [this.muzzle, this.gunDir],
        [this.bowMg, this.bowDir],
      ] as const) {
        const dir = along.clone()
        dir.x += (Math.random() - 0.5) * 0.004
        dir.y += (Math.random() - 0.5) * 0.004
        dir.z += (Math.random() - 0.5) * 0.004
        this.shells.push({
          pos: from.clone(),
          prev: from.clone(),
          vel: dir.normalize().multiplyScalar(MV.mg),
          kind: 'mg',
          life: 0,
          tracer,
        })
      }
      if (this.belt <= 0) this.say('Belt empty. Five magazines is a short afternoon.')
    }
  }

  // --- Ballistics -----------------------------------------------------------

  private advanceShells(dt: number) {
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const shell = this.shells[i]
      // At 792 m/s a whole frame is sixteen metres of flight, so substep.
      const steps = shell.kind === 'mg' ? 5 : 8
      const h = dt / steps
      let done = false
      for (let s = 0; s < steps && !done; s++) {
        shell.prev.copy(shell.pos)
        shell.vel.y -= G * h
        shell.pos.addScaledVector(shell.vel, h)
        shell.life += h

        scratch.subVectors(shell.pos, shell.prev)
        const len = scratch.length()
        if (len > 1e-6) {
          scratch.multiplyScalar(1 / len)
          const hit = this.obstacles.ray(
            shell.prev,
            scratch,
            len,
            shell.kind === 'mg' ? 0.08 : 0.16,
          )
          if (hit) {
            probe.copy(shell.prev).addScaledVector(scratch, hit.distance)
            done = this.impact(shell, hit.obstacle, probe, scratch)
          }
        }
        if (done) break

        if (shell.pos.y <= field.height(shell.pos.x, shell.pos.z)) {
          done = true
          shell.pos.y = field.height(shell.pos.x, shell.pos.z)
          this.ground(shell)
        }
        if (shell.life > (shell.kind === 'mg' ? 2.2 : 9)) done = true
      }
      if (done) this.shells.splice(i, 1)
    }
  }

  /** A round arriving on something solid. Returns true if it stops there. */
  private impact(shell: Shell, o: Obstacle, at: THREE.Vector3, dir: THREE.Vector3) {
    const k = KINDS[o.kind]

    // Armour at a fine angle turns an AP shot away. This is the reason the
    // glacis is laid at sixty degrees in the first place.
    if (shell.kind === 'ap' && o.kind === 'hulk') {
      normal.subVectors(at, o.pos).normalize()
      if (-dir.dot(normal) < 0.25) {
        this.fx.emit('spark', at, { life: 0.05, size: 0.9, grow: 2, colour: '#fff0c0', drag: 6 })
        for (let i = 0; i < 12; i++) {
          this.fx.emit('spark', at, {
            vel: new THREE.Vector3(
              (Math.random() - 0.5) * 24,
              Math.random() * 16,
              (Math.random() - 0.5) * 24,
            ),
            life: 0.35 + Math.random() * 0.5,
            size: 0.12,
            grow: 0.4,
            colour: '#ffdc94',
            fade: '#a83a0c',
            drag: 1,
            gravity: -9.81,
          })
        }
        shell.vel.reflect(normal).multiplyScalar(0.5)
        shell.pos.copy(at).addScaledVector(normal, 0.4)
        this.say('Ricochet — the angle was too fine to bite.')
        return false
      }
    }

    if (shell.kind === 'he') {
      this.detonate(at)
      return true
    }

    const dmg = shell.kind === 'ap' ? k.ap : k.mg
    if (dmg <= 0) {
      // A rifle bullet against 45 mm of armour: sparks and nothing else.
      this.fx.emit('spark', at, {
        vel: new THREE.Vector3((Math.random() - 0.5) * 8, Math.random() * 6, (Math.random() - 0.5) * 8),
        life: 0.22,
        size: 0.08,
        grow: 0.4,
        colour: '#ffe4a6',
        fade: '#9a3208',
        drag: 2,
        gravity: -9.81,
      })
      return true
    }

    if (shell.kind === 'ap') {
      this.fx.impact(at, 0.8, '#b3a487')
      this.fx.emit('spark', at, { life: 0.06, size: 0.7, grow: 2, colour: '#ffe9bd', drag: 6 })
    } else {
      this.fx.emit('dust', at, {
        vel: new THREE.Vector3(0, 1.2, 0),
        life: 0.5,
        size: 0.22,
        grow: 2.4,
        colour: '#c3b89e',
        drag: 2,
      })
    }

    if (this.obstacles.damage(o, dmg)) this.destroy(o, at)
    else if (shell.kind === 'ap') {
      this.say(`AP through the ${k.label} at ${this.metres(o)} m — and out the other side.`)
    }
    // An AP shot goes through a hut and keeps going; it stops in armour.
    return o.kind === 'hulk' || shell.kind === 'mg' || k.solidity > 0.9
  }

  /** The round that fell short, or the one that was meant for the ground. */
  private ground(shell: Shell) {
    if (shell.kind === 'he') {
      this.detonate(shell.pos)
      return
    }
    if (shell.kind === 'mg') {
      this.fx.emit('dust', shell.pos, {
        vel: new THREE.Vector3((Math.random() - 0.5) * 2, 1.4, (Math.random() - 0.5) * 2),
        life: 0.6,
        size: 0.22,
        grow: 3,
        colour: field.colour(shell.pos.x, shell.pos.z, shell.pos.y),
        drag: 2,
      })
      return
    }
    this.fx.impact(shell.pos, 1.7, field.colour(shell.pos.x, shell.pos.z, shell.pos.y))
    const miss = this.nearestMiss(shell.pos)
    if (miss !== null) this.say(`Short — ${miss.toFixed(0)} m from the nearest hulk.`)
  }

  /** High explosive: a fireball, a shockwave in the dust, and a blast radius. */
  private detonate(at: THREE.Vector3) {
    this.fx.explosion(at, 2.6, { debris: 9, fire: 0 })
    // The ring of dust the shockwave rolls outward along the ground.
    const y = field.height(at.x, at.z)
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2
      probe.set(at.x + Math.cos(a) * 1.5, y + 0.2, at.z + Math.sin(a) * 1.5)
      this.fx.emit('dust', probe, {
        vel: scratch.set(Math.cos(a) * 17, 1.4, Math.sin(a) * 17),
        life: 0.85,
        size: 0.5,
        grow: 4.5,
        colour: field.colour(probe.x, probe.z, y),
        fade: '#cfc9b8',
        drag: 3.6,
      })
    }
    this.blast(at, HE_RADIUS, 1)
  }

  private blast(at: THREE.Vector3, radius: number, power: number) {
    for (const o of this.obstacles.list) {
      if (o.dead) continue
      const d = o.pos.distanceTo(at)
      if (d > radius) continue
      const dmg = KINDS[o.kind].he * (1 - d / radius) * power
      if (dmg <= 0.02) continue
      if (this.obstacles.damage(o, dmg)) this.destroy(o, o.pos)
    }
  }

  /** What it looks like when something on the range comes apart. */
  private destroy(o: Obstacle, at: THREE.Vector3) {
    const k = KINDS[o.kind]
    o.data.fall = o.data.fall ?? Math.random() * Math.PI * 2
    o.data.spin = (Math.random() - 0.5) * 2

    if (o.kind === 'hulk') {
      // Ammunition going up inside a tank throws the turret off and puts a
      // lance of flame out of every hatch. It is the most recognisable thing
      // on any battlefield photograph of 1944.
      scratch.copy(o.pos).setY(o.pos.y + 0.9)
      this.fx.explosion(scratch, k.blast, { debris: 18, fire: k.burn })
      for (let i = 0; i < 14; i++) {
        this.fx.emit('fire', scratch, {
          vel: new THREE.Vector3(
            (Math.random() - 0.5) * 5,
            16 + Math.random() * 16,
            (Math.random() - 0.5) * 5,
          ),
          life: 0.55 + Math.random() * 0.5,
          size: 1.1 + Math.random(),
          grow: 2.2,
          colour: '#fff0c4',
          fade: '#d24d10',
          drag: 1.1,
          gravity: -3,
        })
      }
      this.say(`Brewed up — ${k.label} at ${this.metres(o)} m.`)
      return
    }

    if (k.blast > 0) {
      this.fx.explosion(o.pos, k.blast, { debris: Math.round(4 + k.blast * 2), fire: k.burn })
      if (o.kind === 'drum') this.blast(o.pos, 5, 0.5)
    } else {
      this.fx.impact(at, 1.4, field.colour(o.pos.x, o.pos.z, o.pos.y))
      for (let i = 0; i < 8; i++) {
        this.fx.emit('debris', o.pos, {
          vel: new THREE.Vector3(
            (Math.random() - 0.5) * 9,
            2 + Math.random() * 7,
            (Math.random() - 0.5) * 9,
          ),
          life: 3 + Math.random() * 2,
          size: 0.18 + Math.random() * 0.2,
          grow: 1,
          colour: o.kind === 'wall' ? '#8d8272' : '#6a5a41',
          fade: '#4a4236',
          drag: 0.3,
          gravity: -9.81,
          spin: 12,
          bounce: true,
        })
      }
    }
    if (k.solidity > 0.15) this.say(`Down — ${k.label} at ${this.metres(o)} m.`)
  }

  private metres(o: Obstacle) {
    return Math.hypot(o.pos.x - this.position.x, o.pos.z - this.position.z).toFixed(0)
  }

  private nearestMiss(at: THREE.Vector3) {
    let best = Infinity
    for (const o of this.scored) {
      if (o.dead) continue
      best = Math.min(best, Math.hypot(at.x - o.pos.x, at.z - o.pos.z))
    }
    return Number.isFinite(best) ? best : null
  }

  // --- The range lives -------------------------------------------------------

  private advanceLorry(dt: number) {
    const o = this.lorry
    if (o.dead) return
    o.data.t += dt
    // There and back along a fixed line, which is what a range lorry does.
    const cycle = (o.data.span * 2) / o.data.speed
    const phase = o.data.t % cycle
    const run = phase < cycle / 2 ? phase * o.data.speed : o.data.span * 2 - phase * o.data.speed
    o.pos.x = -o.data.span / 2 + run
    o.pos.y = field.height(o.pos.x, o.pos.z) + 1.1
    o.yaw = run < o.data.span ? Math.PI / 2 : -Math.PI / 2
  }

  /** Dust and mud off the tracks, in proportion to speed and to the going. */
  private trackDust(dt: number) {
    const v = Math.abs(this.speed)
    if (v < 1.2) return
    const soft = field.drag(this.position.x, this.position.z)
    this.dustDue -= dt
    while (this.dustDue <= 0) {
      this.dustDue += 0.1 / Math.min(2.4, v / 3)
      for (const side of [1, -1]) {
        scratch.set(side * 1.25, 0.1, -2.5).applyQuaternion(this.quaternion).add(this.position)
        const c = field.colour(scratch.x, scratch.z, scratch.y)
        this.fx.emit('dust', scratch, {
          vel: probe
            .copy(this.forward)
            .multiplyScalar(-v * 0.35)
            .setY(1 + Math.random() * 1.6),
          life: 0.9 + Math.random() * 1.2,
          size: 0.4 + v * 0.05,
          grow: 3.2,
          colour: c,
          fade: '#cec7b5',
          drag: 1.7,
          gravity: -0.8,
        })
        // Soft going throws stones as well as dust.
        if (soft > 0.07 && Math.random() < 0.4) {
          this.fx.emit('debris', scratch, {
            vel: probe
              .copy(this.forward)
              .multiplyScalar(-v * 0.7)
              .setY(3 + Math.random() * 3),
            life: 1.6,
            size: 0.08,
            grow: 1,
            colour: '#6e6350',
            fade: '#544b3c',
            drag: 0.2,
            gravity: -9.81,
            spin: 12,
            bounce: true,
          })
        }
      }
    }
  }

  /** Two pipes out of the rear plate. A diesel opened up makes black smoke. */
  private exhaust(dt: number) {
    this.exhaustDue -= dt
    while (this.exhaustDue <= 0) {
      this.exhaustDue += 0.1
      const load = this.throttle
      for (const side of [1, -1]) {
        scratch.set(side * 0.56, 1.02, -3.25).applyQuaternion(this.quaternion).add(this.position)
        this.fx.puff(
          scratch,
          probe
            .copy(this.forward)
            .multiplyScalar(-2 - load * 5)
            .setY(0.8 + load),
          0.22 + load * 0.5,
          load > 0.5 ? '#2a2723' : '#7a756c',
          0.9 + load * 1.4,
        )
      }
    }
  }

  // --- Scoring ---------------------------------------------------------------

  private score() {
    if (this.finished) return
    const left = this.scored.filter((o) => !o.dead).length
    if (left === 0) {
      const extra = this.obstacles.list.filter((o) => o.dead && !KINDS[o.kind].scored).length
      this.end(true, 'Range complete', [
        `Five targets with ${this.fired} rounds in ${this.clock.toFixed(0)} seconds.`,
        `${extra} other things on the range did not survive the afternoon.`,
        this.fired <= 8
          ? 'That is better shooting than the exercise expects.'
          : 'A pass. The gunner’s handwheel is slower than the target.',
      ])
    } else if (this.ammo.ap + this.ammo.he === 0 && this.shells.length === 0) {
      this.end(false, 'Ammunition expended', [
        `${5 - left} of five, with twenty rounds.`,
        'The racks hold fifty-five more, but not on this exercise.',
      ])
    }
  }

  private end(good: boolean, title: string, lines: string[]) {
    this.verdict = { good, title, lines }
    this.finished = true
  }

  // --- What the rest of the page reads --------------------------------------

  /** Superelevation for a range, in Soviet mils. */
  private layFor(distance: number) {
    if (!distance) return 0
    return Math.atan((G * distance) / (2 * MV[this.round] ** 2)) / MIL
  }

  private publish() {
    sight.live = true
    sight.range = this.rangeToGround
    sight.laid = this.laidRange
    sight.on = this.laidOn
    sight.round = this.round
    sight.ap = this.ammo.ap
    sight.he = this.ammo.he
    sight.belt = this.belt
    sight.reload = this.reload
    sight.reloadFull = RELOAD
    sight.atStop = this.elevation <= ELEV_MIN + 1e-4
    sight.lay = this.layFor(this.laidRange)
    sight.speed = Math.abs(this.speed) * 3.6
  }

  controls() {
    this.ctl.speed = Math.abs(this.speed) * 3.6
    this.ctl.traverse = this.traverse / DEG
    this.ctl.elevation = this.elevation / DEG
    // The suspension has work to do in proportion to how fast it is going.
    this.ctl.terrain = Math.min(100, Math.abs(this.speed) * 6)
    this.ctl.hatches = this.hatches
    this.ctl.shots = this.shots
    this.ctl.mg = this.mgFiring ? 1 : 0
    return this.ctl
  }

  /** A little noise on the camera, scaled by whatever just happened. */
  private jitter(v: THREE.Vector3, amount: number) {
    if (amount < 1e-4) return
    const t = this.clock
    v.x += Math.sin(t * 61.7) * amount
    v.y += Math.sin(t * 74.3 + 1.7) * amount
    v.z += Math.sin(t * 53.1 + 3.1) * amount
  }

  camera(view: ViewName, eye: THREE.Vector3, aim: THREE.Vector3) {
    const s = this.shake * this.shake
    if (view === 'inside') {
      // Down the TSh-16, which is mounted alongside the gun in the mantlet.
      eye.copy(this.muzzle).addScaledVector(this.gunDir, -3.6)
      aim.copy(eye).addScaledVector(this.gunDir, 1400)
      this.jitter(eye, s * 0.035)
      this.jitter(aim, s * 3.2)
      return SIGHT_FOV
    }
    if (view === 'tower') {
      eye.set(-38, field.height(-38, -30) + 12, -30)
      aim.copy(this.position)
      return 26
    }
    eye.copy(this.position).addScaledVector(this.forward, -13).add(UP_13)
    aim.copy(this.position).addScaledVector(this.forward, 8)
    aim.y += 1.5
    this.jitter(eye, s * 0.22)
    return 45
  }

  readout(): Readout {
    const left = this.scored.filter((o) => !o.dead).length
    const kmh = Math.abs(this.speed) * 3.6
    const lay = this.layFor(this.laidRange)
    return {
      gauges: [
        { label: 'Road speed', value: kmh.toFixed(0), unit: 'km/h', bar: kmh / 55 },
        { label: 'Engine', value: (600 + this.throttle * 1200).toFixed(0), unit: 'rpm' },
        { label: 'Traverse', value: (this.traverse / DEG).toFixed(0), unit: '°' },
        {
          label: 'Elevation',
          value: (this.elevation / DEG).toFixed(1),
          unit: '°',
          warn: this.elevation <= ELEV_MIN + 1e-4,
        },
        {
          label: 'Range',
          value: this.laidRange ? this.laidRange.toFixed(0) : '—',
          unit: 'm',
        },
        {
          label: 'Lay high',
          value: this.laidRange ? `+${lay.toFixed(1)}` : '—',
          unit: 'mil',
        },
        {
          label: 'Loaded',
          value: this.round === 'ap' ? 'BR-365' : 'O-365K',
          unit: this.round === 'ap' ? 'AP' : 'HE',
        },
        { label: 'AP rounds', value: `${this.ammo.ap}`, warn: this.ammo.ap === 0 },
        { label: 'HE rounds', value: `${this.ammo.he}`, warn: this.ammo.he === 0 },
        {
          label: 'DT belt',
          value: `${this.belt}`,
          warn: this.belt < 40,
          bar: this.belt / BELT,
        },
        {
          label: 'Breech',
          value: this.reload > 0 ? `${this.reload.toFixed(1)} s` : 'Loaded',
          warn: this.reload > 0,
          bar: 1 - this.reload / RELOAD,
        },
        { label: 'Targets left', value: `${left}` },
      ],
      status: this.finished
        ? 'Exercise over.'
        : Math.abs(this.speed) < 0.1 && Math.abs(this.steer) > 0.2
          ? 'Standing still, steering does nothing — clutch-brake needs road speed.'
          : this.elevation <= ELEV_MIN + 1e-4
            ? 'Gun on the depression stop at five degrees. Reposition, or you cannot reach it.'
            : Math.abs(this.speed) > 1.5
              ? 'Moving. The gun has no stabiliser — halt before you shoot.'
              : this.laidOn && this.laidOn !== 'ground'
                ? `Laid on the ${this.laidOn} at ${this.laidRange.toFixed(0)} m. Lay ${lay.toFixed(1)} mils high.`
                : 'Halted. Lay the gun and fire.',
      task: `Clear the range — ${5 - left} of 5, ${this.ammo.ap} AP and ${this.ammo.he} HE left`,
      progress: (5 - left) / 5,
      log: this.log,
      verdict: this.verdict,
    }
  }
}

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
  { label: 'Armour-piercing', value: 'BR-365, 9.2 kg at 792 m/s', source: ZALOGA },
  { label: 'High explosive', value: 'O-365K, 9.5 kg at 793 m/s, 741 g TNT', source: TM },
  { label: 'Secondary', value: '2 × 7.62 mm DT, 1,890 rounds stowed', source: MANUAL },
  { label: 'Elevation', value: '+25° to −5°', source: MANUAL },
  { label: 'Turret traverse', value: '≈12 s for 360°, electric', source: TM },
  { label: 'Steering', value: 'Clutch and brake: no neutral turn', source: INFER },
  { label: 'Dispersion on the move', value: 'Unstabilised — modelled at 2.2 mrad per m/s', source: INFER },
  { label: 'Trajectory', value: 'Drag neglected: the sight’s lay is the vacuum solution', source: INFER },
]

export const t34Sim: SimDef = {
  slug: 't34-85',
  title: 'Gunnery',
  place: 'Range at Kubinka, outside Moscow',
  briefing: [
    'You are the commander, and on this tank that finally means you are not also the gunner — the 1,600 mm turret ring is the whole reason the crew is five.',
    'Two of the machine’s habits will shape the exercise. The transmission steers by braking one track against the other, so the tank must be rolling before it will turn, and the tighter you turn the more speed you give up. And the gun depresses only five degrees: the hulk sitting in the hollow cannot be reached from the high ground, however well you lay the sight.',
    'You have two natures of round and they are not interchangeable. BR-365 armour-piercing is a nine-kilogram steel bolt that will open a tank and go straight through a timber hut leaving two neat holes. O-365K high explosive will flatten the hut and barely mark the tank. Choose before you pull; changing a loaded round costs the loader time. The two DT machine guns will do neither, but they will take a lorry apart.',
    'There is no stabiliser. Firing on the move throws the round wide in proportion to your speed, which is why the doctrine is the short halt. And the round falls: the panel gives you the superelevation the sight’s range drum would have dialled in, in mils. Lay the reticle that much above what you want to hit — and lead the lorry, which is doing about thirty km/h across your front.',
  ],
  task: 'Clear the range: four hulks and the lorry',
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
    { keys: 'Space', action: 'Fire the 85 mm' },
    { keys: '1 / 2 · C', action: 'Load AP · load HE · change round' },
    { keys: 'F', action: 'Both DT machine guns — hold' },
    { keys: 'B · H', action: 'Brakes · hatches' },
    { keys: 'V · P · R', action: 'View · pause · start again' },
  ],
  envelope,
  create: () => new T34Sim(),
}

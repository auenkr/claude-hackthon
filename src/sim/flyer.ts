import * as THREE from 'three'
import type { Controls, Dimension, Source } from '../types'
import type { Keyboard } from './keyboard'
import type { Readout, Sim, SimDef, ViewName } from './types'
import {
  G,
  airflow,
  attitude,
  bodyAxes,
  liftCoefficient,
  rotateBody,
  setAttitude,
  stallFraction,
  type Airflow,
  type Attitude,
} from './flight'
import { killDevil } from './fields/killDevil'
import { Effects } from './fx'
import { Obstacles, type Obstacle } from './obstacles'
import { FLYER_SKID } from '../three/flyerStance'
import { RAIL, RAIL_END, RAIL_LENGTH, RAIL_TOP, populate } from './flyer/world'

/**
 * Kill Devil Hills, 17 December 1903.
 *
 * Every coefficient below is either a published figure or an inference drawn
 * from one, and they are consistent with each other: at 338 kg on 47.4 m² the
 * wing needs CL ≈ 0.55 to fly at the speed the brothers recorded, the twelve
 * horsepower engine turns that into about four hundred and sixty newtons at
 * that speed, and the resulting lift-to-drag ratio is only good enough to
 * sustain flight *close to the sand*, where the ground takes a slice off the
 * induced drag. Which is exactly how the machine was flown.
 *
 * ---------------------------------------------------------------------------
 * Retuning, and why. The first cut of this model was not flyable: it could
 * not hold height above about half a metre, so every run ended within a few
 * seconds and the visitor could not tell whether they or the aeroplane were
 * at fault. Four things changed, all of them working back from the recorded
 * numbers rather than away from them:
 *
 *  1. Ground effect is now measured from the *wing*, not from the skids. The
 *     old code fed the skid clearance into a formula that wants the height of
 *     the lifting surface, which handed the machine a 95% cut in induced drag
 *     while it was still sitting on the rail. With the honest height the
 *     cushion is weaker and shallower, so it had to be paid for elsewhere.
 *  2. Thrust is a curve, not a number. Static thrust is 575 N — 129 lbf,
 *     near the top of the 90–132 lbf range in the accounts — falling off with
 *     the square of airspeed over the pitch speed, as a propeller's does.
 *     That is about 460 N at the speed the machine actually flies, which is
 *     less than the flat 470 N it had before where it matters.
 *  3. CD₀ is 0.035 rather than 0.045, so that the machine's best lift-to-drag
 *     ratio a metre over the sand falls at 14 to 16 m/s of air — 4 to 6 m/s
 *     over the ground in a ten-metre wind, which is flight four's 260 m in 59
 *     seconds. Top speed in the model is 33–37 mph against the brothers' own
 *     estimate of 30–35.
 *  4. The elevator is a lever, not a sprung stick: it now stays where it is
 *     put, because that is what a hand lever does and because a control that
 *     springs back to centre is unflyable on a divergent aeroplane. Pitch
 *     damping went from −4 to −6.5 and elevator authority from 0.14 to 0.22
 *     per unit of lever. The machine still diverges: with these numbers the
 *     unstable root has a time constant of about 1.6 s, so an upset doubles
 *     in a second or so. That is a workload. At −4 it was under a second,
 *     which is a coin toss.
 *
 * Flown headless by a pilot model — an attitude inner loop under a height
 * outer loop — the result is 14 m hands-off, 60 to 75 m with a third of a
 * second of reaction lag, and kilometres with a tenth. The record is
 * reachable; it is not free.
 *
 * What did *not* change: the sign of Cmα, the wing area, the mass, the wind,
 * or the fact that the machine cannot sustain level flight much more than a
 * metre and a half over the sand at any speed. The aeroplane is still the
 * marginal, divergent, ground-skimming thing it was.
 * ---------------------------------------------------------------------------
 */

const PAPERS: Source = {
  kind: 'text',
  citation: 'McFarland, M. (ed.), The Papers of Wilbur and Orville Wright (1953)',
  note: 'Flight log for 17 December 1903 and the brothers’ own wind-tunnel and propeller figures.',
}
const JAKAB: Source = {
  kind: 'text',
  citation: 'Jakab, P., Visions of a Flying Machine (Smithsonian, 1990)',
}
const NASM: Source = {
  kind: 'artifact',
  citation: 'NASM A19480041 — 1903 Wright Flyer, Smithsonian survey',
}
const INFER: Source = {
  kind: 'inference',
  citation: 'Derived for this simulation from the cited weight, area and power',
  note: 'Coefficients are chosen to reproduce the recorded speeds and durations, not measured.',
}

// --- Airframe ---------------------------------------------------------------
const MASS = 338 // kg, machine and pilot
const AREA = 47.4 // m²
const SPAN = 12.29
const CHORD = 1.98
const HALF = SPAN / 2
const IXX = 1800 // kg·m², roll
const IYY = 760 // pitch
const IZZ = 2100 // yaw

/**
 * Static thrust from both propellers, and the airspeed at which a blade
 * element at three-quarter radius would stop producing any. Thrust falls off
 * as the square of the ratio, which is close enough to a real propeller's
 * curve over the narrow band this machine ever sees.
 */
const THRUST = 575 // N static — 129 lbf, near the top of the published range
const PROP_PITCH = 24 // m/s, the pitch speed at three-quarter radius

const CL_SLOPE = 4.2 // per radian
const ALPHA_ZERO = -0.083 // radians: the deep camber lifts at zero incidence
const CL_MAX = 1.35
const CD0 = 0.035
const K_INDUCED = 0.166 // 1/(π·AR·e) with AR 3.19 and biplane interference

/**
 * Effective height of the wing system above the datum. The lower wing sits
 * 0.45 m over the skid line and the upper 2.33 m; in ground effect the lower
 * surface does most of the work, so the pair is treated as one wing a third
 * of the way up the gap.
 */
const WING_HEIGHT = 1.08

/** Induced-drag relief with the skids on the sand — the whole cushion. */
const GE_SAND = (() => {
  const hb = (16 * WING_HEIGHT) / SPAN
  return 1 - (hb * hb) / (1 + hb * hb)
})()

// Pitch: unstable, as a canard machine with the elevator ahead of the wing is.
/**
 * Trimmed for five degrees of incidence — a little above the attitude the
 * truck holds on the rail, so the machine lifts its own nose as it comes off
 * and then wants to go on doing it. Orville's first flight did exactly that,
 * rose to about ten feet, and darted back at the sand.
 */
const CM0 = -0.0218
const CM_ALPHA = 0.25 // positive — it diverges, and the pilot must answer
/** Per unit of lever, and the pilot's lever is signed nose-up positive. */
const CM_ELEVATOR = 0.22
const CM_RATE = -6.5
/** The canard is 4.5 m² of surface: pulling it also lifts, not just pitches. */
const CL_ELEVATOR = 0.03

const CL_WARP = 0.085 // roll from full hip cradle
const CL_DAMP = -0.5
const CL_BETA = 0.02 // anhedral: sideslip rolls it further, not back

const CN_RUDDER = 0.06 // the linked rudder, into the turn
const CN_ADVERSE = -0.028 // the warped wing's own drag, out of the turn
const CN_BETA = 0.09 // the rudder as a weathercock
const CN_DAMP = -0.06

const WIND = 10 // m/s northerly. 'Wind 27 miles' in the log, easing through the day
const GUST = 0.9 // m/s of it that is not steady
const RAIL_INCIDENCE = 6 * (Math.PI / 180)
/** A truck on an iron-faced rail. Very little, but not nothing. */
const RAIL_FRICTION = 0.015

/** How hard a touch the skids will take before they dig in, m/s. */
const SKIM_SINK = 1.9
/** Beyond this much bank a wingtip reaches the sand before the skids do. */
const TIP_BANK = 7 * (Math.PI / 180)

/** The four flights of the day, in metres over the ground. */
export const RECORD = [
  { m: 36.5, s: 12, who: 'Orville, flight one' },
  { m: 53, s: 12, who: 'Wilbur, flight two' },
  { m: 61, s: 15, who: 'Orville, flight three' },
  { m: 260, s: 59, who: 'Wilbur, flight four' },
]

const MPH = 2.23694

type Phase = 'ready' | 'rail' | 'flying' | 'down' | 'wrecked'

/** Points on the airframe that are tested against the world, in body axes. */
const PROBES: { p: THREE.Vector3; r: number; what: string }[] = [
  { p: new THREE.Vector3(0, 1.0, 3.3), r: 0.55, what: 'the forward elevator' },
  { p: new THREE.Vector3(-6.0, 0.4, 0), r: 0.55, what: 'the port wingtip' },
  { p: new THREE.Vector3(6.0, 0.4, 0), r: 0.55, what: 'the starboard wingtip' },
  { p: new THREE.Vector3(-3.1, 0.9, 0), r: 0.7, what: 'the port wing' },
  { p: new THREE.Vector3(3.1, 0.9, 0), r: 0.7, what: 'the starboard wing' },
  { p: new THREE.Vector3(0, 1.2, 0), r: 0.95, what: 'the centre section' },
  { p: new THREE.Vector3(0, 1.1, -3.0), r: 0.55, what: 'the rudder' },
  // The skids run along the sand, and they are what finds the driftwood.
  { p: new THREE.Vector3(0.6, 0.06, 0.6), r: 0.3, what: 'the starboard skid' },
  { p: new THREE.Vector3(-0.6, 0.06, 0.6), r: 0.3, what: 'the port skid' },
  { p: new THREE.Vector3(0.6, 0.06, -1.8), r: 0.3, what: 'the starboard skid' },
  { p: new THREE.Vector3(-0.6, 0.06, -1.8), r: 0.3, what: 'the port skid' },
]

export class FlyerSim implements Sim {
  readonly position = new THREE.Vector3()
  readonly quaternion = new THREE.Quaternion()

  readonly fx = new Effects(560)
  readonly obstacles = new Obstacles()
  showModel = true

  /** What is left of the machine, for the scene to draw where it stopped. */
  readonly wreck = { active: false, pos: new THREE.Vector3(), yaw: 0, age: 0 }
  /** The launch truck, which goes on down the rail after you have left it. */
  readonly truck = { z: 0, speed: 0, on: true }

  /** Read by the scenery: how hard the air and the propellers are blowing. */
  airspeed = 0
  altitude = 0
  propwash = 0

  private velocity = new THREE.Vector3()
  private wind = new THREE.Vector3(0, 0, -WIND)
  private phase: Phase = 'ready'
  private clock = 0

  // Controls, as the pilot's hands leave them.
  private power = 0
  private warp = 0
  /** +1 = full nose up. A hand lever with friction: it stays where it is put. */
  private elevator = 0
  private linked = true

  private pitchRate = 0
  private rollRate = 0
  private yawRate = 0

  private att: Attitude = { pitch: 0, bank: 0, heading: 0 }
  private air: Airflow = { V: 0, qbar: 0, alpha: 0, beta: 0 }

  private liftDir = new THREE.Vector3()
  private dragDir = new THREE.Vector3()
  private forward = new THREE.Vector3()
  private up = new THREE.Vector3()
  private right = new THREE.Vector3()
  private force = new THREE.Vector3()
  private probe = new THREE.Vector3()
  private scratch = new THREE.Vector3()

  private liftOff = new THREE.Vector3()
  private airtime = 0
  private best = 0
  private climb = 0
  private cushion = 0
  private loadFactor = 0
  private milestone = -1
  private skims = 0
  private sandDue = 0
  private jolt = 0
  private nextBoard = 0
  private breakUpLeft = 0
  private wreckDrift = new THREE.Vector3()
  private tumbleSpin = 0
  private tumbleDue = 0
  private log: string[] = []
  private verdict: Readout['verdict']
  private ctl: Controls = {}
  private stall = 0

  finished = false

  constructor() {
    this.fx.ground = (x, z) => killDevil.height(x, z)
    this.reset()
  }

  reset() {
    this.position.set(0, RAIL_TOP + FLYER_SKID, 0)
    setAttitude(this.quaternion, RAIL_INCIDENCE, 0, 0)
    this.velocity.set(0, 0, 0)
    this.phase = 'ready'
    this.clock = 0
    this.power = 0
    this.warp = 0
    this.elevator = 0
    this.linked = true
    this.pitchRate = this.rollRate = this.yawRate = 0
    this.airtime = 0
    this.best = 0
    this.climb = 0
    this.cushion = 0
    this.loadFactor = 0
    this.milestone = -1
    this.skims = 0
    this.stall = 0
    this.jolt = 0
    this.nextBoard = 1
    this.breakUpLeft = 0
    this.wreckDrift.set(0, 0, 0)
    this.tumbleSpin = 0
    this.tumbleDue = 0
    this.liftOff.set(0, 0, 0)
    this.verdict = undefined
    this.finished = false
    this.showModel = true
    this.wreck.active = false
    this.wreck.age = 0
    this.truck.z = 0
    this.truck.speed = 0
    this.truck.on = true
    this.airspeed = WIND
    this.altitude = 0
    this.propwash = 0
    this.fx.reset()
    this.obstacles.reset()
    populate(this.obstacles, RECORD)
    this.log = ['Machine on the rail, nose into a ten-metre wind.']
  }

  private say(line: string) {
    this.log.push(line)
    if (this.log.length > 6) this.log.shift()
  }

  // --- The air ---------------------------------------------------------------

  /**
   * A December northerly off the sound, which is not a wind tunnel. Two
   * incommensurable periods, so the gust never quite repeats — enough to keep
   * the pilot honest without making the run a lottery.
   */
  private breeze() {
    const t = this.clock
    this.wind.set(
      Math.sin(t * 0.61) * GUST * 0.5,
      Math.sin(t * 1.31 + 0.4) * GUST * 0.3,
      -(WIND + Math.sin(t * 0.77) * GUST * 0.6 + Math.sin(t * 1.93 + 1.1) * GUST * 0.3),
    )
  }

  /** Propeller thrust at the current airspeed. */
  private thrustAt(V: number) {
    const f = Math.min(1, V / PROP_PITCH)
    return THRUST * this.power * Math.max(0.1, 1 - 0.5 * f * f)
  }

  step(dt: number, keys: Keyboard) {
    this.clock += dt
    this.breeze()
    this.fx.step(dt)
    this.obstacles.step(dt)
    if (this.jolt > 0) this.jolt = Math.max(0, this.jolt - dt * 4)

    // The air is resolved in every phase, not only in flight: there is a
    // ten-metre wind over the wing while the machine is still on the rail,
    // and the panel would be lying if it read zero.
    bodyAxes(this.quaternion, this.forward, this.up, this.right)
    airflow(this.velocity, this.wind, this.quaternion, this.air, this.liftDir, this.dragDir)
    attitude(this.quaternion, this.att)
    this.airspeed = this.air.V
    const terrain = killDevil.height(this.position.x, this.position.z)
    this.altitude = Math.max(0, this.position.y - terrain - FLYER_SKID)
    this.propwash = this.power * (1 - Math.min(1, this.altitude / 3))

    // --- The pilot's hands -------------------------------------------------
    this.power = THREE.MathUtils.clamp(
      this.power + keys.axis(['KeyS'], ['KeyW']) * dt * 0.7,
      0,
      1,
    )
    if (keys.tapped('KeyL')) {
      this.linked = !this.linked
      this.say(
        this.linked
          ? 'Rudder linked to the cradle, as rigged in 1903.'
          : 'Linkage disconnected — the rudder is fixed, as it was in 1902.',
      )
    }

    // The elevator lever holds its position — it is a hand lever with
    // friction, not a sprung stick. The hip cradle does come back to centre,
    // because what returns it is the pilot's own body.
    this.elevator = THREE.MathUtils.clamp(
      this.elevator + keys.axis(['ArrowUp'], ['ArrowDown']) * dt * 1.6,
      -1,
      1,
    )
    if (keys.tapped('KeyC') && this.elevator !== 0) {
      this.elevator = 0
      this.say('Elevator lever centred.')
    }
    this.warp = approach(this.warp, keys.axis(['ArrowLeft'], ['ArrowRight']), dt, 2.2, 3)

    if (this.phase === 'wrecked') {
      this.burn(dt)
      return
    }

    if (this.phase === 'ready') {
      if (keys.tapped('Space')) {
        if (this.power > 0.5) {
          this.phase = 'rail'
          this.say('Wire slipped. Running the rail.')
        } else {
          this.say('Not enough engine to leave the rail — open it up first.')
        }
      }
      this.settle(dt)
      this.blow(dt)
      return
    }
    if (this.phase === 'down') {
      this.settle(dt)
      this.blow(dt)
      return
    }

    // --- Airflow -----------------------------------------------------------
    const { V, qbar, alpha, beta } = this.air
    const clearance = Math.max(0.02, this.altitude)

    // Ground effect. Sixteen times the wing's height over the span, squared:
    // the classical correction, and the reason the machine could fly at all.
    // A metre up the induced drag is cut by an eighth; three metres up there
    // is nothing left of it, which is also where the machine stops flying.
    const hb = (16 * (clearance + WING_HEIGHT)) / SPAN
    const groundEffect = (hb * hb) / (1 + hb * hb)
    const relief = 1 - groundEffect
    this.cushion = THREE.MathUtils.clamp(relief / GE_SAND, 0, 1)

    const cl =
      liftCoefficient(alpha, CL_SLOPE, ALPHA_ZERO, CL_MAX) * (1 + 0.12 * relief) +
      CL_ELEVATOR * this.elevator
    this.stall = stallFraction(alpha, CL_SLOPE, ALPHA_ZERO, CL_MAX)
    const cd = CD0 + K_INDUCED * cl * cl * groundEffect

    const lift = qbar * AREA * cl
    const drag = qbar * AREA * cd
    const thrust = this.thrustAt(V)
    this.loadFactor = lift / (MASS * G)

    // --- Rail run ----------------------------------------------------------
    if (this.phase === 'rail') {
      const along = this.velocity.z
      const friction = RAIL_FRICTION * Math.max(0, MASS * G - lift)
      const accel = (thrust - drag - friction) / MASS
      this.velocity.set(0, 0, Math.max(0, along + accel * dt))
      this.position.z += this.velocity.z * dt
      this.position.y = RAIL_TOP + FLYER_SKID
      this.truck.z = this.position.z
      this.truck.speed = this.velocity.z

      // Four boards laid end to end: the truck finds every joint.
      if (this.position.z - RAIL.start > RAIL.board * this.nextBoard) {
        this.nextBoard++
        this.jolt = Math.min(1, 0.25 + this.velocity.z * 0.25)
      }
      this.blow(dt)

      if (lift > MASS * G) {
        this.phase = 'flying'
        this.liftOff.copy(this.position)
        this.airtime = 0
        this.truck.on = true
        this.say(`Off the rail at ${(V * MPH).toFixed(0)} mph of air.`)
      } else if (this.position.z > RAIL_END) {
        this.truck.on = false
        this.end(false, 'Ran off the end of the rail', [
          'The wing never took the weight before the rail ran out.',
          'Let the engine come right up before you slip the wire, and give the wind time to pick up.',
        ])
      }
      return
    }

    // --- Flying ------------------------------------------------------------
    this.airtime += dt
    this.runTruck(dt)

    this.force.set(0, -MASS * G, 0)
    this.force.addScaledVector(this.liftDir, lift)
    this.force.addScaledVector(this.dragDir, drag)
    this.force.addScaledVector(this.forward, thrust)
    // A little side force, so sideslip is felt rather than free.
    this.force.addScaledVector(this.right, -qbar * AREA * 0.25 * beta)

    this.velocity.addScaledVector(this.force, dt / MASS)
    this.position.addScaledVector(this.velocity, dt)
    this.climb = this.velocity.y

    // --- Moments -----------------------------------------------------------
    const vRef = Math.max(V, 4)
    const cm =
      CM0 +
      CM_ALPHA * alpha +
      CM_ELEVATOR * this.elevator +
      (CM_RATE * this.pitchRate * CHORD) / (2 * vRef)
    const clRoll =
      CL_WARP * this.warp +
      CL_BETA * beta +
      (CL_DAMP * this.rollRate * SPAN) / (2 * vRef)
    const cn =
      (this.linked ? CN_RUDDER * this.warp : 0) +
      CN_ADVERSE * this.warp +
      CN_BETA * beta +
      (CN_DAMP * this.yawRate * SPAN) / (2 * vRef)

    // Elevator is a surface, not a wish: it does nothing without airflow.
    this.pitchRate += ((qbar * AREA * CHORD * cm) / IYY) * dt
    this.rollRate += ((qbar * AREA * SPAN * clRoll) / IXX) * dt
    this.yawRate += ((qbar * AREA * SPAN * cn) / IZZ) * dt
    rotateBody(this.quaternion, this.pitchRate, this.yawRate, this.rollRate, dt)

    this.blow(dt)

    // --- Anything solid ----------------------------------------------------
    if (this.strike()) return

    // --- Ground ------------------------------------------------------------
    // A banked machine puts a wingtip down long before the skids touch.
    const tip = Math.abs(Math.sin(this.att.bank)) * HALF
    if (this.position.y - terrain - FLYER_SKID - tip <= 0) {
      this.touchdown(terrain, tip)
      return
    }

    this.progressLog()
  }

  // --- The world ------------------------------------------------------------

  /** Test the airframe against everything standing on the sand. */
  private strike() {
    for (const probe of PROBES) {
      this.probe.copy(probe.p).applyQuaternion(this.quaternion).add(this.position)
      const hit = this.obstacles.hit(this.probe, probe.r)
      if (!hit) continue
      this.obstacles.damage(hit.obstacle, 1)
      this.hitSomething(hit.obstacle, probe.what, hit.point)
      return true
    }
    return false
  }

  private hitSomething(o: Obstacle, what: string, where: THREE.Vector3) {
    const speed = this.velocity.length()
    const name = OBSTACLE_NAMES[o.kind] ?? 'something on the sand'
    const lines = [
      `${cap(what)} took ${name} at ${(speed * MPH).toFixed(0)} mph over the ground.`,
      'Three hundred and thirty-eight kilogrammes of spruce and muslin does not push anything out of the way. The machine folded where it struck.',
      this.best > 1
        ? `You had ${this.best.toFixed(1)} m in hand before it. Nothing out there moves: it is the machine that has to go round.`
        : 'It ended before the flight properly began.',
    ]
    this.breakUp(where, o.solidity > 0.8)
    this.end(false, `Flew into ${name}`, lines)
  }

  /** The truck runs on down the rail, and falls off the end of it. */
  private runTruck(dt: number) {
    if (!this.truck.on) return
    this.truck.speed = Math.max(0, this.truck.speed - 1.6 * dt)
    this.truck.z += this.truck.speed * dt
    if (this.truck.z > RAIL_END) {
      this.truck.on = false
      this.fx.impact(
        this.scratch.set(0, killDevil.height(0, RAIL_END) + 0.1, RAIL_END),
        0.8,
        '#cfc0a0',
      )
    }
  }

  // --- Sand, smoke and fire --------------------------------------------------

  /**
   * What the machine throws up. Sand off the skids and the truck on the rail,
   * and a haze of it blown out from under the wing by the propellers whenever
   * the engine is running close to the ground. It is the only thing at Kill
   * Devil Hills that tells you how fast the air is moving.
   */
  private blow(dt: number) {
    if (this.power < 0.15) return
    this.sandDue -= dt
    if (this.sandDue > 0) return
    this.sandDue += 0.045

    const terrain = killDevil.height(this.position.x, this.position.z)
    const clearance = this.position.y - terrain - FLYER_SKID
    if (clearance > 3.2) return

    const near = 1 - Math.min(1, clearance / 3.2)
    const a = Math.random() * Math.PI * 2
    const r = 1.5 + Math.random() * 5
    const x = this.position.x + Math.cos(a) * r
    const z = this.position.z + Math.sin(a) * r - 2.2

    // Sand does not hang about in a ten-metre wind: it streams away south.
    this.scratch.set(x, killDevil.height(x, z) + 0.05 + Math.random() * 0.3, z)
    this.fx.emit('dust', this.scratch, {
      vel: new THREE.Vector3(
        this.wind.x + (Math.random() - 0.5) * 2,
        0.5 + Math.random() * 1.6 * near,
        this.wind.z * (0.55 + Math.random() * 0.35),
      ),
      life: 0.7 + Math.random() * 0.9,
      size: 0.35 + Math.random() * 0.7 * near,
      grow: 2.8,
      colour: '#d6c7a6',
      fade: '#cdc4b2',
      drag: 0.9,
      gravity: -0.8,
    })
  }

  /**
   * The wreck goes on coming apart for a moment after it stops — and if a tip
   * dug in it does not stop at all to begin with, but pivots about the buried
   * wingtip and goes over end for end down the sand, throwing a plume of it
   * every time a corner of the machine hits.
   */
  private burn(dt: number) {
    this.wreck.age += dt
    if (this.breakUpLeft <= 0) return
    this.breakUpLeft -= dt

    const slide = this.wreckDrift.length()
    if (slide > 0.15) {
      this.wreck.pos.addScaledVector(this.wreckDrift, dt)
      this.wreck.pos.y = killDevil.height(this.wreck.pos.x, this.wreck.pos.z)
      this.wreck.yaw += this.tumbleSpin * dt
      this.wreckDrift.multiplyScalar(Math.max(0, 1 - 2.4 * dt))
      this.tumbleDue -= dt
      if (this.tumbleDue <= 0) {
        this.tumbleDue = 0.3
        this.fx.impact(this.wreck.pos, 1 + slide * 0.09, '#d4c5a4')
        this.scratch.copy(this.wreckDrift).multiplyScalar(0.5)
        this.scratch.y = 3 + Math.random() * 2
        this.fx.emit('debris', this.wreck.pos, {
          vel: this.scratch.clone(),
          life: 7 + Math.random() * 5,
          size: 0.2 + Math.random() * 0.4,
          grow: 1,
          colour: '#9c7a4e',
          fade: '#7b6040',
          drag: 0.3,
          gravity: -9.81,
          spin: 13,
          bounce: true,
        })
      }
      return
    }

    if (Math.random() > dt * 8) return
    const a = Math.random() * Math.PI * 2
    const r = Math.random() * 3
    this.scratch.set(
      this.wreck.pos.x + Math.cos(a) * r,
      this.wreck.pos.y + 0.2,
      this.wreck.pos.z + Math.sin(a) * r,
    )
    this.fx.impact(this.scratch, 0.9, '#d4c5a4')
  }

  /**
   * The machine comes apart. This is not a fireball: the 1903 machine carries
   * a couple of gallons of petrol in a can on the strut and nothing else that
   * will burn in a hurry. What it does is fold — spruce snapping, muslin
   * tearing off the ribs, a great deal of sand — and then, if the can has
   * gone, a small fire in the middle of it.
   */
  private breakUp(where: THREE.Vector3, petrol: boolean, tumble = false) {
    this.showModel = false
    this.phase = 'wrecked'
    this.wreck.active = true
    this.wreck.pos.copy(where)
    this.wreck.pos.y = killDevil.height(where.x, where.z)
    this.wreck.yaw = this.att.heading
    this.wreck.age = 0
    this.breakUpLeft = tumble ? 2.6 : 1.4
    this.wreckDrift.copy(this.velocity).multiplyScalar(tumble ? 0.7 : 0.12)
    this.wreckDrift.y = 0
    this.tumbleSpin = (this.att.bank > 0 ? -1 : 1) * (tumble ? 2.4 : 0.4)
    this.tumbleDue = 0

    const v = new THREE.Vector3()
    const drift = this.velocity.clone().multiplyScalar(0.4)

    // Sand, first and most of it.
    this.fx.impact(where, 2.6, '#d8c9a8')
    this.fx.impact(this.wreck.pos, 2.2, '#cfbf9c')

    // Spruce: long members, tumbling and bouncing down the sand.
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2
      v.set(Math.cos(a) * 3.5 * Math.random(), 1.5 + Math.random() * 4.5, Math.sin(a) * 3.5 * Math.random())
        .add(drift)
      this.fx.emit('debris', where, {
        vel: v.clone(),
        life: 12 + Math.random() * 20,
        size: 0.18 + Math.random() * 0.4,
        grow: 1,
        colour: '#9c7a4e',
        fade: '#7b6040',
        drag: 0.3,
        gravity: -9.81,
        spin: 11,
        bounce: true,
      })
    }

    // Muslin: whole bays of it, coming off the ribs and going downwind.
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2
      v.set(Math.cos(a) * 2, 1.2 + Math.random() * 3, Math.sin(a) * 2)
        .add(drift)
        .addScaledVector(this.wind, 0.35)
      this.fx.emit('debris', where, {
        vel: v.clone(),
        life: 6 + Math.random() * 6,
        size: 0.5 + Math.random() * 0.7,
        grow: 1,
        colour: '#c9bda4',
        fade: '#b3a88f',
        drag: 1.6,
        gravity: -3.2,
        spin: 6,
        bounce: true,
      })
    }

    if (petrol) {
      this.fx.ignite(this.wreck.pos, 0.85, 26)
      for (let i = 0; i < 6; i++) {
        v.set((Math.random() - 0.5) * 3, 1 + Math.random() * 3, (Math.random() - 0.5) * 3)
        this.fx.emit('fire', this.wreck.pos, {
          vel: v.clone(),
          life: 0.5 + Math.random() * 0.5,
          size: 0.5 + Math.random() * 0.6,
          grow: 2,
          colour: '#ffbf63',
          fade: '#b8380f',
          drag: 2,
          gravity: -1,
        })
      }
      this.say('The fuel can has gone. There is a fire in the wreck.')
    }
    this.velocity.set(0, 0, 0)
    this.power = 0
  }

  // --- Ending it -------------------------------------------------------------

  /** Park the machine on the sand, with the engine still turning if it is. */
  private settle(dt: number) {
    const terrain = killDevil.height(this.position.x, this.position.z)
    const rest = this.phase === 'down' ? terrain + FLYER_SKID : RAIL_TOP + FLYER_SKID
    this.position.y += (rest - this.position.y) * (1 - Math.exp(-6 * dt))
  }

  private touchdown(terrain: number, tip: number) {
    const sink = -this.velocity.y
    const bank = Math.abs(this.att.bank)
    const V = this.air.V
    const distance = this.flown()
    this.best = Math.max(this.best, distance)
    const where = this.scratch.copy(this.position)
    where.y = terrain

    // A wingtip in the sand at flying speed is not a landing. This is how the
    // day ended: a gust took flight four's machine over on the ground and the
    // front elevator was broken past repair.
    if (bank > TIP_BANK && tip > 0.35 && V > 8) {
      const lines = [
        `${distance.toFixed(1)} m over the ground before the ${this.att.bank > 0 ? 'starboard' : 'port'} tip went in.`,
        'The tip caught, the machine pivoted about it and cartwheeled. No fire — the fuel can was thrown clear — but the airframe is finished. This is how the day itself ended: a gust took the machine over on the sand after flight four and it never flew again.',
        'Down here, seven degrees of bank is enough to put a tip in the sand before the skids are anywhere near it. Keep the bank gauge near zero.',
      ]
      this.breakUp(where, false, true)
      this.end(false, 'Cartwheeled', lines)
      return
    }

    if (sink > SKIM_SINK) {
      const lines = [
        `${distance.toFixed(1)} m over the ground, then ${sink.toFixed(1)} m/s straight into the sand.`,
        'The skids dug, the forward outriggers folded back into the wing and the machine went over on its nose.',
        'Anything past two metres a second of sink is a crash, not a landing. The rate-of-climb gauge sees it coming; catch it with a touch of back lever while you still have the speed.',
      ]
      this.breakUp(where, sink > 3.4)
      this.end(false, 'Dug in', lines)
      return
    }

    // A light touch at flying speed is a skim, not the end of the flight —
    // the skids kiss the sand and the machine goes on. It costs speed, and
    // the third one is where the sand wins.
    if (V > 9.5 && this.skims < 2 && bank < TIP_BANK) {
      this.skims++
      this.position.y = terrain + FLYER_SKID + tip + 0.05
      this.velocity.y = 0.55
      this.velocity.multiplyScalar(0.94)
      this.pitchRate *= 0.5
      this.fx.impact(where, 0.9, '#d8c9a8')
      this.say(`Skids kissed the sand — ${2 - this.skims} more and she stays there.`)
      return
    }

    this.position.y = terrain + FLYER_SKID + tip
    this.velocity.set(0, 0, 0)
    this.phase = 'down'

    const beaten = RECORD.filter((r) => distance > r.m)
    const lines = [
      `${distance.toFixed(1)} m over the ground in ${this.airtime.toFixed(1)} seconds.`,
      beaten.length
        ? `That beats ${beaten[beaten.length - 1].who} — ${beaten[beaten.length - 1].m} m.`
        : `Flight one covered 36.5 m. You are ${(36.5 - distance).toFixed(1)} m short.`,
      distance < 36.5
        ? 'Almost always the same thing: the nose came up, the machine climbed out of the cushion, the drag doubled and it sank. Hold her a yard up and no higher.'
        : 'Down on the skids with the machine in one piece, which is more than flight four managed.',
    ]
    this.end(distance > 36.5, distance > 36.5 ? 'Down on the sand' : 'Down, and short', lines)
  }

  private flown() {
    return Math.hypot(
      this.position.x - this.liftOff.x,
      this.position.z - this.liftOff.z,
    )
  }

  private progressLog() {
    const distance = this.flown()
    this.best = Math.max(this.best, distance)
    for (let i = RECORD.length - 1; i >= 0; i--) {
      if (distance > RECORD[i].m && this.milestone < i) {
        this.milestone = i
        this.say(`${RECORD[i].m} m — ${RECORD[i].who} equalled.`)
        break
      }
    }
  }

  private end(good: boolean, title: string, lines: string[]) {
    if (this.finished) return
    this.verdict = { good, title, lines }
    this.finished = true
    if (this.phase !== 'wrecked') this.phase = 'down'
    this.power = 0
  }

  controls() {
    this.ctl.engine = this.power * 100
    this.ctl.cradle = this.warp * 100
    // The museum slider reads positive as canard leading edge down; the pilot
    // pulls for nose up, so the sign flips here.
    this.ctl.elevator = -this.elevator * 20
    this.ctl.airborne = this.phase === 'flying' ? 1 : 0
    this.ctl.linkage = this.linked ? 1 : 0
    // Rounded to whole metres per second by the canvas, so the reconstruction
    // only re-renders when the air over the wires has meaningfully changed.
    this.ctl.airspeed = this.airspeed
    return this.ctl
  }

  camera(view: ViewName, eye: THREE.Vector3, aim: THREE.Vector3) {
    bodyAxes(this.quaternion, this.forward, this.up, this.right)

    if (view === 'tower') {
      // Where John Daniels stood with the camera, and squeezed the bulb.
      eye.set(-11, killDevil.height(-11, 2) + 1.7, 2)
      aim.copy(this.wreck.active ? this.wreck.pos : this.position)
      return 34
    }

    if (view === 'inside') {
      // Prone on the lower wing, left of centre, next to the cradle.
      eye.copy(this.position)
        .addScaledVector(this.right, -0.3)
        .addScaledVector(this.up, 0.62)
        .addScaledVector(this.forward, 0.3)
      aim.copy(eye).addScaledVector(this.forward, 12).addScaledVector(this.up, -1.6)
      this.shake(eye, 1)
      return 62
    }

    eye.copy(this.position)
      .addScaledVector(this.forward, -13)
      .addScaledVector(this.up, 4)
    aim.copy(this.position).addScaledVector(this.forward, 4)
    this.shake(eye, 0.45)
    return 42
  }

  /**
   * The picture shakes because the machine does. Thirty miles an hour of air
   * through a hundred wires, an unbalanced four-cylinder engine bolted to the
   * spar, and on the rail a wheeled truck crossing the joint between one
   * two-by-four and the next.
   */
  private shake(eye: THREE.Vector3, gain: number) {
    const t = this.clock
    const air = Math.min(1, this.airspeed / 18)
    const amount =
      gain * (0.014 * air * air + 0.02 * this.jolt + 0.03 * this.power * (this.phase === 'rail' ? 1 : 0.35))
    if (amount < 1e-4) return
    eye.x += Math.sin(t * 41.3) * amount
    eye.y += Math.sin(t * 57.7 + 1.3) * amount * 1.4
    eye.z += Math.sin(t * 33.1 + 2.1) * amount * 0.6
  }

  readout(): Readout {
    const terrain = killDevil.height(this.position.x, this.position.z)
    const height = Math.max(0, this.position.y - terrain - FLYER_SKID)
    const ground = Math.hypot(this.velocity.x, this.velocity.z)
    const distance = this.phase === 'ready' || this.phase === 'rail' ? 0 : this.best
    const flying = this.phase === 'flying'

    return {
      gauges: [
        { label: 'Engine', value: (this.power * 100).toFixed(0), unit: '%', bar: this.power },
        {
          label: 'Airspeed',
          value: (this.air.V * MPH).toFixed(1),
          unit: 'mph',
          bar: THREE.MathUtils.clamp(this.air.V / 20, 0, 1),
          warn: flying && this.air.V < 10.5,
        },
        { label: 'Over ground', value: (ground * MPH).toFixed(1), unit: 'mph' },
        {
          label: 'Height',
          value: height.toFixed(2),
          unit: 'm',
          bar: THREE.MathUtils.clamp(height / 2.5, 0, 1),
          warn: flying && height > 1.7,
        },
        {
          label: 'Rate of climb',
          value: (flying ? this.climb : 0).toFixed(1),
          unit: 'm/s',
          warn: flying && this.climb < -1.2,
        },
        {
          label: 'Incidence',
          value: ((this.air.alpha * 180) / Math.PI).toFixed(1),
          unit: '°',
          bar: this.stall,
          warn: this.stall > 0.2,
        },
        {
          label: 'Cushion left',
          value: (this.cushion * 100).toFixed(0),
          unit: '%',
          bar: this.cushion / 0.55,
          warn: flying && this.cushion < 0.1,
        },
        {
          label: 'Lift',
          value: (this.loadFactor || 0).toFixed(2),
          unit: '× weight',
          warn: flying && this.loadFactor < 0.85,
        },
        {
          label: 'Bank',
          value: ((this.att.bank * 180) / Math.PI).toFixed(0),
          unit: '°',
          warn: Math.abs(this.att.bank) > TIP_BANK,
        },
        { label: 'Distance', value: distance.toFixed(1), unit: 'm' },
        { label: 'Airborne', value: this.airtime.toFixed(1), unit: 's' },
        { label: 'Rudder', value: this.linked ? 'Coupled' : 'Unlinked', warn: !this.linked },
      ],
      status: this.status(height),
      task: this.task(distance),
      progress: THREE.MathUtils.clamp(this.best / 260, 0, 1),
      log: this.log,
      verdict: this.verdict,
    }
  }

  /**
   * What to do next, in one line. The machine is unfamiliar and the controls
   * do nothing a visitor expects, so the panel is never allowed to say only
   * what is happening: it has to say what the pilot should do about it.
   */
  private status(height: number) {
    if (this.phase === 'wrecked') return 'Wrecked. R puts a fresh machine on the rail.'
    if (this.phase === 'ready') {
      return this.power < 0.5
        ? `Engine at ${(this.power * 100).toFixed(0)}%. Hold W until it is running, then Space.`
        : 'Engine running. Space slips the restraining wire — it does not add power.'
    }
    if (this.phase === 'rail') {
      const left = RAIL_END - this.position.z
      return `Running the rail, ${left.toFixed(0)} m of it left. She will lift herself off; hands still.`
    }
    if (this.phase === 'down') return 'Down. R to put a fresh machine on the rail.'
    if (this.stall > 0.25) return 'Wing stalled. Lever forward — ↑ — and let the nose fall.'
    if (this.climb < -1.2) return 'Sinking fast. Nose down for speed before the skids touch.'
    if (height > 1.8) return 'Out of the cushion. Get the nose down — up here nothing will hold her.'
    if (height > 1.2) return 'High. The cushion is thinning; ease the lever forward.'
    if (Math.abs(this.att.bank) > TIP_BANK) {
      return `${this.att.bank > 0 ? 'Starboard' : 'Port'} wing down. Cradle the other way before the tip digs in.`
    }
    if (height < 0.4) return 'Very low. A touch of back lever — ↓ — before the skids catch.'
    return 'In the cushion, a yard up. This is where she flies. Hold it.'
  }

  private task(distance: number) {
    if (this.phase === 'ready') return 'Run the engine up, then slip the wire'
    if (this.phase === 'rail') return 'Let her come off the rail by herself'
    if (this.phase === 'flying' && this.airtime < 2.5) {
      return 'Off the rail — hold her a yard up, no higher'
    }
    return distance < 36.5
      ? 'Beat flight one: 36.5 metres'
      : distance < 260
        ? 'Beat flight four: 260 metres, 59 seconds'
        : 'Past flight four. See how far she will go'
  }
}

const OBSTACLE_NAMES: Record<string, string> = {
  building: 'the camp building',
  derrick: 'the derrick',
  anemometer: 'the anemometer post',
  marker: 'a distance marker',
  driftwood: 'a driftwood log',
  pine: 'the scrub pine',
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Move a springy control toward its input: quick to apply, slower to centre. */
function approach(value: number, input: number, dt: number, rate: number, centre: number) {
  if (input === 0) {
    const back = centre * dt
    return Math.abs(value) <= back ? 0 : value - Math.sign(value) * back
  }
  return THREE.MathUtils.clamp(value + input * rate * dt, -1, 1)
}

const envelope: Dimension[] = [
  { label: 'Gross weight', value: '338 kg with pilot', source: PAPERS },
  { label: 'Wing area', value: '47.4 m²', source: NASM },
  { label: 'Span · chord', value: '12.29 m · 1.98 m', source: NASM },
  { label: 'Thrust', value: '575 N static, ≈460 N at flying speed', source: JAKAB },
  { label: 'Wind that day', value: '20–27 mph from the north', source: PAPERS },
  { label: 'Launch rail', value: `${RAIL_LENGTH.toFixed(1)} m · four 15 ft two-by-fours`, source: PAPERS },
  { label: 'Lift coefficient', value: '0.55 at 32 mph, CL max 1.35', source: INFER },
  { label: 'Zero-lift drag', value: 'CD₀ 0.035, induced factor 0.166', source: INFER },
  { label: 'Ground effect', value: 'Ceiling ≈1.6 m: above it, no speed will hold her up', source: INFER },
  { label: 'Pitch stability', value: 'Cmα +0.25 per radian — divergent', source: INFER },
]

export const flyerSim: SimDef = {
  slug: 'wright-flyer',
  title: 'Flight One',
  place: 'Kill Devil Hills, North Carolina · 17 December 1903, 10:35 a.m.',
  briefing: [
    'You are lying prone on the lower wing with your hips in the cradle. The rail runs eighteen metres north into a ten-metre-per-second wind, and the engine has been warming for several minutes. W runs it up; Space slips the restraining wire. It is worth knowing that Space does not add power — the engine has no throttle worth the name, and once it is running it stays running.',
    'Two things will surprise you. The machine is unstable in pitch: the elevator ahead of the wing makes it diverge rather than settle, so an upset doubles in about a second and you will be working the lever constantly. And it will only stay up close to the sand. Within a couple of metres of the ground the induced drag falls away sharply, and that cushion is the difference between flying and sinking on twelve horsepower. The panel shows you how much of it you have left. When it runs out you are going down, whatever you do with the lever.',
    'So: hold her a yard up. Not ten feet — a yard. The hip cradle warps the wings and swings the rudder together; press L to disconnect the linkage and you have the 1902 machine, which would not turn without trying to spin. And watch the wings: at a yard up, seven degrees of bank puts a tip in the sand, and that is a cartwheel, not a landing.',
  ],
  task: 'Leave the rail and fly further than 36.5 metres',
  views: [
    { name: 'chase', label: 'From astern' },
    { name: 'inside', label: 'Prone on the wing' },
    { name: 'tower', label: 'Daniels’ camera' },
  ],
  bindings: [
    { keys: 'W / S', action: 'Run the engine up · shut it down' },
    { keys: 'Space', action: 'Slip the restraining wire (no extra power)' },
    { keys: '↓ / ↑', action: 'Elevator lever: ↓ nose up, ↑ nose down. It stays where you put it' },
    { keys: 'C', action: 'Centre the elevator lever' },
    { keys: '← / →', action: 'Hip cradle: warp and rudder together' },
    { keys: 'L', action: 'Disconnect the rudder linkage' },
    { keys: 'P · R', action: 'Pause · start again' },
  ],
  envelope,
  create: () => new FlyerSim(),
}

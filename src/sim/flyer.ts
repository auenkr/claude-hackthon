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
import { killDevil } from './terrain'
import { FLYER_SKID } from '../three/stance'

/**
 * Kill Devil Hills, 17 December 1903.
 *
 * Every coefficient below is either a published figure or an inference drawn
 * from one, and they are consistent with each other: at 338 kg on 47.4 m² the
 * wing needs CL ≈ 0.95 to fly at the speed the brothers recorded, the twelve
 * horsepower engine turns that into about 400 N of thrust, and the resulting
 * lift-to-drag ratio is only good enough to sustain flight *close to the
 * sand*, where the ground halves the induced drag. Which is exactly how the
 * machine was flown.
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

// Accounts of the 1903 propellers' thrust run from about 90 to 132 lbf.
// This sits between them, and it is the single number the machine's ability
// to sustain flight is most sensitive to.
const THRUST = 470 // N static, both propellers
const CL_SLOPE = 4.2 // per radian
const ALPHA_ZERO = -0.083 // radians: the deep camber lifts at zero incidence
const CL_MAX = 1.35
const CD0 = 0.045
const K_INDUCED = 0.166 // 1/(π·AR·e) with AR 3.19 and biplane interference

// Pitch: unstable, as a canard machine with the elevator ahead of the wing is.
/**
 * Trimmed for about four degrees of incidence, which is the attitude that
 * balances 338 kg on this wing at 30 mph of air — the speed the brothers
 * recorded. It leaves the rail at eight degrees and settles from there.
 */
const CM0 = -0.017
const CM_ALPHA = 0.25 // positive — it diverges, and the pilot must answer
/** Per radian of surface, and the pilot's lever is signed nose-up positive. */
const CM_ELEVATOR = 0.4
const CM_RATE = -4

const CL_WARP = 0.07 // roll from full hip cradle
const CL_DAMP = -0.45
const CL_BETA = 0.02 // anhedral: sideslip rolls it further, not back

const CN_RUDDER = 0.06 // the linked rudder, into the turn
const CN_ADVERSE = -0.028 // the warped wing's own drag, out of the turn
const CN_BETA = 0.09 // the rudder as a weathercock
const CN_DAMP = -0.06

const WIND = 10 // m/s northerly. 'Wind 27 miles' in the log, easing through the day
const RAIL_LENGTH = 18.3 // 60 ft of two-by-four
const RAIL_INCIDENCE = 8 * (Math.PI / 180)
const RAIL_HEIGHT = 0.06

/** The four flights of the day, in metres over the ground. */
export const RECORD = [
  { m: 36.5, s: 12, who: 'Orville, flight one' },
  { m: 53, s: 12, who: 'Wilbur, flight two' },
  { m: 61, s: 15, who: 'Orville, flight three' },
  { m: 260, s: 59, who: 'Wilbur, flight four' },
]

const MPH = 2.23694

type Phase = 'ready' | 'rail' | 'flying' | 'down'

export class FlyerSim implements Sim {
  readonly position = new THREE.Vector3()
  readonly quaternion = new THREE.Quaternion()

  private velocity = new THREE.Vector3()
  private wind = new THREE.Vector3(0, 0, -WIND)
  private phase: Phase = 'ready'

  // Controls, as the pilot's hands leave them.
  private power = 0
  private warp = 0
  private elevator = 0 // +1 = full nose up
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

  private liftOff = new THREE.Vector3()
  private airtime = 0
  private best = 0
  private milestone = -1
  private log: string[] = []
  private verdict: Readout['verdict']
  private ctl: Controls = {}
  private stall = 0

  finished = false

  constructor() {
    this.reset()
  }

  reset() {
    this.position.set(0, killDevil.height(0, 0) + RAIL_HEIGHT + FLYER_SKID, 0)
    setAttitude(this.quaternion, RAIL_INCIDENCE, 0, 0)
    this.velocity.set(0, 0, 0)
    this.phase = 'ready'
    this.power = 0
    this.warp = 0
    this.elevator = 0
    this.linked = true
    this.pitchRate = this.rollRate = this.yawRate = 0
    this.airtime = 0
    this.best = 0
    this.milestone = -1
    this.stall = 0
    this.liftOff.set(0, 0, 0)
    this.verdict = undefined
    this.finished = false
    this.log = ['Machine on the rail, nose into a ten-metre wind.']
  }

  private say(line: string) {
    this.log.push(line)
    if (this.log.length > 6) this.log.shift()
  }

  step(dt: number, keys: Keyboard) {
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

    // Elevator and cradle spring back when you let go of them.
    const elevInput = keys.axis(['ArrowUp'], ['ArrowDown'])
    const warpInput = keys.axis(['ArrowLeft'], ['ArrowRight'])
    this.elevator = approach(this.elevator, elevInput, dt, 2.5, 3.5)
    this.warp = approach(this.warp, warpInput, dt, 2.2, 3)

    if (this.phase === 'ready') {
      if (keys.tapped('Space')) {
        if (this.power > 0.5) {
          this.phase = 'rail'
          this.say('Wire slipped. Running the rail.')
        } else {
          this.say('Not enough engine to leave the rail — open it up first.')
        }
      }
      this.ground(dt)
      return
    }
    if (this.phase === 'down') {
      this.ground(dt)
      return
    }

    // --- Airflow -----------------------------------------------------------
    bodyAxes(this.quaternion, this.forward, this.up, this.right)
    airflow(this.velocity, this.wind, this.quaternion, this.air, this.liftDir, this.dragDir)
    attitude(this.quaternion, this.att)

    const { V, qbar, alpha, beta } = this.air
    const terrain = killDevil.height(this.position.x, this.position.z)
    const height = Math.max(0.05, this.position.y - terrain)

    // Ground effect. Sixteen times the height over the span, squared: the
    // classical correction, and the reason the machine could fly at all.
    // Near the sand the induced drag is halved and the wing lifts a little
    // harder; a span's height up, both effects are gone.
    const hb = (16 * height) / SPAN
    const groundEffect = (hb * hb) / (1 + hb * hb)

    const cl =
      liftCoefficient(alpha, CL_SLOPE, ALPHA_ZERO, CL_MAX) *
      (1 + 0.12 * (1 - groundEffect))
    this.stall = stallFraction(alpha, CL_SLOPE, ALPHA_ZERO, CL_MAX)
    const cd = CD0 + K_INDUCED * cl * cl * groundEffect

    const lift = qbar * AREA * cl
    const drag = qbar * AREA * cd
    const thrust = THRUST * this.power * (1 - 0.35 * Math.max(0, V - 14) / 14)

    // --- Rail run ----------------------------------------------------------
    if (this.phase === 'rail') {
      const along = this.velocity.z
      const friction = 0.04 * MASS * G
      const accel = (thrust - drag - friction) / MASS
      this.velocity.set(0, 0, Math.max(0, along + accel * dt))
      this.position.z += this.velocity.z * dt
      this.position.y = terrain + RAIL_HEIGHT + FLYER_SKID

      if (lift > MASS * G) {
        this.phase = 'flying'
        this.liftOff.copy(this.position)
        this.airtime = 0
        this.say(`Off the rail at ${(V * MPH).toFixed(0)} mph of air.`)
      } else if (this.position.z > RAIL_LENGTH) {
        this.end(false, 'Ran off the end of the rail', [
          'The wing never took the weight. More engine, or a stronger wind.',
        ])
      }
      return
    }

    // --- Flying ------------------------------------------------------------
    this.airtime += dt

    this.force.set(0, -MASS * G, 0)
    this.force.addScaledVector(this.liftDir, lift)
    this.force.addScaledVector(this.dragDir, drag)
    this.force.addScaledVector(this.forward, thrust)
    // A little side force, so sideslip is felt rather than free.
    this.force.addScaledVector(this.right, -qbar * AREA * 0.25 * beta)

    this.velocity.addScaledVector(this.force, dt / MASS)
    this.position.addScaledVector(this.velocity, dt)

    // --- Moments -----------------------------------------------------------
    const vRef = Math.max(V, 4)
    const cm =
      CM0 +
      CM_ALPHA * alpha +
      CM_ELEVATOR * this.elevator * 0.35 +
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

    // --- Ground ------------------------------------------------------------
    // A banked machine puts a wingtip down long before the skids touch.
    const tip = FLYER_SKID + Math.abs(Math.sin(this.att.bank)) * HALF
    if (this.position.y - terrain <= tip) {
      this.touchdown(terrain, tip)
      return
    }

    this.progressLog()
  }

  /** Park the machine on the sand, with the engine still turning if it is. */
  private ground(dt: number) {
    const terrain = killDevil.height(this.position.x, this.position.z)
    const rest = terrain + (this.phase === 'down' ? FLYER_SKID : RAIL_HEIGHT + FLYER_SKID)
    this.position.y += (rest - this.position.y) * (1 - Math.exp(-6 * dt))
  }

  private touchdown(terrain: number, tip: number) {
    const sink = -this.velocity.y
    const bank = Math.abs(this.att.bank) * (180 / Math.PI)
    const distance = Math.hypot(
      this.position.x - this.liftOff.x,
      this.position.z - this.liftOff.z,
    )
    this.best = Math.max(this.best, distance)
    this.position.y = terrain + tip
    this.velocity.set(0, 0, 0)
    this.phase = 'down'

    const beaten = RECORD.filter((r) => distance > r.m)
    const lines = [
      `${distance.toFixed(1)} m over the ground in ${this.airtime.toFixed(1)} seconds.`,
      beaten.length
        ? `That beats ${beaten[beaten.length - 1].who} — ${beaten[beaten.length - 1].m} m.`
        : `Flight one covered 36.5 m. You are ${(36.5 - distance).toFixed(1)} m short.`,
    ]

    if (sink > 2.2 || bank > 14) {
      lines.push(
        bank > 14
          ? 'A wingtip went in first. That is how flight four ended: the forward elevator was cracked, and the machine never flew again.'
          : 'Too much sink. The skids dug in and the elevator took the blow.',
      )
      this.end(false, 'Down hard', lines)
    } else {
      this.end(distance > 36.5, distance > 36.5 ? 'Down on the sand' : 'Down, and short', lines)
    }
  }

  private progressLog() {
    const distance = Math.hypot(
      this.position.x - this.liftOff.x,
      this.position.z - this.liftOff.z,
    )
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
    this.verdict = { good, title, lines }
    this.finished = true
    this.phase = 'down'
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
    return this.ctl
  }

  camera(view: ViewName, eye: THREE.Vector3, aim: THREE.Vector3) {
    bodyAxes(this.quaternion, this.forward, this.up, this.right)
    if (view === 'inside') {
      // Prone on the lower wing, left of centre, next to the cradle.
      eye.copy(this.position)
        .addScaledVector(this.right, -0.3)
        .addScaledVector(this.up, 0.62)
        .addScaledVector(this.forward, 0.3)
      aim.copy(eye).addScaledVector(this.forward, 12).addScaledVector(this.up, -1.6)
      return 62
    }
    if (view === 'tower') {
      // Where John Daniels stood with the camera, and squeezed the bulb.
      eye.set(-11, killDevil.height(-11, 2) + 1.7, 2)
      aim.copy(this.position)
      return 34
    }
    eye.copy(this.position)
      .addScaledVector(this.forward, -13)
      .addScaledVector(this.up, 4)
    aim.copy(this.position).addScaledVector(this.forward, 4)
    return 42
  }

  readout(): Readout {
    const terrain = killDevil.height(this.position.x, this.position.z)
    const height = Math.max(0, this.position.y - terrain - FLYER_SKID)
    const ground = Math.hypot(this.velocity.x, this.velocity.z)
    const distance = this.phase === 'ready' || this.phase === 'rail' ? 0 : this.best

    const status =
      this.phase === 'ready'
        ? 'On the rail. Space slips the restraining wire.'
        : this.phase === 'rail'
          ? 'Running the rail.'
          : this.phase === 'down'
            ? 'Down.'
            : this.stall > 0.25
              ? 'Wing stalled — ease the nose down.'
              : height < 1.2
                ? 'In ground effect, where the machine will actually fly.'
                : 'Climbing out of ground effect: drag is rising.'

    return {
      gauges: [
        { label: 'Engine', value: (this.power * 100).toFixed(0), unit: '%', bar: this.power },
        {
          label: 'Airspeed',
          value: (this.air.V * MPH).toFixed(1),
          unit: 'mph',
          warn: this.phase === 'flying' && this.air.V < 9.5,
        },
        { label: 'Over ground', value: (ground * MPH).toFixed(1), unit: 'mph' },
        { label: 'Height', value: height.toFixed(2), unit: 'm', warn: height > 6 },
        { label: 'Incidence', value: ((this.air.alpha * 180) / Math.PI).toFixed(1), unit: '°', warn: this.stall > 0.2 },
        { label: 'Bank', value: ((this.att.bank * 180) / Math.PI).toFixed(0), unit: '°', warn: Math.abs(this.att.bank) > 0.17 },
        { label: 'Distance', value: distance.toFixed(1), unit: 'm' },
        { label: 'Airborne', value: this.airtime.toFixed(1), unit: 's' },
        {
          label: 'Rudder',
          value: this.linked ? 'Coupled' : 'Unlinked',
          warn: !this.linked,
        },
      ],
      status,
      task:
        this.phase === 'ready'
          ? 'Run the engine up, then slip the wire'
          : distance < 36.5
            ? 'Beat flight one: 36.5 metres'
            : 'Beat flight four: 260 metres, 59 seconds',
      progress: THREE.MathUtils.clamp(this.best / 260, 0, 1),
      log: this.log,
      verdict: this.verdict,
    }
  }
}

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
  { label: 'Thrust', value: '470 N from both propellers', source: JAKAB },
  { label: 'Wind that day', value: '20–27 mph from the north', source: PAPERS },
  { label: 'Lift coefficient', value: '0.95 at 24 mph, CL max 1.35', source: INFER },
  { label: 'Zero-lift drag', value: 'CD₀ 0.045, induced factor 0.166', source: INFER },
  { label: 'Pitch stability', value: 'Cmα +0.25 per radian — divergent', source: INFER },
]

export const flyerSim: SimDef = {
  slug: 'wright-flyer',
  title: 'Flight One',
  place: 'Kill Devil Hills, North Carolina · 17 December 1903, 10:35 a.m.',
  briefing: [
    'You are lying prone on the lower wing with your hips in the cradle. The rail runs 18 metres north into a ten-metre-per-second wind, and the engine has been warming for several minutes.',
    'Two things will surprise you. The machine is unstable in pitch — the elevator ahead of the wing makes it diverge rather than settle, so you will be working the lever constantly. And it will only stay up close to the sand: within half a span of the ground the induced drag falls by half, which is the difference between flying and sinking on twelve horsepower.',
    'The hip cradle warps the wings and swings the rudder together. Press L to disconnect the linkage and you have the 1902 machine, which would not turn without trying to spin.',
  ],
  task: 'Leave the rail and fly further than 36.5 metres',
  views: [
    { name: 'chase', label: 'From astern' },
    { name: 'inside', label: 'Prone on the wing' },
    { name: 'tower', label: 'Daniels’ camera' },
  ],
  bindings: [
    { keys: 'W / S', action: 'Engine' },
    { keys: 'Space', action: 'Slip the restraining wire' },
    { keys: '↑ / ↓', action: 'Forward elevator — down is nose up' },
    { keys: '← / →', action: 'Hip cradle: warp and rudder together' },
    { keys: 'L', action: 'Disconnect the rudder linkage' },
    { keys: 'V · P · R', action: 'View · pause · start again' },
  ],
  envelope,
  create: () => new FlyerSim(),
}

/**
 * The Lotus 49 as a table of numbers.
 *
 * One file, imported by the reconstruction and by the simulation alike, so
 * the wheel the physics loads is the wheel the geometry draws, and the
 * upright the wing struts bolt to is the one the tyre smoke comes off.
 * Wheelbase and tracks are Team Lotus figures; the pick-up points are scaled
 * from the works drawings against the surviving chassis and marked derived.
 *
 * Model axes: +Z forward through the nose, +X to starboard, +Y up, metres.
 * The wheelbase is centred on the origin and the tyres sit on y = 0.
 */

export const DEG = Math.PI / 180

// --- Chassis ----------------------------------------------------------------
export const WHEELBASE = 2.36
export const FRONT_Z = WHEELBASE / 2
export const REAR_Z = -WHEELBASE / 2
/** 1.52 m front track, 1.54 m rear. */
export const FRONT_X = 0.76
export const REAR_X = 0.77
export const GAUGE = (FRONT_X + REAR_X) // mean track, for the roll geometry
/** Height of the centre of mass: a driver lying almost flat beside the fuel. */
export const CG_H = 0.28
/** Static load on the driven axle, engine and gearbox behind the driver. */
export const REAR_SHARE = 0.58

/** The tub stops here and the DFV takes over as the chassis. */
export const ENGINE_FACE = -0.3
export const NOSE_JOINT = 1.55
export const NOSE_TIP = 2.22
/** Centreline height of the tub's lofted sections. */
export const TUB_Y = 0.38

// --- Wheels -----------------------------------------------------------------
/** 5.50-13 front, 7.00-15 rear: treaded Firestones, narrow by any later standard. */
export const FRONT_R = 0.3
export const REAR_R = 0.33
export const FRONT_W = 0.24
export const REAR_W = 0.33
export const RIM_F = 0.165
export const RIM_R = 0.19
/** Girling discs, outboard all round. */
export const DISC_F = 0.135
export const DISC_R = 0.13

// --- Suspension -------------------------------------------------------------
/** Upright centres: where the wheel actually hangs. */
export const UPRIGHT_F = { x: 0.6, y: 0.3 }
export const UPRIGHT_R = { x: 0.62, y: 0.34 }
/** Inboard pick-ups on the tub, front. Fore and aft legs of each wishbone. */
export const PICKUP_F = {
  upper: { x: 0.3, y: 0.52 },
  lower: { x: 0.3, y: 0.19 },
  zFore: 1.44,
  zAft: 0.98,
  /** The rack, ahead of the axle line. */
  rack: { y: 0.34, z: 1.36 },
  /** Coil-over: top mount on the tub, bottom on the upright. */
  spring: { top: { x: 0.36, y: 0.54, z: 1.23 }, bottom: { x: 0.5, y: 0.33 } },
}
/** Rear pick-ups on the gearbox and the back of the tub. */
export const PICKUP_R = {
  top: { x: 0.15, y: 0.6, z: -1.2 },
  lower: { x: 0.15, y: 0.22 },
  zFore: -1.0,
  zAft: -1.46,
  spring: { top: { x: 0.26, y: 0.57, z: -1.15 }, bottom: { x: 0.5, y: 0.34 } },
}
/** Visible wheel travel at full dive or squat. */
export const TRAVEL = 0.045

// --- Steering ---------------------------------------------------------------
/** Lock at the road wheel. */
export const LOCK = 25 * DEG
/** Turns of the wheel per degree at the road: about 9.4:1 on the 49's rack. */
export const STEER_RATIO = 9.4

// --- Aerodynamics -----------------------------------------------------------
/** The 49B's strutted wing: mounted to the rear uprights, so unsprung. */
export const WING = {
  low: 0.62,
  high: 1.22,
  z: -1.36,
  span: 1.3,
  chord: 0.36,
  strutX: 0.55,
  strutBase: 0.46,
}

// --- Powertrain -------------------------------------------------------------
export const RPM_IDLE = 2200
export const RPM_PEAK = 9000
export const RPM_LIMIT = 9500
/** Where the megaphones end, for the flames on the overrun. */
export const EXHAUST_TIPS: [number, number, number][] = [
  [0.27, 0.57, -1.84],
  [-0.27, 0.57, -1.84],
]

// --- Cockpit ----------------------------------------------------------------
/** Where the driver's eyes are. */
export const EYE = { y: 0.86, z: 0.45 }
export const STEERING_WHEEL = { y: 0.6, z: 0.66, r: 0.135, rake: -70 * DEG }

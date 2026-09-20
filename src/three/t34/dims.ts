/**
 * The T-34-85 as a table of numbers.
 *
 * One file, imported by the reconstruction and by the simulation alike, so
 * that the gun the physics fires is bolted to the trunnion the geometry
 * draws. Every figure is from the 1945 factory handbook or measured off the
 * Kubinka vehicle unless it is marked as derived.
 *
 * Model axes: +Z forward over the glacis, +Y up, metres. That makes +X the
 * PORT side — the driver's hatch and the commander's cupola are both at
 * positive X, which is where they are on the tank.
 */

export const DEG = Math.PI / 180

// --- Hull -------------------------------------------------------------------
/** Ground clearance under the belly plate. */
export const FLOOR = 0.4
/** Hull roof, and therefore the turret ring plane. */
export const DECK = 1.5
export const NOSE = 3.05
export const STERN = -3.05
/** Where the vertical lower side gives way to the sloped sponson. */
export const SIDE_BREAK = 0.83
/** Half-width of the lower hull, between the tracks. */
export const HW_LOWER = 0.84
/** Half-width at the deck edge: 2.80 m across the sponsons. */
export const HW_DECK = 1.4
/** Glacis: 45 mm at 60° from vertical, i.e. 30° above the horizontal. */
export const GLACIS = 30 * DEG
/** Height of the knife edge where glacis meets the lower front plate. */
export const NOSE_Y = 0.85

// --- Running gear -----------------------------------------------------------
/** 830 mm road wheels. */
export const WHEEL_R = 0.415
/** Five a side; 3.90 m of track on the ground. */
export const WHEEL_Z = [1.98, 0.84, -0.08, -1.0, -1.92]
/** Track contact length, which is what the hull actually balances on. */
export const CONTACT = WHEEL_Z[0] - WHEEL_Z[4] + WHEEL_R * 2
export const IDLER = { z: 2.62, y: 0.46, r: 0.25 }
/**
 * Six roller teeth on a 0.33 m pitch circle: twelve pins a revolution at
 * 172 mm each. The centre height matters — set it any higher and the top run
 * lifts clear of the rear road wheels, which a T-34's famously slack track
 * never does.
 */
export const SPROCKET = { z: -2.6, y: 0.47, r: 0.33, teeth: 6 }
/** Track centreline, so the tank is 3.00 m over the tracks. */
export const TRACK_X = 1.25
export const TRACK_W = 0.5
export const TRACK_PITCH = 0.172
/** Gauge between track centres, for the steering geometry. */
export const GAUGE = TRACK_X * 2
/** Swing-arm pivot, relative to the wheel it carries. */
export const ARM = { dz: 0.5, dy: 0.28, x: 1.04 }

// --- Turret and gun ---------------------------------------------------------
/** 1,600 mm ring: the whole reason the crew is five. */
export const RING_R = 0.8
export const RING_Y = DECK
/** The ring sits slightly forward of the hull's midpoint. */
export const RING_Z = 0.15
export const TURRET_H = 0.87
/** Trunnion, relative to the ring centre. Bore axis therefore 2.02 m up. */
export const TRUNNION = { y: 0.52, z: 0.3 }
/** Trunnion to muzzle. The gun overhangs the nose by 2.00 m. */
export const BARREL = 4.6
export const ELEV_MAX = 25 * DEG
export const ELEV_MIN = -5 * DEG

/** Where the commander's cupola and the loader's hatch sit on the roof. */
export const CUPOLA = { x: 0.38, z: -0.3, r: 0.3 }
export const LOADER = { x: -0.4, z: -0.12, r: 0.26 }

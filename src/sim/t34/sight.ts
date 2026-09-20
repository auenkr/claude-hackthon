/**
 * What the gunner can see through the TSh-16.
 *
 * The graticule is an HTML overlay and the gunnery is a physics object in a
 * ref, and the two cannot be wired together through React without
 * re-rendering the scene sixty times a second. So the sight publishes here:
 * the simulation writes it from `step`, the overlay reads it on its own
 * tenth-of-a-second clock, and neither knows about the other.
 */

export type Ammo = 'ap' | 'he'

export interface SightState {
  /** Metres to where the gun axis meets the ground, 0 if it never does. */
  range: number
  /** Metres to whatever solid the sight line is actually resting on. */
  laid: number
  /** What that solid is, in words. */
  on: string
  round: Ammo
  ap: number
  he: number
  belt: number
  /** Seconds left on the reload, and the full cycle for the bar. */
  reload: number
  reloadFull: number
  /** Gun is against the −5° depression stop. */
  atStop: boolean
  /** Superelevation the range calls for, in Soviet mils (1/6000 of a circle). */
  lay: number
  /** Speed in km/h — above a walking pace the dispersion is the story. */
  speed: number
  /** True while a T-34 is the machine on the screen. */
  live: boolean
}

export const sight: SightState = {
  range: 0,
  laid: 0,
  on: '',
  round: 'ap',
  ap: 0,
  he: 0,
  belt: 0,
  reload: 0,
  reloadFull: 8,
  atStop: false,
  lay: 0,
  speed: 0,
  live: false,
}

/**
 * Muzzle velocities: BR-365 armour-piercing and O-365K high explosive. The
 * overlay needs them to draw the range ladder and the gunnery needs them to
 * fire, so they live here rather than in either.
 */
export const MUZZLE = { ap: 792, he: 793 }

/** Sight field of view, degrees. The TSh-16 is four-power over 16°. */
export const SIGHT_FOV = 16
/** A Soviet mil is one six-thousandth of a circle, not a milliradian. */
export const MIL = (Math.PI * 2) / 6000
/** Height of the field in mils, which is the overlay's coordinate system. */
export const FIELD_MILS = (SIGHT_FOV / 360) * 6000
/** The standard ranging target: a tank, hull down to the turret roof. */
export const STADIA_TARGET = 2.7

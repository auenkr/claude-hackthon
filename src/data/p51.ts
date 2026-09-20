import type { MachineSpec, Source } from '../types'

const POH: Source = {
  kind: 'text',
  citation: 'AN 01-60JE-1, Pilot’s Flight Operating Instructions, P-51D',
  note: 'The 1944 USAAF flight manual issued with the aircraft; the authority for operating limits and control travels.',
}

const SPEC: Source = {
  kind: 'text',
  citation: 'NAA Report NA-8449, P-51D Detail Specification',
  note: 'North American Aviation’s own airframe specification, giving the rigged dimensions of the finished aeroplane.',
}

const DEAN: Source = {
  kind: 'text',
  citation: 'Dean, F., America’s Hundred Thousand (Schiffer, 1997), pp. 342–361',
  note: 'Comparative engineering data compiled from wartime manufacturer and USAAF records.',
}

const SURVEY: Source = {
  kind: 'artifact',
  citation: 'NASM A19600296 — P-51D 44-74939, airframe survey',
  note: 'Measurements taken from a surviving airframe in the National Air and Space Museum collection.',
}

const INFER: Source = {
  kind: 'inference',
  citation: 'Scaled from the NAA three-view, fixed to published stations',
  note: 'Section shapes between published stations are interpolated. The overall envelope is sourced; the curve between ribs is our reconstruction.',
}

export const p51: MachineSpec = {
  slug: 'p51-mustang',
  name: 'P-51D Mustang',
  designation: 'North American Aviation NA-109',
  origin: 'Inglewood, California',
  years: '1940 — 1945',
  tagline: 'A laminar-flow wing wrapped around a borrowed engine.',
  accent: '#b5761b',
  camera: [10.5, 4.6, 10.5],
  target: [0, 1.5, 0],
  radius: 6.2,
  summary: [
    'The Mustang began as an airframe without an engine worth the name. North American drew it in 1940 around an Allison V-1710 that ran out of breath above fifteen thousand feet, and for two years the aeroplane was fast, beautiful and useless where the bombers actually flew.',
    'What fixed it was a transplant. Fitting the two-stage supercharged Rolls-Royce Merlin — built under licence by Packard as the V-1650 — moved the aircraft’s best altitude up by ten thousand feet and turned a ground-attack machine into a bomber escort that could reach Berlin and come home.',
    'The other half of the story is the wing. Its laminar-flow section carries maximum thickness unusually far aft, and the belly radiator is ducted so that heat added to the airflow recovers part of its own drag. Pull the aeroplane apart here and both ideas are visible: the deep aft-peaked wing, and the scoop hanging below the spar.',
  ],
  facts: [
    { label: 'Wingspan', value: '11.28 m · 37 ft 0 in' },
    { label: 'Length', value: '9.83 m · 32 ft 3 in' },
    { label: 'Powerplant', value: 'Packard V-1650-7, 1,490 hp' },
    { label: 'Maximum speed', value: '703 km/h at 7,620 m' },
    { label: 'Armament', value: '6 × 12.7 mm M2 Browning' },
    { label: 'Built', value: '15,586 Mustangs of all marks' },
  ],
  controls: [
    {
      id: 'throttle',
      label: 'Throttle',
      kind: 'slider',
      min: 0,
      max: 100,
      step: 1,
      value: 0,
      unit: '%',
      hint: 'The propeller turns at 0.479 × crankshaft speed through the Merlin’s reduction gear — 1,437 rpm at full power.',
    },
    {
      id: 'gear',
      label: 'Landing gear',
      kind: 'toggle',
      value: 1,
      states: ['Retracted', 'Down and locked'],
      hint: 'The wide-track main gear folds inward into the wing, hydraulically, in roughly eight seconds.',
    },
    {
      id: 'flaps',
      label: 'Flaps',
      kind: 'slider',
      min: 0,
      max: 50,
      step: 5,
      value: 0,
      unit: '°',
      hint: 'Full flap is 50°. The manual restricts extension to below 165 mph indicated.',
    },
    {
      id: 'canopy',
      label: 'Canopy',
      kind: 'toggle',
      value: 0,
      states: ['Closed', 'Slid back'],
      hint: 'The D-model’s blown bubble hood replaced the framed greenhouse and gave the pilot rearward vision.',
    },
    {
      id: 'roll',
      label: 'Ailerons',
      kind: 'slider',
      min: -10,
      max: 10,
      step: 1,
      value: 0,
      unit: '°',
      hint: 'Only ±10°, but sealed and balanced — the Mustang kept rolling at speeds where rivals went stiff.',
    },
    {
      id: 'elevator',
      label: 'Elevator',
      kind: 'slider',
      min: -20,
      max: 30,
      step: 1,
      value: 0,
      unit: '°',
      hint: 'Travel is 30° up, 20° down from neutral.',
    },
    {
      id: 'rudder',
      label: 'Rudder',
      kind: 'slider',
      min: -30,
      max: 30,
      step: 1,
      value: 0,
      unit: '°',
      hint: 'Torque from 1,490 hp pulls the nose left on takeoff; the rudder is how the pilot argues back.',
    },
  ],
  parts: [
    {
      id: 'propeller',
      name: 'Propeller and spinner',
      group: 'Powerplant',
      blurb:
        'Four hollow steel blades on a constant-speed hub. The governor changes blade pitch to hold commanded rpm, so the propeller acts as an automatic gearbox between the engine and the air.',
      explode: [0, 0, 2.2],
      dimensions: [
        { label: 'Assembly', value: 'Hamilton Standard 24D50', source: DEAN },
        { label: 'Diameter', value: '3.40 m · 11 ft 2 in', source: SPEC },
        { label: 'Blades', value: '4, cuffed hollow steel', source: DEAN },
        { label: 'Reduction gear', value: '0.479 : 1', source: DEAN },
        { label: 'Speed at 3,000 rpm', value: '1,437 rpm', source: INFER },
      ],
    },
    {
      id: 'engine',
      name: 'Packard V-1650-7 Merlin',
      group: 'Powerplant',
      blurb:
        'A Rolls-Royce Merlin 66 built under licence in Detroit. Its two-stage, two-speed supercharger with an intercooler is what let the Mustang fight at the altitude the bombers flew.',
      explode: [0, 1.5, 1.4],
      dimensions: [
        { label: 'Configuration', value: 'V-12, 60°, liquid cooled', source: DEAN },
        { label: 'Displacement', value: '27.0 L · 1,649 in³', source: DEAN },
        { label: 'Power', value: '1,490 hp at 3,000 rpm', source: POH },
        { label: 'War emergency', value: '1,720 hp at 67 inHg', source: POH },
        { label: 'Supercharger', value: 'Two-stage, two-speed, intercooled', source: DEAN },
      ],
    },
    {
      id: 'exhaust',
      name: 'Exhaust stacks',
      group: 'Powerplant',
      blurb:
        'Six short stacks a side, one per cylinder, angled aft. At speed the jet thrust from the exhaust is worth a measurable few miles per hour.',
      explode: [1.1, 0.5, 0],
      dimensions: [
        { label: 'Stacks', value: '12, one per cylinder', source: SURVEY },
        { label: 'Arrangement', value: 'Six per bank, swept aft', source: SURVEY },
      ],
    },
    {
      id: 'fuselage',
      name: 'Fuselage',
      group: 'Structure',
      blurb:
        'Three bolted sections: engine mount, monocoque centre, and tail cone. The semi-monocoque skin carries the loads, with the cockpit floor sitting directly on the wing centre section.',
      explode: [0, 1.1, 0],
      dimensions: [
        { label: 'Overall length', value: '9.83 m · 32 ft 3 in', source: SPEC },
        { label: 'Height on gear', value: '4.17 m · 13 ft 8 in', source: SPEC },
        { label: 'Maximum width', value: '0.91 m', source: INFER },
        { label: 'Construction', value: 'Aluminium semi-monocoque', source: DEAN },
      ],
    },
    {
      id: 'canopy',
      name: 'Bubble canopy',
      group: 'Structure',
      blurb:
        'The D-model’s defining change. Cutting down the rear decking and blowing a single-piece hood gave the pilot the one thing the earlier framed canopy denied him: a clear view behind.',
      explode: [0, 1.6, -0.4],
      dimensions: [
        { label: 'Type', value: 'One-piece blown Plexiglas', source: DEAN },
        { label: 'Actuation', value: 'Hand crank, slides aft on rails', source: POH },
      ],
    },
    {
      id: 'wing',
      name: 'Laminar-flow wing',
      group: 'Aerodynamics',
      blurb:
        'The NAA/NACA 45-100 section carries its maximum thickness at about 40% chord instead of the usual 30%, holding the airflow smooth further back. The wing is built as one piece, bolted to the fuselage as a unit.',
      explode: [0, -1.8, 0],
      dimensions: [
        { label: 'Span', value: '11.28 m · 37 ft 0 in', source: SPEC },
        { label: 'Area', value: '21.83 m² · 235 ft²', source: SPEC },
        { label: 'Root chord', value: '2.59 m', source: INFER },
        { label: 'Section', value: 'NAA/NACA 45-100, 15.1% root', source: DEAN },
        { label: 'Dihedral', value: '5°', source: SPEC },
        { label: 'Washout', value: '1° tip down', source: INFER },
      ],
    },
    {
      id: 'flaps',
      name: 'Split flaps',
      group: 'Aerodynamics',
      blurb:
        'Hydraulic flaps running from the fuselage to the aileron. They add lift and a great deal of drag, which is exactly what is wanted on approach.',
      explode: [0, -0.9, -1.1],
      dimensions: [
        { label: 'Maximum deflection', value: '50°', source: POH },
        { label: 'Placard speed', value: '165 mph IAS', source: POH },
      ],
    },
    {
      id: 'ailerons',
      name: 'Ailerons',
      group: 'Aerodynamics',
      blurb:
        'Sealed, internally balanced surfaces. They gave the Mustang a roll rate that stayed usable at high speed, when many contemporaries stiffened up.',
      explode: [1.6, 0.2, -0.8],
      dimensions: [
        { label: 'Travel', value: '±10° from neutral', source: POH },
        { label: 'Balance', value: 'Sealed internal, dynamic', source: DEAN },
      ],
    },
    {
      id: 'radiator',
      name: 'Ventral radiator duct',
      group: 'Cooling',
      blurb:
        'Coolant and oil radiators in a belly duct with a variable exit door. Heat added to the air inside the duct expands it, and the expansion recovers part of the duct’s own drag — the Meredith effect.',
      explode: [0, -2.4, -0.6],
      dimensions: [
        { label: 'Contents', value: 'Coolant and oil radiators, aftercooler', source: DEAN },
        { label: 'Inlet', value: 'Boundary-layer split, offset from skin', source: SURVEY },
        { label: 'Exit door', value: 'Thermostatic, automatic', source: POH },
      ],
    },
    {
      id: 'guns',
      name: 'Wing armament',
      group: 'Armament',
      blurb:
        'Six Browning M2 heavy machine guns, canted to lie flat in the thin wing. The inboard pair carry the deepest ammunition boxes.',
      explode: [2.2, 0.3, 0.5],
      dimensions: [
        { label: 'Guns', value: '6 × 12.7 mm M2 Browning', source: POH },
        { label: 'Ammunition', value: '1,880 rounds total', source: POH },
        { label: 'Inboard pair', value: '400 rounds per gun', source: POH },
        { label: 'Outer pairs', value: '270 rounds per gun', source: POH },
      ],
    },
    {
      id: 'tailplane',
      name: 'Tailplane and elevators',
      group: 'Empennage',
      blurb:
        'A conventional tailplane with fabric-covered elevators. Late production added a dorsal fin ahead of it to cure a directional stability problem that appeared with the cut-down rear fuselage.',
      explode: [0, 0.9, -2.2],
      dimensions: [
        { label: 'Span', value: '4.04 m · 13 ft 3 in', source: SPEC },
        { label: 'Elevator travel', value: '30° up, 20° down', source: POH },
      ],
    },
    {
      id: 'fin',
      name: 'Fin and rudder',
      group: 'Empennage',
      blurb:
        'The bubble canopy removed fuselage side area behind the pilot, and the aircraft lost directional stability. The dorsal fin extension restored it.',
      explode: [0, 2.0, -1.6],
      dimensions: [
        { label: 'Rudder travel', value: '±30°', source: POH },
        { label: 'Dorsal fin', value: 'Added from P-51D-5 on', source: DEAN },
      ],
    },
    {
      id: 'gear-main',
      name: 'Main landing gear',
      group: 'Undercarriage',
      blurb:
        'Wide-track gear retracting inward into the wing, with the wheel lying flat in the bay. The track is generous, which is why the Mustang was comparatively civilised on the ground.',
      explode: [1.4, -2.2, 0.4],
      dimensions: [
        { label: 'Track', value: '3.61 m · 11 ft 10 in', source: SPEC },
        { label: 'Retraction', value: 'Inward into wing, hydraulic', source: POH },
        { label: 'Main wheel', value: '27 in smooth contour', source: SURVEY },
      ],
    },
    {
      id: 'gear-tail',
      name: 'Tailwheel',
      group: 'Undercarriage',
      blurb:
        'Steerable through the rudder pedals while the stick is back, and free to castor when the stick is pushed forward for taxiing turns.',
      explode: [0, -1.4, -1.8],
      dimensions: [
        { label: 'Type', value: 'Retractable, steerable, lockable', source: POH },
        { label: 'Wheel', value: '12.5 in', source: SURVEY },
      ],
    },
  ],
  bibliography: [POH, SPEC, DEAN, SURVEY, INFER],
}

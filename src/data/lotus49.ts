import type { MachineSpec, Source } from '../types'

const REGS: Source = {
  kind: 'text',
  citation: 'FIA Appendix J, 1967 Formula One technical regulations',
  note: 'The 3-litre formula the 49 was designed to, governing the engine capacity and minimum weight it was built around.',
}

const COSWORTH: Source = {
  kind: 'text',
  citation: 'Cosworth Engineering, DFV technical description, 1967',
  note: 'The engine builder’s own figures for the Ford-Cosworth DFV as delivered to Team Lotus.',
}

const NYE: Source = {
  kind: 'text',
  citation: 'Nye, D., Twice Lucky: Chapman, Clark, Hill and the Lotus 49 (2012)',
  note: 'The standard account of the car’s design, compiled from Team Lotus drawings and interviews with the engineers.',
}

const CTL: Source = {
  kind: 'artifact',
  citation: 'Classic Team Lotus, chassis survey, 49/R2',
  note: 'Measurements taken from a surviving, running chassis maintained by the factory’s own historic team.',
}

const INFER: Source = {
  kind: 'inference',
  citation: 'Derived from the published wheelbase and track against period photographs',
  note: 'Where no drawing survives with a dimension, the value is scaled from the tub’s known hard points.',
}

export const lotus49: MachineSpec = {
  slug: 'lotus-49',
  name: 'Lotus 49',
  designation: 'Team Lotus Type 49',
  origin: 'Hethel, Norfolk',
  years: '1967 — 1970',
  tagline: 'The engine that stopped being cargo and started being the chassis.',
  accent: '#e6b422',
  camera: [8.2, 3.4, 8.2],
  target: [0, 0.6, 0],
  radius: 4.6,
  summary: [
    'Every grand prix car before the 49 carried its engine as a passenger: a heavy lump bolted into a tub that had to be stiff enough to work without it. Colin Chapman and Maurice Phillippe threw that assumption out. The Ford-Cosworth DFV bolts directly to the back of a short monocoque tub and does the structural work itself, with the rear suspension and gearbox hung straight off the engine block. The result is a car built from four load-bearing pieces instead of one long chassis wrapped around an afterthought.',
    'The DFV existed only because Chapman asked Ford to pay for it. Cosworth’s Keith Duckworth built a 90-degree V8 specifically to be short, stiff, and rear-mounted as a structural member — 408 hp from three litres, in an engine that would go on to win more championships than any other in the sport’s history. In 1967 it was fitted to nobody’s car but Lotus’s.',
    'Jim Clark won on the 49’s debut at Zandvoort, first time out. It was also, in its outrigger-winged 1968 form, one of the last F1 cars anybody built without much idea of how badly aerodynamics could go wrong: high wings mounted straight to the suspension uprights collapsed at Barcelona in 1969 and put wings on stalks in the rulebook for good.',
  ],
  facts: [
    { label: 'Wheelbase', value: '2.36 m · 7 ft 9 in' },
    { label: 'Track, front/rear', value: '1.52 m / 1.54 m' },
    { label: 'Powerplant', value: 'Ford-Cosworth DFV, 408 hp' },
    { label: 'Weight', value: '506 kg, per the 1967 minimum' },
    { label: 'Debut', value: 'Dutch GP, Zandvoort, 4 June 1967 — won' },
    { label: 'Built', value: '12 chassis, 49 through 49C' },
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
      hint: 'Lucas mechanical fuel injection, one slide-throttle body per cylinder. Peak power arrives at 9,000 rpm.',
    },
    {
      id: 'steering',
      label: 'Steering',
      kind: 'slider',
      min: -25,
      max: 25,
      step: 1,
      value: 0,
      unit: '°',
      hint: 'Rack and pinion, feeding the front uprights directly — there is no power assistance and very little to cushion the driver from the road.',
    },
    {
      id: 'brakes',
      label: 'Brakes',
      kind: 'slider',
      min: 0,
      max: 100,
      step: 1,
      value: 0,
      unit: '%',
      hint: 'Girling discs, outboard all round with a 60% front bias. Watch the tub dive on its springs and the wishbones follow it — and the discs run orange.',
    },
    {
      id: 'wing',
      label: 'Rear wing',
      kind: 'slider',
      min: 0,
      max: 100,
      step: 5,
      value: 0,
      unit: '%',
      hint: 'Not fitted at Zandvoort in 1967. The tall strutted wing shown here reflects the 49B and 49C as raced from 1968, before Barcelona 1969 sent wings down onto the bodywork for good.',
    },
    {
      id: 'noseCone',
      label: 'Nose cone',
      kind: 'toggle',
      value: 0,
      states: ['Fitted', 'Removed'],
      hint: 'A glassfibre shell and nothing more. Lift it off, as the mechanics did in every pit stop, and the radiator core and front bulkhead are all that is behind that oval intake.',
    },
  ],
  parts: [
    {
      id: 'tub',
      name: 'Monocoque tub',
      group: 'Structure',
      blurb:
        'A short aluminium-sheet tub running only from the front bulkhead to the back of the cockpit. Everything behind that point is the engine’s job to carry, which is why the tub can be so much shorter and lighter than anything that came before it.',
      explode: [0, -1.2, 0],
      dimensions: [
        { label: 'Construction', value: 'Riveted aluminium sheet, stressed skin', source: NYE },
        { label: 'Length', value: 'Front bulkhead to engine face only', source: NYE },
        { label: 'Fuel cells', value: 'Rubber bag tanks, side and scuttle', source: CTL },
      ],
    },
    {
      id: 'engine',
      name: 'Ford-Cosworth DFV',
      group: 'Powerplant',
      blurb:
        'A 90-degree V8 designed from the outset to be a stressed chassis member — bolted rigidly to the tub at the front and carrying the entire rear suspension and gearbox off its own block at the back. No car had done this before; almost every car since has.',
      explode: [0, 1.3, -1.7],
      dimensions: [
        { label: 'Configuration', value: 'V8, 90°, DOHC 4 valves/cyl', source: COSWORTH },
        { label: 'Displacement', value: '2,993 cc', source: COSWORTH },
        { label: 'Power', value: '408 hp at 9,000 rpm', source: COSWORTH },
        { label: 'Induction', value: 'Lucas mechanical fuel injection', source: COSWORTH },
        { label: 'Structural role', value: 'Load-bearing, rear suspension mounted to block', source: NYE },
      ],
    },
    {
      id: 'gearbox',
      name: 'ZF 5DS-25 gearbox',
      group: 'Powerplant',
      blurb:
        'A five-speed transaxle bolted to the back of the DFV, completing the load path from front bulkhead to rear upright through just two rigid assemblies.',
      explode: [0, 0.6, -3.4],
      dimensions: [
        { label: 'Type', value: 'ZF 5DS-25, 5-speed transaxle', source: NYE },
        { label: 'Mounting', value: 'Bolted to rear engine face', source: CTL },
      ],
    },
    {
      id: 'nose',
      name: 'Nose cone',
      group: 'Aerodynamics',
      blurb:
        'A simple pointed cone with no wing at Zandvoort in 1967 — the 49 was one of the last front-line cars raced with essentially no aerodynamic aids at all.',
      explode: [0, 0.5, 2.4],
      dimensions: [
        { label: 'Material', value: 'Glassfibre', source: NYE },
        { label: 'Aero devices, 1967', value: 'None', source: NYE },
      ],
    },
    {
      id: 'wing',
      name: 'Rear wing and struts',
      group: 'Aerodynamics',
      blurb:
        'Added for 1968, mounted high on struts straight to the rear uprights rather than to the sprung chassis. The load went directly into the suspension with no damping at all, which is exactly what failed catastrophically at Barcelona in 1969.',
      explode: [0, 1.9, -3.2],
      dimensions: [
        { label: 'Introduced', value: '1968 season, 49B', source: NYE },
        { label: 'Mounting', value: 'Struts to rear upright, unsprung', source: NYE },
        { label: 'Banned in this form', value: 'After Spanish GP, 1969', source: NYE },
      ],
    },
    {
      id: 'cockpit',
      name: 'Cockpit and roll hoop',
      group: 'Structure',
      blurb:
        'An open cockpit with a low aluminium roll hoop behind the driver’s head — 1960s protection, which is to say very little by any later standard.',
      explode: [0, 1.4, 0.2],
      dimensions: [
        { label: 'Seating', value: 'Fixed, reclined, single seat', source: CTL },
        { label: 'Roll protection', value: 'Single low hoop', source: NYE },
      ],
    },
    {
      id: 'driver',
      name: 'Driver',
      group: 'Structure',
      blurb:
        'Reclined almost flat, with the fuel in bag tanks beside his hips and nothing holding him in the car but the sides of the seat. Seat belts were not compulsory in Formula One until 1972; in 1967 the received wisdom was that you were better off thrown clear.',
      explode: [0, 1.0, 0.6],
      dimensions: [
        { label: 'Position', value: 'Reclined, feet ahead of the front axle line', source: NYE },
        { label: 'Restraint', value: 'None fitted, 1967', source: NYE },
        { label: 'Helmet', value: 'Open face with peak and goggles, or an early full face', source: NYE },
      ],
    },
    {
      id: 'brakes',
      name: 'Girling disc brakes',
      group: 'Running gear',
      blurb:
        'Solid discs outboard on all four uprights, with a 60% front bias. Under braking the weight moves forward, the nose dives on the springs, and the front tyres do most of the work — which is why the front discs run hottest.',
      explode: [1.4, -0.1, 0],
      dimensions: [
        { label: 'Type', value: 'Girling solid discs, outboard', source: NYE },
        { label: 'Front bias', value: '≈ 60%', source: INFER },
        { label: 'Peak deceleration', value: '≈ 1.15 g, modelled', source: INFER },
      ],
    },
    {
      id: 'suspension-front',
      name: 'Front suspension',
      group: 'Suspension',
      blurb:
        'Double wishbones with outboard coil-spring dampers, steering by rack and pinion straight to the upright.',
      explode: [1.7, -0.3, 1.6],
      dimensions: [
        { label: 'Layout', value: 'Double wishbone, outboard coil-over', source: NYE },
        { label: 'Track', value: '1.52 m', source: CTL },
        { label: 'Tyres', value: '5.50-13 Firestone, treaded', source: NYE },
        { label: 'Movement', value: 'Wishbones pivot on the tub; the upright steers', source: CTL },
      ],
    },
    {
      id: 'suspension-rear',
      name: 'Rear suspension',
      group: 'Suspension',
      blurb:
        'Top link and lower wishbone, with twin radius rods — all of it mounted directly to the gearbox casing rather than to any separate chassis structure, because the gearbox is the chassis back here.',
      explode: [1.9, -0.3, -3.0],
      dimensions: [
        { label: 'Layout', value: 'Top link, reversed lower wishbone, twin radius rods', source: NYE },
        { label: 'Mounting', value: 'To gearbox casing, not a separate frame', source: NYE },
        { label: 'Track', value: '1.54 m', source: CTL },
        { label: 'Tyres', value: '7.00-15 Firestone, treaded', source: NYE },
        { label: 'Static load', value: '≈ 58% of the car', source: INFER },
      ],
    },
    {
      id: 'wheels',
      name: 'Wheels and tyres',
      group: 'Running gear',
      blurb:
        'Cast magnesium wheels on knock-off hubs, narrow by any later standard — the whole car is narrow by any later standard.',
      explode: [2.1, -0.2, 0],
      dimensions: [
        { label: 'Material', value: 'Cast magnesium alloy', source: CTL },
        { label: 'Fixing', value: 'Single centre-lock knock-off', source: NYE },
        { label: 'Tyres', value: 'Firestone or Dunlop, treaded', source: NYE },
      ],
    },
    {
      id: 'exhaust',
      name: 'Exhaust',
      group: 'Powerplant',
      blurb:
        'Eight individual pipes, one per cylinder, running back and up past the gearbox — short, unsilenced, and part of why the DFV is one of the most recognisable sounds in motor racing.',
      explode: [1.2, 0.6, -2.2],
      dimensions: [
        { label: 'Configuration', value: '8 individual pipes, 4-into-1 per bank', source: INFER },
        { label: 'Routing', value: 'Above the gearbox, exiting aft', source: CTL },
      ],
    },
  ],
  bibliography: [REGS, COSWORTH, NYE, CTL, INFER],
}

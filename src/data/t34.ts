import type { MachineSpec, Source } from '../types'

const MANUAL: Source = {
  kind: 'text',
  citation: 'Танк Т-34-85: Руководство (Voenizdat, Moscow, 1945)',
  note: 'The Soviet service manual issued with the vehicle. Authority for the mechanical layout, control travels and maintenance dimensions.',
}

const TM: Source = {
  kind: 'text',
  citation: 'TM 30-430, Handbook on USSR Military Forces, ch. VII (US War Dept., 1945)',
  note: 'American wartime intelligence handbook, compiled from captured vehicles and Lend-Lease liaison.',
}

const ZALOGA: Source = {
  kind: 'text',
  citation: 'Zaloga, S., T-34-85 Medium Tank 1944–94, New Vanguard 20 (Osprey, 1996)',
  note: 'Standard secondary reference reconciling factory variation between plants 112, 174 and 183.',
}

const KUBINKA: Source = {
  kind: 'artifact',
  citation: 'Kubinka collection T-34-85, hull and turret survey',
  note: 'Measured from a surviving Factory 183 vehicle; plate angles confirmed against the casting.',
}

const INFER: Source = {
  kind: 'inference',
  citation: 'Reconstructed from plate angles and the armour schedule',
  note: 'Where the manual gives thickness and slope but not a coordinate, the plate outline is derived rather than cited.',
}

export const t34: MachineSpec = {
  slug: 't34-85',
  name: 'T-34-85',
  nativeName: 'Т-34-85',
  designation: 'Factory No. 183, Model 1944',
  origin: 'Nizhny Tagil, Urals',
  years: '1940 — 1958',
  tagline: 'Sloped armour, a diesel engine, and a shape built to be mass-produced.',
  accent: '#6f9a5c',
  camera: [9.5, 4.2, 9.5],
  target: [0, 1.2, 0],
  radius: 5.4,
  summary: [
    'The T-34 was not the best-protected or best-armed tank of its war. It was the one that could be built in numbers by an evacuated factory staffed largely by people who had never built a tank, and still arrive at the front able to fight.',
    'Three decisions carry the design. The armour is thin but steeply sloped, so a 45 mm glacis laid back at 60° from vertical behaves like far more. The engine is an aluminium V-12 diesel, which gave range and made the vehicle harder to set alight than its petrol-engined opponents. And the Christie suspension, with big road wheels on long coil springs inside the hull, let it keep moving over ground that stopped other tanks.',
    'The 85 mm version is the argument that followed. The original turret could not take a gun large enough to fight a Panther, so a new cast turret on a 1,600 mm ring was fitted — large enough for three crew, so the commander could finally stop also serving as gunner.',
  ],
  facts: [
    { label: 'Combat weight', value: '32.0 tonnes' },
    { label: 'Hull length', value: '6.10 m · 8.10 m gun forward' },
    { label: 'Engine', value: 'V-2-34 diesel V-12, 500 hp' },
    { label: 'Main gun', value: 'ZiS-S-53, 85 mm L/54.6' },
    { label: 'Road speed', value: '55 km/h' },
    { label: 'Crew', value: '5' },
  ],
  controls: [
    {
      id: 'speed',
      label: 'Road speed',
      kind: 'slider',
      min: 0,
      max: 55,
      step: 1,
      value: 0,
      unit: 'km/h',
      hint: 'Drive sprockets sit at the rear. With 830 mm road wheels, 55 km/h is about 350 rpm at the sprocket.',
    },
    {
      id: 'traverse',
      label: 'Turret traverse',
      kind: 'slider',
      min: -180,
      max: 180,
      step: 1,
      value: 0,
      unit: '°',
      hint: 'Electric traverse takes roughly twelve seconds for a full circle; the handwheel takes considerably longer.',
    },
    {
      id: 'elevation',
      label: 'Gun elevation',
      kind: 'slider',
      min: -5,
      max: 25,
      step: 1,
      value: 0,
      unit: '°',
      hint: 'Depression is limited to 5°, a real tactical cost when fighting from a reverse slope.',
    },
    {
      id: 'terrain',
      label: 'Ground roughness',
      kind: 'slider',
      min: 0,
      max: 100,
      step: 1,
      value: 0,
      unit: '%',
      hint: 'Watch the road wheels work independently — the Christie springs are vertical, inside the hull sides.',
    },
    {
      id: 'hatches',
      label: 'Hatches',
      kind: 'toggle',
      value: 0,
      states: ['Closed down', 'Open'],
      hint: 'The commander’s cupola was added with the 85 mm turret; before it, the commander fought half blind.',
    },
  ],
  parts: [
    {
      id: 'hull',
      name: 'Hull',
      group: 'Structure',
      blurb:
        'Welded rolled plate. The glacis is only 45 mm thick, but laid back at 60° from vertical it presents far more metal along the path of a shot — and tends to deflect rather than stop it.',
      explode: [0, -0.9, 0],
      dimensions: [
        { label: 'Length', value: '6.10 m', source: MANUAL },
        { label: 'Width', value: '3.00 m', source: MANUAL },
        { label: 'Height to roof', value: '1.72 m', source: INFER },
        { label: 'Glacis', value: '45 mm at 60° from vertical', source: MANUAL },
        { label: 'Hull sides', value: '45 mm at 40°', source: TM },
        { label: 'Ground clearance', value: '0.40 m', source: MANUAL },
      ],
    },
    {
      id: 'turret',
      name: 'Cast turret',
      group: 'Structure',
      blurb:
        'A single casting on a 1,600 mm ring — 180 mm wider than the 76 mm turret it replaced. The extra ring diameter is the entire reason a third crewman fits, which is the reason the commander can command.',
      explode: [0, 2.6, 0],
      dimensions: [
        { label: 'Ring diameter', value: '1,600 mm', source: MANUAL },
        { label: 'Front', value: '90 mm cast', source: TM },
        { label: 'Sides', value: '75 mm at 20°', source: TM },
        { label: 'Roof', value: '20 mm', source: TM },
        { label: 'Crew', value: '3 — commander, gunner, loader', source: ZALOGA },
        { label: 'Traverse', value: '360° in 12 s, electric', source: MANUAL },
      ],
    },
    {
      id: 'gun',
      name: 'ZiS-S-53 85 mm gun',
      group: 'Armament',
      blurb:
        'Adapted from the 52-K anti-aircraft gun. With the BR-365 armour-piercing round it leaves the muzzle at 792 m/s — enough to fight a Panther at ranges where the earlier 76 mm could only scratch paint.',
      explode: [0, 1.0, 3.2],
      dimensions: [
        { label: 'Calibre', value: '85 mm', source: MANUAL },
        { label: 'Barrel length', value: 'L/54.6 · 4.64 m', source: MANUAL },
        { label: 'Muzzle velocity', value: '792 m/s, BR-365 APHE', source: TM },
        { label: 'Elevation', value: '−5° to +25°', source: MANUAL },
        { label: 'Ammunition', value: '55 rounds stowed', source: MANUAL },
      ],
    },
    {
      id: 'mantlet',
      name: 'Gun mantlet',
      group: 'Armament',
      blurb:
        'The cast cradle cover that moves with the gun in elevation, closing the turret’s largest opening. A classic shot trap when it is rounded — which is why the lower edge is cut back.',
      explode: [0, 0.6, 1.9],
      dimensions: [
        { label: 'Thickness', value: '90 mm cast', source: TM },
        { label: 'Coaxial', value: '7.62 mm DT machine gun', source: MANUAL },
      ],
    },
    {
      id: 'cupola',
      name: 'Commander’s cupola',
      group: 'Structure',
      blurb:
        'Five vision slits and a rotating periscope hatch. Its absence on earlier T-34s was the single most-complained-about fault in the design.',
      explode: [0, 1.6, -0.6],
      dimensions: [
        { label: 'Vision slits', value: '5', source: KUBINKA },
        { label: 'Hatch', value: 'Two-piece, rotating periscope', source: MANUAL },
      ],
    },
    {
      id: 'engine',
      name: 'V-2-34 diesel',
      group: 'Powerplant',
      blurb:
        'An aluminium-block V-12 diesel of 38.9 litres, mounted transversely-braced at the rear with the transmission behind it. Diesel fuel is markedly harder to ignite than petrol, and the tank’s range benefits too.',
      explode: [0, 2.0, -3.4],
      dimensions: [
        { label: 'Configuration', value: 'V-12 diesel, 60°', source: MANUAL },
        { label: 'Displacement', value: '38.88 L', source: MANUAL },
        { label: 'Power', value: '500 hp at 1,800 rpm', source: MANUAL },
        { label: 'Power to weight', value: '15.6 hp/tonne', source: INFER },
        { label: 'Fuel', value: '545 L internal, 300 km road', source: TM },
      ],
    },
    {
      id: 'sprocket',
      name: 'Drive sprockets',
      group: 'Running gear',
      blurb:
        'Rear drive, with roller teeth engaging the track pins. Rear drive keeps the long transmission shaft out of the fighting compartment floor.',
      explode: [1.8, 0, -1.6],
      dimensions: [
        { label: 'Position', value: 'Rear', source: MANUAL },
        { label: 'Engagement', value: 'Roller teeth on track pins', source: KUBINKA },
        { label: 'Speed at 55 km/h', value: '≈ 350 rpm', source: INFER },
      ],
    },
    {
      id: 'wheels',
      name: 'Road wheels',
      group: 'Running gear',
      blurb:
        'Five 830 mm wheels a side on Christie suspension: each wheel rides on a swing arm against a long coil spring housed vertically inside the hull side. The wheels are big enough that no return rollers are needed — the top run of track simply rides on them.',
      explode: [2.6, -0.4, 0],
      dimensions: [
        { label: 'Wheels', value: '5 per side', source: MANUAL },
        { label: 'Diameter', value: '830 mm', source: MANUAL },
        { label: 'Suspension', value: 'Christie, vertical coil springs', source: MANUAL },
        { label: 'Return rollers', value: 'None — track rides on wheels', source: KUBINKA },
      ],
    },
    {
      id: 'idler',
      name: 'Idler wheels',
      group: 'Running gear',
      blurb:
        'Front idlers on cranked axles. Rotating the crank moves the idler fore and aft, which is how track tension is set in the field.',
      explode: [1.8, 0, 1.9],
      dimensions: [
        { label: 'Position', value: 'Front', source: MANUAL },
        { label: 'Adjustment', value: 'Cranked axle, sets track tension', source: MANUAL },
      ],
    },
    {
      id: 'tracks',
      name: 'Tracks',
      group: 'Running gear',
      blurb:
        'Cast steel links 500 mm wide, alternating flat and guide-horn types. The width is the point: 0.83 kg/cm² ground pressure is what let the vehicle cross mud that immobilised heavier tanks.',
      explode: [3.4, 0, 0],
      dimensions: [
        { label: 'Width', value: '500 mm', source: MANUAL },
        { label: 'Links per track', value: '72', source: MANUAL },
        { label: 'Pitch', value: '172 mm', source: MANUAL },
        { label: 'Ground pressure', value: '0.83 kg/cm²', source: TM },
      ],
    },
    {
      id: 'fenders',
      name: 'Fenders and stowage',
      group: 'Structure',
      blurb:
        'Thin sheet mudguards carrying external fuel drums, spare track links and a tow cable. Almost everything bolted here is expendable and frequently missing.',
      explode: [2.2, 0.8, 0],
      dimensions: [
        { label: 'Material', value: 'Thin sheet, unarmoured', source: KUBINKA },
        { label: 'External fuel', value: '2 × 90 L drums, rear', source: MANUAL },
      ],
    },
    {
      id: 'hullmg',
      name: 'Hull machine gun',
      group: 'Armament',
      blurb:
        'A 7.62 mm DT in a ball mount, worked by the radio operator. Aimed through a narrow telescope, it was never accurate, and was mostly used to make infantry keep their heads down.',
      explode: [1.0, 0.3, 2.4],
      dimensions: [
        { label: 'Weapon', value: '7.62 mm DT', source: MANUAL },
        { label: 'Mount', value: 'Ball, right front plate', source: KUBINKA },
      ],
    },
  ],
  bibliography: [MANUAL, TM, ZALOGA, KUBINKA, INFER],
}

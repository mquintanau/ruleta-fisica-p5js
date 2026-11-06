export const CANVAS = { width: 1120, height: 760 };

export const LAYOUT = {
  wheel: { cx: 262, cy: 252, panel: { x: 16, y: 16, w: 492, h: 472 } },
  cam: { x: 526, y: 16, w: 312, h: 234 },
  gauge: { x: 852, y: 16, w: 252, h: 234 },
  card: { x: 526, y: 264, w: 578, h: 224 },
  table: {
    panel: { x: 16, y: 500, w: 1088, h: 254 },
    x0: 102,
    y0: 512,
    zeroW: 58,
    cellW: 66,
    cellH: 50,
    colBetW: 66,
    dozenH: 40,
    outsideH: 40,
    tolerance: 7
  }
};

export const WHEEL = {
  outerR: 232,
  rimR: 214,
  bowlInnerR: 172,
  diamondR: 184,
  numberOuterR: 172,
  pocketOuterR: 150,
  hubR: 118,
  rimSegments: 120,
  diamonds: 8,
  idleOmega: 0.35,
  spinOmega: [1.4, 2.0],
  rotorDecay: 0.07
};

export const BALL = {
  radius: 7,
  launchSpeed: [2700, 3300],
  bowlGravity: 1750,
  rotorGravity: 1100,
  bowlDrag: 0.22,
  bowlRolling: 45,
  rimRestitution: 0.15,
  floorDrag: 2.0,
  maxSpeed: 3400,
  settleSpeed: 14,
  settleTime: 0.7,
  guideAfter: 22,
  snapAfter: 30
};

// Mouse launch: drag down on the wheel to spin it, then drag left to throw the ball.
export const LAUNCH = {
  minDistance: 24,            // px: shorter drags are ignored as clicks
  distanceRef: 220,           // px of drag that counts as full distance
  velocityRef: 2200,          // px/s release speed that counts as a full flick
  distanceWeight: 0.35,       // strength = 0.35·distance + 0.65·velocity (both 0..1)
  velocityWindowMs: 90,       // release velocity is measured over this window
  wheelOmega: [0.5, 2.6],     // rad/s given to the rotor at strength 0..1
  minWheelOmega: 1.4,         // rad/s needed to unlock the ball
  ballSpeed: [1400, 3400],    // px/s given to the ball at strength 0..1
  minBallSpeed: 2600,         // px/s: weaker throws are refused
  ballWindowMs: 3000,         // time to throw the ball once the wheel is fast enough
  countdownDecay: 0.3,        // 1/s rotor decay while the ball window is open
  timeoutPenalty: 0.19        // share of the stake lost when the window expires
};

export const PHYSICS = {
  stepMs: 1000 / 180,
  maxStepsPerFrame: 12,
  positionIterations: 10,
  velocityIterations: 8
};

export const RULES = {
  initialBalance: 1750905,
  chipValues: [10000, 50000, 100000, 500000],
  resultDisplayMs: 2800,
  cardFailsafeMs: 1600
};

export const COLORS = {
  bg: '#0b0f0d',
  panel: '#111a16',
  panelEdge: '#1f2d27',
  felt: '#0e6b3c',
  feltDark: '#0a5530',
  feltLine: '#e9f2ec',
  red: '#c8102e',
  black: '#1a1a1a',
  green: '#0a8a45',
  gold: '#d9b45b',
  goldDark: '#9c7a2b',
  text: '#eef3ef',
  muted: '#8fa39a',
  highlight: '#ffe08a'
};

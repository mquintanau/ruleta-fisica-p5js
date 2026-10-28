// Central configuration: layout of the canvas, physics tuning and game rules.
// All canvas coordinates are in "logical" pixels; the canvas is scaled by CSS
// to fit the viewport and pointer events are mapped back to this space.

export const CANVAS = { width: 1120, height: 760 };

export const LAYOUT = {
  wheel: { cx: 262, cy: 252, panel: { x: 16, y: 16, w: 492, h: 472 } },
  cam: { x: 526, y: 16, w: 312, h: 234 },
  gauge: { x: 852, y: 16, w: 252, h: 234 },
  card: { x: 526, y: 264, w: 578, h: 224 },
  table: {
    panel: { x: 16, y: 500, w: 1088, h: 254 },
    x0: 102,         // left edge of the zero cell (table is centred)
    y0: 512,         // top edge of the number grid
    zeroW: 58,
    cellW: 66,
    cellH: 50,
    colBetW: 66,     // width of the "2 to 1" cells
    dozenH: 40,
    outsideH: 40,
    tolerance: 7     // px around lines/corners that count as edge/corner bets
  }
};

// Wheel geometry (radii in px, relative to the wheel centre).
export const WHEEL = {
  outerR: 232,       // outer wooden rim (visual)
  rimR: 214,         // inner face of the rim: the ball track wall (collision)
  bowlInnerR: 172,   // where the stationary bowl meets the rotor
  diamondR: 184,     // brass deflectors, low on the bowl (below the rim-riding ball)
  numberOuterR: 172, // rotor: coloured number band 150..172 (no collision)
  pocketOuterR: 150, // top of the pocket frets
  hubR: 118,         // inner cone / pocket floor end (collision)
  rimSegments: 120,
  diamonds: 8,
  idleOmega: 0.35,           // rad/s when nobody is playing
  spinOmega: [1.4, 2.0],     // rad/s right after the croupier spins the rotor
  rotorDecay: 0.07           // 1/s exponential decay of rotor speed
};

export const BALL = {
  radius: 7,
  launchSpeed: [2700, 3300],  // px/s, tangential, opposite to the rotor
  bowlGravity: 1750,          // px/s^2 inward "slope" component on the bowl
  rotorGravity: 1100,         // px/s^2 inward component over the rotor/pockets (> ω²r)
  bowlDrag: 0.22,             // 1/s linear rolling resistance on the bowl
  bowlRolling: 45,            // px/s^2 constant rolling resistance on the bowl
  rimRestitution: 0.15,       // bounce off the (smooth) rim wall
  floorDrag: 2.0,             // 1/s drag toward the pocket floor velocity
  maxSpeed: 3400,             // px/s, anti-tunnelling clamp
  settleSpeed: 14,            // px/s relative to rotor surface
  settleTime: 0.7,            // s the ball must stay still in a pocket
  guideAfter: 22,             // s: start the gentle fallback guidance
  snapAfter: 30               // s: hard fallback (never expected)
};

export const PHYSICS = {
  stepMs: 1000 / 180,   // fixed sub-step
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

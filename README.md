# Ruleta Física — physics-based European roulette

A browser roulette game built with **p5.js** (rendering) and **Matter.js** (ball physics), with a
streamer-style reaction cam, a fictional "cortisol" stress meter, a TuLlave tap-to-pay animation and
a betting system in Colombian pesos (simulated currency only).

## Run it

The game uses ES modules, so it must be served over HTTP (opening `index.html` with `file://` will not work).

```bash
cd task_2
python3 tools/serve.py 8125
```

Then open <http://localhost:8125/>. `tools/serve.py` is a static server that disables caching so edited
modules reload. `python3 -m http.server 8125` also works, but your browser may cache old modules.

p5.js 1.11.1, Matter.js 0.20.0 and the Outfit font load from public CDNs (cdnjs / Google Fonts), so the
first load needs an internet connection. Nothing needs installing.

Tests (served the same way):

- `http://localhost:8125/tests/`: 86 logic tests (formatting, chips, the multi-bet slip, payouts,
  every table zone, the state machine, stress formula, stats, card callback and failsafe).
- `http://localhost:8125/tests/physics.html?n=300`: headless physics check. It runs N spins without
  rendering and reports settle times, fallbacks, whether the result always equals the pocket under the
  ball, and a chi-square uniformity check.

## How to play

1. **Start session**: you begin with **COP $1.750.905**.
2. **Pick a zone on the felt.** Hovering highlights the zone and the numbers it covers, with a tooltip
   showing the bet name, numbers, win probability and payout. Clicking a zone adds it to **Your bets**
   and makes it the *selected zone* (gold ring).
3. **Set its stake** with `+10.000` `+50.000` `+100.000` `+500.000` `½` `Clear` `All in`. The
   chip buttons always act on the selected zone.
4. **Add more bets (optional).** Click another zone and give it its own stake. For example,
   100.000 on Odd and 50.000 on Red. Up to 10 bets per spin.
   - Click a zone that already has chips (on the felt or in the list) to edit it again.
   - Click the selected zone again to deselect it (its chips stay).
   - `×` removes a bet and **Clear all** empties the list. Zones left with no chips are dropped.
   - Every stake is an integer, and the **total** never exceeds your balance: `All in` puts the rest
     of your balance on the selected zone.
   - The list shows the total stake, the best-case return and the chance that at least one bet pays.
5. **Place bet**: the total of all bets is deducted once and the bets are locked. The TuLlave card
   taps the terminal (≈0.9 s). While it plays, **Spin** is locked ("Processing payment…"), and you
   cannot retire or get a refund.
6. **Spin**: the rotor is spun and the ball is launched along the rim. When it settles, every bet is
   settled on the same number. The result card lists each bet (✓/✗, stake → payout), then the total
   stake, total payout, net profit/loss and new balance. The next round starts by itself after ~2.8 s
   with an empty bet list.
7. **Retire / Cash out**: retires immediately in READY. If pressed during a spin or a result, the
   cash-out happens right after the result is settled. If the balance reaches 0, the game ends
   (game over takes precedence over a pending cash-out). Both end screens show the session summary
   with **Play again** and **Main menu**.

### Table zones

The hit tolerance is 7 px around grid lines. Priority is **corner > edge > cell centre**.

| Where you click | Bet | Numbers | Pays |
|---|---|---|---|
| Centre of a number (or of 0) | Straight up (Pleno) | 1 | 35:1 |
| Line between two numbers | Split (Caballo) | 2 | 17:1 |
| Outer edge (top or bottom) of a column of three | Street (Transversal) | 3 | 11:1 |
| Intersection of four numbers | Corner (Cuadro) | 4 | 8:1 |
| Outer edge at the line between two streets | Six line (Línea doble) | 6 | 5:1 |
| Line between 0 and 1, 2 or 3 | Split with 0 | 2 | 17:1 |
| Point where 0 meets 1|2 or 2|3 | Trio (0-1-2 / 0-2-3) | 3 | 11:1 |
| Outer corner of the 0 line (by 1 or by 3) | First four (0-1-2-3) | 4 | 8:1 |
| 1st/2nd/3rd 12 | Dozen | 12 | 2:1 |
| 2 TO 1 | Column | 12 | 2:1 |
| 1-18, EVEN, ◆ red, ◆ black, ODD, 19-36 | Even money | 18 | 1:1 |

Probability is `covered / 37`. A win returns `stake × (payout + 1)`. Zero loses every outside bet
(none of them include 0).

## Architecture

One class per file (`src/`). Free functions and constants live in `src/utils/` and `src/config.js`.

| File | Responsibility |
|---|---|
| `main.js` | Creates the single p5 instance (instance mode), scales the 1120×760 logical canvas to the window |
| `Game.js` | Orchestrator: round lifecycle, wiring between models, UI and physics, timers |
| `GameState.js` | State machine with a whitelist of transitions, `spinUnlocked`, `retirePending` |
| `PhysicsWorld.js` | Owns the one Matter engine per session: fixed 1/180 s sub-steps, step and collision hooks, full cleanup |
| `RouletteWheel.js` | Stator (rim backstop, brass diamonds) and kinematic rotor (37 frets + hub), pocket lookup, drawing |
| `RouletteBall.js` | Ball body, force model, settle detection, fallbacks, pocket constraint |
| `BettingSystem.js` | Bet catalogue, payouts, settlement (pure logic) |
| `BettingTable.js` | Felt rendering, hover, hit detection (cells, edges, corners), chip markers, tooltip; reports clicks |
| `BetSlip.js` | The bets of the round being built: zones with their stakes, selected zone, chip operations, round outlook |
| `ChipControls.js` | Stake buttons (emit actions, applied to the selected zone) |
| `MoneyManager.js` | Balance invariants, deduct and credit |
| `SessionStats.js` | Spins, winning and losing bets, wagered, returned (each round recorded once) |
| `StressMeter.js` | Stress formula and gauge |
| `ReactionCam.js` | Face cam: 5 images, crossfade, zoom, shake, overlays, fallback |
| `TuLlaveCard.js` | Card and terminal animation, completion callback, failsafe |
| `UIManager.js` | DOM: balance, history, bet info, buttons, result card, overlays, toasts |

### State management

```
MENU → READY → BET_PLACED → SPINNING → RESULT → READY | GAME_OVER | RETIRED
READY → RETIRED            RETIRED / GAME_OVER → READY (Play again) | MENU (Main menu)
```

- `MENU` is an addition to the specified states (the title screen and the "Main menu" option).
- There is no `BET_PLACED → RETIRED` or `BET_PLACED → READY` transition, so a placed bet must be spun.
- `canSpin()` is true only in `BET_PLACED` with `spinUnlocked`. `unlockSpin()` succeeds once per round.
- The card callback carries the round id and session id, so a stale callback from an earlier round
  or session is ignored. The failsafe timeout (1.6 s) unlocks Spin even if frames stop or the image
  fails to load.
- Results are applied once (`round.resolved`, plus `SessionStats` keyed by round id). Game over is
  only evaluated after a result, so an All-in bet (balance temporarily 0) never ends the game early.
- **Play again** clears timers and the card, resets balance, stats and history, and destroys and
  recreates the Matter engine (bodies, constraints and listeners removed). Table and button listeners
  are registered once per page.

## Roulette physics (and simplifications)

The wheel is simulated **top-down in 2D**. Matter's gravity is off. Real rigid bodies and collisions
are used for the ball (`Bodies.circle`), the 8 brass diamonds, the 37 pocket frets and the central
hub. The result is read from where the ball actually comes to rest.

- **Rotor**: a static compound body (hub + frets) driven kinematically. Each sub-step it is rotated with
  `Body.setAngle(…, true)` and its per-step angular velocity is stored. Matter's contact solver then
  sees a moving wall, so frets push and drag the ball while the ball cannot push the rotor. Its speed
  decays exponentially toward a slow idle spin.
- **Bowl slope** (the 3D part): every sub-step the ball gets an inward acceleration toward the centre:
  1750 px/s² on the tilted bowl and 1100 px/s² over the rotor (more than ω²r, so the spinning rotor
  cannot fling the ball out of the pockets).
- **Rolling resistance**: on the stationary bowl, drag acts on the ball's absolute velocity. Over the
  rotor, "pocket floor friction" drags the ball toward the rotor's surface velocity. Matter's
  `frictionAir` is not used.
- **Rim**: a 120-segment polygon wall lost ~1 % of the ball's speed at every joint (the ball crosses
  one joint per sub-step at full speed). So the track wall is a **smooth circular contact constraint**
  (position projected onto the circle, outward radial velocity removed with 0.15 restitution). The
  Matter rim segments sit 3 px further out as a backstop. This is the main simplification.
- **Behaviour that emerges**: the ball rides the rim while `v²/r > g`. When it slows down it leaves the
  rim (median ≈ 5 s), may hit a diamond, drops onto the rotor, bounces off frets and comes to rest.
- **Settling**: the ball counts as settled when it has been inside the pocket ring and moving with the
  rotor (relative speed < 14 px/s) for 0.7 s. Its pocket is computed from its angle relative to the
  rotor, and a Matter `Constraint` then pins it to that pocket. Static bodies do not rotate constraint
  anchors, so the anchor is rotated with the rotor each step. Displayed number, ball position,
  highlighted pocket and payout therefore always agree.
- **Safety nets** (never triggered in testing): escape or NaN → ball put back on the rim. Ball inside
  the hub → pushed out. Speed clamped to 3400 px/s against tunnelling. After 22 s with no settle, a
  gentle spring guides the ball into the nearest pocket. After 30 s it is placed there.
- **Measured** (300 headless spins): all settled, median 6.9 s (6.3–8.2 s), 0 fallbacks, 0 escapes,
  result always equal to the pocket under the ball (and still there 3 s later). Chi-square over the
  37 pockets: 45.6 (df 36, 95 % bound ≈ 51), consistent with a fair wheel.

## Stress meter (fictional)

`stress = 100 · (0.65·R + 0.35·L)`, clamped to 0–100, where:

- `R = total stake / balance before the bet`
- `L` is the probability that the round loses money: the share of the 37 numbers whose combined
  payout is below the total stake. For a single bet this is `1 − covered/37`, as specified. With
  several bets it reflects hedging: Red + Black with equal stakes only loses on 0, so `L = 1/37`.

With no bets or a 0 stake, stress is 0. It updates when bets or stakes change (hover does not change it). After Place bet it keeps using the pre-deduction balance until the
round resolves. Levels: 0–19 Normal, 20–39 Expectant, 40–59 Stressed, 60–79 Very stressed, 80–100
Extreme nervousness. All in is always ≥ 83, so it is always Extreme. This is a game heuristic, not a
medical measurement.

The reaction cam follows the stress level. It shows at least Expectant while the ball rolls, Normal
after a win, and Extreme on game over.

## Assets

- `assets/reactions/{normal,expectant,stressed,very_stressed,extreme_nervous}.png`: placeholder
  streamer faces generated by `python3 tools/make_reactions.py` (SVG sources in
  `assets/reactions/src/`; PNG conversion uses macOS `qlmanage` and `sips`). To use your own, drop 4:3
  PNGs with the same names in that folder. A missing image shows a styled emoji fallback.
- `assets/card/tullave.png`: the provided TuLlave reference photo, drawn cropped to a rounded card. If
  it is missing, a vector card is drawn instead.
- `assets/table_reference.png`: the provided felt layout reference.

## Known limitations

- Desktop-first layout (minimum width 1024 px). The canvas scales to fit, but there is no phone layout.
- The 3D bowl is approximated by radial forces in a 2D top-down world (see above). The ball does not
  hop above the frets in 3D.
- The rim is a smooth constraint rather than Matter collision geometry, for the energy reason above.
- No sound.
- If the tab is hidden, the browser pauses `requestAnimationFrame`, so the spin pauses with it. The
  card failsafe still unlocks Spin by timer.

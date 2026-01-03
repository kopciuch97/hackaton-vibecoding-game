# HACKATHON PROJECT: "Boldare Run: Sprint to MVP"
**Goal:** A browser-based 2D endless runner built in 4 hours.
**Tech:** HTML5 Canvas + Vanilla JS. Single file architecture prefered for MVP.

## THEME: "The Boldare Way"
- **Player:** A Boldare Developer/Product Designer (abstract representation first).
- **Goal:** Run as far as possible in the "Sprint".
- **Obstacles:** "Legacy Code", "Bugs", "Blockers".
- **Collectibles:** "Insights", "Feedback".
- **Visual Style:** Boldare Brand Colors (Orange #FFA500, Black #111, White #FFF). Clean, minimalist, agile.

### Cyberpunk Parallax Background (3 Layers)

| Layer | Speed | Elements                                                                                      |
|-------|-------|-----------------------------------------------------------------------------------------------|
| **Far** | 0.15x | Retro-wave perspective grid (neothin green `#00FF88`), binary code rain (0s/1s in dark green) |
| **Mid** | 0.4x | Server rack silhouettes (`#1a1a1a`) with blinking LEDs, city buildings with lit windows       |
| **Near** | 0.2-0.3x | 30 dust particles (white/cyan), 5 horizontal data streams (cyan gradient trails)              |

- All layers extend to full canvas height (no gaps in pits)
- Gradient sky: `#000022` (top) to `#111` (bottom)

---

## GAME RULES

### Controls
| Key | Action |
|-----|--------|
| **Arrow Up** / **Space** | Jump (from ground only) |
| **Arrow Left** | Jetpack thrust (hold, if fuel > 0) |
| **Arrow Right** | Shoot Hotfix |
| **Arrow Down** | Crouch (ground) / Fast Fall (air) |

### Player ("Boldare Developer" Character)
- Procedural character (50x50 px hitbox, `baseHeight: 50`)
- **Visual**: Developer in orange hoodie, glasses, holding laptop
- **Head**: Dark circle with white glasses (cyan lenses)
- **Body**: Orange hoodie `#FFA500` with hood detail
- **Legs**: Dark pants, animated swing when running
- **Laptop**: Silver with glowing screen (shows animated code lines)

**Animations:**
- **Running**: Legs swing back/forth, subtle breathing bob
- **Jumping**: Legs bent up in jump pose
- **Crouching**: Huddled pose over laptop
- **Jetpacking**: Body turns blue, flame shoots from laptop!
- **Fast Falling**: Body turns yellow-orange with white glow

**Physics:**
- Gravity: `0.8`
- Jump power: `-18`
- Crouch height: 50% (`CROUCH_HEIGHT_RATIO: 0.5` = 25px)
- Can land on ground blocks and platforms (one-way collision)
- Cannot jump while crouching

### Obstacles (3 Thematic Types)

| Obstacle | Visual | Size | How to avoid | Points |
|----------|--------|------|--------------|--------|
| **Bug/Legacy Code** | Red glitchy block with "FIX ME!" text, jagged edges, corrupt pixels | 30-50w × 40-80h | Jump over | +25 (shoot) |
| **Scope Creep** | Purple monolith with pyramid top, pulsing "?/!" symbol, "SCOPE CREEP" text | 40w × 100h | Shoot with Hotfix | +100 (shoot) |
| **Notification Ping** | Orange speech bubble with red badge, "@" icon, "PING" text | 60w × 20h | Crouch/Dive under | +25 (shoot) |

**Impact Effects (on hit):**
- Bug: "Bug Fixed!", "Refactored!", "Clean Code!", "Debugged!" (green text)
- Scope Creep: "Scope Handled!", "Requirements Met!", "Change Accepted!" (purple text)
- Ping: "Ping Dismissed!", "Notification Off!", "@Handled!" (orange text)
- Text floats upward and fades out with glow

**Spawn pattern (RHYTHMIC mode - Sprint pattern):**
- Cycle: `Bug → Bug → Flying → Bug → PO` (repeating)
- Fixed interval: every `400px` (`RHYTHMIC_SPAWN_INTERVAL`)

**Spawn rates (Island/Risk patterns):**
- Bug: **70-80%** (primary, safe to jump)
- Flying: **20-30%** (grounded to terrain height)

**Fair play rules:**
- Flying obstacle never spawns in gaps (only ON ground/platforms)
- All obstacles spawn relative to terrain height (grounded)
- PO Change never spawns twice in a row

### Collectibles

| Collectible | Visual | Size | Effect |
|-------------|--------|------|--------|
| **Coffee** | White paper cup with brown sleeve, lid, 3 animated steam lines | radius 15 | +1 Hotfix ammo, +50 points |
| **AI Booster** | Blue chip/circuit board with silver pins, pulsing AI core, neural network pattern | 30×30 | +40 fuel, +100 points |

### Projectiles (Hotfixes)
- **Visual**: Code syntax `</>` and `{ }` in cyan/white
- **Trail**: 8-segment speed lines behind projectile
- **Glow**: Cyan `#00FFFF` glow effect

**Coffee Spawn Rates (reduced for rarity):**
- Connectors: 15%
- Sprint end: 10%
- Island gap platforms: 15%
- High Road high platforms: 20%
- Risk & Reward upper: 25%

### Ammo System (Hotfixes)
- Start with: `3`
- Max capacity: `5` (`maxAmmo`)
- Cooldown: `500ms` (`shootCooldown`)

### Fast Fall / Dive
**Activation:** In air (`!grounded`) + holding **Down/S**

**Effects:**
- Crouched hitbox (50% height) for diving under flying obstacles
- Disables jetpack while active (gravity wins)
- No extra speed boost (`FAST_FALL_ACCELERATION: 0`)

**Visual feedback:**
- Player turns yellow-orange `#FFCC00` with white glow
- White wind trail particles stream upward

### Jetpack Fuel System (AI Power)
**Resource:** `jetpackFuel` (0 to 100)
- Start with: `0` fuel
- Max capacity: `100` (`JETPACK_MAX_FUEL`)
- Fuel per pickup: `+40` (`JETPACK_FUEL_PER_PICKUP`)

**Activation conditions (ALL must be true):**
1. Holding **Left Arrow** (`keys.left`)
2. `jetpackFuel > 0`
3. NOT fast falling (`!isFastFalling`)

**Physics:**
- Thrust force: `-1.2` per frame (`JETPACK_THRUST`)
- Fuel consumption: `0.5` per frame (`JETPACK_FUEL_CONSUMPTION`)
- Max upward velocity: `-12` (`JETPACK_MAX_UP_VELOCITY`)
- Gravity still applies (thrust counteracts it)

**Visual feedback:**
- Player/hoodie turns blue `#00AAFF` with glow when thrusting
- Flame shoots from laptop when thrusting
- Subtle blue glow when has fuel but not thrusting
- Fire particles emit from player when thrusting
- Vertical fuel bar on left side of HUD

**Gameplay:**
- Works from ground (vertical takeoff) or air (hover/fly)
- Normal jump from ground always works
- Fuel is stackable (collect multiple boosters)

### Terrain (HARD MODE Geometry + FAIR Obstacle Spacing)

**Obstacle Spacing (generous reaction time):**
- Base spacing: `350px` (`BASE_OBSTACLE_SPACING`)
- Speed factor: `+12px` per gameSpeed (`SPEED_SPACING_FACTOR`)
- At speed 6: ~422px between obstacles
- At speed 15: ~530px between obstacles
- Rhythmic interval: `450px` (`RHYTHMIC_SPAWN_INTERVAL`)

**Gap/Buffer Constants (HARD MODE gaps, GENEROUS buffers):**
- Gap width: `160-200px` (`MIN_GAP_WIDTH` to `MAX_GAP_WIDTH`) - pushed to jump limit!
- Entry buffer: `120px` - plenty of safe landing space
- Exit buffer: `150px` - lots of time to prepare jump
- Connector width: `200px` (`CONNECTOR_WIDTH`)
- Green neon platforms `#00FF88` above gaps (80-120px helper platforms)

**Grounding System (CRITICAL):**
- `getGroundHeightAt(x)` - returns terrain height at X position
- `hasGroundAt(x)` - returns true if solid ground exists
- All obstacles spawn ONLY on solid ground/platforms
- Flying obstacles positioned relative to terrain height

**4 Terrain Patterns (HARD MODE with mini-connectors):**

| Pattern | Width | Description |
|---------|-------|-------------|
| **The Sprint** | ~1300px | 4-5 segments with stepped heights (`STEP_HEIGHT: 50px`). RHYTHMIC obstacles every 450px. Edge guarding (60% chance). |
| **Island Hopping** | ~1400px | 4-5 tiny islands (`150-250px` each). Wide gaps (160-200px). Edge-placed obstacles (70% chance). NO flying in gaps. |
| **The High Road** | ~1200px | 5-6 wider platforms (`200-280px`). Flying obstacles in CENTER (35% chance) - land first, then duck. |
| **Risk & Reward** | ~1300px | Lower path: rhythmic obstacles. Upper platforms (4 escape routes): rewards only. |

**Mini-Connectors (200px safe zones):**
- Flat ground between every pattern
- 15% chance of coffee reward (rare)
- Allows player to land and reset mentally
- Resets obstacle type tracking

**Pattern Flow:**
- Mini-connector before each new pattern
- Same pattern never repeats back-to-back
- Starting zone: 500px (comfortable start)

- Falling into pit = Game Over

### Scoring & Difficulty
- +1 point per frame survived
- Speed increases by `0.5` every `500` points
- Starting speed: `6` (`gameSpeed`)
- Max speed: `15` (`maxSpeed`)
- High score saved in `localStorage` key: `boldareRunHighScore`

### Game Over
- Collision with any obstacle
- Falling into a pit (player.y > canvas.height)
- Press **Space** to restart

---

## CODING GUIDELINES (FOR CLAUDE CODE CLI)
- **Files:** Keep logic in `game.js`, structure in `index.html`, styles in `style.css`.
- **Method:** Iterative. Do not break existing features
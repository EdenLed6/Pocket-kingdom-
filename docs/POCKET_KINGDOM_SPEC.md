# Pocket Kingdom — Build Specification

> **Game name:** Pocket Kingdom (פוקט קינגדום).
> **For:** Claude Code, single-developer build.
> **Author:** Eden.
> **Format:** Mobile-first pixel-art city builder for Android.

---

## הקדמה (קצרה)

מסמך זה הוא מפרט הבנייה המלא של המשחק. הוא כתוב באנגלית כי הוא ניתן ל-Claude Code כקלט ראשי, וזה התחביר שעובד הכי טוב לקוד.
ההחלטות הטכניות נלקחו לפי ההיסטוריה שלך: Web stack שאת מכירה (TypeScript / Vite) + Capacitor ל-Android, אותו דפוס ש-Claude Code בנה לפניו אצלך.
**הסטאק:** Phaser 4 + TypeScript + Vite + Capacitor.
**האסטרטגיה:** לבנות בשלבים (Phase 0–7), כל שלב מסתיים במשחק שעובד ניתן להרצה — לא לבנות הכל ואז לבדוק.

---

## 0. Prime Directive for Claude Code

Read this entire spec **before writing any code**. Do not skim.

**Hard rules:**
1. **Build in phases.** Do not start Phase N+1 until Phase N is fully runnable on a desktop browser. Each phase ends in a working, testable game state.
2. **Confirm before installing.** Before running `npm install` for any dependency not listed in §2, stop and ask the user.
3. **Ask clarifying questions at decision points** (marked `[DECISION POINT]` throughout this spec). Do not invent answers.
4. **Verify Phaser 4 APIs before using them.** If unsure about a method signature, fetch the Phaser 4 docs page rather than guessing.
5. **Use the Phaser 4 AI agent skills.** Phaser 4 ships with a `skills/` folder containing 28 skill files purpose-built for AI coding agents. Before implementing any Phaser subsystem (Scenes, Tilemaps, Input, Tweens, Cameras, Physics, GameObjects, Audio, etc.), read the matching skill file from `node_modules/phaser/skills/` (or the GitHub repo). This is non-negotiable — these skills exist precisely for this workflow.
6. **Mobile-first.** All UI must be designed for a portrait phone screen first (≈ 1080×1920 logical). Desktop is for development only.
7. **Pixel-perfect rendering.** Use `pixelArt: true` in Phaser config. Never anti-alias sprites.
8. **No premature optimization.** Get the system working, then profile.
9. **Save work-in-progress with git after every phase.** Commit message format: `phase-{N}: {summary}`.

**Soft rules:**
- Comments in code: English. Short and explanatory, not narrating obvious code.
- Filenames: `kebab-case.ts`. Class names: `PascalCase`. Variables: `camelCase`.
- Prefer composition over inheritance.
- One Phaser Scene per major game state (Boot, Preload, Game, UI overlay).

**When you (Claude Code) are uncertain:**
> Stop. State the ambiguity. List the 2–3 reasonable options. Wait for the user.

---

## 1. Vision & Scope

### 1.1 Genre & Inspiration
- **Genre:** Real-time, single-player, top-down 2D pixel-art city builder with light combat.
- **Inspiration:** Age of Mythology resource gathering loop, Stardew Valley / Tiny Swords visual style, Kingdom: Two Crowns simplicity of input.
- **Mood:** Cute medieval village, daytime, optimistic.

### 1.2 Platform
- **Primary:** Android (portrait orientation, touch input).
- **Secondary:** Desktop browser (development & testing only).
- **Wrapping:** Capacitor → Android Studio → APK / Play Store.

### 1.3 Core Loop
```
Gather (wood / stone / food)
  → Build (houses, production, military)
    → Defend (against scaling bandit raids)
      → Expand (more workers, better units, bigger map)
        → repeat
```

### 1.4 MVP Scope (what is IN)
- One fixed map (~40×60 tiles, vertical / portrait friendly).
- 3 starting workers, recruitable up to ~12.
- 3 resources: **Wood, Stone, Food**. (No gold in MVP.)
- 10 building types (see §4.4).
- 3 military unit types.
- Bandit raids on a timer, scaling with player power (formula in §4.7).
- Local save/load (single slot, `localStorage`).
- Touch controls: pan, pinch-zoom, tap-to-select, tap-to-place.

### 1.5 Out of Scope (NOT in MVP)
- Multiplayer.
- Procedural map generation.
- Day/night cycle.
- Tech tree / research.
- Multiple save slots.
- In-app purchases / ads.
- Cloud sync.
- Multiple maps / campaign.
- Achievements.

These are tracked in §12 (Stretch Goals).

---

## 2. Tech Stack

### 2.1 Core Stack (do not deviate without asking)
| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript 6+** | Type safety for game state. (TS 7 is in beta — Go-based, 10× faster, but stick with stable 6.) |
| Game engine | **Phaser 4.1+** | Latest major release (Apr 2026). New WebGL renderer, mostly compatible API with v3. **Critical:** ships with 28 AI-agent skill files designed for tools exactly like Claude Code. |
| Bundler | **Vite 8+** | Fast HMR, native TS support. v8 (Mar 2026) uses Rolldown internally — faster builds, mostly drop-in compatible. |
| Mobile wrap | **Capacitor 8+** | Wraps web app as native Android app. **Requires Node 22+** and Android Studio Otter (2025.2.1) or newer. |
| State | **Plain TS classes + event emitter** | No Redux/Zustand needed; Phaser scenes own their state. |
| Persistence | **localStorage** (MVP) → **Capacitor Preferences plugin** (release) | Simple, no backend needed. |
| Audio | **Phaser built-in audio** | Sufficient for MVP. |

### 2.2 Dev Dependencies (install in Phase 0)
```
phaser                    ^4.1.0
typescript                ^6.0.0
vite                      ^8.0.0
@capacitor/core           ^8.3.0
@capacitor/cli            ^8.3.0
@capacitor/android        ^8.3.0
@capacitor/preferences    ^8.0.0
```

> Versions reflect May 2026. Always run `npm install <pkg>@latest` for each — do not pin older majors. If `npm install phaser@latest` resolves to anything below 4.0, stop and ask the user.

### 2.3 Project Structure
```
pocket-kingdom/
├── android/                  # Capacitor-generated Android project (Phase 7)
├── public/
│   └── assets/
│       ├── tiles/            # tilemap pngs
│       ├── sprites/          # workers, buildings, units, bandits
│       ├── ui/               # icons, panels
│       ├── audio/            # sfx + music
│       └── tilemaps/         # .json from Tiled (optional) or hand-built
├── src/
│   ├── main.ts               # entry point, Phaser game config
│   ├── scenes/
│   │   ├── BootScene.ts
│   │   ├── PreloadScene.ts
│   │   ├── GameScene.ts      # the world / map
│   │   └── UIScene.ts        # HUD overlay (separate scene, runs in parallel)
│   ├── systems/
│   │   ├── ResourceSystem.ts
│   │   ├── WorkerSystem.ts
│   │   ├── BuildingSystem.ts
│   │   ├── CombatSystem.ts
│   │   ├── RaidSystem.ts
│   │   ├── PowerSystem.ts
│   │   └── SaveSystem.ts
│   ├── entities/
│   │   ├── Worker.ts
│   │   ├── Building.ts
│   │   ├── Soldier.ts
│   │   ├── Bandit.ts
│   │   └── Resource.ts       # tree, rock, animal, crop
│   ├── data/
│   │   ├── buildings.ts      # building definitions (data-driven)
│   │   ├── units.ts          # unit definitions
│   │   ├── tiles.ts          # tile definitions
│   │   └── balance.ts        # all tunable numbers in one place
│   ├── ui/
│   │   ├── HUD.ts            # top bar resources, time
│   │   ├── BuildMenu.ts
│   │   ├── WorkerPanel.ts
│   │   └── components/
│   ├── input/
│   │   └── TouchController.ts
│   └── utils/
│       ├── pathfinding.ts    # A* on tilemap
│       ├── events.ts         # global event emitter
│       └── math.ts
├── capacitor.config.ts
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## 3. Project Setup (Phase 0)

### 3.1 Environment Requirements

Before running any commands, verify:
- **Node.js ≥ 22** (Capacitor 8 requires it). Check: `node -v`.
- **Android Studio Otter (2025.2.1)** or newer.
- **JDK 21** (ships with Android Studio Otter, no separate install needed).
- **Android SDK:** minSdk 24, compileSdk 36, targetSdk 36.

If Eden's machine doesn't meet these, stop and tell her exactly what to upgrade.

### 3.2 Setup Commands

```bash
npm create vite@latest pocket-kingdom -- --template vanilla-ts
cd pocket-kingdom
npm install phaser
npm install -D @types/node
npm install @capacitor/core @capacitor/cli
npx cap init "Pocket Kingdom" "com.eden.pocketkingdom"
npm install @capacitor/android @capacitor/preferences
```

Add to `vite.config.ts`:
```ts
export default defineConfig({
  base: './',           // critical for Capacitor (relative paths)
  build: { outDir: 'dist' },
  server: { host: true } // for testing on phone via LAN
});
```

Add to `capacitor.config.ts`:
```ts
const config = {
  appId: 'com.eden.pocketkingdom',
  appName: 'Pocket Kingdom',
  webDir: 'dist',
  android: { allowMixedContent: false },
};
```

Phaser game config (`src/main.ts`):
```ts
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: 540,           // logical width (portrait)
  height: 960,          // logical height
  pixelArt: true,
  backgroundColor: '#7AC74F',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    orientation: Phaser.Scale.PORTRAIT,
  },
  scene: [BootScene, PreloadScene, GameScene, UIScene],
};
```

Logical resolution is fixed at **540×960** — gives crisp pixels on most phones, matches the reference image's pixel size; the canvas scales up via `Phaser.Scale.FIT`.

---

## 4. Game Design

### 4.1 Core Loop (detailed)

**Real-time, no pause** (pause via menu only). Game speed: 1× (option for 2× in stretch).

A typical 10-minute session:
1. Player starts with 3 workers, a Town Hall, 50 wood, 30 stone, 50 food.
2. Player taps a tree → assigns a worker → worker walks, chops, returns wood to Town Hall (or nearest storage).
3. Player accumulates ~80 wood → builds a House (population +3) and a Lumber Mill (wood production buff).
4. Around the 3-minute mark, a small bandit raid spawns (2 bandits) — kills any unprotected worker.
5. Player builds Barracks, trains 2 spearmen.
6. Raids escalate. By 8 minutes, raids include 5–8 bandits with mixed unit types.
7. Goal: survive raids while continuing to expand. (No win condition in MVP — endless mode.)

### 4.2 Resources

| Resource | Source | Storage cap (start / per-warehouse) | Notes |
|---|---|---|---|
| **Wood** | Trees on map (chopped by workers). Renewable: trees regrow after 3 min. | 200 / +200 | Most-used resource. |
| **Stone** | Rock outcrops on map. Limited; new outcrops appear at edges over time. | 150 / +150 | Used for walls, towers, advanced buildings. |
| **Food** | (a) Farm building (renewable, slow), (b) Hunt animals on map (fast burst). | 200 / +200 | Soldiers and workers consume food passively. |

**Food consumption:** Each worker consumes 1 food per 30 sec. Each soldier consumes 2 food per 30 sec. If food = 0, units lose HP slowly (no immediate death).

### 4.3 Workers

- **Start count:** 3.
- **Max count:** capped by total population housing (Town Hall = 5 cap, each House = +3 cap, max ~20).
- **Hire cost:** 30 food, 20 wood. Trained at Town Hall. 10 sec training.
- **States (FSM):** `idle` | `moving` | `gathering` | `carrying` | `building` | `fleeing`.
- **Carry capacity:** 5 units of any resource. Drops at nearest storage building.
- **HP:** 20. Workers do NOT fight back. If a bandit is within 4 tiles, worker switches to `fleeing` (move toward Town Hall).

**Assignment model:**
- Tap a worker → worker is selected (highlight).
- Tap a target (tree / rock / animal / crop / build site) → worker assigned to that task.
- Tap the same worker again → deselect.
- Long-press a tree/rock → assign ALL idle workers to that resource type (quality-of-life).

### 4.4 Buildings

All buildings are placed on a 1×1, 2×2, or 3×3 tile footprint.

| ID | Name | Footprint | Cost | Build time | Function | Prereq |
|---|---|---|---|---|---|---|
| `town_hall` | Town Hall | 3×3 | (starting) | — | Resource drop-off, trains workers, can be only 1, HP 500. | — |
| `house` | House | 2×2 | 30W | 15s | +3 population cap. HP 100. | — |
| `lumber_mill` | Lumber Mill | 2×2 | 50W, 20S | 25s | Workers depositing wood here get +50% efficiency. HP 150. | — |
| `quarry` | Quarry | 2×2 | 40W, 30S | 25s | Workers depositing stone here get +50%. HP 150. | — |
| `farm` | Farm | 2×2 | 40W | 20s | Generates 1 food / 5 sec passively (no worker needed). HP 80. | — |
| `hunters_lodge` | Hunter's Lodge | 2×2 | 50W, 10S | 25s | Animal kills give +30% food. HP 120. | — |
| `barracks` | Barracks | 3×3 | 80W, 40S | 35s | Trains soldiers. HP 200. | 1 House |
| `wall` | Wall segment | 1×1 | 10S | 5s | Blocks bandit movement. HP 200. | — |
| `tower` | Tower | 2×2 | 30W, 60S | 30s | Auto-attacks bandits in 5-tile range. HP 250, dmg 15 / 2sec. | Barracks |
| `warehouse` | Warehouse | 2×2 | 60W, 30S | 25s | Increases storage cap by +200 wood, +150 stone, +200 food. HP 150. Stackable — each warehouse adds capacity. | Lumber Mill OR Quarry |

**Confirmed:** Warehouse is in MVP. HUD must show current cap dynamically based on how many warehouses are built.

**Placement rules:**
- Building placement uses a "ghost" preview. Green = valid, red = invalid.
- Invalid: overlapping another building, on water, on a resource node, outside map bounds.
- Player can cancel placement with a back button.

### 4.5 Map & Tiles

- **Size:** 40 wide × 60 tall tiles. Tile size: 32×32 px.
- **Tile types:** `grass`, `dirt_path`, `forest_floor`, `water`, `stone_ground`, `bridge`.
- **Resource nodes (placed on top of tiles):**
  - `tree` (chop → wood, regrows in 3 min)
  - `rock` (mine → stone, does not regrow; new ones spawn at map edges every 5 min, max 30 on map)
  - `animal` (deer wandering; hunt → food, respawn 2 min after kill)
  - `bush` (forageable → food, regrows 1 min)
- **Initial map composition:** ~25% trees, ~5% rocks, ~3% animals, ~2% water, rest grass. Town Hall placed at map center-bottom.
- **Map representation:** static JSON file (`public/assets/tilemaps/main.json`). Editable later with Tiled if needed.

### 4.6 Combat

#### Soldier types

| ID | Name | Cost | Train time | HP | Damage | Range | Speed | Counter |
|---|---|---|---|---|---|---|---|---|
| `spearman` | Spearman | 30W, 10S, 20F | 15s | 50 | 8 | 1 tile (melee) | 60 px/s | Bandit grunt |
| `archer` | Archer | 20W, 10S, 30F | 18s | 35 | 12 | 5 tiles (ranged) | 70 px/s | Bandit grunt at range |
| `knight` | Knight | 60W, 50S, 50F | 30s | 120 | 18 | 1 tile (melee) | 50 px/s | Bandit raider boss |

Soldiers have 4 stances:
- `guard` (stay in place, attack anything in range)
- `patrol` (move between 2 player-set points)
- `follow` (follow another unit)
- `attack-move` (move to point, attack on the way)

Default: `guard` near barracks.

#### Bandit types

| ID | HP | Damage | Speed | Behavior |
|---|---|---|---|---|
| `bandit_grunt` | 30 | 6 | 65 px/s | Attacks nearest worker/building. |
| `bandit_archer` | 25 | 9 | 60 px/s | Kites; range 4 tiles. |
| `bandit_raider` | 80 | 14 | 70 px/s | Targets Town Hall. |

### 4.7 Bandit Raids & Power Scaling — **the key formula**

Eden's requirement: bandit power must be proportional to player power.

#### 4.7.1 Player Power (`P_player`)

```
P_player =
    Σ (building.hp_max * 0.5)         // every standing building
  + Σ (worker × 5)                    // each living worker
  + Σ (soldier.cost_total × 1.0)      // each living soldier (cost = wood + stone + 2*food)
  + (resource_stockpile_sum × 0.05)   // discourages hoarding
```

Recompute every 5 seconds.

#### 4.7.2 Raid Schedule

- **First raid:** 180 sec after game start, regardless of power.
- **Subsequent raids:** every `90 + rand(0, 60)` seconds.

#### 4.7.3 Bandit Power per Raid (`P_raid`)

```
difficulty_multiplier(t) =
    0.40   if t <  300 sec        // gentle intro
    0.55   if t <  600 sec
    0.70   if t <  900 sec
    0.85   if t < 1200 sec
    1.00   otherwise               // stop scaling at 1.0× to keep game beatable

P_raid = P_player × difficulty_multiplier(t)
```

**Cap:** `P_raid` cannot exceed `P_player × 1.1` ever, and cannot be less than 20 (so the first raid is always a real threat even if player has done nothing).

#### 4.7.4 Composition

Distribute `P_raid` across bandits using their "power cost":

| Unit | power_cost |
|---|---|
| `bandit_grunt` | 15 |
| `bandit_archer` | 22 |
| `bandit_raider` | 50 |

Algorithm (greedy):
```
remaining = P_raid
units = []
while remaining > 50 and rand() < 0.3:
   units += bandit_raider; remaining -= 50
while remaining > 22 and rand() < 0.5:
   units += bandit_archer; remaining -= 22
while remaining > 15:
   units += bandit_grunt; remaining -= 15
```

Cap total bandits per raid at 25 (performance + readability).

#### 4.7.5 Spawn

Bandits spawn from a random map edge tile, in a single group. They walk toward the Town Hall, attacking anything in their path.

**Player warning:** 10 seconds before raid spawns, show a top-of-screen banner: ⚠️ "A raid is approaching!" + a directional arrow on the edge they will spawn from. Audio cue: drum stinger.

---

## 5. Data Models (TypeScript interfaces)

Place all in `src/data/` or `src/entities/`.

```ts
// src/data/types.ts
export type ResourceType = 'wood' | 'stone' | 'food';
export type Resources = Record<ResourceType, number>;

export interface Position { x: number; y: number; }    // pixel coords
export interface TileCoord { tx: number; ty: number; } // tile coords

export interface BuildingDef {
  id: string;
  name: string;
  footprint: { w: number; h: number };
  cost: Partial<Resources>;
  buildTimeSec: number;
  hpMax: number;
  prerequisites?: string[];   // building ids
  placementRules?: ('on_grass' | 'not_on_water' | 'not_on_resource')[];
}

export interface UnitDef {
  id: string;
  name: string;
  cost: Partial<Resources>;
  trainTimeSec: number;
  hpMax: number;
  damage: number;
  rangeTiles: number;
  speedPxPerSec: number;
  side: 'player' | 'bandit';
}

export type WorkerState =
  | { kind: 'idle' }
  | { kind: 'moving'; target: Position }
  | { kind: 'gathering'; nodeId: string; resource: ResourceType }
  | { kind: 'carrying'; resource: ResourceType; amount: number; dropoffId: string }
  | { kind: 'building'; siteId: string }
  | { kind: 'fleeing' };

export interface Worker {
  id: string;
  pos: Position;
  hp: number;
  state: WorkerState;
  inventory: { resource: ResourceType; amount: number } | null;
}

export interface BuildingInstance {
  id: string;
  defId: string;
  tile: TileCoord;
  hp: number;
  isConstructed: boolean;
  buildProgress: number; // 0..1
}

export interface UnitInstance {
  id: string;
  defId: string;
  pos: Position;
  hp: number;
  target: { kind: 'unit' | 'building'; id: string } | null;
  stance: 'guard' | 'patrol' | 'follow' | 'attack-move';
}

export interface GameState {
  resources: Resources;
  populationCap: number;
  workers: Worker[];
  buildings: BuildingInstance[];
  units: UnitInstance[];      // player units
  bandits: UnitInstance[];    // hostile units
  resourceNodes: ResourceNode[];
  elapsedSec: number;
  nextRaidAtSec: number;
  difficultyTier: number;     // for UI display
}
```

All numerical balance values live in **`src/data/balance.ts`** as named exports — never inline magic numbers in systems.

---

## 6. Game Systems

Each system is a class with `update(dt: number, state: GameState)` called from `GameScene.update()`.

### 6.1 ResourceSystem
- Tracks current resources, caps them at storage limits.
- Emits `'resource_changed'` event on change (HUD listens).
- Handles food consumption tick (every 30 sec, subtract `(workers + 2*soldiers)`).

### 6.2 WorkerSystem
- Owns the FSM transitions for each worker.
- Pathfinding via A* on the tile grid (`src/utils/pathfinding.ts`).
  - Walkable check: not water, not building (unless target is the building), not blocked by wall.
- Implements gather logic: walk to node → wait `gatherTimeSec` → inventory += yield → walk to nearest dropoff → drop.
- `nearest dropoff` = nearest building of type `town_hall | lumber_mill | quarry | hunters_lodge` matching the resource.

### 6.3 BuildingSystem
- Handles placement (preview ghost, validation).
- Construction lifecycle: `placed` (0% HP, ghost) → workers assigned → progress accumulates → `built` (full HP, functional).
- Construction speed: 1 worker = 1 build-progress / sec. Multiple workers stack (cap at 3 workers per site).

### 6.4 CombatSystem
- Generic for player units and bandits.
- Targeting: pick nearest enemy in range (or assigned target).
- Damage application: instantaneous on attack tick. No projectile entities for MVP (just a flash effect).
- Death: HP ≤ 0 → remove entity, spawn small "puff" particle.

### 6.5 RaidSystem
- Tracks `nextRaidAtSec`.
- On trigger: compute `P_player`, then `P_raid`, then composition (§4.7.4).
- Picks a random edge tile, spawns warning banner, waits 10 sec, spawns bandits.
- Bandits added to `state.bandits`.
- Logs raid summary to console for tuning.

### 6.6 PowerSystem
- Recomputes `P_player` every 5 sec. Caches the value.
- Used by RaidSystem and (optionally) shown on a debug HUD.

### 6.7 SaveSystem
- Auto-save every 30 sec.
- Manual save on app pause / close.
- Serializes `GameState` to JSON, writes to `localStorage` key `pocket_kingdom_save_v1`.
- On boot: if save exists, prompt "Continue / New Game".
- **Versioning:** Include `saveVersion: 1` in the JSON. On load, if version mismatch → discard with warning.

---

## 7. UI / UX

UI runs in a **separate Phaser Scene** (`UIScene`) launched in parallel with `GameScene`. The UI scene listens to global events and renders DOM-style elements via Phaser.

### 7.1 HUD (top of screen, always visible)

Layout (portrait):
```
┌─────────────────────────────────────────────┐
│ 🪵 142 / 200    🪨 88 / 150    🍞 56 / 200    │   ← resources
│ 👥 8 / 11        ⏱ 04:23                      │   ← pop / time
└─────────────────────────────────────────────┘
```

### 7.2 Build Menu (bottom of screen)

Floating bottom button: 🏠 **BUILD**.
Tap → drawer slides up showing buildings as cards with icon, cost, lock state.
Tap a card → enter placement mode → drawer hides → ghost follows finger.
Tap on map → place. Drag finger → move ghost. Two-finger tap → cancel.

### 7.3 Selection Panel (bottom, contextual)

When a unit/building is selected:
- Worker selected: show "Idle / Gathering wood" state, button "Send home".
- Building selected: show HP bar, build progress (if not done), action buttons:
  - Town Hall: 👤 Train Worker (cost shown).
  - Barracks: ⚔ Train Spearman / 🏹 Archer / 🛡 Knight.
  - House / Mill / etc.: just info.

### 7.4 Raid Warning

Top banner appears on raid trigger (10 sec before):
```
⚠️ Raid incoming! ←  (arrow points to spawn edge)
   8 bandits, 0:10
```
Red flashing border on screen edge during the warning.

### 7.5 Touch Controls (`TouchController.ts`)

| Gesture | Action |
|---|---|
| Single tap on entity | Select |
| Single tap on empty tile (with selection) | Issue order (move / attack-move / gather) |
| Single tap on empty tile (no selection) | Deselect |
| Drag with one finger | Pan camera |
| Pinch with two fingers | Zoom (between 0.7× and 2.0×) |
| Long-press on resource node | Assign all idle workers to that resource type |
| Long-press on enemy | Send all idle soldiers to attack |

**Critical:** Distinguish tap vs drag using a 10 px / 200 ms threshold. Otherwise pan will fire selection events.

### 7.6 Pause Menu

Hamburger icon top-right. Opens overlay: Resume / Save / Load / Settings / Quit to Menu.

**Settings overlay contents (MVP):**
- Master / Music / SFX volume sliders.
- "Reset Progress" button (with confirmation dialog — destroys save).

---

## 8. Art & Audio Assets

### 8.1 Pixel Art Style Guidelines

- **Tile size:** 32×32 px. All sprites snap to this grid.
- **Palette:** Warm, saturated. ~30 colors total. Reference Eden's image: red roofs, vibrant greens, soft pinks (cherry trees), warm wood tones, gray cobblestone.
- **No anti-aliasing** in sprites. Crisp pixels.
- **Outline:** Optional 1-px dark outline on units (helps them stand out on grass).
- **Animation framerate:** 6–8 fps for sprite anims (worker walk: 4 frames, attack: 3 frames).

### 8.2 Recommended Asset Packs (CC0 / free for commercial use)

The image style Eden uploaded matches **Pixel Frog "Tiny Swords"** very closely.

**Primary pack:**
- **Tiny Swords by Pixel Frog** (free + paid tiers on itch.io). License permits commercial use. Has units, buildings, terrain, and effects already aligned to this style. → https://pixelfrog-assets.itch.io/

**Supplementary:**
- **Kenney "Tiny Town" / "Tiny Dungeon"** (CC0). → https://kenney.nl/assets
- **OpenGameArt LPC tilesets** for fillers if needed.

`[CONFIRMED]` — Use **Tiny Swords by Pixel Frog**. Other packs are listed as supplementary fillers only.

### 8.3 Asset Manifest (to populate during Preload)

```
tiles/terrain.png              tilemap, 32×32
sprites/worker.png             4×4 frame strip (idle, walk-down, walk-side, walk-up)
sprites/spearman.png
sprites/archer.png
sprites/knight.png
sprites/bandit_grunt.png
sprites/bandit_archer.png
sprites/bandit_raider.png
buildings/town_hall.png
buildings/house.png
... (one per building)
ui/icons.png                   icon atlas
ui/panel.9.png                 9-slice panel (use Phaser nineslice)
audio/sfx/chop.ogg
audio/sfx/build.ogg
audio/sfx/sword.ogg
audio/sfx/raid_warning.ogg
audio/music/village_loop.ogg
```

### 8.4 Audio
- BGM: 1 looping village track during normal play.
- BGM: 1 tense track during raids.
- SFX: chop, mine, build-place, build-complete, sword, arrow, hurt, die, raid-warning, button-tap.
- Master volume + music + sfx sliders in pause menu.

---

## 9. Implementation Roadmap

Each phase ends in a runnable checkpoint. Commit after each.

### Phase 0 — Bootstrap (≈ 1 session)
- Run setup commands from §3.
- Create empty Phaser game with green background.
- Confirm it runs in `npm run dev`.
- Set up the folder structure (empty files OK).
- ✅ **Checkpoint:** Green canvas in browser.

### Phase 1 — Tilemap + Camera (≈ 1–2 sessions)
- Load terrain tileset.
- Render a static 40×60 tilemap (hand-author a small JSON of tile indices).
- Implement pan + pinch-zoom (`TouchController.ts`). Pan must clamp to map bounds.
- ✅ **Checkpoint:** Player can pan and zoom around the village map.

### Phase 2 — Workers & Resources (≈ 2–3 sessions)
- Spawn 3 workers at the Town Hall position (Town Hall is a placeholder rectangle for now).
- Place trees on map (random, ~25% of grass tiles).
- Implement A* pathfinding.
- Implement worker FSM: tap worker → tap tree → worker walks → chops (3 sec) → carries → drops at Town Hall → wood counter goes up.
- Build the HUD top bar (resources only).
- ✅ **Checkpoint:** Workers gather wood. Resource counter increases.

### Phase 3 — Buildings (≈ 2–3 sessions)
- Replace Town Hall placeholder with sprite.
- Build Menu UI.
- Placement system with ghost preview + validation.
- Construction lifecycle (workers must be assigned to build).
- All 9 buildings from §4.4 functional (no need to balance yet, just functional).
- Stone & Food gathering working (rocks, animals, farm passive generation).
- Population cap enforced.
- ✅ **Checkpoint:** Player can build a small village.

### Phase 4 — Combat (≈ 2 sessions)
- Soldier training at Barracks.
- Soldier FSM (similar to worker, but with attack state).
- Health bars over units (small, only when damaged).
- Manual attack: tap soldier → tap target → attack-move.
- ✅ **Checkpoint:** Player can train soldiers and order them to attack a stationary dummy enemy (placed for testing).

### Phase 5 — Bandit Raids (≈ 2 sessions)
- Implement `PowerSystem` and `RaidSystem`.
- Bandit AI: walk to Town Hall, attack anything in range.
- Raid warning UI.
- Tower auto-attack.
- Worker `fleeing` state.
- Raid summary log to console.
- ✅ **Checkpoint:** Raids spawn and threaten the village. Game has tension.

### Phase 6 — UI Polish & Save/Load (≈ 1–2 sessions)
- Selection panel.
- Pause menu.
- Save/load via localStorage.
- Audio (SFX + BGM).
- Death / game-over screen (Town Hall destroyed → "Your village has fallen" → Restart).
- ✅ **Checkpoint:** Full game loop on desktop browser, complete UX.

### Phase 7 — Android Build (≈ 1 session)
- See §10.
- ✅ **Checkpoint:** APK installed and runs on Eden's Android phone.

**Total estimated time:** 12–18 working sessions of focused Claude Code work.

---

## 10. Android Build with Capacitor

After Phase 6 is done:

```bash
npm run build                  # produces dist/
npx cap add android            # only first time
npx cap sync android           # every time after a build
npx cap open android           # opens Android Studio
```

In Android Studio:
1. Let Gradle sync (may need AGP Upgrade Assistant: `Tools → AGP Upgrade Assistant` → version `8.13.0+`).
2. Connect phone via USB (USB debugging enabled), or use emulator.
3. Click ▶ Run.

**Capacitor 8 Android requirements** (`android/variables.gradle`):
```
minSdkVersion = 24
compileSdkVersion = 36
targetSdkVersion = 36
```

For production APK / AAB:
1. Android Studio → Build → Generate Signed Bundle / APK.
2. First time: create a keystore. **Back up the keystore file securely** — losing it means losing the ability to update the app on Play Store.

**`AndroidManifest.xml` overrides** (set in Capacitor config):
- `screenOrientation="portrait"` — lock to portrait.
- `configChanges` — handle rotation gracefully.

**Performance flags for the WebView:**
- Enable hardware acceleration (default on modern Android).
- Disable WebView debugging in release builds.

---

## 11. Decisions Log

**All foundational decisions resolved with Eden before build:**
1. ✅ Logical resolution: **540×960** (chunky pixels, matches reference image).
2. ✅ Asset pack: **Tiny Swords by Pixel Frog** (https://pixelfrog-assets.itch.io/).
3. ✅ Initial map: **hand-authored JSON**, generated by Claude Code at Phase 1.
4. ✅ Warehouse building: **included in MVP** (see §4.4).
5. ✅ Settings overlay: **audio sliders + Reset Progress** (see §7.6).
6. ✅ Difficulty cap: **1.0×** (game stays beatable). Revisit for tuning in Phase 5 playtesting.
7. ✅ Game name: **Pocket Kingdom**. App ID: `com.eden.pocketkingdom`.

No further blockers. Claude Code may proceed to Phase 0.

---

## 12. Stretch Goals (Post-MVP)

When MVP is solid and you want to keep going:

- **Tech tree** — research at Town Hall: cheaper buildings, faster workers, stronger units.
- **Day/night cycle** — bandits prefer night, vision range reduced at night.
- **Multiple maps** — campaign mode, each map a "level".
- **Procedural generation** — replayability.
- **More resources:** gold (from a marketplace building, used for hiring mercenaries), iron (better weapons).
- **Hero unit** — single named character, levels up, dies = game over.
- **Cloud save** via Capacitor + Firebase / Supabase.
- **Leaderboards** (longest survival time).
- **Achievements.**
- **Tutorial mode** with guided tasks for the first 5 minutes.
- **Localization:** Hebrew UI strings (right-to-left support in Phaser is non-trivial — plan accordingly).
- **Terraforming — water channels.** Workers can dig dirt/grass tiles to open a channel that water spreads through. Player-controlled rivers / moats. Open questions: does water flow automatically once a channel touches existing water, can channels be filled back in, do bandits avoid them, do they count as walls for defence purposes? Resolve before scoping.
- **Decoration mode — roads.** Toggle that lets the player paint dirt-path tiles over grass to lay roads. Initial implementation shipped in Phase 4 polish; broaden later with more decoration tiles (flowers, fences, banners, lamps).
- **Farms need irrigation + a worker.** Active spec divergence (vs §4.4 "no worker needed"): farms now require an adjacent water tile at placement and only produce while a worker is tending them. If we keep this, formalise it in §4.4 and adjust the farmer worker-cost so passive food doesn't become free pop-cap pressure.

---

## Appendix A — Balance Cheat Sheet (initial values)

All in `src/data/balance.ts`:

```ts
export const BALANCE = {
  startingResources: { wood: 50, stone: 30, food: 50 },
  startingWorkers: 3,

  worker: {
    hpMax: 20,
    speedPxPerSec: 60,
    carryCapacity: 5,
    gatherTimeSec: { wood: 3, stone: 4, food: 3 },
    yieldPerGather: { wood: 5, stone: 4, food: 4 },
    fleeRangeTiles: 4,
  },

  storage: {
    initialCap: { wood: 200, stone: 150, food: 200 },
    perWarehouse: { wood: 200, stone: 150, food: 200 },
  },

  foodConsumptionPer30Sec: { worker: 1, soldier: 2 },

  raid: {
    firstRaidAtSec: 180,
    intervalMinSec: 90,
    intervalMaxSec: 150,
    warningLeadSec: 10,
    minPower: 20,
    maxRaidUnitCount: 25,
    difficultyTiers: [
      { untilSec: 300,  mult: 0.40 },
      { untilSec: 600,  mult: 0.55 },
      { untilSec: 900,  mult: 0.70 },
      { untilSec: 1200, mult: 0.85 },
      { untilSec: Infinity, mult: 1.00 },
    ],
    powerCapMultiplier: 1.1,
  },

  power: {
    buildingHpWeight: 0.5,
    workerWeight: 5,
    soldierCostWeight: 1.0,
    stockpileWeight: 0.05,
    recomputeIntervalSec: 5,
  },
};
```

Tune these after Phase 5 playtesting. Do not pre-tune.

---

## Appendix B — Quick Reference for Claude Code

When stuck, in this order:
1. Re-read §0 (Prime Directive).
2. **Read the matching Phaser 4 skill file** in `node_modules/phaser/skills/` for whichever subsystem you're working on.
3. Re-read the relevant §6 system spec.
4. Re-read the data model in §5.
5. Check Phaser 4 docs (https://docs.phaser.io/) for API specifics.
6. If still stuck → stop and ask Eden.

When tempted to add a feature not in §1.4 (MVP scope) → don't. Add it to §12 instead.

When something feels too ambitious for a single session → break it down further and tell Eden the new sub-phases before starting.

---

**End of spec. Build well.**

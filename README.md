# +1 Double Jump Bike Escape — client

A browser bike-escape game built with React Three Fiber. You ride a BMX, gain
Speed while you move, and every level gives one more jump and a faster bike.
Each stage is a short island in a deadly pit, a little higher than the one
before, and you chain jumps to fly across the ever longer gaps between them
(every mid-air jump is a trick: flips, barrel rolls, tailwhips…). Fall in and
you're back in the lobby. Multiplayer runs on the Colyseus server in
`../double-jump-bike-escape-server` (8 riders per lobby).

## Run it

```bash
# terminal 1 — game server (ws://localhost:2567)
cd ../double-jump-bike-escape-server
npm install
npm run dev

# terminal 2 — this client (http://localhost:5173)
npm install
cp .env.example .env   # VITE_GAME_SLUG / VITE_GAME_ID for Bloxity
npm run dev
```

The page loads straight into the game: a 0–100 loading screen (fonts, Bloxity
sign-in, 3D assets, the world, a lobby) and no Play button. A player signed in
to Bloxity joins with their account, anyone else as a guest.

On localhost the game joins `ws://localhost:2567`; `VITE_SERVER_URL` overrides
that. Hosted on Bloxity it joins through the Legion matchmaker (see Hosting).

## Controls

| Input | Action |
| --- | --- |
| W A S D / arrows | ride and steer (relative to the camera) |
| Space | jump; tap again in the air for each extra jump; **hold to climb** |
| Drag | look around |
| Scroll | zoom |
| Enter or `/` | chat |
| E | buy / equip the bike you're standing on |

Every HUD button shows its shortcut key in its top-left corner. Pressing the
key again closes the window.

| Key | Button | Key | Button |
| --- | --- | --- | --- |
| T | Trails | Q | Quests |
| U | Auras | B | Bike Speed |
| R | Rebirth | X | 2X Speed |
| I | Inventory | M | Music on/off |
| 1–4 | Speed packs | 5 | Shop |
| O | Settings | G | Worlds |
| Tab | Players in the lobby | V | ring the bike bell |
| Esc | close a window | | |

Phones get an on-screen joystick and a jump button. The daily reward is
collected automatically on your first join each day; codes are in Settings.
The top left of the screen is left free for the Bloxity host page's own menu
and chat; the top right shows who you're playing as.

## The game

- **World 1**: lobby plus 10 stages (Starter, Forest, Cloud, Volcano, Desert,
  Ice, Candy, Neon, Space, Rainbow) and the escape plateau.
- **World 2**: its own lobby plus 10 more stages and its own escape. It
  unlocks once you have escaped World 1 **and** have 10 rebirths; travel
  through the portals (or press G).
- Stage 1 is level with the lobby; each later island sits 3 studs higher than
  the one before. Every island has a yellow Return pad and a purple 2x Wins
  pad, and a deadly river runs round it (water, lava, chocolate, slime… to suit
  the stage). The gap in front of each stage is
  longer than the last; a stage marked "Level N" needs level N to jump across
  (stage 10 needs level 40, the World 1 escape 46, World 2 runs from 42 to 75).
  The gaps to stages 1–3 are clear; from the gap to stage 4 on, lasers bob up
  and down in them. Falling into the river or touching a laser sends you to the
  lobby.
- **Wins** are the only currency (stage pads, quests, daily reward, chest,
  codes). There is no premium currency.
- **Rebirth** (from level 10) resets your level to 1 for a permanent +50%
  Speed XP per rebirth. The higher your level, the more rebirths you get at
  once: level 10 gives 1, level 20 gives 46, level 40 gives 243.
- **Riding feel**: speed lines pour out to both sides and the screen edges
  zoom-blur from where you're heading (WebGL, see `src/game/SpeedBlur.jsx`),
  with a burst on every jump; the camera widens with speed. Every mid-air jump
  shows a stunt label (with a combo count when chained). A white line follows
  the rear wheel, on the ground and in the air. Banking Wins rains trophies
  into the Wins counter.
- **Lobby**: a brick road with arrows to the course, leaderboards, the
  training zone (24 treadmills; standing on one pays out), the Bike Shop with
  every World 1 bike (ride onto one and press E), the Item Shop (restocks
  every 5 minutes), the Group Chest, the feedback mailbox and the World 2
  portal.
- **Performance**: bikes are merged per material with shared materials, far
  labels, lasers and scenery props are hidden, and the render resolution steps
  down automatically when the frame rate drops.

## Hosting (Bloxity Legion)

`.github/workflows/deploy.yml` builds the site and uploads it to Bloxity
hosting on every push: `main` → https://1-double-jump-bike-escape.play.bloxity.io,
`dev` → https://1-double-jump-bike-escape.dev.play.bloxity.io. Add the
repository secret `LEGION_DEPLOY_TOKEN` (My Games → eye icon); never commit it.

When hosted, every join asks the matchmaker for a server
(`Legion.SDK.net.resolveEndpoint`) and connects through the relay it returns,
with a new Colyseus client each time; a dropped or restarting server is
rejoined the same way. The dev site reaches the dev game server automatically.

## Where things live

| Path | What |
| --- | --- |
| `src/shared/` | Rules and the deterministic map. **Shared with the server**: after editing, run `npm run sync-shared` in the server repo. |
| `src/game/world/` | Turns the layout into meshes: textures, scenery, signs, lasers |
| `src/game/rider/` | Bikes, the riding pose (2-bone IK), tricks, trails, auras |
| `src/game/LocalPlayer.jsx` | Controller: input, physics, jumps, pads, triggers |
| `src/game/physics.js` | Box collision with step-up and wall climbing |
| `src/net/connection.js` | Colyseus connection and HUD state sync |
| `src/ui/` | HUD (with its keyboard shortcuts), speed effects and all the windows (shops, inventory, quests…) |

## Checks

```bash
npm run lint
npm run build
npm run check:climb   # simulates every stage: the listed level makes it, one level less falls
```

Dev-only URL switches (ignored in production builds):

- `?autoplay&name=X&uid=Y` joins straight away as the throwaway profile
  `test:Y` (the server never saves `test:` profiles).
- `?tp=<stage id>` starts on a stage (World 1: 1–11, World 2: 12–22).
- `?blocky` forces the fallback avatar.
- `?posedebug` shows the IK joint targets.

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

The page loads straight into the lobby: no loading screen or Play button of
its own. The Bloxity host page shows its loading screen (kept informed with
`loadingStep`) and lifts it with `loadingEnd()` once the rider is in a lobby
(`src/ui/AutoJoin.jsx`). A player signed in to Bloxity joins with their
account, anyone else as a guest.

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
  the stage). Each stage's gate shows a Total Speed (⚡10 for stage 1 up to
  ⚡650K for stage 10 and ⚡1.4M to escape World 1). Speed sets the bike's top
  speed and your level, and every level is one more jump, so the gap is built
  from that number: with the gate's Speed you clear it, with clearly less (88%)
  you physically fall short. The gaps to stages 1–3 are clear; from the gap to
  stage 4 on, lasers bob up and down in them. Falling into the river or
  touching a laser sends you to the lobby.
- **Wins** are the only currency (stage pads, quests, daily reward, chest,
  codes). There is no premium currency.
- **Rebirth** needs a Speed target (⚡160K for the first, then 1.9x more each
  time). It resets Speed (so the gates close again) for one rebirth: a
  permanent +50% Speed and faster treadmills (Rebirth 1+, 5+, 10+…). The
  Rebirth window previews exactly what you get and what resets; rebirthing
  plays a full-screen celebration. Rebirths 5, 10 and 25 give exclusive bikes
  (Reborn, Eclipse, Ascended) that can't be bought.
- **Coming back**: a 7-day login streak (Day 7 is the big one; miss a day and
  it starts over) opens on your first join each day. Three daily quests per
  player, sized to their progress (e.g. "Clear 30 jumps", "Finish the Cloud
  Stage", "Earn 50 Wins"), refresh at midnight UTC in the Quests window. While
  you're away your best treadmill keeps training at 10% (up to 4 hours, at most
  half your next rebirth); a "Welcome back!" window shows what it earned.
- **Treadmills** pay while you stand still (AFK is fine); a counter shows what
  the current session on the belt has earned. A live countdown above the Item
  Shop shows the next restock.
- **Collecting**: bikes, trails and auras have rarities (Common to Mythic).
  The Bike Shop shows every bike spinning on a pedestal in its rarity colour,
  labelled with how much faster it is than your best bike. There are 15 trails
  and 15 auras to collect ("Collection X/30" in the Trails & Auras and
  Inventory windows). A bar under your Wins always shows progress to the next
  bike ("Dragon Bike 20/35 🏆").
- **Stage records**: the timer starts when you ride out of the lobby. Landing
  on a stage shows your split, 1–3 stars against its par (riding flat out at
  the gate's top speed) and "NEW RECORD!" when you beat your best. Best stars
  sit under each stage on the progress bar; records are saved with your profile.
- **Bike Speed** button: tune-ups, each a permanent +10% Speed gain (up to 25).
  Top speed itself always comes from your Speed.

### Balance

Every progression number (gates, Wins per stage, bike and treadmill tiers,
prices, rebirth targets, rewards, quests) is in `config/balance.ts`. After a
change:

```bash
npm run balance        # replays a new player's first hours: stages, purchases, rebirths
npm run check:climb    # proves every gate: its Speed clears the gap, 88% falls short
# then in the server repo: npm run sync-shared
```

With the current numbers a solo player reaches stages 1–2 in under a minute,
stage 7 at about 33 minutes and rebirths for the first time at about 48;
later lives take 12–35 minutes, World 1 is escaped at about 1:50 and World 2
opens at about 3:50. One run of the newest stage pays 20–40% of the next bike,
so players replay stages or train. The simulator's rider is tidy and solo, so
real players land a little either side of these.
- **Riding feel**: speed lines pour out to both sides and the screen edges
  zoom-blur from where you're heading (WebGL, see `src/game/SpeedBlur.jsx`),
  with a burst on every jump; the camera widens with speed. Pedals turn with
  the wheel, the bike leans into turns and lifts its front wheel on take-off.
  Every double jump fires a ring burst (in the trick's colours, for every rider)
  and a stunt label (with a combo count when chained); landings squash the bike,
  kick up a dust ring and shake the camera a little, harder for bigger drops.
  The big "Jump: 7/11" counter pulses on every jump, turns orange then red as
  jumps run out, and shows "GAP CLEARED!" on a new island. A white line follows
  the rear wheel, on the ground and in the air. A Wins pad plays a fanfare with
  confetti, then trophies rain into the Wins counter.
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
npm run check:climb   # simulates every stage: its gate's Speed makes it, 88% of it falls
npm run balance       # progression timeline for the numbers in config/balance.ts
```

Dev-only URL switches (ignored in production builds):

- `?autoplay&name=X&uid=Y` joins straight away as the throwaway profile
  `test:Y` (the server never saves `test:` profiles).
- `?tp=<stage id>` starts on a stage (World 1: 1–11, World 2: 12–22).
- `?blocky` forces the fallback avatar.
- `?posedebug` shows the IK joint targets.

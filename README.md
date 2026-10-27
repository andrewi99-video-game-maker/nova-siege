# Nova Siege

A futuristic first-person arena shooter that runs in the browser (Three.js). Bots, loadouts, skins, private lobbies and online matches.

The game is a static site, so it can live on **GitHub Pages**. Online play needs the tiny relay server in `server/` running somewhere (free on Render). Without it, the bot modes still work.

## Files

| File | What it is |
| --- | --- |
| `index.html` | the whole game |
| `three.min.js` | Three.js r128 (MIT licence), included so the page needs no CDN |
| `net.js` | connects the game to the relay server |
| `config.js` | **put your server address here** |
| `server/` | the relay (Node + `ws`) |
| `render.yaml` | one-click blueprint for deploying the relay on Render |

## 1. Publish the game on GitHub Pages

1. Create a new GitHub repository and upload everything in this folder (keep `.nojekyll`).
2. Repository **Settings > Pages**. Under *Build and deployment* choose **Deploy from a branch**, branch `main`, folder `/ (root)`, then Save.
3. After a minute your game is at `https://YOUR-NAME.github.io/YOUR-REPO/`.

The bot modes (Deathmatch, Elite Duel, Survival) work right away.

## 2. Turn on online play (relay server)

1. Go to <https://render.com>, choose **New > Blueprint** (or **New > Web Service**) and connect the same repository. The blueprint in `render.yaml` sets it up. If you make the service by hand, use root directory `server`, build command `npm install`, start command `node server.js`.
2. In the service's **Environment** tab set `ALLOWED_ORIGINS` to your Pages address, for example `https://YOUR-NAME.github.io` (no path, no trailing slash). This stops other websites from using your server.
3. Copy the service URL (for example `https://nova-siege-relay.onrender.com`) and put it in `config.js` with `wss://` in front:

   ```js
   window.NOVA_SERVER = 'wss://nova-siege-relay.onrender.com';
   ```

4. Commit the change. Online Arena, Quick match, private lobbies and the friends list now work.

You can also test without editing the file by adding `?server=wss://your-service.onrender.com` to the game address.

Free Render services go to sleep after a while without visitors, so the first connection can take up to a minute to wake the server.

## Running everything on your own computer

```bash
cd server && npm install && node server.js      # relay on port 8080
# in another terminal, from the repo root:
python3 -m http.server 8000
# open http://localhost:8000/?server=ws://localhost:8080
```

## How the online parts work

* **Quick match** puts you in the busiest public arena (up to 12 players per map), or a random map if nobody is playing.
* **Private lobby** creates a six-character code. Only people who enter that code (or accept your invite) can join, it holds 8 players, and it never has bots. The host picks the map and starts the match.
* **Friends** are stored in the browser (`localStorage`) and identified by an anonymous id the browser makes for itself. Clearing site data removes the id and the list.
* The relay only forwards messages (positions, shots, hits). Players report their own hits, so it is built for friendly play, not for cheat-proof competition.

## Controls

WASD move, Shift sprint, Space jump, mouse aim and fire, R reload, 1 / 2 / 3 or mouse wheel switch guns, Q ability, Esc pause (with **Exit match**), arrow keys also look.

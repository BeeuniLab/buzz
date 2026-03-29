# buzzplay-creative

Interactive creative content template for BuzzPlay. Each project is a self-contained `code.html` that runs in a 720x1280 portrait canvas, powered by a lightweight host API (`window.lib`). Supports games, interactive stories, data visualizations, creative tools, animated art, and any rich visual experience.

## File Structure

```
src/
  code.html           Creative content source (HTML + CSS + JS, single file)
  config              Project configuration (JSON, no extension)
  asset_map           Asset ID -> URL mapping (JSON, no extension)
lib/
  host-stub.js        Host runtime: injects window.lib, loads gameConfig + assets,
                      provides save/load, leaderboard, sprite animation APIs.
                      Falls back to sessionStorage when KV is unavailable.
assets/
  images/             Static images (PNG, WebP, SVG ...)
  fonts/              Custom font files (WOFF2, TTF ...)
  audio/              Sound effects and music (MP3, OGG, WAV ...)
  3d/                 3D models and textures (GLB, GLTF, OBJ ...)
worker/
  host.ts             Cloudflare Worker: serves static files + /__buzzplay-host/v1 API
                      (user auth, KV state, leaderboard)
scripts/
  build-static.mjs    Copies src/, lib/, assets/, index.html into dist/ for deployment
index.html            Redirect entry point -> src/code.html
wrangler.jsonc        Cloudflare Worker config
```

## Host API (window.lib)

`host-stub.js` is loaded before project code and provides:

| Method | Description |
|--------|-------------|
| `lib.log(...)` | Debug logging with `[game-host]` prefix |
| `lib.getAsset(id)` | Get asset entry from asset_map (`{ url, animation? }`) |
| `lib.preloadAnimation(id)` | Preload sprite sheet image |
| `lib.getAnimationPlayer(id)` | Get sprite player with `reset()`, `update(ts)`, `draw(ctx, x, y, w, h)` |
| `lib.getUserGameState()` | Load saved state (KV or sessionStorage) |
| `lib.saveUserGameState(state)` | Persist state |
| `lib.deleteUserGameState()` | Clear saved state |
| `lib.addPlayerScoreToLeaderboard(score, n)` | Submit score, get top N + rank |
| `lib.getTopNEntriesFromLeaderboard(n)` | Read leaderboard |
| `lib.showGameParameters(config)` | Register editable parameters for host editor UI |

## Entry Convention

The host calls `window.run(mode)` after loading:

```javascript
// mode = 'play' -> normal experience
// mode = 'edit' -> editor mode (show parameter panel, skip intros)
async function run(mode) {
    const isEdit = mode === 'edit';
    lib.showGameParameters({ name: 'Settings', params: { ... } });
    await preloadAssets();
    requestAnimationFrame(mainLoop);
}
window.run = run;
```

## window.gameConfig

Configurable parameters loaded from `src/config`.
Editor parameters registered via `lib.showGameParameters()` modify `window.gameConfig.*` live.

Supported parameter types: `slider`, `dropdown`, `color`, `toggle`.

## Canvas Defaults

- Resolution: **720 x 1280** (9:16 portrait, mobile-first)
- CSS: `width: 100%; height: 100%` with `touch-action: none`
- Input: pointer events mapped to canvas coordinates via `getBoundingClientRect()`
- Audio: Web Audio API (resumed on first user interaction)

## Asset Map (`src/asset_map`)

Maps logical asset IDs to URLs and metadata. Code references assets by ID via `lib.getAsset(id)` and `lib.getAnimationPlayer(id)`.

Each entry is keyed by a descriptive ID (e.g. `"player_idle"`, `"salon_background"`) and contains:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | yes | CDN or relative URL to the asset file |
| `type` | string | yes | `"image"`, `"audio"`, `"3d"` |
| `subtype` | string | no | `"background"`, `"character"`, `"item"`, `"ui"`, `"effect"`, `"music"`, `"sfx"` |
| `prompt` | string | no | Generation prompt used to create this asset (for AI reproducibility) |
| `description` | string | no | Human-readable description of the asset |
| `aspect_ratio` | [w, h] | no | Pixel dimensions (e.g. `[1024, 1536]`) |
| `animation` | object | no | Sprite sheet animation data (see below) |
| `animation.url` | string | no | Sprite sheet image URL (overrides top-level `url`) |
| `animation.frames` | array | no | Frame rects: `[{ x, y, width, height }, ...]` |
| `animation.fps` | number | no | Playback speed (default: 8) |
| `animation.loop` | boolean | no | Loop playback (default: true) |
| `duration_hint` | string | no | Audio duration hint (e.g. `"3s"`, `"loop"`) |
| `loop` | boolean | no | Whether audio should loop |

Example:

```json
{
  "salon_background": {
    "url": "https://cdn.example.com/assets/salon-bg.webp",
    "type": "image",
    "subtype": "background",
    "prompt": "Bright modern hair salon interior, cartoon style, warm colors",
    "description": "Modern hair salon interior with styling chair and mirrors",
    "aspect_ratio": [1024, 1536]
  },
  "player_idle": {
    "url": "https://cdn.example.com/assets/player-idle-sheet.png",
    "type": "image",
    "subtype": "character",
    "description": "Player character idle animation sprite sheet",
    "animation": {
      "frames": [
        { "x": 0, "y": 0, "width": 128, "height": 128 },
        { "x": 128, "y": 0, "width": 128, "height": 128 },
        { "x": 256, "y": 0, "width": 128, "height": 128 }
      ],
      "fps": 8,
      "loop": true
    }
  },
  "bgm_main": {
    "url": "https://cdn.example.com/assets/bgm.mp3",
    "type": "audio",
    "subtype": "music",
    "description": "Main background music",
    "duration_hint": "loop",
    "loop": true
  }
}
```

Usage in code:

```javascript
// Static image
const bg = lib.getAsset('salon_background');
const bgImg = new Image();
bgImg.src = bg.url;

// Animated sprite
await lib.preloadAnimation('player_idle');
const player = lib.getAnimationPlayer('player_idle');
// In main loop:
player.update(timestamp);
player.draw(ctx, x, y, width, height);

// Audio
const bgm = lib.getAsset('bgm_main');
const audio = new Audio(bgm.url);
audio.loop = true;
audio.play();
```

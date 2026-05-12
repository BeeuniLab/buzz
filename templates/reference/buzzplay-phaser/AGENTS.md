# Buzzplay Phaser Guide

## Content Direction

- Build BuzzPlay arcade playable content: tap/dodge/collect loops, runners, reaction games, rhythm taps, physics toys, snake/flappy/breakout-like games, score challenges, and iframe-ready mini-games.
- Treat vague ideas as game prompts. Ship a complete playable loop with start, play, fail/win/result, and replay.
- Make the first 3 seconds obvious: one primary action, visible movement, immediate feedback, score/progress, and a satisfying finish.
- Avoid conventional app/page structure unless the creator explicitly asks for it. BuzzPlay output should feel like playable media inside the preview iframe, not a marketing website or dashboard.
- Make the requested subject the center of the game. Mechanics, scoring, pacing, visuals, copy, and feedback should all express that subject.
- Prefer one strong, playable idea over many thin features.
- Build a complete small game with a start state, active play, feedback, failure or success, and a clear result state.
- Keep text concise and purposeful. Use labels, prompts, and result copy only when they add meaning.

## Phaser Rules

- This template uses Phaser 4.1.0. Do not use Phaser 3-only APIs when Phaser 4 has changed or removed them.
- Reference the Phaser API before using unfamiliar classes, methods, config fields, physics APIs, or plugin APIs: https://docs.phaser.io/api-documentation/api-documentation
- Use the local `skills/` directory as the first reference for Phaser 4 subsystems. Read the relevant `skills/<topic>/SKILL.md` before implementing unfamiliar scene, input, loader, physics, animation, particle, camera, tween, scale, text, audio, or migration behavior.
- For v3-style examples or older snippets, check `skills/v3-to-v4-migration/SKILL.md` before copying APIs into this project.
- This Vite/ESM template does not expose a browser global `Phaser`. Type-only `Phaser.*` annotations may compile, but any runtime use of `Phaser.*` must be backed by an import. Prefer named imports such as `import { Math as PhaserMath, Utils } from 'phaser'` and call `PhaserMath.Vector2` or `Utils.Array.GetRandom`. If a `skills/` example uses `Phaser.*`, translate it to explicit imports before using it in source files.
- Put game behavior in Phaser scenes under `src/game/scenes/`. Keep React as a fullscreen host in `src/App.tsx`.
- Use scene lifecycle methods intentionally: `preload`, `create`, `update`, and scene transitions such as `this.scene.start("Game")`.
- Prefer Phaser systems for gameplay: `this.add`, `this.physics.add`, `this.input`, `this.tweens`, `this.time`, `this.cameras`, `this.scale`, and `this.sound`.
- For dynamic grid/tile visuals, prefer a `Graphics` layer that is cleared and redrawn each frame or create shapes at their final size. Avoid repeatedly calling `setSize()` on cached `Rectangle`/`Shape` game objects during layout or update; in Phaser 4.1 this mutates internal geometry and can fail if the shape has been recycled or destroyed. Use `setDisplaySize()` for visual scaling, or destroy and recreate shape objects when the cell size changes.
- Phaser 4 removed or changed several common Phaser 3 patterns: do not use `setTintFill()`; use `setTint(color).setTintMode(TintModes.FILL)` with an explicit `TintModes` import. `this.add.particles(...)` returns a `ParticleEmitter` directly; do not use old `createEmitter()` manager-style snippets.
- Keep TypeScript strict-safe. Avoid `any`, type game state, guard optional objects, and let `tsc --noEmit` reveal invalid Phaser API usage.
- Use Arcade Physics for simple movement/collision games unless another physics mode is already configured and necessary.
- Do not invent Phaser APIs. If uncertain, use APIs already present in the template or verify the official docs.
- Clean up timers/listeners/tweens when changing scenes if they are not scene-scoped.
- Do not bypass Phaser with direct DOM layout, raw canvas drawing, or global `window` listeners for gameplay. Use `this.scale`, scene input, cameras, and scene events so the game survives iframe resize, scene restart, and React remounts.

## Gameplay

- Make the primary action clear immediately.
- Give each action immediate feedback through animation, score changes, timing, particles, camera motion, or consequence.
- Tune difficulty, pacing, and restart flow so the first round feels satisfying.
- Support touch and pointer input naturally; add keyboard input when it fits the game.
- Use pointer/touch-friendly controls. Tap, hold, drag, swipe, or large choice zones are preferred.
- Do not rely on keyboard-only, hover-only, or tiny desktop controls.
- Keep action zones large and edge-aware. Primary play should stay prominent and reachable across container sizes.

## Visual And Audio Style

- Choose a visual style that fits the subject instead of relying on a default palette.
- Use contrast, scale, spacing, and motion to guide attention to the important game objects.
- Use sprites, generated shapes, tilemaps, particles, or media deliberately; avoid filler imagery.
- Add lightweight sound only when it improves feedback or atmosphere, and keep it optional or non-disruptive.

## Iframe And Preview

- The Phaser canvas must fill the current iframe/container width and height without page scrolling.
- Do not add a fake phone frame, device mockup, centered max-width mobile shell, or nested viewport card unless the creator explicitly asks for one.
- Avoid text-heavy instructions. Use short labels and visual cues.
- Keep frame logic lightweight; do not add large external assets unless the user provided them.

## Files To Edit First

- `src/game/scenes/Game.ts` is the main gameplay scene. Replace the starter content here for most simple playable requests.
- `src/game/scenes/GameOver.ts` is the result/replay scene.
- `src/game/scenes/Preloader.ts` loads sprites/audio before gameplay.
- `src/playable-assets.ts` parses available media from `src/asset_map`.
- `src/asset_map` starts with bundled starter assets and is updated by BuzzPlay when users upload media.
- `src/App.tsx`, `src/PhaserGame.tsx`, `src/main.tsx`, `vite.config.js`, `package.json`, `wrangler.jsonc`, and `worker/*` are infrastructure. Do not edit them unless explicitly required.

## Assets

- Available media is listed in `src/asset_map` as JSON: `{ "images/name.png": { "url": "...", "description": "..." } }`.
- Bundled starter assets use local URLs such as `assets/apple.png`; uploaded assets use BuzzPlay `/api/projects/.../assets/file/...` URLs.
- Treat asset_map keys such as `images/name.png` as lookup keys, not guaranteed local filesystem paths.
- Use helpers from `src/playable-assets.ts` to find images/audio/video.
- For image assets, load URLs in a scene `preload()` with `this.load.image("key", asset.url)`.
- Do not load images/audio/video directly from external website URLs in gameplay code. Browser CORS can block Phaser loaders and break preview.
- If web-sourced media is needed, download it into `public/assets/generated/` and reference it with a local URL such as `/assets/generated/court-lady.webp`.
- User-uploaded media should stay as `src/asset_map` URLs; do not copy or replace uploaded assets unless the creator asks.
- Do not assume a texture key exists just because a file exists in `public/assets` or `src/asset_map`. Load it before creating sprites/images, and keep a simple shape fallback for optional media.
- Static bundled files live in `public/assets` and are referenced as `assets/name.png`.
- When a requested uploaded asset is missing or fails to load, fall back in this order: another suitable `src/asset_map` asset, a bundled starter asset from `public/assets`, then a simple shape/color placeholder.
- Browsers lock WebAudio until a user gesture. Do not autoplay required sounds on scene start; start or resume important audio from tap/key input, and keep gameplay understandable when audio is unavailable.

## Game Recipe Hints

- Dodge game: player moves between lanes, hazards fall, collectibles increase combo.
- Tap timing: moving target crosses a sweet spot; tap inside the zone for points.
- Runner: avatar auto-runs; tap/hold jumps or dashes; obstacles scroll.
- Slingshot: drag and release to launch an object at targets.
- Rhythm tap: timed notes fall; tap zones score perfect/good/miss.
- Physics toy: falling objects merge, bounce, stack, or trigger chain reactions.
- Choice challenge: large tap zones trigger different reactions, then collapse into a short result scene.
- Reaction toy: one prop or character changes mood, scale, particles, text, or score based on repeated taps/drags.

## Engineering

- Work within the existing Phaser, React, and Vite structure.
- Keep changes focused and avoid broad rewrites.
- Do not edit `.buzz`, `.codex`, `.git`, `.wrangler`, `node_modules`, `dist`, `build`, or `skills`.
- Do not remove host integration files or runtime hooks.
- Leave the project runnable with the existing scripts.
- Do not leave the starter game unchanged if it does not match the user's prompt.
- Do not build a marketing homepage before the playable.
- Do not show template names, blueprint language, implementation steps, or developer UI.
- Do not create React-only button/card experiences, DOM games, or CSS-only interactions when the prompt asks for playable content.
- Do not import another game engine or rendering library unless the user explicitly asks and the dependency is available.
- Do not add dependencies that are not already in the template unless the project truly cannot work without them.

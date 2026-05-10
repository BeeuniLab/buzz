# Usage

## Product Fit
- Build BuzzPlay arcade playable content: tap/dodge/collect loops, runners, reaction games, rhythm taps, physics toys, snake/flappy/breakout-like games, score challenges, and iframe-ready mini-games.
- Treat vague ideas as game prompts. Ship a complete playable loop with start, play, fail/win/result, and replay.
- Make the first 3 seconds obvious: one primary action, visible movement, immediate feedback, score/progress, and a satisfying finish.
- Avoid conventional app/page structure unless the creator explicitly asks for it. BuzzPlay output should feel like playable media inside the preview iframe, not a marketing website or dashboard.

## Phaser Rules
- This template uses Phaser 4.1.0. Do not use Phaser 3-only APIs when Phaser 4 has changed or removed them.
- Reference the Phaser API before using unfamiliar classes, methods, config fields, physics APIs, or plugin APIs: https://docs.phaser.io/api-documentation/api-documentation
- Use the local `skills/` directory as the first reference for Phaser 4 subsystems. Read the relevant `skills/<topic>/SKILL.md` before implementing unfamiliar scene, input, loader, physics, animation, particle, camera, tween, scale, text, audio, or migration behavior.
- For v3-style examples or older snippets, check `skills/v3-to-v4-migration/SKILL.md` before copying APIs into this project.
- Put game behavior in Phaser scenes under `src/game/scenes/`. Keep React as a fullscreen host in `src/App.tsx`.
- Use scene lifecycle methods intentionally: `preload`, `create`, `update`, and scene transitions such as `this.scene.start("Game")`.
- Prefer Phaser systems for gameplay: `this.add`, `this.physics.add`, `this.input`, `this.tweens`, `this.time`, `this.cameras`, `this.scale`, and `this.sound`.
- Keep TypeScript strict-safe. Avoid `any`, type game state, guard optional objects, and let `tsc --noEmit` reveal invalid Phaser API usage.
- Use Arcade Physics for simple movement/collision games unless another physics mode is already configured and necessary.
- Do not invent Phaser APIs. If uncertain, use APIs already present in the template or verify the official docs.
- Clean up timers/listeners/tweens when changing scenes if they are not scene-scoped.

## Iframe, Touch, And Preview Rules
- The Phaser canvas must fill the current iframe/container width and height without page scrolling.
- Do not add a fake phone frame, device mockup, centered max-width mobile shell, or nested viewport card unless the creator explicitly asks for one.
- Use pointer/touch-friendly controls. Tap, hold, drag, swipe, or large choice zones are preferred.
- Do not rely on keyboard-only, hover-only, or tiny desktop controls.
- Keep action zones large and edge-aware. Primary play should stay prominent and reachable across container sizes.
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
- Use helpers from `src/playable-assets.ts` to find images/audio/video.
- For image assets, load URLs in a scene `preload()` with `this.load.image("key", asset.url)`.
- Static files live in `public/assets` and are referenced as `assets/name.png`.
- Always provide a shape/color fallback when an asset is missing or fails to load.

## Game Recipe Hints
- Dodge game: player moves between lanes, hazards fall, collectibles increase combo.
- Tap timing: moving target crosses a sweet spot; tap inside the zone for points.
- Runner: avatar auto-runs; tap/hold jumps or dashes; obstacles scroll.
- Slingshot: drag and release to launch an object at targets.
- Rhythm tap: timed notes fall; tap zones score perfect/good/miss.
- Physics toy: falling objects merge, bounce, stack, or trigger chain reactions.
- Choice challenge: large tap zones trigger different reactions, then collapse into a short result scene.
- Reaction toy: one prop or character changes mood, scale, particles, text, or score based on repeated taps/drags.

## Avoid
- Do not leave the starter game unchanged if it does not match the user's prompt.
- Do not build a marketing homepage before the playable.
- Do not show template names, blueprint language, implementation steps, or developer UI.
- Do not create React-only button/card experiences, DOM games, or CSS-only interactions when the prompt asks for playable content.
- Do not import another game engine or rendering library unless the user explicitly asks and the dependency is available.
- Do not add dependencies that are not already in the template unless the project truly cannot work without them.

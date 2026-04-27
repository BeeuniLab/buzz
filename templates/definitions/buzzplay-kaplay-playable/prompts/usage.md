# Usage

## Product Fit
- Build BuzzPlay arcade playable content: tap/dodge/collect loops, runners, reaction games, rhythm taps, physics toys, snake/flappy/breakout-like games, score challenges, and mobile feed mini-games.
- Treat vague ideas as game prompts. Ship a complete playable loop with start, play, fail/win/result, and replay.
- Make the first 3 seconds obvious: one primary action, visible movement, immediate feedback, score/progress, and a satisfying finish.
- Avoid conventional app/page structure unless the creator explicitly asks for it. BuzzPlay output should feel like playable media, not a marketing website or dashboard.

## KAPLAY Rules
- Reference the official KAPLAY guides when unsure about API patterns: https://kaplayjs.com/docs/guides/
- Put the actual game in `src/game/playable-game.ts`. React should only mount the canvas and light platform chrome.
- Use KAPLAY scenes for `start`, `game`, and `result` states. Keep scene code small and readable.
- Prefer KAPLAY components (`pos`, `area`, `body`, `move`, `anchor`, `sprite`, `rect`, `circle`, `text`) instead of hand-rolled DOM movement.
- Use collisions for game outcomes (`onCollide`) and `onUpdate` / `loop` for motion and spawning.
- Keep all game state local: score, combo, lives, timer, progress, result title, and replay.
- Use KAPLAY's scene/state APIs for gameplay. Do not drive core animation or collision with React state.

## Mobile And Preview Rules
- Portrait first. The canvas must fill the iframe/mobile viewport without page scrolling.
- Use pointer/touch-friendly controls. Tap, hold, drag, swipe, or one-thumb lanes are preferred.
- Do not rely on keyboard-only, hover-only, or tiny desktop controls.
- Keep action zones large and safe-area friendly. Primary play should happen in the lower two-thirds of the screen.
- Avoid text-heavy instructions. Use short labels and visual cues.
- Keep frame logic lightweight; do not add large external assets unless the user provided them.

## Files To Edit First
- `src/game/playable-game.ts` is the main game loop, scenes, movement, collision, score, and result logic.
- `src/pages/HomePage.tsx` mounts the KAPLAY canvas and optional React overlay.
- `src/lib/playable-assets.ts` parses uploaded media from `src/asset_map`.
- `src/asset_map` is injected by BuzzPlay and may be `{}` when no assets are provided.
- `src/main.tsx` intentionally avoids React StrictMode so KAPLAY is not double-initialized in development.

## Assets
- Uploaded media is listed in `src/asset_map` as JSON: `{ "images/name.png": { "url": "...", "description": "..." } }`.
- Use helpers from `src/lib/playable-assets.ts` to find uploaded images/audio/video.
- If the user uploaded a relevant image, use it as a sprite, background, collectible, target, avatar, or result-card visual.
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
- Do not create a React-only button/card experience when the prompt asks for a game.
- Do not import Phaser, PixiJS, Three.js, or Matter.js in this template unless the user explicitly asks.
- Do not add dependencies that are not already in the template unless the project truly cannot work without them.

# Usage

## Product Fit
- Build BuzzPlay arcade playable content: tap/dodge/collect loops, runners, reaction games, rhythm taps, physics toys, snake/flappy/breakout-like games, score challenges, and iframe-ready mini-games.
- Treat vague ideas as game prompts. Ship a complete playable loop with start, play, fail/win/result, and replay.
- Make the first 3 seconds obvious: one primary action, visible movement, immediate feedback, score/progress, and a satisfying finish.
- Treat game feel as required: large readable HUD, instant feedback, satisfying motion, score/progress response, and a replayable result state.
- Avoid conventional app/page structure unless the creator explicitly asks for it. BuzzPlay output should feel like playable media inside the preview iframe, not a marketing website or dashboard.

## Development Planning
- Before a new playable or substantial gameplay/visual change, create or update `docs/game-plan.md` inside the generated project. Do not write planning docs under `.codex`, `.buzz`, temp folders, or outside the repository.
- Keep the plan concise with these headings: Creator Brief, Core Loop, Visual Direction, UIX And Controls, Assets And Media, Aspect Ratio Layout, Implementation Tasks, Smoke Checks.
- Use the plan as the implementation contract; update it if the build changes direction while coding.
- Do not pause for user confirmation unless genuinely blocked, and do not show the plan, template names, or implementation steps inside the playable UI.

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
- The default playable target is 720x1280 portrait. If the BuzzPlay prompt requests 16:9 landscape, set the Phaser game config to 1280x720 and compose gameplay for that wider frame.
- Do not add a fake phone frame, device mockup, centered max-width mobile shell, or nested viewport card unless the creator explicitly asks for one.
- Use pointer/touch-friendly controls. Tap, hold, drag, swipe, or large choice zones are preferred.
- Do not rely on keyboard-only, hover-only, or tiny desktop controls.
- Keep action zones large and edge-aware. Primary play should stay prominent and reachable across container sizes.
- Avoid text-heavy instructions. Use short labels and visual cues.
- Keep every readable label legible in the requested preview aspect ratio without zooming. At 720x1280 portrait or 1280x720 landscape design resolution, use at least 34px for HUD/status text, at least 40px for instructions and button labels, and at least 56px for titles, result messages, or primary calls to action. Shorten copy before reducing type size.
- Keep frame logic lightweight; do not add large external assets unless the user provided them.

## Game Feel And Polish
- Read `skills/game-feel/SKILL.md` before implementing gameplay feedback, readable state, start/result flow, or replay polish.
- Read `skills/visual-direction/SKILL.md` before coding the scene's palette, shape language, type scale, motion signature, and layered presentation.
- If the request is broad or does not clearly specify a mechanic, read `skills/game-type-recipes/SKILL.md` to choose one primary microgame loop and reference pattern.
- If the request asks for stronger feel, polish, animation, effects, audio, or reference-quality presentation, read `skills/presentation-polish/SKILL.md`.
- Then read the most relevant specialized skill: `arcade-action`, `puzzle-board`, `idle-tycoon-clicker`, `choice-quiz-story`, `media-interaction`, and/or `pixel-retro`.
- Prefer helpers from `src/game/game-feel.ts` when they fit the game type: large status text, floating score/resource text, particle bursts, button press feedback, short camera kicks, flashes, pulses, and squash/stretch.
- Every core action should create at least two appropriate feedback signals: object pulse, selection highlight, state change, floating text, tile/card animation, particle burst, camera kick, tint flash, sound, reveal, or gameplay consequence.
- Build the first playable pass as a complete 15-30 second loop: ready/start, active play, escalating challenge or progress, result, replay.
- Match the quality bar of a finished mobile microgame: full-bleed stage, strong subject-specific visual theme, visible motion in the first second, large HUD, big touch targets, juicy feedback, and a fast replay loop.
- Choose feedback by genre. Action games can use particles, trails, and camera kicks; puzzle/word/card games should prioritize board state, previews, valid/invalid highlights, and completion animations; clickers need resource ticks, upgrade states, and milestones; choice/story games need selection, reveal, and result polish; pixel games need crisp palette-consistent flashes and chunky motion.
- Prefer a few polished objects or states with clear feedback over many thin systems or tiny controls.
- Before finishing, smoke-check one round: first action obvious, touch works, state updates, result/replay works, resize keeps content visible, and no debug markers remain.

## Files To Edit First
- `src/game/scenes/Game.ts` is the main gameplay scene. Replace the starter content here for most simple playable requests.
- `src/game/scenes/GameOver.ts` is the result/replay scene.
- `src/game/scenes/Preloader.ts` loads sprites/audio before gameplay.
- `src/game/game-feel.ts` provides reusable finished-game feedback helpers.
- `src/playable-assets.ts` parses available media from `src/asset_map`.
- `src/asset_map` starts with bundled starter assets and is updated by BuzzPlay when users upload media.
- `src/App.tsx`, `src/PhaserGame.tsx`, `src/main.tsx`, `vite.config.js`, `package.json`, `wrangler.jsonc`, and `worker/*` are infrastructure. Do not edit them unless explicitly required.

## Assets
- Available media is listed in `src/asset_map` as JSON: `{ "images/name.png": { "url": "...", "description": "..." } }`.
- Bundled starter assets use local URLs such as `assets/apple.png`; uploaded assets use BuzzPlay `/api/projects/.../assets/file/...` URLs.
- Use helpers from `src/playable-assets.ts` to find images/audio/video.
- For image assets, load URLs in a scene `preload()` with `this.load.image("key", asset.url)`.
- When uploaded images or media are central to the request, make them the main playable object or stage prop and add invisible, natural touch zones around meaningful regions. Transform the real media or nearby props; avoid drawing permanent debug zones or fake replacement features unless the creator explicitly asks for them.
- Static files live in `public/assets` and are referenced as `assets/name.png`.
- Always provide a shape/color fallback when an asset is missing or fails to load.

## Game Recipe Hints
- Arcade action: use `skills/arcade-action/SKILL.md` for dodge, collect, runner, shooter, reaction, timing, rhythm, survival, and collision games.
- Puzzle board: use `skills/puzzle-board/SKILL.md` for blocks, word puzzles, matching, card flips, merge boards, tile placement, and grid logic.
- Idle/clicker/tycoon: use `skills/idle-tycoon-clicker/SKILL.md` for resource growth, upgrades, shops, milestone unlocks, and incremental loops.
- Choice/quiz/story: use `skills/choice-quiz-story/SKILL.md` for quizzes, meme reveals, social challenges, voting, story choices, and result toys.
- Uploaded media interaction: use `skills/media-interaction/SKILL.md` when user images, GIFs, videos, memes, or uploaded assets are central to the request.
- Pixel/retro style: use `skills/pixel-retro/SKILL.md` for pixel, 8-bit, 16-bit, CRT, low-resolution, or tile/sprite-sheet looks.
- Visual direction: use `skills/visual-direction/SKILL.md` for every playable to set subject-specific palette roles, shape language, type, motion, and layers.
- Game type recipes: use `skills/game-type-recipes/SKILL.md` when translating a broad idea, subject, uploaded image, meme, or reference into a concrete playable loop.
- Presentation polish: use `skills/presentation-polish/SKILL.md` when improving animation, impact, VFX, audio cues, media integration, and reference-style feel.

## Avoid
- Do not leave the starter game unchanged if it does not match the user's prompt.
- Do not build a marketing homepage before the playable.
- Do not show template names, blueprint language, implementation steps, or developer UI.
- Do not create React-only button/card experiences, DOM games, or CSS-only interactions when the prompt asks for playable content.
- Do not import another game engine or rendering library unless the user explicitly asks and the dependency is available.
- Do not add dependencies that are not already in the template unless the project truly cannot work without them.

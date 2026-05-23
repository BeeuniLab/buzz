# BuzzPlay Phaser Reference

Phaser 4 + React + Vite + TypeScript reference used by BuzzPlay playable templates.

## Folder Structure

- `src/game/scenes` - Phaser scenes for start, gameplay, preloader, and result states
- `src/game/main.ts` - Phaser game configuration
- `src/game/game-feel.ts` - reusable helpers for HUD text, floating score, particles, press feedback, and camera kicks
- `skills/game-feel/SKILL.md` - baseline generation guidance for finished mobile microgame feel, readable state, touch feedback, result/replay flow, and polish
- `skills/visual-direction/SKILL.md` - compact visual identity guidance for palette roles, shape language, type, motion, and layered presentation
- `skills/game-type-recipes/SKILL.md` - microgame type selection, presentation references, and subject-to-loop recipes
- `skills/presentation-polish/SKILL.md` - animation, impact, VFX, audio cue, media integration, and reference-style polish guidance
- `skills/arcade-action`, `skills/puzzle-board`, `skills/idle-tycoon-clicker`, `skills/choice-quiz-story`, `skills/media-interaction`, and `skills/pixel-retro` - specialized gameplay and style guidance
- `src/App.tsx` and `src/PhaserGame.tsx` - thin fullscreen React host for the Phaser canvas
- `src/playable-assets.ts` and `src/asset_map` - bundled starter assets plus uploaded media references used by BuzzPlay
- `public/assets` - bundled starter sprites/images
- `skills` - read-only Phaser 4 subsystem guides copied from the official Phaser repo for AI code generation reference
- `worker` - Cloudflare Worker shell for API/error routes and static asset serving

## Development

```sh
npm run dev
```

The dev server uses the `PORT` env var when provided by the sandbox.

```sh
npm run typecheck
```

Runs strict TypeScript checks for the playable.

## Distribution

```sh
npm run build
```

Builds the Vite app for Cloudflare deployment.

```sh
npm run deploy
```

Builds and deploys through Wrangler.

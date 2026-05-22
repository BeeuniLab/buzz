# BuzzPlay Phaser Reference

Phaser 4 + React + Vite + TypeScript reference used by BuzzPlay playable templates.

## Folder Structure

- `src/game/scenes` - Phaser scenes for start, gameplay, preloader, and result states
- `src/game/main.ts` - Phaser game configuration
- `src/game/asset-interactions.ts` - optional helpers for turning uploaded photos/assets into invisible tap, drag, drop, and hit zones
- `src/game/media-annotation-zones.ts` - standard normalized region annotations for uploaded media interactions
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

## Media Interaction Zones

When uploaded media needs direct interaction, inspect the visible content and define `AnnotatedMediaRegion[]` in normalized image coordinates, then convert with `defineMediaZoneSet()`. Use these fixed zones for face parts, hands, buttons, props, products, stickers, or other semantic regions. Do not paint replacement facial features, move the whole chin/neck region, or run recognition loops in `update()`; map fixed zones with `zoneToWorld()` or `zonesToWorld()` as the image layout changes.

## Distribution

```sh
npm run build
```

Builds the Vite app for Cloudflare deployment.

```sh
npm run deploy
```

Builds and deploys through Wrangler.

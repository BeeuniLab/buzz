# BuzzPlay Phaser Reference

Phaser + React + Vite + TypeScript reference used by BuzzPlay playable templates.

## Folder Structure

- `src/game/scenes` - Phaser scenes for start, gameplay, preloader, and result states
- `src/game/main.ts` - Phaser game configuration
- `src/App.tsx` and `src/PhaserGame.tsx` - thin fullscreen React host for the Phaser canvas
- `src/playable-assets.ts` and `src/asset_map` - bundled starter assets plus uploaded media references used by BuzzPlay
- `public/assets` - bundled starter sprites/images
- `assets` - folder structure reserved for user-uploaded media
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

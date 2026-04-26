# Usage

## Product Fit
- Build BuzzPlay playable content: mobile-first interactive posts, tiny games, visual challenges, character toys, quizzes, tap/drag loops, reveal mechanics, and result cards.
- Treat vague ideas as creative prompts. Ship a complete playable first screen, not a landing page, placeholder, or technical demo.
- Keep the experience instantly understandable in a feed: one clear action, responsive feedback, and a satisfying finish/replay/share moment.

## Mobile And Preview Rules
- Design for portrait first. The root UI should fill the iframe/mobile viewport using `100svh`/`100dvh` friendly layouts.
- Keep all primary controls reachable by thumb and avoid hover-only interactions.
- Support pointer/touch interactions with `onPointer*` handlers. Do not rely on desktop-only drag behavior.
- Prevent layout shift: stage, counters, toolbars, and action zones need stable dimensions.
- Text must fit inside buttons and panels at mobile widths. Use concise labels and wrap long copy.

## Files To Edit First
- `src/pages/HomePage.tsx` is the playable entry point. Replace the starter concept with the user's requested experience.
- `src/components/playable/PlayableStage.tsx` provides the mobile-first stage shell.
- `src/components/playable/ResultCard.tsx` provides a reusable result/replay pattern.
- `src/hooks/use-pointer-drag.ts` provides touch/pointer drag state.
- `src/hooks/use-playable-viewport.ts` exposes viewport dimensions and CSS vars for mobile browser chrome.
- `src/lib/playable-assets.ts` parses `src/asset_map` for uploaded images/audio/video.

## Assets
- Uploaded media is listed in `src/asset_map` as JSON: `{ "images/name.png": { "url": "...", "description": "..." } }`.
- Use helpers from `src/lib/playable-assets.ts` to find the first image/audio/video or search descriptions.
- If the user uploaded a reference image, incorporate it visibly when it matches the idea.
- Always provide a graceful fallback when an asset is missing.

## Implementation Guidance
- Prefer React state and small components for score, phase, choices, timers, and result generation.
- Use `lucide-react` icons for buttons and controls when an icon exists.
- Use Tailwind for layout and styling. Keep custom CSS minimal and purposeful.
- Use `framer-motion` only when it improves a specific interaction; simple CSS transitions are usually enough.
- Keep data local unless the user explicitly asks for persistence, accounts, leaderboards, or backend behavior.

## Routing
- Uses `createBrowserRouter`. Do not switch to `BrowserRouter`, `HashRouter`, or `MemoryRouter`.
- Add routes in `src/main.tsx` only if the requested playable truly needs multiple screens.

## Avoid
- Do not expose template names, blueprint language, implementation steps, or developer instructions inside the app UI.
- Do not leave the starter content intact if it does not match the user's prompt.
- Do not create a marketing homepage before the playable experience.
- Do not use tiny desktop controls, hover-only affordances, or layouts wider than the preview frame.

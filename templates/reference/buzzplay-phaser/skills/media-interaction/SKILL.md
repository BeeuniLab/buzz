---
name: media-interaction
description: "Use this skill when uploaded images, GIFs, videos, memes, stickers, or user-provided assets are central to the Phaser playable."
---

# Media Interaction

User media should feel like the subject of the game, not a texture pasted behind unrelated controls. Keep interactions natural, avoid permanent debug marks, and make the uploaded asset visibly respond.

## Asset Use

- Inspect `src/asset_map` and use `src/playable-assets.ts` to select suitable images/audio/video.
- Load uploaded asset URLs with Phaser loaders; do not copy or replace user uploads unless the creator asks.
- If an external web asset is needed, download it into `public/assets/generated/` first to avoid CORS breakage.
- Provide a simple shape fallback if the requested asset is missing or fails to load.

## Interaction Design

- Make the uploaded media the main playable object, avatar, stage, puzzle board, prop, collectible, hazard, or result visual.
- Use invisible, generous hit zones over meaningful regions instead of visible debug boxes.
- Transform the real media when possible: scale, crop, mask, tint, wobble, shake, reveal, spotlight, or attach props.
- If exact semantic regions matter, define normalized coordinates once in code based on the visible image and reuse them for taps, drags, masks, scoring, and tween targets.
- Prefer interactions around the asset when semantic precision is uncertain: stickers, props, frames, spotlights, cutout motion, collectibles, hazards, captions, or reveal masks.
- If a request needs direct interaction with a region of an uploaded image, define named normalized regions in code and keep them reusable for input, animation, scoring, and visual effects.

## Feedback

- On tap/drag: subject reacts locally, not just via text. Use pulse, wobble, tint, prop movement, small burst, score/progress, or result reveal.
- When the asset is a photo, avoid drawing fake facial/body features unless explicitly requested. Prefer props, overlays, masks, highlights, or transformations around the real content.
- Keep discovery subtle: first-use pulse, brief instruction, or invisible large zones. Remove tuning overlays for final output.
- Use feathered-looking overlays, shadows, frames, or color tint to make web/media assets feel integrated with the game world.

## Layout

- Preserve the asset's aspect ratio.
- Use cover/contain intentionally and know which coordinates match the displayed image.
- Keep controls outside the important part of the media.
- Make sure mobile touch input does not fight page scrolling or iframe gestures.

## Avoid

- Do not draw permanent rings, boxes, coordinates, or labels on user media.
- Do not run expensive image detection in `update()`.
- Do not assume `asset_map` keys are local file paths.
- Do not load gameplay media directly from arbitrary external URLs.
- Do not fake precise facial/body transformations unless the requested effect can be made believable with the provided asset and time.

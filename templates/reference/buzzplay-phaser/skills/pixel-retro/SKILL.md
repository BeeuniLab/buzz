---
name: pixel-retro
description: "Use this skill for Phaser games with pixel, retro arcade, 8-bit, 16-bit, Game Boy, CRT, low-resolution, or tile/sprite-sheet visual styles."
---

# Pixel Retro

Pixel and retro styles look best when the whole presentation follows the same rules. Crisp edges, limited palette, stepped motion, chunky text, and tile-aligned feedback matter more than smooth glow or modern UI polish.

## Visual Rules

- Use pixel-art assets, blocky shapes, tilemaps, or low-resolution sprites consistently.
- Prefer integer positions and scales for sprites and grid elements where possible.
- Keep outlines chunky and shadows hard. Avoid soft gradients unless the prompt asks for a hybrid neon/retro look.
- Use a limited palette with strong contrast. Make hazards, rewards, and player states distinct.
- Disable smoothing for pixel textures when appropriate and avoid blurry scaling.
- Pick one retro reference direction: arcade cabinet, handheld LCD, Game Boy, 16-bit platformer, CRT shooter, terminal roguelike, or sticker-pixel hybrid.

## Text And UI

- Use short labels and large bitmap/pixel-style text.
- Keep UI panels simple: rectangular, chunky borders, limited colors, clear icons.
- Avoid thin strokes, tiny body text, glass cards, and delicate shadows.
- CRT scanlines, vignette, or screen curve are optional style touches, not required for every pixel game.

## Motion And Feedback

- Use snappy, stepped, or frame-like motion: 2-4 frame idle loops, blink, palette flash, hit freeze, bounce by a few pixels.
- For hits or pickups, prefer sprite flash, tile pop, score tick, or small pixel debris over soft particles.
- Screen shake can be crisp and short for collisions, explosions, and boss hits.
- If using particles, make them square/blocky and palette-consistent.
- Use brief hit stop or one-frame palette inversion for important impacts; it often reads better than smooth squash in pixel style.

## Gameplay Fit

- For arcade pixel games, combine with `skills/arcade-action/SKILL.md`.
- For pixel puzzles or tile games, combine with `skills/puzzle-board/SKILL.md`.
- For retro clickers, combine with `skills/idle-tycoon-clicker/SKILL.md`.

## Avoid

- Do not mix pixel sprites with smooth vector UI unless it is clearly intentional.
- Do not use small unreadable pixel text.
- Do not scale font size with viewport width; choose fixed readable sizes and responsive layout instead.
- Do not add modern bokeh/orb decoration to a pixel scene.
- Do not blur or anti-alias the main pixel objects while scaling for mobile.

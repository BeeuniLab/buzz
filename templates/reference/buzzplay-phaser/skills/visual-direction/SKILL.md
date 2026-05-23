---
name: visual-direction
description: "Use this skill before coding any BuzzPlay Phaser playable to choose a subject-specific visual identity, palette roles, shape language, motion signature, and readable layered presentation."
---

# Visual Direction

A BuzzPlay playable should look intentionally designed for its subject. Phaser can match the polish of single-file HTML examples when the scene has a clear visual rule, readable layers, and a style-specific feedback language.

Use this skill before implementing the scene. Keep the visual brief implicit in the work; do not print process notes in the game.

## Quick Visual Brief

Decide these before coding:

- **Anchor:** one phrase for the look, such as candy arcade, haunted toybox, terminal neon, cozy sticker shop, paper cutout, crisp pixel, sports broadcast, or comic quiz.
- **Palette roles:** background, primary subject, reward, hazard/error, neutral UI, and highlight. Three to six strong colors usually beats many similar shades.
- **Shape language:** rounded toy shapes, hard sci-fi angles, chunky pixel blocks, paper cards, sticker cutouts, neon rails, soft blobs, or clean sports panels.
- **Type style:** large labels that match the mood. Use short all-caps arcade labels, friendly rounded labels, chunky pixel text, or quiet quiz text as appropriate.
- **Motion signature:** bounce, snap, float, squash, flip, jitter, smear, pulse, slide, or stepped pixel motion. Use this consistently for the main interactions.

## Presentation Layers

Build the scene in clear layers:

- Background that supports the fantasy without stealing touch focus.
- Main subject or board large enough to read instantly.
- Primary interaction affordance: target, lane, tray, cards, avatar, button, or touch zone.
- Large state HUD: score, timer, progress, health, resource, combo, or step.
- Transient feedback: popups, flashes, particles, trails, highlights, shakes, or reveals.
- Result/replay layer that feels like a payoff, not just a modal.

## Style Recipes

- **Arcade action:** saturated contrast, big silhouettes, trails, warning colors, short camera hits, and reward bursts.
- **Puzzle/board:** stable board geometry, clear cell states, calm background, crisp valid/invalid previews, satisfying completion sweep.
- **Tycoon/clicker:** bright resource tokens, tappable centerpiece, affordable/locked button states, upgrade glow, visible world improvement.
- **Choice/quiz/story:** central prop or character, expressive option cards, quick selection animation, staged reveal, strong result visual.
- **Uploaded media:** let the real asset dominate; use frames, props, masks, tint, subtle spotlight, and invisible zones instead of visible debug marks.
- **Pixel/retro:** limited palette, integer-aligned motion, chunky UI, sprite flashes, small blocky debris, no soft modern glass unless intentional.

## Readability Rules

- Make the first action visible without reading a paragraph.
- Keep important text high-contrast and large in a 9:16 mobile iframe.
- Do not use a one-note palette where everything is a variant of the same hue.
- Use non-color cues for important state: shape, icon, position, scale, stroke, motion, or sound.
- Put the requested subject in the first viewport and main play area, not only in title text.

## Avoid

- Do not ship the default starter palette or generic UI if it does not match the prompt.
- Do not add decorative particles, glows, or panels that obscure the core action.
- Do not mix many unrelated styles unless the prompt asks for collage or chaos.
- Do not make the scene look like a web app card stack when the request is playable media.

# Buzzplay Content Guide

## Content Direction

- Make the requested subject the center of the game. Mechanics, scoring, pacing, visuals, copy, and feedback should all express that subject.
- Prefer one strong, playable idea over many thin features.
- Build a complete small game with a start state, active play, feedback, failure or success, and a clear result state.
- Keep text concise and purposeful. Use labels, prompts, and result copy only when they add meaning.

## Gameplay

- Make the primary action clear immediately.
- Give each action immediate feedback through animation, score changes, timing, particles, camera motion, or consequence.
- Tune difficulty, pacing, and restart flow so the first round feels satisfying.
- Support touch and pointer input naturally; add keyboard input when it fits the game.

## Visual And Audio Style

- Choose a visual style that fits the subject instead of relying on a default palette.
- Use contrast, scale, spacing, and motion to guide attention to the important game objects.
- Use sprites, generated shapes, tilemaps, particles, or media deliberately; avoid filler imagery.
- Add lightweight sound only when it improves feedback or atmosphere, and keep it optional or non-disruptive.

## Engineering

- Work within the existing Phaser, React, and Vite structure.
- Keep changes focused and avoid broad rewrites.
- Do not edit `.buzz`, `.codex`, `.git`, `.wrangler`, `node_modules`, `dist`, or `build`.
- Do not remove host integration files or runtime hooks.
- Leave the project runnable with the existing scripts.

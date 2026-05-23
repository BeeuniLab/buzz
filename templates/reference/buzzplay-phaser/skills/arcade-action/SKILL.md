---
name: arcade-action
description: "Use this skill for Phaser arcade action games: dodge, collect, runner, shooter, reaction, timing, rhythm, chase, collision, survival, and short score challenges."
---

# Arcade Action

Arcade action playables should be readable while moving. The player should understand what to do in one glance, then feel each collision, dodge, hit, collect, miss, or combo immediately.

## Core Loop

- Start with one large, obvious action: move, tap, dodge, jump, shoot, catch, slice, or time a hit.
- Make the danger/reward language visually clear: hazards, collectibles, target zones, player, and goal should look distinct.
- Keep the first round short and escalating. Increase speed, spawn rate, target size, or pattern complexity gradually.
- Let the player recover from early mistakes. One instant failure is fine for reaction games, but most action games feel better with health, misses, or a short warning.
- Design around a 15-30 second run: opening cue, a few escalating beats, a clear final push, then score/result/retry.

## Feedback

- Use strong feedback for collisions, hits, rewards, and misses: squash/stretch, tint flash, score popup, short camera kick, burst, trail, or sound.
- Telegraph danger before impact with a glow, warning line, shadow, countdown, lane marker, or spawn animation.
- Reward skill with combo, streak, perfect/good/miss, speed-up, or temporary power-up.
- Use `src/game/game-feel.ts` helpers when they match the style: `pulseTarget`, `squashStretchTarget`, `floatingScoreText`, `burstParticles`, `screenKick`, and `screenFlash`.
- Use anticipation and recovery: a hazard should enter with a cue, a hit should briefly freeze/flash, and the player should regain control cleanly.

## Layout

- Keep the player, target lane, or main touch zone away from the extreme mobile edges.
- Avoid tiny moving targets unless the whole game is about precision.
- For runners and dodgers, reserve a consistent lane/track area and keep HUD outside it.
- For rhythm/timing, make timing zones persistent and readable; use color and scale changes for hit quality.

## Patterns

- **Dodge/collect:** player follows pointer, collectible pulls in or pops, hazard warns then hurts.
- **Runner:** automatic motion, one touch action, forgiving restart, clear obstacle rhythm.
- **Shooter:** aim or tap targets, projectiles have trails, enemies flash when hit, waves are short.
- **Reaction/timing:** large target, shrinking window, perfect/good/miss feedback, fast retry.
- **Survival:** show health/misses clearly, spawn waves with brief breathing room.
- **Boss/toy target:** large center target, visible weak spots, escalating phases, oversized hit reactions.

## Avoid

- Do not hide the next hazard behind the player's finger area.
- Do not rely on keyboard controls as the primary input.
- Do not make all objects move at the same speed or color; the player needs visual hierarchy.
- Do not overuse camera shake. Big shake is for major impacts, not every tap.
- Do not create a system that only becomes fun after a long upgrade curve; BuzzPlay needs an immediate first-session payoff.

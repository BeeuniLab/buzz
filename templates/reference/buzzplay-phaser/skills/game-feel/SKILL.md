---
name: game-feel
description: "Use this baseline skill for every BuzzPlay Phaser playable. Covers first-action clarity, touch-first feedback, readable state, result/replay flow, and choosing appropriate polish for the game type."
---

# Game Feel

BuzzPlay playables should feel complete in the first few seconds. A small game with one clear action, understandable state, and a polished loop usually works better than a larger game with thin systems.

Use this skill for every Phaser playable unless the creator explicitly asks for a static visual. The goal is not more features; the goal is a stronger first round.

After reading this baseline skill, read `skills/visual-direction/SKILL.md`. If the gameplay type is unclear or broad, read `skills/game-type-recipes/SKILL.md`, then read the most relevant specialized skill:

- `skills/arcade-action/SKILL.md` for dodge, runner, shooter, reaction, timing, rhythm, chase, and collision games.
- `skills/puzzle-board/SKILL.md` for grid puzzles, word games, match games, block placement, cards, and board logic.
- `skills/idle-tycoon-clicker/SKILL.md` for clickers, upgrade loops, resource growth, shops, tycoon, and incremental games.
- `skills/choice-quiz-story/SKILL.md` for quizzes, choose-one challenges, interactive story, reveal, voting, and result toys.
- `skills/media-interaction/SKILL.md` when uploaded images, GIFs, video stills, memes, or user assets are the main subject.
- `skills/pixel-retro/SKILL.md` when the requested style is pixel, retro arcade, 8-bit, Game Boy, CRT, or low-resolution.
- `skills/presentation-polish/SKILL.md` when the core loop works but the playable needs stronger animation, visual effects, audio cues, or reference-quality presentation.

## Required Playable Shape

- Start with a clear ready state or instantly obvious first action.
- Keep one primary action visible and reachable on mobile: tap, hold, drag, swipe, dodge, collect, slice, aim, or choose.
- Show the current state clearly: score, progress, timer, health, combo, objective, selected item, next piece, current word, resource count, or story step.
- Give every important action at least two appropriate feedback signals: object reaction, state change, animation, highlight, shake, sound, color flash, score/progress change, particles, camera motion, or reveal.
- Include a result or replay state. Do not leave the player stranded after failure or success.
- Make the subject of the request visible in the main play area, not only in the title or result text.

## Mini Vertical Slice

Treat every generated playable as a tiny vertical slice, not a tech demo. The first pass should prove one complete player experience:

- **Start:** the player sees what to touch or do immediately.
- **Challenge:** the core action repeats with slight escalation, choice, risk, timing, or progress.
- **Resolution:** the round ends with a result, reveal, win/fail, unlocked state, or score payoff.
- **Replay:** the player can restart without refreshing the iframe.

Cut scope before cutting quality. If the idea starts sprawling, keep one polished loop, one strong visual identity, and one clear payoff.

## Use The Helper

Use `src/game/game-feel.ts` when its helpers fit the game type:

```ts
import {
	createHudText,
	floatingScoreText,
	burstParticles,
	screenKick,
	screenFlash,
	makePillButton,
	pulseTarget,
	squashStretchTarget,
} from '../game-feel';
```

Common uses:

```ts
this.scoreLabel = createHudText(this, 120, 64, '0', { fontSize: 48 });

floatingScoreText(this, player.x, player.y - 48, '+10');
burstParticles(this, collectible.x, collectible.y, { color: 0xffd23f, count: 18 });
screenKick(this, 120, 0.006);
screenFlash(this, { color: 0xfff4a8, duration: 90 });
pulseTarget(this, player);
squashStretchTarget(this, target, { scaleX: 1.2, scaleY: 0.82 });

makePillButton(this, this.scale.width / 2, this.scale.height - 110, 'PLAY', () => {
	this.scene.restart();
});
```

These helpers are optional tools, not a required visual style. A word puzzle may use tile highlights and invalid-word shake instead of particles. A pixel game may use crisp flashes and stepped movement instead of smooth glow. A story choice may use card flips and result reveal instead of camera kick.

## Finished-Game Checklist

- **Readable:** Status text, labels, counters, or selected-state indicators are large, high-contrast, and readable in a 9:16 mobile iframe.
- **Alive:** At least one object is moving, pulsing, bouncing, counting down, or reacting within the first second.
- **Responsive:** A tap/drag/choice immediately changes the object, selected state, score/progress, resource count, reveal, or scene consequence.
- **Layered:** Use a background, main play objects, readable state layer, transient feedback, and result overlay/scene. The exact layers depend on genre.
- **Replayable:** End the round quickly, show the outcome clearly, and provide a large replay button.

## Pre-Finish Smoke Check

Before finishing, mentally play one round from a new player's perspective:

- First action is obvious without developer explanation.
- Touch/pointer input works; keyboard is optional, not required.
- Score/progress/resource/health updates immediately after action.
- Failure, success, or timeout cannot leave the scene stuck.
- Replay resets timers, score, spawned objects, listeners, and tweens that could leak across scenes.
- Resize or 9:16 mobile preview keeps HUD, board, buttons, and main subject inside the iframe.
- There are no visible debug boxes, coordinates, placeholder labels, or template names.
- The final screen has a clear outcome and a large replay/tap-again action.

## Mobile State Rules

- At a 720x1280 design scale, use at least 34px for status text, 40px for instructions/buttons, and 56px for title/result text.
- Keep status near edges but inside safe margins. Avoid putting tiny controls in corners.
- Use high contrast: text stroke, shadow, panel, or bright-on-dark pairing.
- Keep labels short. Prefer `SCORE 120`, `3 LIVES`, `NEXT`, `LEVEL 4`, `TAP`, `DRAG`, or `CHOOSE`.

## Feedback Recipe

For each core interaction, add:

- Object reaction: scale pulse, squash, bounce, or tint flash.
- Local feedback: particles, trail, burst, ripple, tile highlight, invalid shake, card flip, resource tick, selection ring, or floating score.
- Game consequence: score, combo, health, timer, progress, new wave, next piece, unlocked upgrade, revealed word, or state change.
- Optional camera feedback: short `screenKick()` for hits, collisions, combos, or level clears. Skip it for calm puzzles, cozy toys, and precise board games unless it helps.

Good default action recipe:

1. `pulseTarget()` or `squashStretchTarget()` on the touched/collided object.
2. `floatingScoreText()` close to the action.
3. `burstParticles()` in a color that matches the reward/hazard.
4. Update the relevant state display immediately.
5. Use `screenKick()` or `screenFlash()` sparingly for big hits, failures, or round clear.

Good default puzzle/choice recipe:

1. Highlight what changed.
2. Animate the accepted or rejected choice.
3. Update progress/state.
4. Reveal the next step.
5. Reserve bigger effects for completion, streaks, or failure.

## Avoid

- Do not ship a static title card with only a tiny moving object.
- Do not rely on instructions to explain the game; make the first interaction visible.
- Do not make UI text small to fit more copy. Shorten the copy.
- Do not use permanent debug markers, bounding boxes, or implementation labels in the final playable.
- Do not add many small buttons when one large touch action would be more fun.
- Do not use only text changes as feedback. The main object must visibly react.
- Do not force particles, shake, or a large HUD into genres where clear board state, pixel-consistent flashes, or calm progression would be better.

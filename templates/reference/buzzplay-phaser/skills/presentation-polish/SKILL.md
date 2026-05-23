---
name: presentation-polish
description: "Use this skill when a BuzzPlay Phaser playable needs stronger game feel, animation, visual effects, audio cues, media integration, or reference-quality presentation."
---

# Presentation Polish

Use this after the core loop works. Add a few high-impact polish layers that match the game type instead of scattering effects everywhere.

## High-Impact Passes

- **Anticipation:** warn or wind up before a big event: shrinking target, flashing lane, stretched sprite, countdown tick, or held pose.
- **Impact:** make contact readable: hit stop, squash/stretch, tint flash, particle burst, sound, haptic-friendly visual snap, or short camera kick.
- **Recovery:** let objects settle: bounce back, drift, fade, score popup, cleanup tween, or next-state reveal.
- **Escalation:** show the round getting hotter: faster spawn, richer background, danger tint, combo glow, higher pitch, or denser effects.
- **Payoff:** make completion feel staged: spotlight, wipe, confetti burst, board sweep, card flip, rank stamp, or result animation.

## Animation Patterns

- Use `Back`, `Cubic`, `Sine`, `Elastic`, or stepped easing intentionally; avoid linear motion for rewards and hits.
- Add brief overshoot to buttons, collectibles, upgrades, result stamps, and important reveals.
- For repeated actions, vary scale, angle, or particle count slightly so feedback does not feel mechanical.
- Use hit stop sparingly: pause the hit object or camera for 40-90ms, then release with burst/score.
- Keep precise board/puzzle motion ordered and readable; keep action motion snappy and exaggerated.

## Visual Effects

- Use effects to communicate state: reward, danger, selected, invalid, combo, low health, complete.
- Match VFX shape to style: round sparkles for cute, shards for action, squares for pixel, cards/flips for quiz, soft glow for cozy.
- Use screen flash or camera kick only for major events: hit, fail, clear, level up, combo break, or round complete.
- For media/photo playables, integrate assets with frame, shadow, tint, mask, spotlight, or prop overlays rather than drawing fake features.
- Prefer one signature effect repeated well over many unrelated effects.

## Audio And Tactile Feel

- Browser audio must start from user gesture; do not make sound required for understanding.
- Add short optional sounds for press, reward, hit, fail, purchase, reveal, and result when assets exist or can be generated locally.
- Pair visual impact with sound timing. A delayed sound makes the game feel loose.
- Use pitch variation for repeated pickups or taps.
- For mobile-feeling feedback, pair small screen shake, scale snap, and sound tick as if it were a haptic cue.

## Reference Translation

Translate references into principles:

- **WarioWare-like:** instant prompt, absurd action, 3-8 second beat, punchy success/fail.
- **Arcade cabinet:** bold HUD, clear silhouettes, score chase, strong hit flashes.
- **Mobile puzzle:** stable board, satisfying snap, valid preview, completion sweep.
- **Idle/clicker:** juicy center tap, resource rain, upgrade reveal, milestone glow.
- **Photo toy:** subject-first framing, invisible touch zones, props and masks, exaggerated but believable reactions.
- **Rhythm game:** persistent lanes, beat pulse, hit quality labels, synced flashes.

Do not copy names, characters, art, sounds, logos, or exact level layouts.

## Finish Check

- The biggest player action has anticipation, impact, and recovery.
- The final success/fail/reveal is more polished than ordinary interactions.
- Effects do not cover the HUD or important touch zones.
- Motion still reads on a 9:16 mobile iframe.
- The scene has one cohesive visual signature, not a pile of generic effects.

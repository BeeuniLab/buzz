---
name: idle-tycoon-clicker
description: "Use this skill for Phaser clicker, idle, tycoon, upgrade, resource, shop, merge economy, and incremental games."
---

# Idle Tycoon Clicker

Idle, tycoon, and clicker games feel good when every tap visibly turns into progress. The player should always know what resource changed, what can be upgraded next, and why one more tap matters.

## Core Loop

- Put the main tappable subject in the center or lower-middle touch area.
- Show the primary resource clearly: coins, energy, likes, damage, customers, followers, gems, or production.
- Give each tap or purchase immediate visual feedback: resource tick, object reaction, floating value, progress fill, unlock glow, or upgraded appearance.
- Include at least one short-term goal: next upgrade, level threshold, combo, boss health, production target, or milestone.
- Compress the first economy arc. The player should earn, buy, and see a visible upgrade within the first 20-30 seconds.

## Economy Presentation

- Use simple numbers and readable abbreviations: `1.2K`, `45K`, `3.4M`.
- Show affordance states: affordable, locked, purchased, maxed, cooldown, insufficient resource.
- Keep upgrade choices large and few. Three strong upgrade buttons are better than a dense spreadsheet.
- Make upgrades visibly change the world: larger subject, new worker, faster animation, richer background, new tier badge, or stronger hit effect.
- Show why the next tap matters: progress ring, next-cost label, milestone meter, or boss/resource bar.

## Feedback

- Taps: subject squash/stretch, floating resource, sound, small burst, progress tick.
- Purchase: button press, cost subtraction, upgrade glow, changed sprite/state, short confirmation text.
- Milestone: larger reveal, level-up flash, new area/skin/worker, result overlay, or prestige option.
- Failure/locked state: short button shake, muted color, "NEED 120" style label.

## Structure

- Separate play area, resource display, and upgrade/shop area.
- Keep upgrades reachable at the bottom on mobile, but do not cover the main subject.
- For timed clickers, show timer and end state. For idle toys, show goal/progress and a satisfying unlock sequence.
- Use a small upgrade set with strong state changes before adding extra currencies.

## Variants

- **Clicker:** one juicy tappable, combo/streak, resource popups, quick milestone.
- **Tycoon/shop:** visible customers/workers, production tick, upgrade cards, area improvement.
- **Merge economy:** stable grid/tray, merge preview, rarity colors, reward burst on upgrade.
- **Boss/resource race:** big health/progress bar, hit reactions, timed result, one power-up.

## Avoid

- Do not make resource changes invisible or delayed.
- Do not fill the screen with tiny upgrade rows.
- Do not make every button the same color regardless of affordable/locked state.
- Do not depend on long idle waiting; BuzzPlay posts need fast first-session payoff.
- Do not bury the main action under menus; upgrades should support the toy, not replace it.

---
name: puzzle-board
description: "Use this skill for Phaser board and puzzle games: blocks, word puzzles, match games, card matching, grid placement, tile logic, sorting, merge puzzles, and calm brain teasers."
---

# Puzzle Board

Puzzle board games feel polished when the board state is unmistakable. Prioritize clear grid geometry, selected-state feedback, legal/illegal previews, and satisfying completion animation over noisy action effects.

## Core Loop

- Keep the board centered, stable, and sized for mobile touch.
- Show current objective, progress, next piece, selected card, current word, or remaining moves clearly.
- Make each move readable before release: preview placement, highlight target cells, draw path, or show selected cards.
- End with a clear solved, failed, streak, level complete, or next puzzle state.
- Let the first puzzle teach the rule through the board itself: one obvious valid move, one visible consequence, then a slightly harder follow-up.

## Board Presentation

- Use stable grid math. Define cell size, board bounds, safe margins, and drag offsets once.
- Do not resize cells during hover or drag. Use highlight overlays, ghost pieces, alpha, tint, or outline instead.
- Separate board, tray/hand/letter bank, status, and buttons into predictable zones.
- Use a distinct visual language for empty, filled, selected, valid, invalid, locked, and completed cells.
- Keep board changes traceable. When cells clear, merge, flip, or move, animate in a readable order instead of changing everything at once.

## Feedback

- Valid move: snap into place, small scale pulse, color settle, score/progress tick, line/word/card completion animation.
- Invalid move: short shake, red flash, return-to-origin tween, soft error sound, or crossed preview.
- Completion: line clear sweep, tile flip, word reveal, card match shrink, board glow, or next-level transition.
- Particles are optional. Use them for clears or level complete, not for every small hover.

## Input

- Drag pieces/cards with a visible ghost and keep the original slot legible.
- For word games, draw the swipe line and selected letter order; show invalid words with a shake rather than a modal.
- For card matching, use flip animations and brief mismatch delay so the player can learn.
- For block/merge games, make drop targets generous and explain invalid placement visually.
- For sorting/path/logic puzzles, preview the path or target before commit so touch imprecision does not feel unfair.

## Variants

- **Match/clear:** emphasize streaks, clear sweeps, combo labels, and a next-board moment.
- **Word:** emphasize selected order, valid-word glow, dictionary rejection shake, and final word reveal.
- **Card/memory:** use readable backs, flip timing, mismatch pause, and matched-pair celebration.
- **Block/merge:** use ghost placement, merge preview, resource/result tick, and stable tray layout.

## Avoid

- Do not animate the board so much that the player loses track of state.
- Do not use tiny text inside cells. Prefer icons, color, or larger labels.
- Do not make puzzles depend on hover-only affordances.
- Do not use full-screen shake for ordinary invalid moves.
- Do not hide the objective in long instructions; keep the next meaningful move visible.

# Template Selection

BuzzPlay Phaser playable template for touch-friendly playable posts.

Use when:
- The request sounds like a tiny game, arcade loop, tap challenge, dodge/collect/runner, snake/flappy/breakout-style game, timing challenge, reaction test, physics toy, score chase, or replayable touch playable.
- The user gives a simple creative idea and expects it to become a real touch-first game with movement, collision, score, feedback, end state, and replay.
- The experience should feel like playable media in the BuzzPlay preview rather than a React UI card, dashboard, quiz page, or landing page.
- The idea benefits from a game loop, canvas rendering, sprites/shapes, Phaser scenes, Arcade Physics, collisions, particles, tweens, or pointer/touch control.
- The user uploaded image/audio/video references that can become a sprite, prop, background, collectible, hazard, avatar, or result visual.
- The output should feel like a finished mobile microgame with clear HUD, immediate action feedback, result/replay flow, and polished motion.

Avoid when:
- The user asks for a dashboard, CRUD app, blog, long-form website, e-commerce app, conventional React app shell, or SEO landing page.
- The user explicitly wants single-file HTML without React/Vite structure.
- The request is a presentation, pitch deck, article, docs page, or non-interactive writing task.

For softer interaction prompts:
- If the user asks for a quiz, meme reveal, interactive story, result card, or social challenge, translate it into a simple tap/choose/drag/timing game with a result scene instead of building a static UI card.
- Prefer one strong core action and a 15-30 second payoff over many UI controls.
- Use the Phaser `game-feel`, `visual-direction`, and, when needed, `game-type-recipes` guidance plus the relevant specialized skill for the requested gameplay or style.
- Select this template confidently for polished game-like interactions; Phaser can handle the same finished microgame quality as single-file HTML when the implementation uses the game-feel guidance.

Built with:
- Phaser 4.1.0, React, Vite, TypeScript, Cloudflare Workers static serving, and `src/asset_map` awareness for uploaded images/audio/video.
- The main game code lives in `src/game/scenes/*` and `src/game/main.ts`; React is only a thin fullscreen host.

Reference:
- Phaser API Reference: https://docs.phaser.io/api-documentation/api-documentation
- Phaser Examples: https://phaser.io/examples
- Local Phaser 4 AI reference skills are included under `skills/`.

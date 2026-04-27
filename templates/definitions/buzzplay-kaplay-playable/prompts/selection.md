# Template Selection

BuzzPlay KAPLAY playable template for mobile-first playable posts.

Use when:
- The request sounds like a tiny game, arcade loop, tap challenge, dodge/collect/runner, snake/flappy/breakout-style game, timing challenge, reaction test, physics toy, score chase, or replayable mobile playable.
- The user gives a simple creative idea and expects it to become a real touch-first game with movement, collision, score, feedback, end state, and replay.
- The experience should feel like playable media in a feed rather than a React UI card, dashboard, quiz page, or landing page.
- The idea benefits from a game loop, canvas rendering, sprites/shapes, KAPLAY components, scenes, collisions, particles, or mobile pointer/touch control.
- The user uploaded image/audio/video references that can become a sprite, prop, background, collectible, hazard, avatar, or result visual.

Avoid when:
- The user asks for a dashboard, CRUD app, blog, long-form website, e-commerce app, or SEO landing page.
- The user explicitly wants single-file HTML without React/Vite structure.
- The request is a presentation, pitch deck, article, docs page, or non-interactive writing task.

For softer interaction prompts:
- If the user asks for a quiz, meme reveal, interactive story, result card, or social challenge, translate it into a simple tap/choose/timing game with a result scene instead of building a static UI card.
- Prefer one strong core action and a 15-30 second payoff over many UI controls.

Built with:
- React shell, Vite, TypeScript, KAPLAY, Tailwind, Cloudflare Workers serving, and `src/asset_map` awareness for uploaded images/audio/video.

Reference:
- KAPLAY guides: https://kaplayjs.com/docs/guides/

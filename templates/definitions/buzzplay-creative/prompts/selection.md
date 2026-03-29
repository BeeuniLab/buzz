# Template Selection

BuzzPlay interactive creative template: a self-contained HTML canvas experience hosted on Cloudflare (Worker + static assets).

Use when:

- You are building any **rich visual or interactive content** — games, interactive stories, data visualizations, creative tools, animated art, quizzes, or any experience that runs as client-side HTML/CSS/JavaScript in a portrait canvas (e.g. 720x1280).
- You need **save/load**, leaderboards, or asset helpers exposed through **`window.lib`** (see `lib/host-stub.js` in the template).
- You want a **minimal deploy surface** (single `src/code.html` entry, optional `context_meta.json` / `asset_map.json`) with instant browser-mode preview.

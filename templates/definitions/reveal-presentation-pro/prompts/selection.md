## Template Selection – Reveal Presentation Pro

Use this template when a user wants:
- A **visually rich Reveal.js slide deck** with glass-morphism, gradients and modern typography.
- Slides that are **defined as JSON**, so they can be updated, rearranged and edited structurally (not just as raw JSX text).
- A presentation that can be **iterated on quickly**: add/remove slides, change layout, adjust theme, or rewrite content without touching low-level runtime code.
- **Live streaming of slides** during generation, where content appears in real-time as it's being created.
- **Step-by-step reveals** using Reveal.js fragments for progressive disclosure.
- Visual style that can closely **match or exceed** the existing `reveal-presentation-dev` template (hero gradients, glass cards, etc.).

Prefer another template when:
- The user only needs a small, simple deck and is comfortable with JSX slides; `reveal-presentation-dev` may be simpler in that case.
- The primary goal is building an app, dashboard, or document rather than a slide deck.

Mental model for you (the assistant building the deck):
- Think of each slide as a **JSON representation of a JSX tree**: a root element with nested `children`, Tailwind `className`s and optional metadata.
- You edit **content and layout** by editing these JSON slide files and, when necessary, adjusting the shared design system.
- The platform handles **live streaming** automatically - your generated slides appear in real-time to users as you create them.
- Use the `fragment` class for elements that should appear step-by-step during presentation.
- You do not need to know any details about how the platform loads files, compiles modules, or handles the streaming protocol – treat it as a black box that renders whatever slide JSON you write.

# Buzzplay Content Guide

## Content Direction

- Make the requested subject the center of the experience. Every visual, motion, label, sound cue, and interaction should reinforce that subject.
- Prefer a clear, memorable content idea over generic UI decoration.
- Build a complete small piece with a beginning state, active state, feedback, and result state.
- Keep text concise and purposeful. Use labels, prompts, and result copy only when they add meaning.

## Interaction

- Give each user action immediate feedback through motion, state changes, scoring, timing, reveal, or consequence.
- Keep controls obvious from the first moment. Avoid hidden mechanics unless discovery is part of the concept.
- Make the primary loop satisfying even when the implementation is small.
- Preserve responsive layout and input comfort across pointer, touch, and keyboard where appropriate.

## Visual And Audio Style

- Choose a visual style that fits the subject instead of relying on a default palette.
- Use contrast, scale, spacing, and motion to guide attention to the content.
- Use assets, generated shapes, canvas drawing, or media deliberately; avoid filler imagery.
- Add lightweight sound only when it improves feedback or atmosphere, and keep it optional or non-disruptive.

## Engineering

- Work within the existing template structure and host APIs.
- Keep changes focused and avoid broad rewrites.
- Do not edit `.buzz`, `.codex`, `.git`, `.wrangler`, `node_modules`, `dist`, or `build`.
- Do not remove host integration files or runtime hooks.
- Leave the project runnable with the existing scripts.

---
name: demo-optimize
description: Optimize an existing demo-machine spec for better quality, pacing, and narration. Use when a demo works but needs polish.
argument-hint: [spec-file]
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(node *), Bash(pnpm *)
---

# Optimize a Demo Spec

Review and improve an existing demo-machine spec for production quality.

## Input

- `$ARGUMENTS` should be a path to an existing `.demo.yaml` file.

## Review Checklist

### Selectors

- Prefer stable selectors: `data-testid` > `id` > `role` > `class`
- Avoid fragile selectors like `:nth-child(3)` or deeply nested paths
- Use `getByRole`, `getByText`, `getByTestId` locator strategies where possible

### Pacing

- Ensure `cursorDurationMs` is 400-800ms (smooth but not sluggish)
- `typeDelayMs` of 40-60ms feels natural
- Add `wait` steps (500-1500ms) after animations, modals, or page transitions
- Use custom `delay` on steps where the default feels too fast or slow

### Narration

- Every chapter should have narration on at least the first step
- Narration text should lead into the action ("Let's click..." not "We clicked...")
- Keep narration concise: 5-15 words per step
- Don't narrate every step; skip obvious waits and intermediate clicks

### Chapter Organization

- Group related actions into chapters (login, feature A, feature B)
- Each chapter should demonstrate one concept or feature
- 3-8 steps per chapter is ideal
- Add a descriptive chapter title

### Visual Polish

- Add `screenshot` steps at key moments for thumbnails
- Use `hover` before `click` on important elements to draw attention
- Consider `assert` steps to verify expected state (keeps demo reliable)

## Steps

1. Read the spec file
2. Review against each checklist item
3. Suggest specific improvements with code examples
4. Apply changes if the user approves
5. Validate: `node dist/cli.js validate <spec>`

Arguments: $ARGUMENTS
